import { useEffect, useState } from "react";
import { Chess } from "chess.js";

import type {
  Color,
  OpeningExplorerPositionResponse,
  OpeningPositionAnalysisResponse,
} from "../../../../packages/contracts/src/api";
import { get, post } from "../api";
import { ChessBoard } from "./ChessBoard";

export interface SandboxMove {
  moveUci: string;
  moveSan: string;
  fenBefore: string;
  fenAfter: string;
}

interface OpeningAnalysisSandboxProps {
  baseFen: string;
  orientation: Color;
  onAddMoves: (moves: SandboxMove[]) => void;
}

function applyMove(fen: string, moveUci: string): { fen: string; san: string } {
  const chess = new Chess(fen);
  const move = chess.move({
    from: moveUci.slice(0, 2),
    to: moveUci.slice(2, 4),
    ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
  });
  if (!move) throw new Error("That move is not legal in the analysis position");
  return { fen: chess.fen(), san: move.san };
}

function scoreLabel(line: OpeningPositionAnalysisResponse["lines"][number]): string {
  if (line.score.kind === "mate") {
    return line.score.value > 0 ? `Mate in ${line.score.value}` : `Being mated in ${Math.abs(line.score.value)}`;
  }
  const pawns = line.score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function OpeningAnalysisSandbox({ baseFen, orientation, onAddMoves }: OpeningAnalysisSandboxProps) {
  const [fen, setFen] = useState(baseFen);
  const [moves, setMoves] = useState<SandboxMove[]>([]);
  const [analysis, setAnalysis] = useState<OpeningPositionAnalysisResponse | null>(null);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [explorer, setExplorer] = useState<OpeningExplorerPositionResponse | null>(null);
  const [explorerError, setExplorerError] = useState("");
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [explorerEnabled, setExplorerEnabled] = useState(false);
  const [ratingGroup, setRatingGroup] = useState(1600);

  useEffect(() => {
    setFen(baseFen);
    setMoves([]);
    setAnalysis(null);
    setAnalysisError("");
    setExplorer(null);
    setExplorerError("");
  }, [baseFen]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAnalysisBusy(true);
      setAnalysisError("");
      void post<OpeningPositionAnalysisResponse>("/api/v1/openings/analysis", { fen }, controller.signal)
        .then(setAnalysis)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setAnalysisError(error instanceof Error ? error.message : "Stockfish analysis failed");
        })
        .finally(() => { if (!controller.signal.aborted) setAnalysisBusy(false); });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fen]);

  useEffect(() => {
    if (!explorerEnabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setExplorerBusy(true);
      setExplorerError("");
      void get<OpeningExplorerPositionResponse>(
        `/api/v1/openings/explorer?rating=${ratingGroup}&fen=${encodeURIComponent(fen)}`,
        controller.signal,
      ).then(setExplorer).catch((error: unknown) => {
        if (!controller.signal.aborted) setExplorerError(error instanceof Error ? error.message : "Practical frequencies are unavailable");
      }).finally(() => { if (!controller.signal.aborted) setExplorerBusy(false); });
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [explorerEnabled, fen, ratingGroup]);

  const playMove = (moveUci: string, suppliedSan?: string): void => {
    try {
      const applied = applyMove(fen, moveUci);
      setMoves((current) => [...current, {
        moveUci,
        moveSan: suppliedSan ?? applied.san,
        fenBefore: fen,
        fenAfter: applied.fen,
      }]);
      setFen(applied.fen);
    } catch (error) {
      setAnalysisError(error instanceof Error ? error.message : "Could not explore that move");
    }
  };

  const undo = (): void => {
    const last = moves.at(-1);
    if (!last) return;
    setFen(last.fenBefore);
    setMoves((current) => current.slice(0, -1));
  };

  const reset = (): void => {
    setFen(baseFen);
    setMoves([]);
  };

  const addToRepertoire = (): void => {
    if (moves.length === 0) return;
    onAddMoves(moves);
  };

  const lastMove = moves.at(-1)?.moveUci ?? null;
  const turn = fen.split(" ")[1] === "b" ? "Black" : "White";

  return (
    <section className="opening-sandbox" aria-label="Analysis sandbox">
      <div className="candidate-banner opening-studio-banner">
        <div>
          <span>Analysis sandbox</span>
          <small>Explore freely. Nothing is saved until you add it.</small>
        </div>
        <strong>{turn} to move</strong>
      </div>
      <div className="board-toolbar opening-sandbox-toolbar">
        <span>{moves.length === 0 ? "Synced with your repertoire position" : `${moves.length} unsaved move${moves.length === 1 ? "" : "s"}`}</span>
        <div>
          <button className="text-button" disabled={moves.length === 0} onClick={undo}>Undo</button>
          <button className="text-button" disabled={moves.length === 0} onClick={reset}>Reset</button>
        </div>
      </div>
      <ChessBoard
        fen={fen}
        orientation={orientation}
        interactive
        lastMove={lastMove}
        onMove={(uci, san) => playMove(uci, san)}
        ariaLabel="Analysis board"
      />
      <div className="opening-sandbox-moves" aria-label="Unsaved analysis moves">
        {moves.length === 0 && <span>Move on this board or choose an idea below.</span>}
        {moves.map((move, index) => <b key={`${move.moveUci}-${index}`}>{index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ""}{move.moveSan}</b>)}
      </div>

      <div className="opening-analysis-results">
        <section>
          <div className="opening-analysis-title">
            <div><span className="eyebrow">Local Stockfish</span><strong>Strong candidates</strong></div>
            {analysisBusy && <small>Analysing…</small>}
          </div>
          <p>These are engine-supported ideas, not moves you must memorise.</p>
          <div className="opening-analysis-lines">
            {analysis?.lines.map((line) => (
              <button key={`${fen}-${line.rank}`} onClick={() => playMove(line.moveUci, line.moveSan)}>
                <span><b>{line.moveSan}</b><small>{line.pvSan.join(" ")}</small></span>
                <strong>{scoreLabel(line)}</strong>
              </button>
            ))}
          </div>
          {analysisError && <p className="error">{analysisError}</p>}
        </section>

        <section>
          <div className="opening-analysis-title">
            <div><span className="eyebrow">Practical play</span><strong>Common moves here</strong></div>
            {explorerEnabled && <label>
              Rating
              <select value={ratingGroup} onChange={(event) => setRatingGroup(Number(event.target.value))}>
                {[1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500].map((rating) => <option key={rating} value={rating}>{rating}+</option>)}
              </select>
            </label>}
          </div>
          {!explorerEnabled ? (
            <>
            <p>Optionally ask Lichess Explorer what players commonly choose. This sends only the current position and requires a server-side Lichess token.</p>
              <button className="secondary" onClick={() => setExplorerEnabled(true)}>Load Lichess frequencies</button>
            </>
          ) : (
            <>
              <p>{explorerBusy ? "Loading rated blitz, rapid and classical games…" : explorer?.opening ? `${explorer.opening.eco} · ${explorer.opening.name}` : "Rated blitz, rapid and classical games."}</p>
              <div className="opening-analysis-lines practical">
                {explorer?.replies.slice(0, 5).map((reply) => (
                  <button key={`${fen}-${reply.moveUci}`} onClick={() => playMove(reply.moveUci, reply.moveSan)}>
                    <span><b>{reply.moveSan}</b><small>{reply.games.toLocaleString()} games</small></span>
                    <strong>{reply.frequencyPercent}%</strong>
                  </button>
                ))}
              </div>
              {explorerError && <p className="error">{explorerError}</p>}
            </>
          )}
        </section>
      </div>

      <button className="opening-add-analysis" disabled={moves.length === 0} onClick={addToRepertoire}>
        Add {moves.length || "explored"} move{moves.length === 1 ? "" : "s"} to my repertoire
      </button>
    </section>
  );
}

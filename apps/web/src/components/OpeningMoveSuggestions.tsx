import { useEffect, useMemo, useState } from "react";

import type {
  OpeningExplorerPositionResponse,
  OpeningPositionAnalysisResponse,
} from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

interface OpeningMoveSuggestionsProps {
  fen: string;
  ratingGroup: number;
  useExplorer: boolean;
  savedMoveUcis?: string[];
  onChooseMove: (moveUci: string, moveSan: string) => void;
}

function scoreLabel(line: OpeningPositionAnalysisResponse["lines"][number] | undefined): string {
  if (!line) return "—";
  if (line.score.kind === "mate") {
    return line.score.value > 0 ? `M${line.score.value}` : `−M${Math.abs(line.score.value)}`;
  }
  const pawns = line.score.value / 100;
  return `${pawns >= 0 ? "+" : ""}${pawns.toFixed(2)}`;
}

export function OpeningMoveSuggestions({
  fen,
  ratingGroup,
  useExplorer,
  savedMoveUcis = [],
  onChooseMove,
}: OpeningMoveSuggestionsProps) {
  const [analysis, setAnalysis] = useState<OpeningPositionAnalysisResponse | null>(null);
  const [explorer, setExplorer] = useState<OpeningExplorerPositionResponse | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [explorerError, setExplorerError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setAnalysis(null);
      setAnalysisBusy(true);
      setAnalysisError("");
      void post<OpeningPositionAnalysisResponse>("/api/v1/openings/analysis", { fen }, controller.signal)
        .then(setAnalysis)
        .catch((error: unknown) => {
          if (!controller.signal.aborted) setAnalysisError(error instanceof Error ? error.message : "Stockfish analysis failed");
        })
        .finally(() => { if (!controller.signal.aborted) setAnalysisBusy(false); });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fen]);

  useEffect(() => {
    if (!useExplorer) {
      setExplorer(null);
      setExplorerError("");
      setExplorerBusy(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setExplorer(null);
      setExplorerBusy(true);
      setExplorerError("");
      void get<OpeningExplorerPositionResponse>(
        `/api/v1/openings/explorer?rating=${ratingGroup}&fen=${encodeURIComponent(fen)}`,
        controller.signal,
      ).then(setExplorer).catch((error: unknown) => {
        if (!controller.signal.aborted) setExplorerError(error instanceof Error ? error.message : "Practical frequencies are unavailable");
      }).finally(() => { if (!controller.signal.aborted) setExplorerBusy(false); });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fen, ratingGroup, useExplorer]);

  const candidates = useMemo(() => {
    const analysisByMove = new Map((analysis?.lines ?? []).map((line) => [line.moveUci, line]));
    const explorerByMove = new Map((explorer?.replies ?? []).map((reply) => [reply.moveUci, reply]));
    const orderedMoves = [
      ...(useExplorer ? (explorer?.replies ?? []).slice(0, 7).map((reply) => reply.moveUci) : []),
      ...(analysis?.lines ?? []).map((line) => line.moveUci),
    ].filter((move, index, moves) => moves.indexOf(move) === index).slice(0, 7);

    return orderedMoves.map((moveUci) => {
      const engine = analysisByMove.get(moveUci);
      const practical = explorerByMove.get(moveUci);
      return {
        moveUci,
        moveSan: practical?.moveSan ?? engine?.moveSan ?? moveUci,
        engine,
        practical,
        saved: savedMoveUcis.includes(moveUci),
      };
    });
  }, [analysis, explorer, savedMoveUcis, useExplorer]);

  return (
    <section className="opening-move-suggestions" aria-label="Moves to consider">
      <div className="opening-suggestion-heading">
        <div>
          <span className="eyebrow">Moves to consider</span>
          <strong>{explorer?.opening ? `${explorer.opening.eco} · ${explorer.opening.name}` : "Choose with evidence"}</strong>
        </div>
        {(analysisBusy || explorerBusy) && <small>Updating…</small>}
      </div>
      <div className="opening-suggestion-labels" aria-hidden="true">
        <span>Move</span><span>{useExplorer ? `${ratingGroup}+ games` : "Practical"}</span><span>Engine</span>
      </div>
      <div className="opening-suggestion-list">
        {candidates.map((candidate) => (
          <button
            type="button"
            className={candidate.saved ? "saved" : ""}
            disabled={candidate.saved}
            key={candidate.moveUci}
            onClick={() => onChooseMove(candidate.moveUci, candidate.moveSan)}
          >
            <span><strong>{candidate.moveSan}</strong>{candidate.engine?.rank === 1 && <small>Stockfish choice</small>}</span>
            <span>{candidate.saved
              ? "Saved"
              : candidate.practical
                ? `${candidate.practical.frequencyPercent}%`
                : "—"}</span>
            <span>{scoreLabel(candidate.engine)}</span>
          </button>
        ))}
        {!analysisBusy && !explorerBusy && candidates.length === 0 && !analysisError && !explorerError && (
          <p>No candidate data is available for this position.</p>
        )}
      </div>
      {!useExplorer && <p className="opening-suggestion-note">Practical frequencies are off. Enable them in your opening settings to rank moves seen at your level.</p>}
      {analysisError && <p className="error">{analysisError}</p>}
      {explorerError && <p className="error">{explorerError}</p>}
    </section>
  );
}

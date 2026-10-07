import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";

import type {
  Color,
  OpeningExplorerReply,
  OpeningExplorerPositionResponse,
  OpeningPositionAnalysisResponse,
} from "../../../../packages/contracts/src/api";
import { get, post } from "../api";

interface OpeningMoveSuggestionsProps {
  fen: string;
  learnerColor: Color;
  ratingGroup: number;
  useExplorer: boolean;
  savedMoveUcis?: string[];
  savedMoves?: Array<{ moveUci: string; moveSan: string }>;
  disabled?: boolean;
  onChooseMove: (moveUci: string, moveSan: string) => void;
}

function frequencyLabel(reply: OpeningExplorerReply | undefined): string {
  if (!reply || reply.frequencyPercent <= 0) return "—";
  return `1 in ${Math.max(1, Math.round(100 / reply.frequencyPercent))}`;
}

function learnerScore(reply: OpeningExplorerReply | undefined, learnerColor: Color): string {
  if (!reply || reply.games <= 0) return "—";
  const wins = learnerColor === "white" ? reply.whiteWins : reply.blackWins;
  return `${Math.round(((wins + reply.draws / 2) / reply.games) * 100)}%`;
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
  learnerColor,
  ratingGroup,
  useExplorer,
  savedMoveUcis = [],
  savedMoves = [],
  disabled = false,
  onChooseMove,
}: OpeningMoveSuggestionsProps) {
  const [analysis, setAnalysis] = useState<OpeningPositionAnalysisResponse | null>(null);
  const [explorer, setExplorer] = useState<OpeningExplorerPositionResponse | null>(null);
  const [analysisBusy, setAnalysisBusy] = useState(false);
  const [explorerBusy, setExplorerBusy] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [explorerError, setExplorerError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setAnalysis(null);
    setAnalysisBusy(true);
    setAnalysisError("");
    const timer = window.setTimeout(() => {
      void post<OpeningPositionAnalysisResponse>("/api/v1/openings/analysis", { fen }, controller.signal)
        .then(result => { if (!controller.signal.aborted) setAnalysis(result); })
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
    setExplorer(null);
    setExplorerBusy(true);
    setExplorerError("");
    const timer = window.setTimeout(() => {
      void get<OpeningExplorerPositionResponse>(
        `/api/v1/openings/explorer?rating=${ratingGroup}&fen=${encodeURIComponent(fen)}`,
        controller.signal,
      ).then(result => { if (!controller.signal.aborted) setExplorer(result); }).catch((error: unknown) => {
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
    const savedByMove = new Map(savedMoves.map(move => [move.moveUci, move]));
    const orderedMoves = [
      ...savedMoves.map(move => move.moveUci),
      ...(useExplorer ? (explorer?.replies ?? []).slice(0, 7).map((reply) => reply.moveUci) : []),
      ...(analysis?.lines ?? []).map((line) => line.moveUci),
    ].filter((move, index, moves) => moves.indexOf(move) === index).slice(0, Math.max(7, savedMoves.length));

    return orderedMoves.map((moveUci) => {
      const engine = analysisByMove.get(moveUci);
      const practical = explorerByMove.get(moveUci);
      const saved = savedByMove.get(moveUci);
      const moveSan = saved?.moveSan ?? practical?.moveSan ?? engine?.moveSan ?? moveUci;
      let description = "";
      try {
        const move = new Chess(fen).move(moveSan);
        description = ({ p: "Pawn", n: "Knight", b: "Bishop", r: "Rook", q: "Queen", k: "King" }[move.piece])
          + (move.captured ? " captures on " : " to ") + move.to;
        if (move.flags.includes("k")) description = "Castle kingside";
        if (move.flags.includes("q")) description = "Castle queenside";
      } catch { /* A stale suggestion cannot prevent playing directly on the board. */ }
      return {
        moveUci,
        moveSan,
        description,
        engine,
        practical,
        saved: savedMoveUcis.includes(moveUci) || savedByMove.has(moveUci),
      };
    });
  }, [analysis, explorer, savedMoveUcis, savedMoves, useExplorer, fen]);

  return (
    <section className={`opening-move-suggestions ${detailsOpen ? "show-evidence" : "compact-evidence"}`} aria-label="Moves to consider">
      <div className="opening-suggestion-heading">
        <div>
          <span className="eyebrow">{fen.split(" ")[1] === (learnerColor === "white" ? "w" : "b") ? "Your response" : "Their possible replies"}</span>
          <strong>{explorer?.opening ? `${explorer.opening.eco} · ${explorer.opening.name}` : "Play on the board or choose below"}</strong>
        </div>
        {(analysisBusy || explorerBusy) && <small>Updating…</small>}
      </div>
      <div className="opening-suggestion-labels" aria-hidden="true">
        <span>Move</span><span>{useExplorer ? `Seen in ${ratingGroup} band` : "Seen"}</span><span>Results for {learnerColor === "white" ? "White" : "Black"}</span><span>Engine</span>
      </div>
      <div className="opening-suggestion-list">
        {candidates.map((candidate) => (
          <button
            type="button"
            className={candidate.saved ? "saved" : ""}
            disabled={disabled}
            key={candidate.moveUci}
            onClick={() => onChooseMove(candidate.moveUci, candidate.moveSan)}
          >
            <span>
              <strong>{candidate.moveSan}</strong>
              <small>{candidate.description}</small>
              {candidate.saved
                ? <small>Saved · follow this move</small>
                : candidate.engine?.rank === 1 && <small>Stockfish choice</small>}
            </span>
            <span>
              <strong>{frequencyLabel(candidate.practical)}</strong>
              {candidate.practical && <small>{candidate.practical.frequencyPercent}% · {candidate.practical.games.toLocaleString()} games</small>}
            </span>
            <span>
              <strong>{learnerScore(candidate.practical, learnerColor)}</strong>
              {candidate.practical && <small>sample wins + ½ draws</small>}
            </span>
            <span><strong>{scoreLabel(candidate.engine)}</strong></span>
          </button>
        ))}
        {!analysisBusy && !explorerBusy && candidates.length === 0 && !analysisError && !explorerError && (
          <p>No candidate data is available for this position.</p>
        )}
      </div>
      {!useExplorer && <p className="opening-suggestion-note">Practical frequencies are off. Enable them in your opening settings to rank moves seen at your level.</p>}
      <button type="button" className="text-button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>
        {detailsOpen ? "Hide engine and results" : "Show engine and results"}
      </button>
      <p className="opening-suggestion-note">Frequency is measured at this position, not the chance of reaching the whole line.{explorer?.stale ? " Cached game data may be out of date." : ""}</p>
      {detailsOpen && <p className="opening-suggestion-note">Results describe the sampled games, not your personal results. A positive engine score favours {fen.split(" ")[1] === "b" ? "Black" : "White"}, the side to move.</p>}
      {analysisError && <p className="error">{analysisError}</p>}
      {explorerError && <p className="error">{explorerError}</p>}
    </section>
  );
}

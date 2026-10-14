import { useMemo, useState } from "react";
import { Chess } from "chess.js";

import type {
  Color,
  OpeningExplorerReply,
  OpeningExplorerPositionResponse,
  OpeningPositionAnalysisResponse,
} from "../../../../packages/contracts/src/api";
import { useOpeningMoveEvidence, type OpeningMoveEvidence } from "../use-opening-move-evidence";

interface OpeningMoveSuggestionsProps {
  fen: string;
  learnerColor: Color;
  ratingGroup: number;
  useExplorer: boolean;
  savedMoveUcis?: string[];
  savedMoves?: Array<{ moveUci: string; moveSan: string }>;
  disabled?: boolean;
  evidence?: OpeningMoveEvidence;
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
  evidence,
}: OpeningMoveSuggestionsProps) {
  const ownEvidence = useOpeningMoveEvidence(fen, ratingGroup, useExplorer, !evidence);
  const { analysis, explorer, analysisBusy, explorerBusy, analysisError, explorerError } = evidence ?? ownEvidence;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const ownTurn = fen.split(" ")[1] === (learnerColor === "white" ? "w" : "b");

  const candidates = useMemo(() => {
    const analysisByMove = new Map((analysis?.lines ?? []).map((line) => [line.moveUci, line]));
    const explorerByMove = new Map((explorer?.replies ?? []).map((reply) => [reply.moveUci, reply]));
    const savedByMove = new Map(savedMoves.map(move => [move.moveUci, move]));
    const orderedMoves = [
      ...savedMoves.map(move => move.moveUci),
      ...(useExplorer ? [...(explorer?.replies ?? [])].sort((a, b) => b.games - a.games || a.moveUci.localeCompare(b.moveUci)).slice(0, 7).map((reply) => reply.moveUci) : []),
      ...(ownTurn || detailsOpen ? analysis?.lines ?? [] : []).map((line) => line.moveUci),
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
  }, [analysis, explorer, savedMoveUcis, savedMoves, useExplorer, fen, ownTurn, detailsOpen]);

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
                : ownTurn && candidate.engine?.rank === 1 && <small>Stockfish choice</small>}
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

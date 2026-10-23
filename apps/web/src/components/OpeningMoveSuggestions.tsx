import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";

import type {
  Color,
  OpeningExplorerReply,
  OpeningExplorerPositionResponse,
} from "../../../../packages/contracts/src/api";
import { openingEvaluation } from "../opening-evaluation";
import type { BuildGuidance } from "../opening-build-guidance";
import { useOpeningMoveEvidence, type OpeningMoveEvidence } from "../use-opening-move-evidence";

interface OpeningMoveSuggestionsProps {
  fen: string;
  learnerColor: Color;
  ratingGroup: number;
  useExplorer: boolean;
  explorerSpeeds?: string;
  savedMoveUcis?: string[];
  savedMoves?: Array<{ moveUci: string; moveSan: string }>;
  disabled?: boolean;
  evidence?: OpeningMoveEvidence;
  guidance?: BuildGuidance;
  arrowsShown?: boolean;
  onToggleArrows?: () => void;
  onFocusMove?: (move: string | null) => void;
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

export function OpeningMoveSuggestions({
  fen,
  learnerColor,
  ratingGroup,
  useExplorer, explorerSpeeds = "blitz,rapid,classical",
  savedMoveUcis = [],
  savedMoves = [],
  disabled = false,
  onChooseMove,
  evidence, guidance, arrowsShown, onToggleArrows, onFocusMove,
}: OpeningMoveSuggestionsProps) {
  const ownEvidence = useOpeningMoveEvidence(fen, ratingGroup, useExplorer, !evidence, savedMoves.map(move => move.moveUci), explorerSpeeds);
  const { analysis, explorer, analysisBusy, explorerBusy, analysisError, explorerError } = evidence ?? ownEvidence;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showAllMoves, setShowAllMoves] = useState(false);
  useEffect(() => setShowAllMoves(false), [fen]);
  const ownTurn = fen.split(" ")[1] === (learnerColor === "white" ? "w" : "b");

  const candidates = useMemo(() => {
    const analysisByMove = new Map((analysis?.lines ?? []).map((line) => [line.moveUci, line]));
    const explorerByMove = new Map((explorer?.replies ?? []).map((reply) => [reply.moveUci, reply]));
    const savedByMove = new Map(savedMoves.map(move => [move.moveUci, move]));
    const popularMoves = useExplorer ? [...(explorer?.replies ?? [])].sort((a, b) => b.games - a.games || a.moveUci.localeCompare(b.moveUci)).slice(0, 7).map(reply => reply.moveUci) : [];
    const engineMoves = (analysis?.lines ?? []).filter(line => line.rank <= 3).sort((a, b) => a.rank - b.rank).map(line => line.moveUci);
    const orderedMoves = [
      ...(ownTurn ? engineMoves : popularMoves),
      ...savedMoves.map(move => move.moveUci),
      ...(ownTurn ? popularMoves : popularMoves.length === 0 ? engineMoves : []),
    ].filter((move, index, moves) => moves.indexOf(move) === index).slice(0, Math.max(7, savedMoves.length + (ownTurn ? engineMoves.length : popularMoves.length)));

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
  }, [analysis, explorer, savedMoveUcis, savedMoves, useExplorer, fen, ownTurn]);

  return (
    <section className={`opening-move-suggestions ${detailsOpen ? "show-evidence" : "compact-evidence"}`} aria-label="Moves to consider">
      <div className="opening-suggestion-heading">
        <div>
          <strong>{ownTurn ? "Your move options" : explorer?.replies.length && useExplorer ? "Opponent replies by frequency" : "Opponent move options"}</strong>
          {explorer?.opening && <small>{explorer.opening.eco} · {explorer.opening.name}</small>}
        </div>
        {(analysisBusy || explorerBusy) && <small>Updating…</small>}
      </div>
      <div className="opening-position-evaluation" aria-label="Position evaluation">
        <strong>Position: {openingEvaluation(analysis?.lines.find(line => line.rank === 1), fen)}</strong>
        <small>+ favours White · − favours Black{analysisBusy ? " · analysing…" : !analysis ? " · unavailable" : ""}</small>
      </div>
      {guidance && <section className="opening-arrow-controls" aria-label="Board move suggestions">
        <div><small>{ownTurn ? "Green arrow: engine's leading move" : "Blue arrows: up to three most frequent replies"}</small>
          <button type="button" className="text-button" aria-pressed={arrowsShown} onClick={onToggleArrows}>{arrowsShown ? "Hide suggestion arrows" : "Show suggestion arrows"}</button></div>
        {guidance.moves.length === 0 && <p className="opening-suggestion-note">{guidance.message}</p>}
      </section>}
      <div className="opening-suggestion-labels" aria-hidden="true">
        <span>Move</span><span>{useExplorer ? `Seen in ${ratingGroup} band` : "Seen"}</span><span>Results for {learnerColor === "white" ? "White" : "Black"}</span><span>Evaluation</span>
      </div>
      <div className="opening-suggestion-list">
        {(showAllMoves ? candidates : candidates.slice(0, 3)).map((candidate) => (
          <button
            type="button"
            className={candidate.saved ? "saved" : ""}
            disabled={disabled}
            key={candidate.moveUci}
            onFocus={() => onFocusMove?.(candidate.moveUci)} onBlur={() => onFocusMove?.(null)}
            onMouseEnter={() => onFocusMove?.(candidate.moveUci)} onMouseLeave={() => onFocusMove?.(null)}
            onClick={() => onChooseMove(candidate.moveUci, candidate.moveSan)}
          >
            <span>
              {(guidance?.moves.findIndex(move => move.uci === candidate.moveUci) ?? -1) >= 0 && <b className="opening-arrow-rank" aria-label={`Arrow ${guidance!.moves.findIndex(move => move.uci === candidate.moveUci) + 1}`}>{guidance!.moves.findIndex(move => move.uci === candidate.moveUci) + 1}</b>}
              <strong>{candidate.moveSan}</strong>
              <small>{candidate.description}</small>
              {candidate.saved
                ? <small>Saved · follow this move</small>
                : ownTurn && candidate.engine?.rank === 1 && <small>Stockfish choice</small>}
            </span>
            <span>
              <strong>{frequencyLabel(candidate.practical)}</strong>
              {candidate.practical && <small className={explorer?.stale || (explorer?.totalGames ?? 0) < 200 || candidate.practical.games < 5 ? "frequency-uncertain" : ""}>
                {explorer?.stale ? "Old sample · " : (explorer?.totalGames ?? 0) < 200 || candidate.practical.games < 5 ? "Small sample · " : ""}{candidate.practical.frequencyPercent}% · {candidate.practical.games.toLocaleString()} games</small>}
            </span>
            <span>
              <strong>{learnerScore(candidate.practical, learnerColor)}</strong>
              {candidate.practical && <small>sample wins + ½ draws</small>}
            </span>
            <span aria-label={`Evaluation for ${candidate.moveSan}`}><strong>{candidate.engine ? openingEvaluation(candidate.engine, fen) : analysisBusy ? "…" : "—"}</strong></span>
          </button>
        ))}
        {!analysisBusy && !explorerBusy && candidates.length === 0 && !analysisError && !explorerError && (
          <p>No candidate data is available for this position.</p>
        )}
      </div>
      {candidates.length > 3 && <button type="button" className="text-button" aria-expanded={showAllMoves} onClick={() => setShowAllMoves(value => !value)}>{showAllMoves ? "Show top three moves" : `Show all ${candidates.length} moves`}</button>}
      {!useExplorer && <p className="opening-suggestion-note">Practical frequencies are off. Enable them in your opening settings to rank moves seen at your level.</p>}
      <button type="button" className="text-button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>
        {detailsOpen ? "Hide game results" : "Show game results"}
      </button>
      <p className="opening-suggestion-note">{ownTurn ? "Stockfish ranks your options by strength." : explorer?.replies.length && useExplorer ? "Replies are ordered by frequency, not engine strength." : "Engine choices shown; reply frequencies are unavailable."} {explorer?.stale ? " Cached game data may be out of date." : ""}</p>
      {detailsOpen && <p className="opening-suggestion-note">Stockfish search depth: {analysis?.depth ?? "unavailable"}. Results describe the sampled games, not your personal results. Move evaluations use White’s perspective and describe the position after that move, assuming best play.</p>}
      {analysisError && <p className="error">{analysisError}</p>}
      {explorerError && <p className="error">{explorerError}</p>}
    </section>
  );
}

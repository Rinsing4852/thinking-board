import { Chess } from "chess.js";
import type { Color, OpeningBoardAnnotation } from "../../../packages/contracts/src/api";
import type { OpeningMoveEvidence } from "./use-opening-move-evidence";

export interface BuildGuidance {
  arrows: OpeningBoardAnnotation[];
  moves: Array<{ uci: string; san: string; games: number | null; percent: number | null }>;
  title: string;
  message: string;
}

export function openingBuildGuidance(fen: string, learnerColor: Color, rating: number, useExplorer: boolean,
  evidence: OpeningMoveEvidence): BuildGuidance {
  const chess = new Chess(fen);
  const legal = new Set(chess.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion ?? ""}`));
  const ownTurn = chess.turn() === (learnerColor === "white" ? "w" : "b");
  const result: BuildGuidance = { arrows: [], moves: [], title: ownTurn ? "Your strongest engine suggestion" : "Most likely opponent replies", message: "" };
  if (ownTurn) {
    const best = evidence.analysis?.fen === fen ? [...evidence.analysis.lines].sort((a, b) => a.rank - b.rank)
      .find(line => legal.has(line.moveUci)) : undefined;
    if (best) {
      result.moves = [{ uci: best.moveUci, san: best.moveSan, games: null, percent: null }];
      result.message = `Stockfish's leading move at depth ${evidence.analysis!.depth}. It is a suggestion; you can save any legal move.`;
    } else result.message = evidence.analysisBusy ? "Finding a move with Stockfish…" : evidence.analysisError || "Engine guidance is unavailable. You can still build on the board.";
  } else {
    const sample = evidence.explorer;
    if (!useExplorer) result.message = "Enable practical Lichess frequencies in Opening settings to show likely replies. Opponent engine moves are not used as frequency estimates.";
    else if (!sample || sample.fen !== fen || sample.ratingGroup !== rating) result.message = evidence.explorerBusy ? "Loading likely replies from Lichess…" : evidence.explorerError || "No reply-frequency sample is available for this position.";
    else if (sample.stale) result.message = "This frequency sample is old. Refresh it before relying on likely-reply arrows.";
    else if (sample.totalGames < 200) result.message = `Only ${sample.totalGames} sampled games; there is not enough evidence for likely-reply arrows.`;
    else {
      result.moves = sample.replies.filter(move => move.games >= 5 && legal.has(move.moveUci))
        .sort((a, b) => b.games - a.games || a.moveUci.localeCompare(b.moveUci)).slice(0, 3)
        .map(move => ({ uci: move.moveUci, san: move.moveSan, games: move.games, percent: move.frequencyPercent }));
      result.message = result.moves.length
        ? `Ranked by frequency in the Lichess ${rating} band (${sample.totalGames.toLocaleString()} games), not engine strength. Percentages apply at this position.`
        : "No reply has enough observations for likely-reply arrows.";
    }
  }
  result.arrows = result.moves.map(move => ({ from: move.uci.slice(0, 2), to: move.uci.slice(2, 4), color: ownTurn ? "green" : "blue" }));
  return result;
}

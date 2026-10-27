import { Chess } from "chess.js";
import { assessMove } from "./move-quality.js";

export type PunishmentProof =
  | { kind: "forced_mate"; mateIn: number; pvUci: string[] }
  | { kind: "material"; gainPawns: number; pvUci: string[] };

export interface SavedMoveAssessment {
  meaningful: number;
  classification: string;
  eval_before_cp_white: number | null;
  eval_before_mate_white: number | null;
  eval_after_cp_white: number | null;
  eval_after_mate_white: number | null;
}

/** A stale classification alone cannot turn a sound move into a tactical error. */
export function significantMistake(assessment: SavedMoveAssessment, color: "white" | "black"): boolean {
  if (!assessment.meaningful || !["mistake", "blunder"].includes(assessment.classification)) return false;
  try {
    return assessMove(
      { centipawnsWhite: assessment.eval_before_cp_white, mateInWhite: assessment.eval_before_mate_white },
      { centipawnsWhite: assessment.eval_after_cp_white, mateInWhite: assessment.eval_after_mate_white },
      color, false,
    ).loss >= 10;
  } catch { return false; }
}

const VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
function material(board: Chess, attacker: "w" | "b"): number {
  return board.board().flat().reduce((total, piece) => total + (piece ? VALUES[piece.type]! * (piece.color === attacker ? 1 : -1) : 0), 0);
}

/** Conservative evidence from the saved engine continuation, not a full tactical proof search.
 * An attack/check/capture alone says nothing about whether material is actually won.
 */
export function tacticalPunishment(beforeMoveFen: string, fen: string, moveUci: string, pvJson: string, mateInWhite: number | null): PunishmentProof | null {
  try {
    const pv: unknown = JSON.parse(pvJson);
    if (!Array.isArray(pv) || !pv.length || pv.length > 256 || pv[0] !== moveUci || pv.some(move => typeof move !== "string" || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move))) return null;
    const board = new Chess(fen), attacker = board.turn();
    // Measure against BEFORE the alleged mistake: recapturing after a fair
    // exchange restores material rather than winning it.
    const baseline = material(new Chess(beforeMoveFen), attacker), defensiveGains: number[] = [];
    for (let index = 0; index < pv.length; index++) {
      const uci = pv[index] as string;
      board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length === 5 ? { promotion: uci[4]! } : {}) });
      if (index % 2 === 1) defensiveGains.push(material(board, attacker) - baseline);
    }
    if (board.isCheckmate()) {
      if (board.turn() === attacker) return null;
      return { kind: "forced_mate", mateIn: Math.ceil(pv.length / 2), pvUci: pv as string[] };
    }
    if (board.isDraw()) return null;
    if (mateInWhite !== null) {
      if (!Number.isFinite(mateInWhite) || mateInWhite === 0 || (attacker === "w" ? mateInWhite < 0 : mateInWhite > 0)) return null;
      return { kind: "forced_mate", mateIn: Math.abs(mateInWhite), pvUci: pv as string[] };
    }
    // Require a gain retained through at least two defensive replies. An
    // unfinished capture at the PV boundary or a normal equal trade is insufficient.
    if (defensiveGains.length < 2) return null;
    const gain = Math.min(...defensiveGains.slice(-2));
    return gain >= 1 ? { kind: "material", gainPawns: gain, pvUci: pv as string[] } : null;
  } catch { return null; }
}

import type { EngineScore } from "./uci-engine.js";
export const QUALITY_VERSION = "chances-v1";
export type MoveGrade = "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** A documented evaluation transform, not a personal forecast or site-equivalent rating. */
export function chances(score: EngineScore, color: "white" | "black"): number {
  let white: number;
  if (score.mateInWhite !== null) {
    if (score.mateInWhite === 0) throw new Error("Ambiguous mate score");
    white = score.mateInWhite > 0 ? 100 : 0;
  } else {
    if (score.centipawnsWhite === null || !Number.isFinite(score.centipawnsWhite)) throw new Error("Missing evaluation");
    white = 100 / (1 + Math.exp(-0.00368208 * score.centipawnsWhite));
  }
  return color === "white" ? white : 100 - white;
}
export function assessMove(best: EngineScore, played: EngineScore, color: "white" | "black", isBest: boolean) {
  const before = chances(best, color), after = chances(played, color);
  const loss = Math.max(0, before - after);
  const grade: MoveGrade = loss >= 20 ? "blunder" : loss >= 10 ? "mistake" : loss >= 5 ? "inaccuracy" : isBest && loss < .5 ? "best" : "good";
  // The published Lichess per-move transform; game aggregation here is our own simple mean.
  const accuracy = loss === 0 ? 100 : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  return { before, after, loss, accuracy, grade };
}

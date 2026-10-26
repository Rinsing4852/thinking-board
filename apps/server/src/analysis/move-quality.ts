import type { EngineScore } from "./uci-engine.js";
export const QUALITY_VERSION = "chances-v3";
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
  // Published per-move transform: https://lichess.org/page/accuracy.
  const accuracy = loss === 0 ? 100 : Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
  return { before, after, loss, accuracy, grade };
}

/** Independent implementation of the published weighted/harmonic approach.
 * Uses our saved move accuracies and actual initial evaluation, so it is not
 * an exact reproduction of Lichess's whole-game score.
 */
export function gameAccuracy(
  moves: Array<{ply:number;color:"white"|"black";accuracy:number;chancesBefore:number;chancesAfter:number}>,
  color: "white" | "black",
): number | null {
  if (!moves.some(move => move.color === color)) return null;
  const ordered = [...moves].sort((a,b) => a.ply-b.ply);
  const white = (value:number, mover:"white"|"black") => mover === "white" ? value : 100-value;
  const balances = [white(ordered[0]!.chancesBefore, ordered[0]!.color),
    ...ordered.map(move => white(move.chancesAfter,move.color))];
  const size = Math.max(2,Math.min(8,Math.floor(ordered.length/10)));
  let weighted = 0, totalWeight = 0, reciprocal = 0, count = 0, hasZero = false;
  for (let i=0;i<ordered.length;i++) {
    const move=ordered[i]!;
    if (move.color !== color) continue;
    const end=Math.min(balances.length,Math.max(size,i+2));
    const window=balances.slice(Math.max(0,end-size),end);
    const mean=window.reduce((sum,n)=>sum+n,0)/window.length;
    const volatility=Math.sqrt(window.reduce((sum,n)=>sum+(n-mean)**2,0)/window.length);
    const weight=Math.max(.5,Math.min(12,volatility));
    const accuracy=Math.max(0,Math.min(100,move.accuracy));
    weighted+=accuracy*weight;totalWeight+=weight;count++;
    if(accuracy===0)hasZero=true;else reciprocal+=1/accuracy;
  }
  const harmonic=hasZero?0:count/reciprocal;
  return (weighted/totalWeight+harmonic)/2;
}

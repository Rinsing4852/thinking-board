import { Chess } from "chess.js";
import type { QuietPositionAnswerResponse } from "../../../../packages/contracts/src/api.js";
import type { EngineHistory, EngineScore, UciEngine } from "../analysis/uci-engine.js";

export type QuietMoveCheck = NonNullable<QuietPositionAnswerResponse["engineCheck"]>;
export const QUIET_CHECK_NODES = 500_000;
const utility = (score: EngineScore): number => score.mateInWhite === null
  ? score.centipawnsWhite ?? 0 : Math.sign(score.mateInWhite) * (100_000 - Math.abs(score.mateInWhite));

/** One unrestricted and, if needed, one restricted search; never claims an unsearched move is wrong. */
export async function checkQuietMove(engine: Pick<UciEngine, "analyze">, fen: string, moveUci: string,
  baseDepth: number, history: EngineHistory): Promise<QuietMoveCheck> {
  const board = new Chess(fen);
  const move = board.move({ from: moveUci.slice(0, 2), to: moveUci.slice(2, 4), ...(moveUci[4] ? { promotion: moveUci[4] } : {}) });
  const depth = Math.max(12, Math.min(16, baseDepth));
  const initial = await engine.analyze(fen, depth, 3, [], undefined, QUIET_CHECK_NODES, history);
  let best = initial.lines[0];
  const played = initial.lines.find(line => line.moveUci === moveUci)
    ?? (await engine.analyze(fen, depth, 1, [moveUci], undefined, QUIET_CHECK_NODES, history)).lines[0];
  if (!best || !played || Math.min(best.depth, played.depth) < 10 ||
    [best, played].some(line => line.centipawnsWhite === null && line.mateInWhite === null)) {
    throw new Error("The bounded search did not return a reliable comparison");
  }
  const direction = fen.split(" ")[1] === "w" ? 1 : -1;
  if (direction * utility(played) > direction * utility(best)) best = played;
  const lossCp = Math.max(0, Math.round(direction * (utility(best) - utility(played))));
  return {
    status: lossCp > 75 ? "weaker" : move.captured || board.inCheck() ||
      (played.mateInWhite !== null && direction * played.mateInWhite > 0) ? "forcing" : "useful",
    depth: Math.min(best.depth, played.depth), lossCp: best.mateInWhite !== null || played.mateInWhite !== null ? null : lossCp, bestMoveSan: best.moveSan,
    continuationSan: played.pvSan.slice(0, 6),
  };
}

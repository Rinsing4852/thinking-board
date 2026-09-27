import type { OpeningLineMove } from "../../../packages/contracts/src/api";

type LinePositionMove = Pick<OpeningLineMove, "ply" | "fenBefore" | "fenAfter">;

export function fenPositionKey(fen: string): string {
  return fen.split(" ").slice(0, 4).join(" ");
}

export function findPlyAtFen(moves: LinePositionMove[], fen: string): number | null {
  const key = fenPositionKey(fen);
  if (moves[0] && fenPositionKey(moves[0].fenBefore) === key) return 0;
  const after = moves.find((move) => fenPositionKey(move.fenAfter) === key);
  if (after) return after.ply;
  const before = moves.find((move) => fenPositionKey(move.fenBefore) === key);
  return before ? Math.max(0, before.ply - 1) : null;
}

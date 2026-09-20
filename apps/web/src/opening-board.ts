import { Chess } from "chess.js";

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

export function applyUciMove(fen: string, moveUci: string): string {
  const chess = new Chess(fen);
  chess.move({
    from: moveUci.slice(0, 2),
    to: moveUci.slice(2, 4),
    ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
  });
  return chess.fen();
}

export function getMoveHint(fen: string, moveUci: string): { square: string; piece: string } {
  if (moveUci.length < 4) return { square: "", piece: "piece" };
  const square = moveUci.slice(0, 2);
  const piece = new Chess(fen).get(square as never);
  return { square, piece: piece ? PIECE_NAMES[piece.type] ?? "piece" : "piece" };
}

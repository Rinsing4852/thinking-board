import { useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";

import type { Color } from "../../../../packages/contracts/src/api";

const PIECES: Record<string, string> = {
  K: "♚", Q: "♛", R: "♜", B: "♝", N: "♞", P: "♟",
  k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟",
};
const PIECE_NAMES: Record<string, string> = {
  p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king",
};

interface ChessBoardProps {
  fen: string;
  orientation: Color;
  interactive?: boolean;
  lastMove?: string | null;
  selectedSquare?: string | null;
  highlightedSquares?: string[];
  onMove?: (uci: string, san: string) => void;
  onSquareSelect?: (square: string) => void;
}

function squareName(file: number, rank: number): string {
  return `${"abcdefgh"[file]}${rank + 1}`;
}

function boardSquares(orientation: Color): string[] {
  const squares: string[] = [];
  const ranks = orientation === "white" ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = orientation === "white" ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  for (const rank of ranks) for (const file of files) squares.push(squareName(file, rank));
  return squares;
}

export function ChessBoard({
  fen,
  orientation,
  interactive = false,
  lastMove,
  selectedSquare,
  highlightedSquares = [],
  onMove,
  onSquareSelect,
}: ChessBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const game = useMemo(() => new Chess(fen), [fen]);
  const squares = useMemo(() => boardSquares(orientation), [orientation]);
  const targets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(
      game.moves({ square: selected as never, verbose: true }).map((move) => move.to),
    );
  }, [game, selected]);

  useEffect(() => setSelected(null), [fen]);

  const clickSquare = (square: string): void => {
    if (!interactive) return;
    if (onSquareSelect) {
      onSquareSelect(square);
      return;
    }
    if (!selected) {
      const piece = game.get(square as never);
      if (piece && piece.color === game.turn()) setSelected(square);
      return;
    }
    if (selected === square) {
      setSelected(null);
      return;
    }
    const legal = game.moves({ square: selected as never, verbose: true })
      .filter((move) => move.to === square);
    const chosen = legal.find((move) => move.promotion === "q") ?? legal[0];
    if (!chosen) {
      const piece = game.get(square as never);
      setSelected(piece && piece.color === game.turn() ? square : null);
      return;
    }
    const uci = `${chosen.from}${chosen.to}${chosen.promotion ?? ""}`;
    onMove?.(uci, chosen.san);
    setSelected(null);
  };

  return (
    <div className="chessboard" role="grid" aria-label="Chess position">
      {squares.map((square) => {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]) - 1;
        const piece = game.get(square as never);
        const symbol = piece ? PIECES[piece.color === "w" ? piece.type.toUpperCase() : piece.type] : "";
        const isLast = Boolean(lastMove?.startsWith(square) || lastMove?.slice(2, 4) === square);
        const className = [
          "board-square",
          (file + rank) % 2 === 0 ? "light" : "dark",
          selected === square || selectedSquare === square ? "selected" : "",
          targets.has(square) ? "target" : "",
          isLast ? "last-move" : "",
          highlightedSquares.includes(square) ? "answer-highlight" : "",
        ].filter(Boolean).join(" ");
        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            className={className}
            aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}` : " empty"}`}
            tabIndex={interactive ? 0 : -1}
            onClick={() => clickSquare(square)}
          >
            <span className={`piece ${piece?.color === "w" ? "white-piece" : "black-piece"}`} aria-hidden="true">{symbol}</span>
            {file === (orientation === "white" ? 0 : 7) && <span className="rank-label">{square[1]}</span>}
            {rank === (orientation === "white" ? 0 : 7) && <span className="file-label">{square[0]}</span>}
          </button>
        );
      })}
    </div>
  );
}

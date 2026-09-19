import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Chess } from "chess.js";

import type { Color } from "../../../../packages/contracts/src/api";

const PIECE_IMAGES: Record<string, string> = {
  wk: "/pieces/cburnett/wk.svg",
  wq: "/pieces/cburnett/wq.svg",
  wr: "/pieces/cburnett/wr.svg",
  wb: "/pieces/cburnett/wb.svg",
  wn: "/pieces/cburnett/wn.svg",
  wp: "/pieces/cburnett/wp.svg",
  bk: "/pieces/cburnett/bk.svg",
  bq: "/pieces/cburnett/bq.svg",
  br: "/pieces/cburnett/br.svg",
  bb: "/pieces/cburnett/bb.svg",
  bn: "/pieces/cburnett/bn.svg",
  bp: "/pieces/cburnett/bp.svg",
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
  ariaLabel?: string;
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
  ariaLabel = "Chess position",
}: ChessBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const game = useMemo(() => new Chess(fen), [fen]);
  const squares = useMemo(() => boardSquares(orientation), [orientation]);
  const [focusedSquare, setFocusedSquare] = useState(squares[0]!);
  const squareRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const targets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(
      game.moves({ square: selected as never, verbose: true }).map((move) => move.to),
    );
  }, [game, selected]);

  useEffect(() => setSelected(null), [fen]);
  useEffect(() => setFocusedSquare(squares[0]!), [squares]);

  const moveKeyboardFocus = (event: KeyboardEvent<HTMLButtonElement>, square: string): void => {
    if (!interactive) return;
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    const index = squares.indexOf(square);
    const row = Math.floor(index / 8) + offset[0];
    const column = index % 8 + offset[1];
    if (row < 0 || row > 7 || column < 0 || column > 7) return;
    event.preventDefault();
    const nextSquare = squares[row * 8 + column]!;
    setFocusedSquare(nextSquare);
    squareRefs.current[nextSquare]?.focus();
  };

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
    <div className="chessboard" role="grid" aria-label={ariaLabel}>
      {squares.map((square) => {
        const file = square.charCodeAt(0) - 97;
        const rank = Number(square[1]) - 1;
        const piece = game.get(square as never);
        const pieceImage = piece ? PIECE_IMAGES[`${piece.color}${piece.type}`] : null;
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
            tabIndex={interactive && focusedSquare === square ? 0 : -1}
            ref={(element) => { squareRefs.current[square] = element; }}
            onFocus={() => setFocusedSquare(square)}
            onKeyDown={(event) => moveKeyboardFocus(event, square)}
            onClick={() => {
              setFocusedSquare(square);
              clickSquare(square);
            }}
          >
            {pieceImage && (
              <img
                className="piece"
                src={pieceImage}
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            )}
            {file === (orientation === "white" ? 0 : 7) && <span className="rank-label">{square[1]}</span>}
            {rank === (orientation === "white" ? 0 : 7) && <span className="file-label">{square[0]}</span>}
          </button>
        );
      })}
    </div>
  );
}

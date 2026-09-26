import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
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
const PROMOTION_PIECES = ["q", "r", "b", "n"] as const;

interface PromotionChoice {
  color: "w" | "b";
  from: string;
  to: string;
  moves: Array<{ promotion: string; san: string; uci: string }>;
}

interface DragStart {
  from: string;
  image: string;
  moved: boolean;
  pointerId: number;
  size: number;
  startX: number;
  startY: number;
}

interface DragPiece {
  from: string;
  image: string;
  size: number;
  x: number;
  y: number;
}

type AnnotationColor = "green" | "red" | "blue" | "yellow";

interface BoardAnnotation {
  color: AnnotationColor;
  from: string;
  to: string;
}

interface AnnotationStart {
  color: AnnotationColor;
  from: string;
  pointerId: number;
}

interface ChessBoardProps {
  fen: string;
  orientation: Color;
  interactive?: boolean;
  lastMove?: string | null;
  selectedSquare?: string | null;
  highlightedSquares?: string[];
  rejectedMove?: string | null;
  allowAnnotations?: boolean;
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

function boardPoint(square: string, orientation: Color): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return orientation === "white"
    ? { x: file + .5, y: 7 - rank + .5 }
    : { x: 7 - file + .5, y: rank + .5 };
}

function annotationColor(event: PointerEvent<HTMLButtonElement>): AnnotationColor {
  if (event.shiftKey) return "red";
  if (event.altKey) return "blue";
  if (event.ctrlKey || event.metaKey) return "yellow";
  return "green";
}

export function ChessBoard({
  fen,
  orientation,
  interactive = false,
  lastMove,
  selectedSquare,
  highlightedSquares = [],
  rejectedMove,
  allowAnnotations = false,
  onMove,
  onSquareSelect,
  ariaLabel = "Chess position",
}: ChessBoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragPiece, setDragPiece] = useState<DragPiece | null>(null);
  const [promotionChoice, setPromotionChoice] = useState<PromotionChoice | null>(null);
  const [annotations, setAnnotations] = useState<BoardAnnotation[]>([]);
  const [annotationPreview, setAnnotationPreview] = useState<BoardAnnotation | null>(null);
  const [invalidSquare, setInvalidSquare] = useState<string | null>(null);
  const game = useMemo(() => new Chess(fen), [fen]);
  const squares = useMemo(() => boardSquares(orientation), [orientation]);
  const [focusedSquare, setFocusedSquare] = useState(squares[0]!);
  const squareRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const firstPromotionButton = useRef<HTMLButtonElement | null>(null);
  const dragStart = useRef<DragStart | null>(null);
  const annotationStart = useRef<AnnotationStart | null>(null);
  const invalidTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const statusId = useId();
  const markerId = statusId.replaceAll(":", "");
  const targets = useMemo(() => {
    const result = new Map<string, boolean>();
    if (!selected) return result;
    for (const move of game.moves({ square: selected as never, verbose: true })) {
      result.set(move.to, Boolean(move.captured));
    }
    return result;
  }, [game, selected]);
  const checkedKing = useMemo(() => {
    if (!game.inCheck()) return null;
    return squares.find((square) => {
      const piece = game.get(square as never);
      return piece?.type === "k" && piece.color === game.turn();
    }) ?? null;
  }, [game, squares]);

  useEffect(() => {
    setSelected(null);
    setDragPiece(null);
    setPromotionChoice(null);
    setAnnotations([]);
    setAnnotationPreview(null);
    setInvalidSquare(null);
    dragStart.current = null;
    annotationStart.current = null;
    if (invalidTimer.current !== null) {
      window.clearTimeout(invalidTimer.current);
      invalidTimer.current = null;
    }
  }, [fen]);
  useEffect(() => setFocusedSquare(squares[0]!), [squares]);
  useEffect(() => {
    if (promotionChoice) firstPromotionButton.current?.focus();
  }, [promotionChoice]);
  useEffect(() => () => {
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current);
  }, []);

  const showInvalidMove = (square: string): void => {
    if (invalidTimer.current !== null) window.clearTimeout(invalidTimer.current);
    setInvalidSquare(null);
    window.requestAnimationFrame(() => setInvalidSquare(square));
    invalidTimer.current = window.setTimeout(() => {
      setInvalidSquare(null);
      invalidTimer.current = null;
    }, 420);
  };

  const moveKeyboardFocus = (event: KeyboardEvent<HTMLButtonElement>, square: string): void => {
    if (!interactive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setSelected(null);
      setPromotionChoice(null);
      return;
    }
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

  const finishMove = (uci: string, san: string): void => {
    onMove?.(uci, san);
    setPromotionChoice(null);
    setSelected(null);
  };

  const tryMove = (from: string, to: string): boolean => {
    const legal = game.moves({ square: from as never, verbose: true }).filter((move) => move.to === to);
    if (legal.length === 0) return false;
    const promotions = legal.filter((move) => move.promotion);
    if (promotions.length > 1) {
      const piece = game.get(from as never);
      setPromotionChoice({
        color: piece?.color ?? game.turn(),
        from,
        to,
        moves: promotions.map((move) => ({
          promotion: move.promotion!,
          san: move.san,
          uci: `${move.from}${move.to}${move.promotion}`,
        })),
      });
      return true;
    }
    const chosen = legal[0]!;
    const uci = `${chosen.from}${chosen.to}${chosen.promotion ?? ""}`;
    finishMove(uci, chosen.san);
    return true;
  };

  const clickSquare = (square: string): void => {
    if (annotations.length > 0) setAnnotations([]);
    if (!interactive || promotionChoice) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
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
    if (tryMove(selected, square)) return;
    const piece = game.get(square as never);
    if (piece && piece.color === game.turn()) {
      setSelected(square);
    } else {
      showInvalidMove(square);
      setSelected(null);
    }
  };

  const startAnnotation = (event: PointerEvent<HTMLButtonElement>, square: string): boolean => {
    if (!allowAnnotations || event.button !== 2) return false;
    event.preventDefault();
    annotationStart.current = {
      color: annotationColor(event),
      from: square,
      pointerId: event.pointerId,
    };
    setAnnotationPreview({ color: annotationColor(event), from: square, to: square });
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>, square: string, image: string): void => {
    if (!interactive || onSquareSelect || promotionChoice || event.button !== 0) return;
    const piece = game.get(square as never);
    if (!piece || piece.color !== game.turn()) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    dragStart.current = {
      from: square,
      image,
      moved: false,
      pointerId: event.pointerId,
      size: bounds.width * .96,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const mark = annotationStart.current;
    if (mark?.pointerId === event.pointerId) {
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-square]");
      setAnnotationPreview({ color: mark.color, from: mark.from, to: target?.dataset.square ?? mark.from });
      return;
    }
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    if (!start.moved && Math.hypot(event.clientX - start.startX, event.clientY - start.startY) < 5) return;
    start.moved = true;
    event.preventDefault();
    setSelected(start.from);
    setDragPiece({ from: start.from, image: start.image, size: start.size, x: event.clientX, y: event.clientY });
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const mark = annotationStart.current;
    if (mark?.pointerId === event.pointerId) {
      event.preventDefault();
      annotationStart.current = null;
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-square]");
      const annotation = { color: mark.color, from: mark.from, to: target?.dataset.square ?? mark.from };
      setAnnotationPreview(null);
      setAnnotations((current) => current.some((item) => item.from === annotation.from && item.to === annotation.to && item.color === annotation.color)
        ? current.filter((item) => !(item.from === annotation.from && item.to === annotation.to && item.color === annotation.color))
        : [...current, annotation]);
      return;
    }
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    dragStart.current = null;
    setDragPiece(null);
    if (!start.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 0);
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-square]");
    const destination = target?.dataset.square;
    if (!destination || destination === start.from || !tryMove(start.from, destination)) {
      setSelected(start.from);
      showInvalidMove(destination ?? start.from);
    }
  };

  const cancelDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    if (annotationStart.current?.pointerId === event.pointerId) {
      annotationStart.current = null;
      setAnnotationPreview(null);
      return;
    }
    if (dragStart.current?.pointerId !== event.pointerId) return;
    dragStart.current = null;
    setDragPiece(null);
  };

  const selectedPiece = selected ? game.get(selected as never) : null;
  const boardStatus = promotionChoice
    ? `Choose a piece for the pawn on ${promotionChoice.to}.`
    : invalidSquare
      ? `That piece cannot move to ${invalidSquare}. Try another move.`
    : selected && selectedPiece
      ? `${PIECE_NAMES[selectedPiece.type]} on ${selected} selected. ${targets.size} legal ${targets.size === 1 ? "move" : "moves"}.`
      : interactive ? "Select a piece, then choose its destination. You can also drag pieces." : "";

  return (
    <div className="chessboard-frame">
      <div
        className={`chessboard${interactive ? " interactive" : ""}${dragPiece ? " dragging" : ""}`}
        role="grid"
        aria-label={ariaLabel}
        aria-describedby={statusId}
        onContextMenu={(event) => { if (allowAnnotations) event.preventDefault(); }}
      >
        {squares.map((square) => {
          const file = square.charCodeAt(0) - 97;
          const rank = Number(square[1]) - 1;
          const piece = game.get(square as never);
          const pieceImage = piece ? PIECE_IMAGES[`${piece.color}${piece.type}`] : null;
          const isLast = lastMove?.slice(0, 2) === square || lastMove?.slice(2, 4) === square;
          const isRejected = rejectedMove?.slice(0, 2) === square || rejectedMove?.slice(2, 4) === square;
          const isMovable = interactive && !onSquareSelect && piece?.color === game.turn();
          const isTarget = targets.has(square);
          const isMoveDestination = lastMove?.slice(2, 4) === square;
          const moveFrom = lastMove?.slice(0, 2);
          const fromPoint = moveFrom ? boardPoint(moveFrom, orientation) : null;
          const toPoint = boardPoint(square, orientation);
          const moveStyle = isMoveDestination && fromPoint
            ? {
                "--move-x": `${(fromPoint.x - toPoint.x) * (100 / .96)}%`,
                "--move-y": `${(fromPoint.y - toPoint.y) * (100 / .96)}%`,
              } as CSSProperties
            : undefined;
          const className = [
            "board-square",
            (file + rank) % 2 === 0 ? "light" : "dark",
            selected === square || selectedSquare === square ? "selected" : "",
            isTarget ? "target" : "",
            isTarget && targets.get(square) ? "capture-target" : "",
            isMovable ? "movable" : "",
            dragPiece?.from === square ? "drag-origin" : "",
            isLast ? "last-move" : "",
            highlightedSquares.includes(square) ? "answer-highlight" : "",
            isRejected ? "rejected-move" : "",
            checkedKing === square ? "in-check" : "",
            invalidSquare === square ? "invalid-move" : "",
          ].filter(Boolean).join(" ");
          return (
            <button
              key={square}
              type="button"
              role="gridcell"
              className={className}
              data-square={square}
              aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}` : " empty"}`}
              aria-selected={selected === square || undefined}
              tabIndex={interactive && focusedSquare === square ? 0 : -1}
              ref={(element) => { squareRefs.current[square] = element; }}
              onFocus={() => setFocusedSquare(square)}
              onKeyDown={(event) => moveKeyboardFocus(event, square)}
              onPointerDown={(event) => {
                if (startAnnotation(event, square)) return;
                if (pieceImage) startDrag(event, square, pieceImage);
              }}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={cancelDrag}
              onClick={() => {
                setFocusedSquare(square);
                clickSquare(square);
              }}
            >
              {pieceImage && (
                <img
                  key={isMoveDestination ? `${lastMove}-${fen}` : `${piece?.color}${piece?.type}`}
                  className={`piece${isMoveDestination ? " moving-piece" : ""}`}
                  src={pieceImage}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                  style={moveStyle}
                />
              )}
              {file === (orientation === "white" ? 7 : 0) && <span className="rank-label" aria-hidden="true">{square[1]}</span>}
              {rank === (orientation === "white" ? 0 : 7) && <span className="file-label" aria-hidden="true">{square[0]}</span>}
            </button>
          );
        })}
        {(annotations.length > 0 || annotationPreview) && (
          <svg className="board-annotations" viewBox="0 0 8 8" aria-hidden="true">
            <defs>
              {(["green", "red", "blue", "yellow"] as const).map((color) => (
                <marker key={color} id={`${markerId}-${color}`} markerWidth="3.8" markerHeight="3.8" refX="2.8" refY="1.9" orient="auto" markerUnits="strokeWidth">
                  <path className={`annotation-${color}`} d="M0,0 L3.8,1.9 L0,3.8 z" />
                </marker>
              ))}
            </defs>
            {[...annotations, ...(annotationPreview ? [annotationPreview] : [])].map((annotation, index) => {
              const from = boardPoint(annotation.from, orientation);
              const to = boardPoint(annotation.to, orientation);
              const preview = index >= annotations.length;
              if (annotation.from === annotation.to) {
                return <circle key={`${annotation.from}-${annotation.to}-${annotation.color}-${index}`} className={`annotation-mark annotation-${annotation.color}${preview ? " preview" : ""}`} cx={from.x} cy={from.y} r=".36" />;
              }
              const distance = Math.hypot(to.x - from.x, to.y - from.y);
              const endRatio = Math.max(0, (distance - .28) / distance);
              return (
                <line
                  key={`${annotation.from}-${annotation.to}-${annotation.color}-${index}`}
                  className={`annotation-mark annotation-${annotation.color}${preview ? " preview" : ""}`}
                  x1={from.x}
                  y1={from.y}
                  x2={from.x + (to.x - from.x) * endRatio}
                  y2={from.y + (to.y - from.y) * endRatio}
                  markerEnd={`url(#${markerId}-${annotation.color})`}
                />
              );
            })}
          </svg>
        )}
      </div>
      {dragPiece && (
        <img
          className="dragged-piece"
          src={dragPiece.image}
          alt=""
          aria-hidden="true"
          style={{ height: dragPiece.size, left: dragPiece.x, top: dragPiece.y, width: dragPiece.size }}
        />
      )}
      {promotionChoice && (
        <div
          className="promotion-picker"
          role="dialog"
          aria-modal="true"
          aria-label="Choose promotion piece"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setPromotionChoice(null);
              squareRefs.current[promotionChoice.from]?.focus();
            }
          }}
        >
          <strong>Promote pawn to</strong>
          <div>
            {PROMOTION_PIECES.map((piece) => {
              const move = promotionChoice.moves.find((candidate) => candidate.promotion === piece);
              if (!move) return null;
              return (
                <button
                  key={piece}
                  type="button"
                  ref={piece === "q" ? firstPromotionButton : undefined}
                  aria-label={`Promote to ${PIECE_NAMES[piece]}`}
                  onClick={() => finishMove(move.uci, move.san)}
                >
                  <img src={PIECE_IMAGES[`${promotionChoice.color}${piece}`]} alt="" aria-hidden="true" draggable={false} />
                  <span>{PIECE_NAMES[piece]}</span>
                </button>
              );
            })}
          </div>
          <button className="text-button" onClick={() => setPromotionChoice(null)}>Cancel</button>
        </div>
      )}
      <span id={statusId} className="sr-only" aria-live="polite">{boardStatus}</span>
    </div>
  );
}

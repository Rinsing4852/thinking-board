import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Chess, type Square } from "chess.js";
import { Chessground } from "@lichess-org/chessground";
import type { Api } from "@lichess-org/chessground/api";
import type { Key } from "@lichess-org/chessground/types";
import "@lichess-org/chessground/assets/chessground.base.css";
import "@lichess-org/chessground/assets/chessground.brown.css";

import type { Color, OpeningBoardAnnotation } from "../../../../packages/contracts/src/api";
import { boardSquares, legalDestinations, moveSquares } from "../chessboard";

const PIECE_NAMES = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
const PROMOTION_PIECES = ["q", "r", "b", "n"] as const;
const NO_SQUARES: string[] = [];
const NO_ANNOTATIONS: OpeningBoardAnnotation[] = [];
interface PromotionChoice {
  color: "w" | "b";
  from: Square;
  to: Square;
  moves: Array<{ promotion: string; san: string; uci: string }>;
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
  sourceAnnotations?: OpeningBoardAnnotation[];
  onMove?: (uci: string, san: string) => void;
  onSquareSelect?: (square: string) => void;
  ariaLabel?: string;
  animateMoves?: boolean;
  animationDuration?: number;
}

export function ChessBoard(props: ChessBoardProps) {
  const { fen, orientation, interactive = false, lastMove, selectedSquare, highlightedSquares = NO_SQUARES,
    rejectedMove, allowAnnotations = false, sourceAnnotations = NO_ANNOTATIONS, ariaLabel = "Chess position", animateMoves = true,
    animationDuration = 200 } = props;
  const squareSelection = Boolean(props.onSquareSelect);
  const game = useMemo(() => new Chess(fen), [fen]);
  const destinations = useMemo(() => legalDestinations(game), [game]);
  const squares = useMemo(() => boardSquares(orientation), [orientation]);
  const [selected, setSelected] = useState<Key | null>(null);
  const [focused, setFocused] = useState<Square>(squares[0]!);
  const [promotion, setPromotion] = useState<PromotionChoice | null>(null);
  const [boardElement, setBoardElement] = useState<HTMLElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const host = useRef<HTMLDivElement | null>(null);
  const ground = useRef<Api | null>(null);
  const cells = useRef<Record<string, HTMLButtonElement | null>>({});
  const picker = useRef<HTMLDivElement | null>(null);
  const previousFen = useRef(fen);
  const pendingFrame = useRef<number | null>(null);
  const latest = useRef({ props, game });
  latest.current = { props, game };
  const statusId = useId();

  // The parent owns the position. Restore it when a training answer is
  // rejected, or when the caller collects candidates without playing them.
  const restoreControlledPosition = () => {
    const api = ground.current;
    if (!api) return;
    const current = latest.current;
    api.set({ fen: current.props.fen, turnColor: current.game.turn() === "w" ? "white" : "black",
      lastMove: moveSquares(current.props.lastMove) ?? [], movable: { dests: legalDestinations(current.game) } });
  };
  const proposeMove = (from: Key, to: Key) => {
    if (!ground.current) return; // Ignore deferred native callbacks after unmount.
    const current = latest.current;
    if (!current.props.interactive || current.props.onSquareSelect) return;
    const legal = current.game.moves({ square: from as Square, verbose: true }).filter(move => move.to === to);
    if (!legal.length) { restoreControlledPosition(); return; }
    if (legal[0]!.promotion) {
      restoreControlledPosition();
      setPromotion({ color: current.game.turn(), from: from as Square, to: to as Square,
        moves: legal.map(move => ({ promotion: move.promotion!, san: move.san,
          uci: `${move.from}${move.to}${move.promotion}` })) });
      return;
    }
    const move = legal[0]!;
    setSelected(null);
    current.props.onMove?.(`${move.from}${move.to}`, move.san);
    if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = requestAnimationFrame(() => {
      pendingFrame.current = null;
      const api = ground.current;
      if (api && api.getFen() !== latest.current.props.fen.split(" ")[0]) restoreControlledPosition();
    });
  };
  const proposeRef = useRef(proposeMove);
  proposeRef.current = proposeMove;

  useLayoutEffect(() => {
    const api = Chessground(host.current!, {
      fen: latest.current.props.fen,
      coordinates: false,
      viewOnly: false, // Keep fixed: API.set cannot change native event bindings.
      premovable: { enabled: false }, predroppable: { enabled: false },
      movable: { free: false, rookCastle: false, events: { after: (from, to) => proposeRef.current(from, to) } },
      events: {
        insert: elements => setBoardElement(elements.board),
        select: square => {
          if (!ground.current) return;
          const current = latest.current.props;
          if (!current.interactive) return;
          if (current.onSquareSelect) current.onSquareSelect(square);
          else setSelected(ground.current?.state.selected ?? null);
        },
      },
    });
    ground.current = api;
    // A click can follow scrolling/layout changes before the browser delivers
    // its scroll/resize event. Measure the board at input time, not from a stale
    // cached rectangle (especially when practice scrolls a square into view).
    const refreshBounds = (event: Event) => {
      api.state.dom.bounds.clear();
      // Chessground normally suppresses a touch on any piece, even when it
      // cannot move. Let the page scroll over read-only review boards.
      if (event.type === "touchstart" && !latest.current.props.interactive && !latest.current.props.allowAnnotations)
        event.stopPropagation();
    };
    const element = host.current!;
    element.addEventListener("mousedown", refreshBounds, true);
    element.addEventListener("touchstart", refreshBounds, { capture: true, passive: true });
    return () => {
      element.removeEventListener("mousedown", refreshBounds, true);
      element.removeEventListener("touchstart", refreshBounds, true);
      if (pendingFrame.current !== null) cancelAnimationFrame(pendingFrame.current);
      ground.current = null;
      api.destroy();
    };
  }, []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(preference.matches);
    update(); preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  // Preserve the instance during React renders. In particular, selection must
  // not replace FEN on every click and cancel an active drag.
  useLayoutEffect(() => {
    const api = ground.current;
    if (!api) return;
    const changed = previousFen.current !== fen;
    if (changed) {
      api.cancelMove(); setSelected(null); setPromotion(null);
      previousFen.current = fen;
    }
    const enabled = interactive && !promotion;
    const canMove = enabled && !props.onSquareSelect;
    if (!canMove) delete api.state.movable.color;
    const custom = new Map<Key, string>();
    for (const square of highlightedSquares) custom.set(square as Key, "answer-highlight");
    for (const square of moveSquares(rejectedMove) ?? []) custom.set(square, "rejected-move");
    if (selectedSquare) custom.set(selectedSquare as Key, "answer-highlight");
    api.set({
      ...(changed || api.getFen() !== fen.split(" ")[0] ? { fen } : {}),
      orientation, turnColor: game.turn() === "w" ? "white" : "black",
      lastMove: moveSquares(lastMove) ?? [], check: game.inCheck(),
      animation: { enabled: animateMoves && !reducedMotion, duration: animationDuration },
      movable: { ...(canMove ? { color: game.turn() === "w" ? "white" as const : "black" as const } : {}),
        dests: destinations },
      draggable: { enabled: enabled && !props.onSquareSelect, distance: 4, autoDistance: true, showGhost: true },
      selectable: { enabled }, blockTouchScroll: enabled,
      drawable: { enabled: allowAnnotations && !promotion, eraseOnMovablePieceClick: true,
        autoShapes: sourceAnnotations.map(mark => ({ orig: mark.from as Key,
          ...(mark.from !== mark.to ? { dest: mark.to as Key } : {}), brush: mark.color })) },
      highlight: { custom },
    });
    if (!enabled) { api.cancelMove(); setSelected(null); }
  }, [fen, orientation, interactive, promotion, squareSelection, destinations, game,
    highlightedSquares, rejectedMove, selectedSquare, lastMove, animateMoves, animationDuration, reducedMotion,
    allowAnnotations, sourceAnnotations]);

  useEffect(() => setFocused(squares[0]!), [squares]);
  useEffect(() => {
    if (promotion) picker.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [promotion]);
  const cancelPromotion = () => {
    setPromotion(null);
    if (promotion) cells.current[promotion.from]?.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>, square: Square) => {
    if (!interactive || promotion || event.altKey) return;
    if (event.key === "Escape") { ground.current?.cancelMove(); setSelected(null); return; }
    const offsets: Record<string, [number, number]> = {
      ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const index = squares.indexOf(square);
    const row = Math.floor(index / 8) + offset[0], column = index % 8 + offset[1];
    if (row >= 0 && row < 8 && column >= 0 && column < 8) cells.current[squares[row * 8 + column]!]!.focus();
  };
  const selectedPiece = selected ? game.get(selected as Square) : null;
  const status = promotion ? `Choose a piece for the pawn on ${promotion.to}.`
    : selected && selectedPiece ? `${PIECE_NAMES[selectedPiece.type]} on ${selected} selected. ${(destinations.get(selected) ?? []).length} legal moves.`
    : interactive ? props.onSquareSelect ? "Choose a square on the board." : "Select a piece, then its destination, or drag it. Arrow keys move focus; Enter or Space selects a square." : "";

  return <div className="chessboard-frame">
    <div ref={host} className={`chessboard cg-wrap${interactive ? " interactive" : ""}`} role="grid"
      aria-label={ariaLabel} aria-describedby={statusId} />
    {boardElement && createPortal(
      // Inside cg-board: trusted mouse/touch events bubble to Chessground.
      // This accessible layer does not implement a second drag engine.
      <div className="board-square-layer">
        {squares.map(square => {
          const piece = game.get(square);
          const file = square.charCodeAt(0) - 97, rank = Number(square[1]) - 1;
          const isSelected = selected === square || selectedSquare === square;
          const target = selected && destinations.get(selected)?.includes(square);
          const answer = highlightedSquares.includes(square) || selectedSquare === square;
          const rejected = moveSquares(rejectedMove)?.includes(square);
          return <button key={square} type="button" role="gridcell" data-square={square}
            className={`board-square ${(file + rank) % 2 === 0 ? "dark" : "light"}${isSelected ? " selected" : ""}${target ? " target" : ""}${answer ? " answer-highlight" : ""}${rejected ? " rejected-move" : ""}`}
            aria-label={`${square}${piece ? ` ${piece.color === "w" ? "white" : "black"} ${PIECE_NAMES[piece.type]}` : " empty"}`}
            aria-selected={isSelected || undefined} tabIndex={interactive && !promotion && focused === square ? 0 : -1}
            ref={element => { cells.current[square] = element; }} onFocus={() => setFocused(square)}
            onKeyDown={event => keyDown(event, square)} onPointerDown={() => setFocused(square)}
            onClick={event => {
              // Pointer moves are handled natively; keyboard activation has no
              // mousedown and must explicitly select a square exactly once.
              if (event.detail === 0 && interactive && !promotion) ground.current?.selectSquare(square);
            }}>
            {file === (orientation === "white" ? 7 : 0) && <span className="rank-label" aria-hidden="true">{square[1]}</span>}
            {rank === (orientation === "white" ? 0 : 7) && <span className="file-label" aria-hidden="true">{square[0]}</span>}
          </button>;
        })}
      </div>, boardElement)}
    {promotion && <div ref={picker} className="promotion-picker" role="dialog" aria-modal="true" aria-label="Choose promotion piece"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); cancelPromotion(); }
        if (event.key === "Tab") {
          const buttons = [...picker.current!.querySelectorAll<HTMLButtonElement>("button")];
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault(); buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]!.focus();
        }
      }}>
      <strong>Promote pawn to</strong><div>{PROMOTION_PIECES.map(piece => {
        const move = promotion.moves.find(choice => choice.promotion === piece)!;
        return <button key={piece} type="button" aria-label={`Promote to ${PIECE_NAMES[piece]}`} onClick={() => {
          setPromotion(null); setSelected(null); latest.current.props.onMove?.(move.uci, move.san);
        }}><img src={`/pieces/cburnett/${promotion.color}${piece}.svg`} alt="" aria-hidden="true" draggable={false} />
          <span>{PIECE_NAMES[piece]}</span></button>;
      })}</div><button type="button" className="text-button" onClick={cancelPromotion}>Cancel</button>
    </div>}
    <span id={statusId} className="sr-only" aria-live="polite">{status}</span>
  </div>;
}

import { useCallback, useEffect, useRef, useState } from "react";
import { applyUciMove } from "./opening-board";

export const REJECTED_MOVE_HOLD_MS = 650;
export const REJECTED_MOVE_RETURN_MS = 360;

/** A rejected answer is a temporary preview, never a change to the exercise. */
export function usePracticeMoveReset(positionKey: string, enabled = true,
  holdMs = REJECTED_MOVE_HOLD_MS, returnDuration = REJECTED_MOVE_RETURN_MS) {
  const [preview, setPreview] = useState<{ key: string; fen: string | null } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const locked = useRef(false);
  const cancel = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    locked.current = false;
    setPreview(null);
  }, []);

  useEffect(() => {
    cancel();
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      locked.current = false;
    };
  }, [positionKey, enabled, cancel]);

  const reject = (fen: string, uci: string) => {
    if (!enabled || locked.current) return;
    const movedFen = applyUciMove(fen, uci);
    locked.current = true;
    setPreview({ key: positionKey, fen: movedFen });
    timers.current.push(setTimeout(() => {
      setPreview({ key: positionKey, fen: null });
      const returnMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : returnDuration;
      timers.current.push(setTimeout(cancel, returnMs));
    }, holdMs));
  };
  const current = enabled && preview?.key === positionKey ? preview : null;
  return { fen: current?.fen, busy: current !== null, reject,
    animationDuration: current ? returnDuration : 200 };
}

import { Chess } from "chess.js";
import type { Color } from "../../../packages/contracts/src/api";

export interface BuiltMove { moveUci: string; moveSan: string; fenBefore: string; fenAfter: string; note: string }
export interface OpeningDraft { name: string; learnerColor: Color; moves: BuiltMove[] }
export const OPENING_DRAFT_KEY = "thinking-board.opening-draft.v1";
export const emptyOpeningDraft = (): OpeningDraft => ({ name: "", learnerColor: "white", moves: [] });

/** Treat browser storage as untrusted; rebuild positions rather than trust stored FENs. */
export function parseOpeningDraft(raw: string | null): OpeningDraft | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as OpeningDraft;
    if (typeof value.name !== "string" || !["white", "black"].includes(value.learnerColor)
      || !Array.isArray(value.moves) || value.moves.length > 512) return null;
    const chess = new Chess();
    const moves = value.moves.map(move => {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move.moveUci) || typeof move.note !== "string") throw new Error("Invalid draft");
      const fenBefore = chess.fen();
      const played = chess.move({ from: move.moveUci.slice(0, 2), to: move.moveUci.slice(2, 4),
        ...(move.moveUci[4] ? { promotion: move.moveUci[4] } : {}) });
      return { moveUci: move.moveUci, moveSan: played.san, fenBefore, fenAfter: chess.fen(), note: move.note.slice(0, 1000) };
    });
    return { name: value.name.slice(0, 120), learnerColor: value.learnerColor, moves };
  } catch { return null; }
}

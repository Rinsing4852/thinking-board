import type { SqliteDatabase } from "../db/database.js";
import type { MoveExplanation } from "./opening-content.js";

/** Source context is separate from shared memory cards and personal explanations. */
export function sourceExplanation(db: SqliteDatabase, lineId: string, ply: number): MoveExplanation | null {
  const row = db.prepare("SELECT explanation_json FROM opening_line_annotations WHERE line_id = ? AND ply = ?")
    .pluck().get(lineId, ply) as string | undefined;
  return row ? JSON.parse(row) as MoveExplanation : null;
}

export function storeSourceExplanations(db: SqliteDatabase, lineId: string, explanations: MoveExplanation[]): void {
  const insert = db.prepare(`INSERT INTO opening_line_annotations(line_id, ply, explanation_json) VALUES (?, ?, ?)
    ON CONFLICT(line_id, ply) DO UPDATE SET explanation_json = excluded.explanation_json`);
  explanations.forEach((explanation, index) => insert.run(lineId, index + 1, JSON.stringify(explanation)));
}

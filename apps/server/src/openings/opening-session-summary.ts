import type { SqliteDatabase } from "../db/database.js";

/** A later successful retry is useful, but cannot turn a first attempt into a success. */
export function openingSessionSummary(db: SqliteDatabase, sessionId: string) {
  const rows = db.prepare(`
    SELECT q.review_item_id, q.sequence, q.presentation_kind, q.expected_move_id,
           q.idea_hint, q.piece_hint, q.move_shown, e.correct, e.assisted,
           EXISTS(SELECT 1 FROM opening_review_mistakes m WHERE m.queue_entry_id = q.id) AS mistaken
    FROM opening_review_queue q JOIN opening_review_events e ON e.queue_entry_id = q.id
    WHERE q.session_id = ? ORDER BY q.sequence
  `).all(sessionId) as Array<{ review_item_id: string; expected_move_id: string | null;
    presentation_kind: string; correct: number; assisted: number; mistaken: number;
    idea_hint: number; piece_hint: number; move_shown: number }>;
  const first = new Map<string, typeof rows[number]>();
  const helped = new Set<string>();
  const mistaken = new Set<string>();
  for (const row of rows) {
    const key = `${row.review_item_id}:${row.expected_move_id ?? "any"}`;
    if (!first.has(key)) first.set(key, row);
    if (row.idea_hint || row.piece_hint || row.move_shown) helped.add(key);
    if (row.mistaken || !row.correct) mistaken.add(key);
  }
  return {
    positions: first.size,
    firstTryRemembered: [...first.values()].filter(row => row.correct && !row.assisted).length,
    helpedPositions: helped.size,
    mistakePositions: mistaken.size,
    repeatAttempts: rows.filter(row => row.presentation_kind === "lapse_repeat").length,
  };
}

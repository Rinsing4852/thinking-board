import type { SqliteDatabase } from "../db/database.js";

/** First answer per scheduled encounter, never immediate retries or lapse repeats. */
export const FIRST_RECALL_EVIDENCE = `
  WITH answers AS (
    SELECT event.*, event.rowid AS event_order, COALESCE(played.id, queue.expected_move_id, item.move_id) AS target_move_id,
      ROW_NUMBER() OVER (PARTITION BY event.queue_entry_id ORDER BY event.created_at, event.rowid) AS encounter_answer
    FROM opening_review_events event
    JOIN opening_review_items item ON item.id = event.review_item_id AND item.profile_id = ?
    JOIN opening_review_queue queue ON queue.id = event.queue_entry_id AND queue.presentation_kind = 'scheduled'
    LEFT JOIN opening_moves played ON event.correct = 1 AND played.repertoire_id = item.repertoire_id
      AND played.from_position_id = item.position_id AND played.move_uci = event.played_move_uci
  ), recent AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY target_move_id ORDER BY created_at DESC, event_order DESC) AS recency
    FROM answers WHERE encounter_answer = 1
  )`;

export function moveRecall(db: SqliteDatabase, profileId: string): Map<string, { attempts: number; percent: number }> {
  const rows = db.prepare(`${FIRST_RECALL_EVIDENCE}
    SELECT target_move_id, COUNT(*) AS attempts,
      SUM(CASE WHEN correct = 1 AND assisted = 0 THEN 1 ELSE 0 END) AS correct
    FROM recent WHERE recency <= 20 GROUP BY target_move_id`).all(profileId) as Array<{
      target_move_id: string; attempts: number; correct: number;
    }>;
  return new Map(rows.map(row => [row.target_move_id, { attempts: row.attempts, percent: Math.round(100 * row.correct / row.attempts) }]));
}

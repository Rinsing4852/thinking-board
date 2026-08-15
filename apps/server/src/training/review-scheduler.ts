import type { SqliteDatabase } from "../db/database.js";

interface ReviewStateRow {
  mastery_level: number;
  attempts: number;
  successes: number;
  lapses: number;
  average_response_ms: number | null;
}

const REVIEW_INTERVAL_DAYS = [1, 3, 7, 16, 35] as const;

export function nextReviewDate(level: number, passed: boolean, attemptedAt: string): string {
  if (!passed) return attemptedAt;
  const days = REVIEW_INTERVAL_DAYS[Math.min(level, REVIEW_INTERVAL_DAYS.length - 1)] ?? 35;
  return new Date(Date.parse(attemptedAt) + days * 86_400_000).toISOString();
}

export function recordReview(
  db: SqliteDatabase,
  itemId: string,
  passed: boolean,
  durationMs: number,
  result: string,
  attemptedAt: string,
): void {
  const current = db.prepare(`
    SELECT mastery_level, attempts, successes, lapses, average_response_ms
    FROM review_states WHERE item_id = ?
  `).get(itemId) as ReviewStateRow | undefined;
  if (!current) throw new Error("Review state not found");

  const level = passed ? Math.min(5, current.mastery_level + 1) : 0;
  const attempts = current.attempts + 1;
  const average = Math.round(
    ((current.average_response_ms ?? durationMs) * current.attempts + durationMs) / attempts,
  );
  db.prepare(`
    UPDATE review_states SET mastery_level = ?, due_at = ?, last_attempted_at = ?,
      last_result = ?, attempts = ?, successes = ?, lapses = ?, average_response_ms = ?
    WHERE item_id = ?
  `).run(
    level,
    nextReviewDate(level, passed, attemptedAt),
    attemptedAt,
    result,
    attempts,
    current.successes + (passed ? 1 : 0),
    current.lapses + (passed ? 0 : 1),
    average,
    itemId,
  );
}

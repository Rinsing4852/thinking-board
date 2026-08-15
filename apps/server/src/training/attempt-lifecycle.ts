import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { activeProfileId } from "./profile.js";

export class AttemptLifecycle {
  constructor(private readonly db: SqliteDatabase) {}

  start(itemId: string, sessionId?: string): { attemptId: string; startedAt: string } {
    const profileId = activeProfileId(this.db);
    const item = this.db.prepare(`
      SELECT id FROM training_items
      WHERE id = ? AND profile_id = ? AND active = 1 AND mode != 'diagnosis_only'
    `).get(itemId, profileId) as { id: string } | undefined;
    if (!item) throw new Error("Training item not found");

    if (sessionId) {
      const selected = this.db.prepare(`
        SELECT 1 FROM training_session_items tsi
        JOIN training_sessions ts ON ts.id = tsi.session_id
        WHERE tsi.session_id = ? AND tsi.item_id = ? AND tsi.completed = 0
          AND ts.profile_id = ? AND ts.status = 'active'
      `).get(sessionId, itemId, profileId);
      if (!selected) throw new Error("This item is not pending in that session");
    }

    const startedAt = now();
    const attemptId = id();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts SET abandoned_at = ?
        WHERE item_id = ? AND answered_at IS NULL AND abandoned_at IS NULL
      `).run(startedAt, itemId);
      this.db.prepare(`
        INSERT INTO training_attempts(id, item_id, started_at, session_id, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(attemptId, itemId, startedAt, sessionId ?? null, startedAt);
      if (sessionId) {
        this.db.prepare(`
          UPDATE training_session_items SET attempt_id = ?
          WHERE session_id = ? AND item_id = ? AND completed = 0
        `).run(attemptId, sessionId, itemId);
      }
    })();
    return { attemptId, startedAt };
  }
}

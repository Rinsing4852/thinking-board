import type { OpeningPracticeSelectionResponse } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";
import { openingPositionKey } from "./opening-content.js";
import type { OpeningContentService } from "./opening-content-service.js";
import type { OpeningWorkspaceService } from "./opening-workspace-service.js";
import type { OpeningPreferencesService } from "./opening-preferences-service.js";
import type { OpeningExplorerService } from "./opening-explorer-service.js";
import { PREPARATION_MIN_SAMPLE } from "./opening-preparation-policy.js";

/** Visibility, game matching and move-memory cards are deliberately unchanged. */
export class OpeningPracticeSelectionService {
  constructor(private readonly db: SqliteDatabase, private readonly workspace: OpeningWorkspaceService,
    private readonly content: OpeningContentService, private readonly preferences: OpeningPreferencesService,
    private readonly explorer: OpeningExplorerService) {}

  get(repertoireId: string): OpeningPracticeSelectionResponse {
    const profileId = ensureActiveProfile(this.db);
    const detail = this.workspace.repertoire(repertoireId);
    const preferences = this.preferences.get();
    const progress = new Map(this.content.progress().lines.map(line => [line.lineId, line]));
    const cache = new Map<string, ReturnType<OpeningExplorerService["cachedPosition"]>>();
    const missing = new Set<string>();
    const fullRuns = this.fullRuns(profileId, repertoireId);
    const lines = detail.chapters.flatMap(chapter => chapter.lines.map(line => {
      const replies = line.moves.filter(move => move.role === "opponent");
      const observed: Array<{ percent: number; moveLabel: string; games: number }> = [];
      for (const move of replies) {
        const key = openingPositionKey(move.fenBefore);
        if (!cache.has(key)) cache.set(key, preferences.useExplorer
          ? this.explorer.cachedPosition(move.fenBefore, preferences.ratingGroup) : null);
        const sample = cache.get(key);
        if (!sample || sample.stale) { if (!line.archived) missing.add(key); continue; }
        const reply = sample.replies.find(candidate => candidate.moveUci === move.moveUci);
        if (sample.totalGames < PREPARATION_MIN_SAMPLE || !reply || reply.games < 5) continue;
        const fields = move.fenBefore.split(" ");
        observed.push({ percent: reply.frequencyPercent,
          moveLabel: `${fields[5]}${fields[1] === "b" ? "..." : "."}${move.moveSan}`, games: sample.totalGames });
      }
      const least = observed.sort((a, b) => a.percent - b.percent)[0];
      const complete = replies.length > 0 && observed.length === replies.length;
      const runs = fullRuns.get(line.id) ?? { completed: 0, unaided: 0 };
      return {
        lineId: line.id, enabled: !line.archived && line.practiceEnabled !== false,
        frequency: { band: !complete ? "unknown" as const : least!.percent >= 5 ? "common" as const
          : least!.percent >= 1 ? "uncommon" as const : "rare" as const,
          percent: least?.percent ?? null, moveLabel: least?.moveLabel ?? null,
          sampleGames: least?.games ?? null, knownReplies: observed.length, totalReplies: replies.length,
          pathPercent: complete ? Math.round(observed.reduce((probability, reply) => probability * reply.percent / 100, 1) * 10000) / 100 : null },
        recall: progress.get(line.id) ?? null,
        fullRuns: { ...runs, accuracyPercent: runs.completed ? Math.round(100 * runs.unaided / runs.completed) : null },
      };
    }));
    return { repertoireId, ratingGroup: preferences.ratingGroup, useExplorer: preferences.useExplorer,
      enabledCount: lines.filter(line => line.enabled).length, lines,
      remainingPositions: missing.size, message: null };
  }

  update(repertoireId: string, lineIds: string[], enabled: boolean): OpeningPracticeSelectionResponse {
    if (!Array.isArray(lineIds) || !lineIds.length || lineIds.length > 1000
      || lineIds.some(value => typeof value !== "string") || new Set(lineIds).size !== lineIds.length
      || typeof enabled !== "boolean") throw new Error("Choose distinct saved lines and whether to practise them");
    const profileId = ensureActiveProfile(this.db);
    const timestamp = now();
    this.db.transaction(() => {
      const available = new Set(this.workspace.repertoire(repertoireId).chapters.flatMap(chapter => chapter.lines.map(line => line.id)));
      if (lineIds.some(lineId => !available.has(lineId))) throw new Error("A selected line is no longer in this repertoire. Reload and try again.");
      const save = this.db.prepare(`INSERT INTO opening_line_practice_preferences(profile_id, line_id, enabled, updated_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(profile_id, line_id) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`);
      let changed = false;
      for (const lineId of lineIds) {
        const previous = this.db.prepare("SELECT enabled FROM opening_line_practice_preferences WHERE profile_id = ? AND line_id = ?")
          .pluck().get(profileId, lineId) as number | undefined;
        if ((previous ?? 1) === Number(enabled)) continue;
        save.run(profileId, lineId, Number(enabled), timestamp); changed = true;
      }
      if (changed) {
        // Retire stale queues, never delete their answers or reschedule cards.
        this.db.prepare(`UPDATE opening_review_sessions SET status = 'abandoned', abandoned_at = ?
          WHERE profile_id = ? AND repertoire_id = ? AND status = 'active'`).run(timestamp, profileId, repertoireId);
        this.db.prepare(`UPDATE opening_lesson_attempts SET status = 'abandoned', abandoned_at = ?
          WHERE profile_id = ? AND repertoire_id = ? AND status = 'active'`).run(timestamp, profileId, repertoireId);
      }
    })();
    return { ...this.get(repertoireId), message: enabled ? "Selected lines are included in automatic practice."
      : "Selected lines are paused for automatic practice. Their notes, recall history and game matching are kept." };
  }

  async loadFrequencies(repertoireId: string): Promise<OpeningPracticeSelectionResponse> {
    const preferences = this.preferences.get();
    if (!preferences.useExplorer) throw new Error("Enable practical frequencies in Opening settings first.");
    const positions = new Map<string, string>();
    for (const chapter of this.workspace.repertoire(repertoireId).chapters) for (const line of chapter.lines) {
      if (line.archived) continue;
      for (const move of line.moves) if (move.role === "opponent") {
        positions.set(openingPositionKey(move.fenBefore), move.fenBefore);
      }
    }
    const missing = [...positions.values()].filter(fen => {
      const sample = this.explorer.cachedPosition(fen, preferences.ratingGroup);
      return !sample || sample.stale;
    });
    let message = "Cached opponent-reply frequencies are up to date.";
    // At most two 8-second remote calls per explicit request; stay inside client timeout.
    for (const fen of missing.slice(0, 2)) {
      try {
        const sample = await this.explorer.position(fen, preferences.ratingGroup);
        if (sample.stale) { message = "Lichess is unavailable; old samples remain uncertain. Try again later."; break; }
        message = "Loaded opponent-reply frequencies. Unknown or small samples are not treated as rare.";
      } catch (error) { message = error instanceof Error ? error.message : "Could not load frequencies. Try again later."; break; }
    }
    // Re-read current profile/graph; never mutate participation using a remote response.
    return { ...this.get(repertoireId), message };
  }

  private fullRuns(profileId: string, repertoireId: string): Map<string, { completed: number; unaided: number }> {
    const rows = this.db.prepare(`
      WITH planned AS (
        SELECT membership.line_id, membership.move_id,
          ROW_NUMBER() OVER (PARTITION BY membership.line_id ORDER BY membership.ply) - 1 AS sequence,
          COUNT(*) OVER (PARTITION BY membership.line_id) AS decisions
        FROM opening_line_moves membership JOIN opening_moves move ON move.id = membership.move_id
        WHERE move.repertoire_id = ? AND move.role = 'learner' AND move.active = 1
      ), queue_answers AS (
        SELECT queue.id, queue.session_id, queue.source_line_id, queue.expected_move_id, queue.sequence,
          MIN(CASE WHEN event.correct = 1 AND event.assisted = 0 THEN 1 ELSE 0 END) AS unaided
        FROM opening_review_queue queue LEFT JOIN opening_review_events event ON event.queue_entry_id = queue.id
        WHERE queue.presentation_kind = 'scheduled'
        GROUP BY queue.id
      ), runs AS (
        SELECT queue.source_line_id AS line_id, session.id, session.completed_at,
          MIN(queue.unaided) AS unaided
        FROM opening_review_sessions session
        JOIN queue_answers queue ON queue.session_id = session.id
        JOIN planned ON planned.line_id = queue.source_line_id AND planned.sequence = queue.sequence
          AND planned.move_id = queue.expected_move_id
        WHERE session.profile_id = ? AND session.repertoire_id = ? AND session.status = 'completed' AND session.focus_move_id IS NULL
        GROUP BY session.id, queue.source_line_id
        HAVING COUNT(*) = MAX(planned.decisions) AND COUNT(*) = MAX(session.initial_item_count)
      ), recent AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY line_id ORDER BY completed_at DESC, id DESC) AS recency FROM runs
      ) SELECT line_id, COUNT(*) AS completed, SUM(unaided) AS unaided FROM recent WHERE recency <= 20 GROUP BY line_id
    `).all(repertoireId, profileId, repertoireId) as Array<{ line_id: string; completed: number; unaided: number }>;
    return new Map(rows.map(row => [row.line_id, { completed: row.completed, unaided: row.unaided }]));
  }
}

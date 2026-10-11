import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { Database } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningReviewService } from "./opening-review-service.js";
import { FIRST_RECALL_EVIDENCE } from "./opening-recall.js";

const databases: Database[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));

it("calculates progress with a large shared-line library and review history", () => {
  const database = new Database(":memory:", path.resolve("migrations")); databases.push(database);
  const db = database.connection;
  const content = new OpeningContentService(db);
  const repertoireId = new OpeningPgnImportService(db, content).import({
    pgn: '[Event "Progress performance"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. d3 *',
    learnerColor: "white", ownershipConfirmed: true,
  }).repertoireIds[0]!;
  const profileId = ensureActiveProfile(db);
  const source = db.prepare("SELECT * FROM opening_lines LIMIT 1").get() as { id: string; chapter_id: string };
  db.transaction(() => {
    const line = db.prepare("INSERT INTO opening_lines(id, chapter_id, slug, title, priority, active) VALUES (?, ?, ?, ?, 1, 1)");
    const membership = db.prepare("INSERT INTO opening_line_moves SELECT ?, move_id, ply FROM opening_line_moves WHERE line_id = ?");
    for (let i = 0; i < 1000; i++) {
      line.run(`perf-line-${i}`, source.chapter_id, `perf-${i}`, `Shared line ${i}`);
      membership.run(`perf-line-${i}`, source.id);
    }
  })();
  new OpeningReviewService(db).recommendation();
  const items = db.prepare("SELECT id, move_id FROM opening_review_items").all() as Array<{ id: string; move_id: string }>;
  const timestamp = "2026-10-01T00:00:00.000Z";
  db.transaction(() => {
    db.prepare(`INSERT INTO opening_review_sessions(id, profile_id, repertoire_id, status, selection_pool,
      initial_item_count, started_at, created_at) VALUES ('perf-session', ?, ?, 'completed', 'mixed', 10000, ?, ?)`)
      .run(profileId, repertoireId, timestamp, timestamp);
    const queue = db.prepare(`INSERT INTO opening_review_queue(id, session_id, review_item_id, sequence,
      presentation_kind, status, expected_move_id) VALUES (?, 'perf-session', ?, ?, 'scheduled', 'completed', ?)`);
    const event = db.prepare(`INSERT INTO opening_review_events(id, review_item_id, session_id, queue_entry_id,
      played_move_uci, played_move_san, correct, assisted, rating, response_ms, previous_state, next_state, next_due_at, created_at)
      SELECT ?, ?, 'perf-session', ?, CASE WHEN ? = 0 THEN 'a2a3' ELSE move_uci END,
        move_san, ?, ?, 3, 1000, 0, 2, ?, ? FROM opening_moves WHERE id = ?`);
    for (let i = 0; i < 10000; i++) {
      const item = items[i % items.length]!;
      queue.run(`perf-q-${i}`, item.id, i, item.move_id);
      const correct = Number(i % 5 !== 0);
      event.run(`perf-event-${i}`, item.id, `perf-q-${i}`, correct, correct, Number(i % 5 === 1), timestamp, timestamp, item.move_id);
    }
  })();
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${FIRST_RECALL_EVIDENCE}
    SELECT membership.line_id, COUNT(*) FROM recent event
    JOIN opening_line_moves membership ON membership.move_id = event.target_move_id
    WHERE event.recency <= 20 GROUP BY membership.line_id`).all(profileId) as Array<{ detail: string }>;
  expect(plan.some(row => row.detail === "MATERIALIZE recent")).toBe(true);
  expect(plan.some(row => row.detail.includes("opening_line_moves_move_line_idx"))).toBe(true);
  const start = performance.now();
  const result = content.progress();
  const elapsed = performance.now() - start;
  // Generous for hosted runners. The query-plan assertions also catch the
  // original nested-history scan without relying only on wall-clock speed.
  expect(elapsed).toBeLessThan(1000);
  expect(result.totalLines).toBe(1001);
  expect(result.lines.every(line => line.decisions === 4 && line.accuracyPercent === 60
    && line.recallAttempts === 80 && line.testedDecisions === 4)).toBe(true);
  const before = db.prepare("SELECT total_changes() AS n").get() as { n: number };
  new OpeningReviewService(db).recommendation();
  expect((db.prepare("SELECT total_changes() AS n").get() as { n: number }).n).toBe(before.n);
}, 20000);

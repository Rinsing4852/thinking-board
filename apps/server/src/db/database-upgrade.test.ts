import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Database } from "./database.js";
import { OpeningContentService } from "../openings/opening-content-service.js";
import { STARTER_OPENING_CURRICULA } from "../openings/starter-curricula.js";
import { ImportService } from "../imports/import-service.js";

describe("opening database upgrades", () => {
  it("upgrades an existing v1.5.3 database without losing games, cards or review history", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-upgrade-"));
    const oldMigrations = path.join(directory, "old-migrations");
    fs.mkdirSync(oldMigrations);
    for (const file of fs.readdirSync("migrations")) {
      if (Number.parseInt(file, 10) <= 21) fs.copyFileSync(path.join("migrations", file), path.join(oldMigrations, file));
    }
    const filename = path.join(directory, "trainer.sqlite3");
    let database: Database | undefined;
    try {
      database = new Database(filename, oldMigrations);
      new OpeningContentService(database.connection).sync(STARTER_OPENING_CURRICULA);
      new ImportService(database.connection).import('[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 e5 *', "Alice");
      const profileId = database.connection.prepare("SELECT id FROM player_profiles WHERE display_name = 'Alice'").pluck().get();
      const move = database.connection.prepare(`SELECT id, repertoire_id, from_position_id FROM opening_moves
        WHERE role = 'learner' AND move_uci = 'e2e4' LIMIT 1`).get() as { id: string; repertoire_id: string; from_position_id: string };
      const timestamp = "2026-09-29T12:00:00.000Z";
      database.connection.prepare(`INSERT INTO opening_review_items(id, profile_id, repertoire_id, position_id, move_id,
        scheduler_version, state, due_at, repetitions, stability, created_at, updated_at)
        VALUES ('legacy-card', ?, ?, ?, ?, 'legacy-scheduler', 2, ?, 4, 12, ?, ?)`)
        .run(profileId, move.repertoire_id, move.from_position_id, move.id, "2026-10-04T12:00:00.000Z", timestamp, timestamp);
      database.connection.prepare(`INSERT INTO opening_review_sessions(id, profile_id, repertoire_id, status, selection_pool,
        initial_item_count, started_at, completed_at, created_at) VALUES ('legacy-session', ?, ?, 'completed', 'early', 1, ?, ?, ?)`)
        .run(profileId, move.repertoire_id, timestamp, timestamp, timestamp);
      database.connection.prepare(`INSERT INTO opening_review_queue(id, session_id, review_item_id, sequence,
        presentation_kind, status, started_at, answered_at) VALUES ('legacy-queue', 'legacy-session', 'legacy-card', 0,
        'scheduled', 'completed', ?, ?)`).run(timestamp, timestamp);
      database.connection.prepare(`INSERT INTO opening_review_events(id, review_item_id, session_id, queue_entry_id,
        played_move_uci, played_move_san, correct, rating, response_ms, previous_state, next_state, next_due_at, created_at)
        VALUES ('legacy-event', 'legacy-card', 'legacy-session', 'legacy-queue', 'e2e4', 'e4', 1, 3, 8000, 2, 2, ?, ?)`)
        .run(timestamp, timestamp);
      const games = database.connection.prepare("SELECT id, original_pgn FROM games").all();
      database.close();
      for (let restart = 0; restart < 2; restart += 1) {
        database = new Database(filename, path.resolve("migrations"));
        expect(database.connection.prepare("SELECT id, original_pgn FROM games").all()).toEqual(games);
        expect(database.connection.prepare("SELECT state, repetitions, stability FROM opening_review_items WHERE id = 'legacy-card'").get())
          .toEqual({ state: 2, repetitions: 4, stability: 12 });
        expect(database.connection.prepare("SELECT COUNT(*) FROM opening_review_events").pluck().get()).toBe(1);
        expect(database.connection.pragma("foreign_key_check")).toEqual([]);
        expect(database.connection.prepare("SELECT MAX(version) FROM schema_migrations").pluck().get()).toBe(26);
        // Historical position evidence must not falsely prove every alternative.
        expect(database.connection.prepare("SELECT COUNT(*) FROM opening_move_review_cards").pluck().get()).toBe(0);
        database.close();
        database = undefined;
      }
    } finally {
      database?.close();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
});

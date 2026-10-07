import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Database } from "./database.js";
import { Chess } from "chess.js";
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
      // Seed the historical schema directly: the current content service requires current migrations.
      const before = new Chess();
      const after = new Chess();
      after.move("e4");
      const seededAt = "2026-09-29T12:00:00.000Z";
      database.connection.prepare(`INSERT INTO opening_repertoires(id, slug, name, learner_color, first_move_uci,
        first_move_san, summary, audience_label, style_json, memory_burden, content_version, status, created_at, updated_at)
        VALUES ('legacy-repertoire', 'legacy', 'Legacy repertoire', 'white', 'e2e4', 'e4', 'Old notes', 'Everyone',
          '[]', 'low', 1, 'published', ?, ?)`).run(seededAt, seededAt);
      for (const [id, chess] of [["before", before], ["after", after]] as const) {
        database.connection.prepare("INSERT INTO opening_positions(id, position_key, fen, side_to_move) VALUES (?, ?, ?, ?)")
          .run(id, chess.fen().split(" ").slice(0, 4).join(" "), chess.fen(), chess.turn() === "w" ? "white" : "black");
      }
      database.connection.prepare(`INSERT INTO opening_moves(id, repertoire_id, from_position_id, to_position_id,
        move_uci, move_san, role, move_kind, sort_order) VALUES ('legacy-move', 'legacy-repertoire', 'before', 'after',
          'e2e4', 'e4', 'learner', 'primary', 0)`).run();
      database.connection.prepare(`INSERT INTO opening_move_annotations(move_id, summary, changes_json, concepts_json)
        VALUES ('legacy-move', 'Claim the centre', '[]', '[]')`).run();
      new ImportService(database.connection).import('[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 e5 *', "Alice");
      const profileId = database.connection.prepare("SELECT id FROM player_profiles WHERE display_name = 'Alice'").pluck().get();
      database.connection.prepare(`INSERT INTO opening_player_preferences(profile_id, rating_group, platform, use_explorer, updated_at)
        VALUES (?, 1400, 'lichess', 0, ?)`).run(profileId, seededAt);
      database.connection.prepare(`INSERT INTO opening_learning_comments(profile_id, move_id, comment, created_at, updated_at)
        VALUES (?, 'legacy-move', 'My centre reminder', ?, ?)`).run(profileId, seededAt, seededAt);
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
        expect(database.connection.prepare("SELECT rating_group, practice_pace, pause_after_move FROM opening_player_preferences WHERE profile_id = ?").get(profileId))
          .toEqual({ rating_group: 1400, practice_pace: "normal", pause_after_move: "never" });
        expect(database.connection.prepare("SELECT comment, idea_hint FROM opening_learning_comments WHERE move_id = 'legacy-move'").get())
          .toEqual({ comment: "My centre reminder", idea_hint: null });
        expect(database.connection.prepare("SELECT idea_hint FROM opening_review_queue WHERE id = 'legacy-queue'").pluck().get()).toBe(0);
        expect(database.connection.pragma("foreign_key_check")).toEqual([]);
        expect(database.connection.prepare("SELECT MAX(version) FROM schema_migrations").pluck().get()).toBe(31);
        expect(database.connection.prepare("SELECT summary, board_annotations_json FROM opening_move_annotations WHERE move_id = 'legacy-move'").get())
          .toEqual({ summary: "Claim the centre", board_annotations_json: "[]" });
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

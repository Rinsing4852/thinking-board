import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Database } from "./database.js";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function seedRepresentativeData(database: Database): void {
  const db = database.connection;
  db.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('profile', 'Player', '2026-01-01')").run();
  db.prepare("INSERT INTO import_batches(id, original_pgn, status, created_at) VALUES ('batch', 'pgn', 'completed', '2026-01-01')").run();
  db.prepare(`
    INSERT INTO games(
      id, import_batch_id, profile_id, fingerprint, raw_pgn_sha256, original_pgn,
      headers_json, initial_fen, white_name, black_name, player_color, result, created_at
    ) VALUES ('game', 'batch', 'profile', 'fingerprint', 'hash', 'pgn', '{}', 'fen',
              'Player', 'Opponent', 'white', '*', '2026-01-01')
  `).run();
  db.prepare("INSERT INTO positions(id, game_id, ply_index, fen, side_to_move) VALUES ('p0', 'game', 0, 'fen0', 'white')").run();
  db.prepare("INSERT INTO positions(id, game_id, ply_index, fen, side_to_move) VALUES ('p1', 'game', 1, 'fen1', 'black')").run();
  db.prepare(`
    INSERT INTO moves(id, game_id, ply, move_number, mover_color, from_position_id, to_position_id, uci, san)
    VALUES ('move', 'game', 1, 1, 'white', 'p0', 'p1', 'e2e4', 'e4')
  `).run();
  db.prepare(`
    INSERT INTO training_items(id, profile_id, game_id, source_move_id, mode, prompt_version, created_at)
    VALUES ('item', 'profile', 'game', 'move', 'blunder_check', 1, '2026-01-01')
  `).run();
  db.prepare(`
    INSERT INTO training_attempts(id, item_id, created_at)
    VALUES ('attempt', 'item', '2026-01-01')
  `).run();
}

describe("database migrations", () => {
  it("upgrades representative data from every released schema version", () => {
    const migrationFiles = fs.readdirSync(path.resolve("migrations"))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    const abandonedAttemptsMigration = migrationFiles.findIndex((file) => file.startsWith("007_")) + 1;

    for (let prefix = 1; prefix <= migrationFiles.length; prefix += 1) {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), `thinking-board-migration-${prefix}-`));
      tempDirectories.push(directory);
      const partialMigrations = path.join(directory, "migrations");
      fs.mkdirSync(partialMigrations);
      for (const file of migrationFiles.slice(0, prefix)) {
        fs.copyFileSync(path.resolve("migrations", file), path.join(partialMigrations, file));
      }
      const databasePath = path.join(directory, "trainer.sqlite3");
      const oldDatabase = new Database(databasePath, partialMigrations);
      seedRepresentativeData(oldDatabase);
      oldDatabase.close();

      const upgraded = new Database(databasePath, path.resolve("migrations"));
      expect(upgraded.connection.prepare("SELECT display_name FROM player_profiles WHERE id = 'profile'").pluck().get()).toBe("Player");
      expect(upgraded.connection.prepare("SELECT abandoned_at FROM training_attempts WHERE id = 'attempt'").pluck().get())
        .toBe(prefix < abandonedAttemptsMigration ? "2026-01-01" : null);
      expect(upgraded.connection.prepare("SELECT COUNT(*) FROM schema_migrations").pluck().get()).toBe(migrationFiles.length);
      expect(upgraded.connection.prepare("SELECT name FROM pragma_table_info('opening_lesson_attempts') WHERE name = 'content_version'").pluck().get())
        .toBe("content_version");
      expect(upgraded.connection.prepare("SELECT name FROM pragma_table_info('opening_imports') WHERE name = 'original_pgn'").pluck().get())
        .toBe("original_pgn");
      expect(upgraded.connection.prepare("SELECT name FROM pragma_table_info('opening_review_items') WHERE name = 'stability'").pluck().get())
        .toBe("stability");
      expect(upgraded.connection.prepare("SELECT name FROM pragma_table_info('opening_review_events') WHERE name = 'assisted'").pluck().get())
        .toBe("assisted");
      expect(upgraded.connection.prepare("SELECT name FROM pragma_table_info('opening_review_events') WHERE name = 'revealed'").pluck().get())
        .toBe("revealed");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_opening_matches'").pluck().get())
        .toBe("game_opening_matches");
      expect(upgraded.connection.prepare("SELECT name FROM pragma_table_info('opening_review_sessions') WHERE name = 'focus_game_id'").pluck().get())
        .toBe("focus_game_id");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lichess_connections'").pluck().get())
        .toBe("lichess_connections");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opening_position_statistics'").pluck().get())
        .toBe("opening_position_statistics");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opening_explorer_cache'").pluck().get())
        .toBe("opening_explorer_cache");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opening_learning_comments'").pluck().get())
        .toBe("opening_learning_comments");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'opening_review_mistakes'").pluck().get())
        .toBe("opening_review_mistakes");
      expect(upgraded.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_opening_review_states'").pluck().get())
        .toBe("game_opening_review_states");
      expect(upgraded.connection.pragma("foreign_key_check")).toEqual([]);
      upgraded.close();
    }
  });

  it("preserves opening history when legacy move cards collapse into one position card", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-opening-card-upgrade-"));
    tempDirectories.push(directory);
    const partialMigrations = path.join(directory, "migrations");
    fs.mkdirSync(partialMigrations);
    const migrationFiles = fs.readdirSync(path.resolve("migrations"))
      .filter((file) => /^\d+_.+\.sql$/.test(file))
      .sort();
    for (const file of migrationFiles.filter((file) => !file.startsWith("013_"))) {
      fs.copyFileSync(path.resolve("migrations", file), path.join(partialMigrations, file));
    }

    const databasePath = path.join(directory, "trainer.sqlite3");
    const legacy = new Database(databasePath, partialMigrations);
    const db = legacy.connection;
    db.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('profile', 'Player', '2026-01-01')").run();
    db.prepare(`
      INSERT INTO opening_repertoires(
        id, slug, name, learner_color, first_move_uci, first_move_san, summary,
        audience_label, style_json, memory_burden, content_version, status, created_at, updated_at
      ) VALUES ('rep', 'rep', 'Repertoire', 'white', 'e2e4', 'e4', 'Summary',
                'Learner', '[]', 'low', 1, 'published', '2026-01-01', '2026-01-01')
    `).run();
    db.prepare("INSERT INTO opening_positions(id, position_key, fen, side_to_move) VALUES ('before', 'before', 'before fen', 'white')").run();
    db.prepare("INSERT INTO opening_positions(id, position_key, fen, side_to_move) VALUES ('after-a', 'after-a', 'after a', 'black')").run();
    db.prepare("INSERT INTO opening_positions(id, position_key, fen, side_to_move) VALUES ('after-b', 'after-b', 'after b', 'black')").run();
    db.prepare(`
      INSERT INTO opening_moves(id, repertoire_id, from_position_id, to_position_id, move_uci, move_san, role, move_kind, sort_order)
      VALUES ('move-a', 'rep', 'before', 'after-a', 'e2e4', 'e4', 'learner', 'primary', 0)
    `).run();
    db.prepare(`
      INSERT INTO opening_moves(id, repertoire_id, from_position_id, to_position_id, move_uci, move_san, role, move_kind, sort_order)
      VALUES ('move-b', 'rep', 'before', 'after-b', 'd2d4', 'd4', 'learner', 'alternative', 1)
    `).run();
    const insertItem = db.prepare(`
      INSERT INTO opening_review_items(
        id, profile_id, repertoire_id, position_id, move_id, scheduler_version, state,
        due_at, repetitions, last_reviewed_at, created_at, updated_at
      ) VALUES (?, 'profile', 'rep', 'before', ?, 'fsrs', 2, '2026-02-01', ?, ?, '2026-01-01', '2026-01-01')
    `);
    insertItem.run("item-a", "move-a", 1, "2026-01-02");
    insertItem.run("item-b", "move-b", 5, "2026-01-03");
    db.prepare(`
      INSERT INTO opening_review_sessions(id, profile_id, repertoire_id, status, selection_pool, initial_item_count, started_at, completed_at, created_at)
      VALUES ('session', 'profile', 'rep', 'completed', 'early', 2, '2026-01-03', '2026-01-03', '2026-01-03')
    `).run();
    const insertQueue = db.prepare(`
      INSERT INTO opening_review_queue(id, session_id, review_item_id, sequence, presentation_kind, status, started_at, answered_at)
      VALUES (?, 'session', ?, ?, 'scheduled', 'completed', '2026-01-03', '2026-01-03')
    `);
    insertQueue.run("queue-a", "item-a", 0);
    insertQueue.run("queue-b", "item-b", 1);
    const insertEvent = db.prepare(`
      INSERT INTO opening_review_events(
        id, review_item_id, session_id, queue_entry_id, played_move_uci, played_move_san,
        correct, rating, response_ms, previous_state, next_state, next_due_at, created_at
      ) VALUES (?, ?, 'session', ?, 'e2e4', 'e4', 1, 3, 1000, 1, 2, '2026-02-01', '2026-01-03')
    `);
    insertEvent.run("event-a", "item-a", "queue-a");
    insertEvent.run("event-b", "item-b", "queue-b");
    legacy.close();

    const upgraded = new Database(databasePath, path.resolve("migrations"));
    expect(upgraded.connection.prepare("SELECT id FROM opening_review_items").pluck().all()).toEqual(["item-b"]);
    expect(upgraded.connection.prepare("SELECT DISTINCT review_item_id FROM opening_review_queue").pluck().all()).toEqual(["item-b"]);
    expect(upgraded.connection.prepare("SELECT DISTINCT review_item_id FROM opening_review_events").pluck().all()).toEqual(["item-b"]);
    expect(upgraded.connection.prepare("SELECT COUNT(*) FROM opening_review_events").pluck().get()).toBe(2);
    expect(upgraded.connection.prepare("SELECT SUM(assisted) FROM opening_review_events").pluck().get()).toBe(0);
    expect(upgraded.connection.prepare("SELECT SUM(revealed) FROM opening_review_events").pluck().get()).toBe(0);
    expect(upgraded.connection.pragma("foreign_key_check")).toEqual([]);
    upgraded.close();
  });
});

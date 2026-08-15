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
        .toBe(prefix < migrationFiles.length ? "2026-01-01" : null);
      expect(upgraded.connection.prepare("SELECT COUNT(*) FROM schema_migrations").pluck().get()).toBe(migrationFiles.length);
      expect(upgraded.connection.pragma("foreign_key_check")).toEqual([]);
      upgraded.close();
    }
  });
});

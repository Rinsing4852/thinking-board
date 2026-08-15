import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { setActiveProfile } from "./profile.js";
import { V1TrainingService } from "./v1-training-service.js";

const ALICE_GAME = `[Event "Alice game"]
[White "Alice"]
[Black "Opponent"]

1. e4 e5 2. Nf3 Nc6 *`;

const BOB_GAME = `[Event "Bob game"]
[White "Opponent"]
[Black "Bob"]

1. d4 d5 2. c4 e6 *`;

describe("player-scoped session allocation", () => {
  const directories: string[] = [];
  afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it("does not include modes that exist only for another player", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-profile-"));
    directories.push(directory);
    const database = new Database(path.join(directory, "test.sqlite3"), path.resolve("migrations"));
    const imports = new ImportService(database.connection);
    imports.import(ALICE_GAME, "Alice");
    imports.import(BOB_GAME, "Bob");

    const profiles = database.connection.prepare("SELECT id, display_name FROM player_profiles ORDER BY display_name")
      .all() as Array<{ id: string; display_name: string }>;
    const alice = profiles.find((profile) => profile.display_name === "Alice")!;
    const bob = profiles.find((profile) => profile.display_name === "Bob")!;
    const bobMove = database.connection.prepare(`
      SELECT m.id AS move_id, m.game_id FROM moves m
      JOIN games g ON g.id = m.game_id WHERE g.profile_id = ? LIMIT 1
    `).get(bob.id) as { move_id: string; game_id: string };
    database.connection.prepare(`
      INSERT INTO training_items(id, profile_id, game_id, source_move_id, mode, prompt_version, created_at)
      VALUES ('bob-only-item', ?, ?, ?, 'blunder_check', 2, '2026-08-15T12:00:00.000Z')
    `).run(bob.id, bobMove.game_id, bobMove.move_id);
    database.connection.prepare(`
      INSERT INTO review_states(item_id, mastery_level, due_at) VALUES ('bob-only-item', 0, '2026-08-15T12:00:00.000Z')
    `).run();

    const service = new V1TrainingService(database.connection);
    setActiveProfile(database.connection, alice.id);
    expect(service.dashboard().recommendedSession).toEqual([]);
    setActiveProfile(database.connection, bob.id);
    expect(service.dashboard().recommendedSession).toContainEqual({
      mode: "blunder_check", label: "Blunder checks", count: 1,
    });
    database.close();
  });
});

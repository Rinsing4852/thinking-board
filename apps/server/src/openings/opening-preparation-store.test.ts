import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { Database } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";
import { openingPositionKey } from "./opening-content.js";
import { OpeningPreferencesService } from "./opening-preferences-service.js";
import { practiceReplyFrequency } from "./opening-preparation-store.js";

const cleanup: Array<() => void> = [];
afterEach(() => cleanup.splice(0).forEach(action => action()));
function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-preparation-"));
  const database = new Database(path.join(directory, "test.sqlite3"), path.resolve("migrations"));
  cleanup.push(() => { database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const db = database.connection;
  const preferences = new OpeningPreferencesService(db, true);
  preferences.update({ ratingGroup: 1600, platform: "lichess", useExplorer: true });
  const profileId = ensureActiveProfile(db);
  const chess = new Chess(); chess.move("e4");
  const key = openingPositionKey(chess.fen());
  db.prepare(`INSERT INTO opening_explorer_cache(position_key, fen, rating_group, speeds, total_games, moves_json, fetched_at)
    VALUES (?, ?, 1600, 'blitz,rapid,classical', 1000, ?, ?)`)
    .run(key, chess.fen(), JSON.stringify([{ uci: "e7e5", san: "e5", white: 50, draws: 0, black: 50 }]), new Date().toISOString());
  return { db, preferences, profileId, key };
}
describe("practice's shared practical evidence", () => {
  it("uses the observed probability at the opponent's position without remote requests", () => {
    const { db, profileId, key } = fixture();
    expect(practiceReplyFrequency(db, profileId, key, "e7e5")).toBe(0.1);
    expect(practiceReplyFrequency(db, profileId, key, "c7c5")).toBeNull();
  });
  it.each([
    "UPDATE opening_explorer_cache SET fetched_at = '2020-01-01'",
    "UPDATE opening_explorer_cache SET total_games = 10",
    "UPDATE opening_explorer_cache SET moves_json = 'broken'",
    "UPDATE opening_player_preferences SET rating_group = 1800",
    "UPDATE opening_player_preferences SET use_explorer = 0",
  ])("falls back to authored weighting when evidence is unsuitable: %s", sql => {
    const { db, profileId, key } = fixture(); db.exec(sql);
    expect(practiceReplyFrequency(db, profileId, key, "e7e5")).toBeNull();
  });
});

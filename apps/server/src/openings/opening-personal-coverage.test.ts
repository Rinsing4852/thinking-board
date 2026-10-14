import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { ensureActiveProfile, setActiveProfile } from "../training/profile.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningCoverageService } from "./opening-coverage-service.js";
import { OpeningExplorerService } from "./opening-explorer-service.js";

const databases: Database[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));
function setup() {
  const database = new Database(":memory:", path.resolve("migrations")); databases.push(database);
  const db = database.connection;
  const repertoireId = new OpeningPgnImportService(db, new OpeningContentService(db)).import({
    pgn: "1. e4 g6 *", learnerColor: "black", ownershipConfirmed: true,
  }).repertoireIds[0]!;
  const importer = new ImportService(db);
  const lines = ["1. e4 g6 2. d4 Bg7", "1. e4 g6 2. Nf3 Bg7", "1. d4 d5 2. c4 e6", "1. d4 d5 2. Nf3 Nf6", "1. d4 d5 2. Nc3 Nf6"];
  for (let index = 0; index < 5; index++) importer.import(`[White "Opponent${index}"]\n[Black "Bob"]\n[Result "*"]\n\n${lines[index]} *`, "Bob");
  const profileId = String(db.prepare("SELECT id FROM player_profiles WHERE display_name = 'Bob'").pluck().get());
  setActiveProfile(db, profileId);
  const fetcher = vi.fn<typeof fetch>();
  const explorer = new OpeningExplorerService(db, undefined, fetcher);
  const coverage = new OpeningCoverageService(db, undefined, explorer);
  return { db, repertoireId, coverage, fetcher, importer, profileId };
}

describe("coverage from personal games", () => {
  it("finds missing replies from games without a token and keeps their frequency separate from Lichess", async () => {
    const { repertoireId, coverage, fetcher } = setup();
    const result = await coverage.coverage(repertoireId, 1600, { local: true, throughMove: 1 });
    expect(fetcher).not.toHaveBeenCalled();
    const missing = result.gaps.find(gap => gap.moveUci === "d2d4")!;
    expect(missing).toMatchObject({ status: "missing_response", games: 0, frequencyPercent: 0,
      personalFrequency: { games: 3, positionGames: 5, percent: 60 } });
    expect(result.personal).toMatchObject({ replyOccurrences: 5, preparedReplyOccurrences: 2, preparedPercent: 40 });
    expect(result.model?.unknownPercent).toBe(100);
  });
  it("does not include another player or the opposite side's games", async () => {
    const { importer, db, profileId, repertoireId, coverage } = setup();
    importer.import('[White "Elsewhere"]\n[Black "Other learner"]\n[Result "*"]\n\n1. Nf3 d5 *', "Other learner");
    importer.import('[White "Bob"]\n[Black "Elsewhere"]\n[Result "*"]\n\n1. e4 e5 *', "Bob");
    setActiveProfile(db, profileId);
    expect((await coverage.coverage(repertoireId, 1600, { local: true, throughMove: 1 })).personal?.replyOccurrences).toBe(5);
  });
  it("reports a sample of zero as unknown rather than fully prepared", async () => {
    const { db, repertoireId, coverage } = setup();
    db.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('empty', 'Empty', '2026-10-14')").run();
    setActiveProfile(db, "empty");
    expect(ensureActiveProfile(db)).toBe("empty");
    expect((await coverage.coverage(repertoireId, 1600, { local: true, throughMove: 1 })).personal)
      .toMatchObject({ replyOccurrences: 0, preparedReplyOccurrences: 0, preparedPercent: null });
  });
  it("retains independent Lichess denominators when both sources exist", async () => {
    const { db, repertoireId, coverage } = setup();
    const fen = new Chess().fen();
    db.prepare(`INSERT INTO opening_explorer_cache(position_key, fen, rating_group, speeds, total_games, moves_json, fetched_at)
      VALUES (?, ?, 1600, 'blitz,rapid,classical', 1000, ?, ?)`)
      .run(fen.split(" ").slice(0, 4).join(" "), fen, JSON.stringify([
        { uci: "e2e4", san: "e4", white: 800, draws: 0, black: 0 },
        { uci: "d2d4", san: "d4", white: 200, draws: 0, black: 0 },
      ]), new Date().toISOString());
    const result = await coverage.coverage(repertoireId, 1600, { local: true, throughMove: 1 });
    expect(result.gaps.find(gap => gap.moveUci === "d2d4"))
      .toMatchObject({ frequencyPercent: 20, games: 200, personalFrequency: { percent: 60, games: 3 } });
    expect(result.personal?.preparedPercent).toBe(40);
  });
  it("finds a game-based preparation gap independently of a different recommended practice repertoire", async () => {
    const { db, repertoireId, coverage, fetcher } = setup();
    const other = new OpeningPgnImportService(db, new OpeningContentService(db)).import({
      pgn: "1. d4 d5 2. c4 e6 3. Nc3 Nf6 *", learnerColor: "white", ownershipConfirmed: true,
    }).repertoireIds[0]!;
    const result = await coverage.recommended(1600, true, other);
    expect(result?.repertoireId).toBe(repertoireId);
    expect(result?.gaps.some(gap => gap.moveUci === "d2d4" && gap.personalFrequency?.games === 3)).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("counts a repeated position only once per game", async () => {
    const { importer, profileId, db, repertoireId, coverage } = setup();
    importer.import('[White "Cycle"]\n[Black "Bob"]\n[Result "*"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. e4 g6 *', "Bob");
    setActiveProfile(db, profileId);
    const result = await coverage.coverage(repertoireId, 1600, { local: true, throughMove: 1 });
    expect(result.personal?.replyOccurrences).toBe(6);
    expect(result.positions?.flatMap(position => position.branches).find(branch => branch.moveUci === "e2e4")?.personalFrequency?.games).toBe(2);
  });
});

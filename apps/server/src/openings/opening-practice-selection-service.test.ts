import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { ensureActiveProfile, setActiveProfile } from "../training/profile.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningWorkspaceService } from "./opening-workspace-service.js";
import { OpeningReviewService } from "./opening-review-service.js";
import { OpeningTrainingService } from "./opening-training-service.js";
import { OpeningPreferencesService } from "./opening-preferences-service.js";
import { OpeningExplorerService } from "./opening-explorer-service.js";
import { OpeningPracticeSelectionService } from "./opening-practice-selection-service.js";
import { openingPositionKey } from "./opening-content.js";
import { ImportService } from "../imports/import-service.js";

const PGN = '[Event "Practice selection"]\n[Result "*"]\n\n1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bc4 *';
const databases: Database[] = [];
afterEach(() => databases.splice(0).forEach(database => database.close()));
function setup() {
  const database = new Database(":memory:", path.resolve("migrations")); databases.push(database);
  const db = database.connection;
  const content = new OpeningContentService(db);
  const importer = new OpeningPgnImportService(db, content);
  const repertoireId = importer.import({ pgn: PGN, learnerColor: "white", ownershipConfirmed: true }).repertoireIds[0]!;
  const workspace = new OpeningWorkspaceService(db);
  const preferences = new OpeningPreferencesService(db, true);
  preferences.update({ ratingGroup: 1600, platform: "lichess", useExplorer: true });
  const fetcher = vi.fn(async () => new Response(JSON.stringify({ white: 500, draws: 0, black: 500,
    moves: [{ uci: "e7e5", san: "e5", white: 250, draws: 0, black: 250 }] }), { headers: { "Content-Type": "application/json" } }));
  const explorer = new OpeningExplorerService(db, "test-token", fetcher as typeof fetch);
  const service = new OpeningPracticeSelectionService(db, workspace, content, preferences, explorer);
  const lines = workspace.repertoire(repertoireId).chapters[0]!.lines;
  return { db, content, importer, repertoireId, workspace, preferences, fetcher, service,
    main: lines[0]!, branch: lines[1]!, profileId: ensureActiveProfile(db), reviews: new OpeningReviewService(db) };
}
function cacheReplies(fixture: ReturnType<typeof setup>) {
  for (const line of [fixture.main, fixture.branch]) for (const move of line.moves.filter(move => move.role === "opponent")) {
    const key = openingPositionKey(move.fenBefore);
    const replies = move.ply === 2
      ? [{ uci: "e7e5", san: "e5", white: 500, draws: 0, black: 0 }, { uci: "c7c5", san: "c5", white: 5, draws: 0, black: 0 }]
      : [{ uci: move.moveUci, san: move.moveSan, white: 200, draws: 0, black: 0 }];
    fixture.db.prepare(`INSERT OR REPLACE INTO opening_explorer_cache(position_key, fen, rating_group, speeds, total_games, moves_json, fetched_at)
      VALUES (?, ?, 1600, 'blitz,rapid,classical', 1000, ?, ?)`)
      .run(key, move.fenBefore, JSON.stringify(replies), new Date().toISOString());
  }
}

describe("per-repertoire practice selection", () => {
  it("defaults on, pauses a branch without hiding it, keeps shared moves and excludes unique paused moves", () => {
    const { service, repertoireId, main, branch, reviews, db, workspace, content } = setup();
    expect(service.get(repertoireId).enabledCount).toBe(2);
    service.update(repertoireId, [branch.id], false);
    expect(workspace.repertoire(repertoireId).chapters[0]!.lines.find(line => line.id === branch.id))
      .toMatchObject({ archived: false, practiceEnabled: false });
    const exercise = reviews.start(repertoireId, "new", 10, 10);
    const queued = db.prepare(`SELECT item.move_id FROM opening_review_queue queue JOIN opening_review_items item ON item.id = queue.review_item_id
      WHERE queue.session_id = ?`).pluck().all(exercise.sessionId);
    expect(queued).toContain(main.moves[0]!.id);
    expect(queued).not.toContain(branch.moves.at(-1)!.id);
    expect(content.catalog().repertoires[0]!.review.total).toBe(3);
    expect(content.progress().weakestLines.some(line => line.lineId === branch.id)).toBe(false);
    expect(reviews.startTree(repertoireId).lineRun?.lineId).toBe(main.id);
    expect(new OpeningTrainingService(db).start(repertoireId).lineTitle).toBe(main.title);
  });
  it("supports all off, explicit one-off practice, retained answers and re-enabling", () => {
    const { service, repertoireId, main, branch, reviews, db } = setup();
    const exercise = reviews.startLine(repertoireId, main.id);
    reviews.answer(exercise.sessionId, "e2e4");
    const events = db.prepare("SELECT * FROM opening_review_events").all();
    service.update(repertoireId, [main.id, branch.id], false);
    expect(db.prepare("SELECT status FROM opening_review_sessions WHERE id = ?").pluck().get(exercise.sessionId)).toBe("abandoned");
    expect(db.prepare("SELECT * FROM opening_review_events").all()).toEqual(events);
    expect(() => reviews.start(repertoireId)).toThrow("Include a line");
    expect(() => reviews.startTree(repertoireId)).toThrow("Include a line");
    expect(reviews.startLine(repertoireId, branch.id).lineRun?.lineId).toBe(branch.id);
    service.update(repertoireId, [branch.id], true);
    expect(reviews.startTree(repertoireId).lineRun?.lineId).toBe(branch.id);
  });
  it("isolates player choices and preserves them through archive/restore and source import", () => {
    const { service, repertoireId, branch, main, workspace, db, profileId, importer } = setup();
    service.update(repertoireId, [branch.id], false);
    workspace.setLineArchived(repertoireId, branch.id, true);
    workspace.setLineArchived(repertoireId, branch.id, false);
    expect(service.get(repertoireId).lines.find(line => line.lineId === branch.id)?.enabled).toBe(false);
    importer.import({ pgn: PGN, learnerColor: "white", ownershipConfirmed: true });
    expect(service.get(repertoireId).enabledCount).toBe(1);
    db.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('other', 'Other learner', ?)").run(new Date().toISOString());
    setActiveProfile(db, "other"); expect(service.get(repertoireId).enabledCount).toBe(2);
    service.update(repertoireId, [main.id], false);
    setActiveProfile(db, profileId);
    expect(service.get(repertoireId).lines.find(line => line.lineId === main.id)?.enabled).toBe(true);
  });
  it("validates the whole batch atomically and leaves another repertoire unchanged", () => {
    const { service, repertoireId, main, importer, db } = setup();
    const other = importer.import({ pgn: '[Event "Other"]\n[Result "*"]\n\n1. d4 d5 *', learnerColor: "white", ownershipConfirmed: true }).repertoireIds[0]!;
    expect(() => service.update(other, [main.id], false)).toThrow("no longer");
    expect(() => service.update(repertoireId, [main.id, "missing"], false)).toThrow("no longer");
    expect(() => service.update(repertoireId, [main.id, main.id], false)).toThrow("distinct");
    expect(db.prepare("SELECT COUNT(*) FROM opening_line_practice_preferences").pluck().get()).toBe(0);
    expect(db.pragma("foreign_key_check")).toEqual([]);
  });
  it("does not abandon a session when saving an unchanged selection", () => {
    const { service, repertoireId, main, reviews, db } = setup();
    const exercise = reviews.startLine(repertoireId, main.id);
    service.update(repertoireId, [main.id], true);
    expect(db.prepare("SELECT status FROM opening_review_sessions WHERE id = ?").pluck().get(exercise.sessionId)).toBe("active");
  });
  it("retains opponent-move context for deliberately reviewing a paused position from a game", () => {
    const { db, service, repertoireId, main, branch, reviews } = setup();
    new ImportService(db).import('[White "Local learner"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 3. d4 *', "Local learner");
    const gameId = db.prepare("SELECT id FROM games").pluck().get() as string;
    service.update(repertoireId, [main.id, branch.id], false);
    const positionId = db.prepare("SELECT from_position_id FROM opening_moves WHERE id = ?").pluck().get(branch.moves.at(-1)!.id) as string;
    expect(reviews.startPosition(repertoireId, positionId, gameId).opponentMove?.moveSan).toBe("d6");
  });
  it("uses fresh complete reply samples, not products or unknown-as-rare estimates", () => {
    const fixture = setup(); cacheReplies(fixture);
    const response = fixture.service.get(fixture.repertoireId);
    expect(response.lines.find(line => line.lineId === fixture.main.id)?.frequency).toMatchObject({ band: "common", percent: 20 });
    expect(response.lines.find(line => line.lineId === fixture.branch.id)?.frequency).toMatchObject({ band: "rare", percent: 0.5, moveLabel: "1...c5" });
    expect(fixture.fetcher).not.toHaveBeenCalled();
    fixture.db.exec("UPDATE opening_explorer_cache SET fetched_at = '2020-01-01'");
    expect(fixture.service.get(fixture.repertoireId).lines.every(line => line.frequency.band === "unknown")).toBe(true);
  });
  it.each(["UPDATE opening_explorer_cache SET total_games = 50", "UPDATE opening_explorer_cache SET moves_json = '[]'",
    "UPDATE opening_player_preferences SET rating_group = 2000", "UPDATE opening_player_preferences SET use_explorer = 0"])
  ("does not classify incomplete, tiny or incompatible samples as rare: %s", sql => {
    const fixture = setup(); cacheReplies(fixture); fixture.db.exec(sql);
    expect(fixture.service.get(fixture.repertoireId).lines.every(line => line.frequency.band === "unknown")).toBe(true);
  });
  it("loads bounded shared-position batches only on explicit request and respects frequency opt-out", async () => {
    const fixture = setup();
    expect(fixture.service.get(fixture.repertoireId).remainingPositions).toBe(3);
    await fixture.service.loadFrequencies(fixture.repertoireId);
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
    expect(fixture.service.get(fixture.repertoireId).remainingPositions).toBe(1);
    fixture.preferences.update({ ratingGroup: 1600, platform: "lichess", useExplorer: false });
    await expect(fixture.service.loadFrequencies(fixture.repertoireId)).rejects.toThrow("Enable practical");
    expect(fixture.fetcher).toHaveBeenCalledTimes(2);
  });
  it("distinguishes full-line unaided runs from partial drills, hints and shared move recall", () => {
    const { reviews, service, repertoireId, main, branch } = setup();
    const play = (max?: number, help = false) => {
      let exercise = reviews.startLine(repertoireId, main.id, max);
      for (;;) {
        if (help && exercise.positionNumber === 1) reviews.help(exercise.sessionId, "piece", exercise.queueEntryId);
        reviews.answer(exercise.sessionId, exercise.introduction.repertoireMove.moveUci);
        const next = reviews.continue(exercise.sessionId, exercise.queueEntryId);
        if (next.kind === "complete") return;
        exercise = next;
      }
    };
    play(1);
    expect(service.get(repertoireId).lines.find(line => line.lineId === main.id)?.fullRuns.completed).toBe(0);
    play(); play(undefined, true);
    const result = service.get(repertoireId);
    expect(result.lines.find(line => line.lineId === main.id)?.fullRuns).toEqual({ completed: 2, unaided: 1, accuracyPercent: 50 });
    expect(result.lines.find(line => line.lineId === branch.id)?.fullRuns.completed).toBe(0);
    expect(result.lines.find(line => line.lineId === main.id)?.recall?.recallAttempts).toBeGreaterThan(0);
  });
});

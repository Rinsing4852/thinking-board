import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Chess } from "chess.js";

import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "./config.js";
import { buildApp } from "./app.js";
import { Database } from "./db/database.js";
import { OpeningContentService } from "./openings/opening-content-service.js";
import { STARTER_OPENING_CURRICULA } from "./openings/starter-curricula.js";

const FOOLS_MATE = `[Event "Checklist fixture"]
[Date "2026.08.14"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

const OPENING_REPERTOIRE_PGN = `[Event "My French notes"]
[Result "*"]

1. e4 e6 {Black builds a solid centre.}
2. d4 d5 (2... c5 3. d5) 3. Nc3 *`;

const PRIVATE_LICHESS_STUDY_PGN = `[Event "My Private Study: Italian"]
[StudyName "My Private Study"]
[ChapterName "Italian"]
[Result "*"]

1. e4 e5 (1... c5 2. Nf3) 2. Nf3 *

[Event "My Private Study: Caro-Kann"]
[StudyName "My Private Study"]
[ChapterName "Caro-Kann"]
[Result "*"]

1. e4 c6 2. d4 d5 *`;

const ITALIAN_DEVIATION = `[Event "Opening connection"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. h3 *`;

const REPEATED_ITALIAN_DEVIATIONS = `[Event "Opening miss one"]
[Date "2026.09.18"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. h3 Nf6 5. d3 *

[Event "Opening miss two"]
[Date "2026.09.19"]
[White "Alice"]
[Black "Carol"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. h3 d6 5. d3 *`;

const ITALIAN_OPPONENT_DEVIATION = `[Event "Opponent leaves the line"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 d6 *`;

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const tempDirs: string[] = [];
const originalFetch = globalThis.fetch;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  await Promise.all(apps.splice(0).map((app) => app.close()));
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function config(runWorker: boolean, seedLegacyFixtures = true): AppConfig {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-test-"));
  tempDirs.push(directory);
  if (seedLegacyFixtures) {
    const database = new Database(path.join(directory, "test.sqlite3"), path.resolve("migrations"));
    new OpeningContentService(database.connection).sync(STARTER_OPENING_CURRICULA);
    database.close();
  }
  return {
    host: "127.0.0.1",
    port: 0,
    dataDir: directory,
    databasePath: path.join(directory, "test.sqlite3"),
    migrationsDir: path.resolve("migrations"),
    webDistDir: path.join(directory, "no-web"),
    stockfishBinary: path.resolve("tests/fake-stockfish.mjs"),
    stockfishDepth: 14,
    stockfishMultiPv: 3,
    stockfishThreads: 1,
    stockfishHashMb: 16,
    acceptableToleranceCp: 40,
    meaningfulLossCp: 150,
    runWorker,
  };
}

async function waitForCompleted(app: Awaited<ReturnType<typeof buildApp>>, jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const response = await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}` });
    const body = response.json() as { status: string; error?: string };
    if (body.status === "completed") return;
    if (body.status === "failed") throw new Error(body.error ?? "Job failed");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Job did not complete");
}

describe("vertical slice", () => {
  it("assesses an actual opponent surprise, keeps ideas without cards and carries them into later practice", async () => {
    let calls = 0;
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("explorer.lichess.org");
      expect(Number(url.searchParams.get("moves"))).toBeGreaterThan(12);
      calls++;
      return new Response(JSON.stringify({ white: 5000, draws: 1000, black: 4000, moves: [
        { uci: "g8f6", san: "Nf6", white: 3000, draws: 600, black: 2400 },
        { uci: "d7d6", san: "d6", white: 10, draws: 2, black: 8 },
      ] }), { status: 200 });
    }) as typeof fetch;
    const appConfig = config(true);
    appConfig.lichessApiToken = "test-explorer-token";
    let app = await buildApp(appConfig); apps.push(app);
    const imported = await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: {
      pgn: '[Event "Preparation safety"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 d6 3. d4 *', playerName: "Alice",
    } });
    await waitForCompleted(app, imported.json().jobId);
    expect((await app.inject({ method: "PATCH", url: "/api/v1/openings/preferences", payload: {
      ratingGroup: 1600, platform: "lichess", useExplorer: true,
    } })).statusCode).toBe(200);
    const inbox = (await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).json();
    const group = inbox.groups.find((item: { opening: { status: string } }) => item.opening.status === "opponent_deviation");
    expect(group.preparation.frequency.status).toBe("unknown");
    expect(calls).toBe(0); // Reading the inbox must not block on Lichess.
    const target = { fen: group.opening.departure.fenBefore, opponentMoveUci: "d7d6", learnerColor: "white",
      repertoireId: group.opening.repertoire.id, groupKey: group.key };
    const checked = await app.inject({ method: "POST", url: "/api/v1/openings/preparation/assess", payload: { ...target, refresh: true, analyze: true } });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ frequency: { status: "known", percent: 0.2, moveGames: 20, positionGames: 10000 },
      personal: { occurrences: 1, responsesAnalyzed: 1, responseMistakes: 0 }, priority: "low", recommendation: "optional" });
    const database = new BetterSqlite3(appConfig.databasePath);
    const counts = () => ["opening_lines", "opening_review_items", "opening_move_review_cards"]
      .map(table => database.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get());
    const before = counts();
    const note = "Take the centre and finish development; no deep line needed.";
    const kept = await app.inject({ method: "PATCH", url: `/api/v1/openings/game-inbox/${group.key}/preparation`, payload: { choice: "idea", note } });
    expect(kept.statusCode).toBe(200);
    expect(kept.json()).toMatchObject({ assessment: { decision: { choice: "idea", note } } });
    expect(kept.json().inbox.groups[0].unreviewedCount).toBe(0);
    expect(counts()).toEqual(before);
    await app.close();
    app = await buildApp(appConfig); apps.push(app);
    const restored = (await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).json().groups[0];
    expect(restored.preparation).toMatchObject({ decision: { choice: "idea", note }, personal: { responsesAnalyzed: 1 }, frequency: { status: "known" } });
    expect(calls).toBe(1);
    const skipped = await app.inject({ method: "PATCH", url: `/api/v1/openings/game-inbox/${group.key}/preparation`, payload: { choice: "unprepared", note } });
    expect(skipped.json().assessment.decision.choice).toBe("unprepared");
    expect(counts()).toEqual(before);
    const prepared = await app.inject({ method: "POST", url: `/api/v1/openings/game-inbox/${group.key}/prepare`, payload: { replyMoveUci: "d2d4" } });
    expect(prepared.statusCode).toBe(200);
    const preparedTarget = prepared.json();
    const decisions = database.prepare("SELECT repertoire_id, choice, note FROM opening_preparation_decisions WHERE repertoire_id = ?")
      .all(preparedTarget.repertoire.id);
    expect(decisions).toEqual([expect.objectContaining({ choice: "line", note })]);
    let exercise = (await app.inject({ method: "POST", url: `/api/v1/openings/repertoires/${preparedTarget.repertoire.id}/lines/${preparedTarget.lineId}/reviews/start` })).json();
    for (let index = 0; index < 3 && !exercise.preparationNote; index++) {
      expect(exercise.kind).toBe("exercise");
      await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${exercise.sessionId}/move`,
        payload: { moveUci: exercise.acceptedMoves[0].moveUci, queueEntryId: exercise.queueEntryId } });
      exercise = (await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${exercise.sessionId}/continue`, payload: { queueEntryId: exercise.queueEntryId } })).json();
    }
    expect(exercise.preparationNote).toBe(note);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("keeps missing, small and stale Explorer samples uncertain and rejects invalid preparation decisions", async () => {
    let mode: "missing" | "small" | "failure" = "missing";
    globalThis.fetch = (async () => {
      if (mode === "failure") throw new Error("Explorer offline");
      return new Response(JSON.stringify({ white: mode === "small" ? 10 : 500, draws: 0, black: 0,
        moves: mode === "small" ? [{ uci: "d7d6", san: "d6", white: 1, draws: 0, black: 0 }] : [] }), { status: 200 });
    }) as typeof fetch;
    const appConfig = config(false); appConfig.lichessApiToken = "test-token";
    const app = await buildApp(appConfig); apps.push(app);
    await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: ITALIAN_OPPONENT_DEVIATION, playerName: "Alice" } });
    await app.inject({ method: "PATCH", url: "/api/v1/openings/preferences", payload: { ratingGroup: 1600, platform: "lichess", useExplorer: true } });
    const group = (await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).json().groups[0];
    const target = { fen: group.opening.departure.fenBefore, opponentMoveUci: "d7d6", learnerColor: "white", groupKey: group.key, refresh: true };
    const missing = (await app.inject({ method: "POST", url: "/api/v1/openings/preparation/assess", payload: target })).json();
    expect(missing).toMatchObject({ priority: "unknown", frequency: { status: "unknown", percent: null } });
    mode = "small";
    const small = (await app.inject({ method: "POST", url: "/api/v1/openings/preparation/assess", payload: target })).json();
    expect(small).toMatchObject({ priority: "unknown", frequency: { status: "small_sample", percent: 10 } });
    const database = new BetterSqlite3(appConfig.databasePath);
    database.prepare("UPDATE opening_explorer_cache SET fetched_at = '2020-01-01T00:00:00.000Z'").run();
    mode = "failure";
    const stale = (await app.inject({ method: "POST", url: "/api/v1/openings/preparation/assess", payload: target })).json();
    expect(stale.frequency.stale).toBe(true); expect(stale.priority).toBe("unknown");
    for (const payload of [{ choice: "idea", note: " " }, { choice: "line", note: "Not actually saved" }]) {
      expect((await app.inject({ method: "PATCH", url: `/api/v1/openings/game-inbox/${group.key}/preparation`, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "POST", url: "/api/v1/openings/preparation/assess", payload: { fen: new Chess().fen(), opponentMoveUci: "e2e4", learnerColor: "white" } })).statusCode).toBe(400);
    await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: '[White "Other"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 e5 *', playerName: "Other" } });
    const otherProfile = (await app.inject({ method: "GET", url: "/api/v1/profiles" })).json().profiles.find((profile: { displayName: string }) => profile.displayName === "Other");
    await app.inject({ method: "POST", url: `/api/v1/profiles/${otherProfile.id}/activate` });
    expect((await app.inject({ method: "PATCH", url: `/api/v1/openings/game-inbox/${group.key}/preparation`, payload: { choice: "idea", note: "Private" } })).statusCode).toBe(400);
    expect(database.prepare("SELECT COUNT(*) FROM opening_preparation_decisions").pluck().get()).toBe(0);
    database.close();
  });

  it("reconsiders repeated encounters while preserving a deliberate no-line choice", async () => {
    const settings = config(false);
    const app = await buildApp(settings); apps.push(app);
    await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: ITALIAN_OPPONENT_DEVIATION, playerName: "Alice" } });
    const first = (await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).json().groups[0];
    await app.inject({ method: "PATCH", url: `/api/v1/openings/game-inbox/${first.key}/preparation`, payload: { choice: "unprepared", note: "Use development principles." } });
    for (const opponent of ["Carol", "Dan"]) {
      const pgn = ITALIAN_OPPONENT_DEVIATION.replace('[Black "Bob"]', `[Black "${opponent}"]`)
        .replace("d6 *", opponent === "Carol" ? "d6 3. d4 *" : "d6 3. Bc4 *");
      const imported = await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: { pgn, playerName: "Alice" } });
      expect(imported.json().imported).toBe(1);
    }
    const repeated = (await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).json().groups[0];
    expect(repeated).toMatchObject({ key: first.key, occurrenceCount: 3, unreviewedCount: 2,
      preparation: { priority: "high", personal: { occurrences: 3 }, decision: { choice: "unprepared", note: "Use development principles." } } });
    const database = new BetterSqlite3(settings.databasePath);
    const reviewsBefore = database.prepare("SELECT COUNT(*) FROM opening_review_sessions").pluck().get();
    expect(reviewsBefore).toBe(0);
    const deleted = await app.inject({ method: "DELETE", url: `/api/v1/openings/repertoires/${first.opening.repertoire.id}` });
    expect(deleted.statusCode).toBe(200);
    expect(database.prepare("SELECT COUNT(*) FROM opening_preparation_decisions").pluck().get()).toBe(0);
    expect(database.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(3);
    expect(database.pragma("foreign_key_check")).toEqual([]);
    database.close();
  });

  it("starts with an empty opening library without silently restoring starter repertoires", async () => {
    const settings = config(false, false);
    const app = await buildApp(settings);
    apps.push(app);
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json()).toEqual({ repertoires: [] });
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/reviews/recommended" })).json()).toMatchObject({ available: false });
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/progress" })).json()).toMatchObject({ totalLines: 0, lines: [] });
    await app.close();
    const restarted = await buildApp(settings);
    apps.push(restarted);
    expect((await restarted.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json()).toEqual({ repertoires: [] });
  });

  it("deletes built-in lines without restoring them after a restart", async () => {
    const settings = config(false);
    const app = await buildApp(settings);
    apps.push(app);
    const repertoireId = "repertoire.white-e4-principled";
    const before = (await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` })).json();
    const lines = before.chapters.flatMap((chapter: { lines: Array<{ id: string }> }) => chapter.lines);
    await app.inject({ method: "PATCH", url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lines[0].id}/archive`, payload: { archived: true } });
    const removed = await app.inject({ method: "DELETE", url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lines[0].id}` });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().detail.chapters.flatMap((chapter: { lines: Array<{ id: string }> }) => chapter.lines)).toHaveLength(lines.length - 1);
    await app.close();
    const restarted = await buildApp(settings);
    apps.push(restarted);
    const after = (await restarted.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` })).json();
    expect(after.chapters.flatMap((chapter: { lines: Array<{ id: string }> }) => chapter.lines).map((line: { id: string }) => line.id)).not.toContain(lines[0].id);
    const db = new BetterSqlite3(settings.databasePath);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
  });

  it("clears the confirmed library including archives but keeps games, jobs and preferences", async () => {
    const settings = config(false);
    const app = await buildApp(settings);
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: FOOLS_MATE, playerName: "Alice" } });
    const preferences = (await app.inject({ method: "GET", url: "/api/v1/openings/preferences" })).json();
    await app.inject({ method: "POST", url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start", payload: { mode: "new" } });
    await app.inject({ method: "PATCH", url: "/api/v1/openings/repertoires/repertoire.black-modern-e4/archive", payload: { archived: true } });
    const snapshot = (await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json().repertoires.map((repertoire: { id: string }) => repertoire.id);
    expect((await app.inject({ method: "POST", url: "/api/v1/openings/library/delete", payload: { repertoireIds: snapshot, confirmed: false } })).statusCode).toBe(400);
    await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: { pgn: OPENING_REPERTOIRE_PGN, learnerColor: "white", ownershipConfirmed: true } });
    expect((await app.inject({ method: "POST", url: "/api/v1/openings/library/delete", payload: { repertoireIds: snapshot, confirmed: true } })).statusCode).toBe(400);
    const catalogue = (await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json();
    expect(catalogue.repertoires).toHaveLength(3);
    const ids = catalogue.repertoires.map((repertoire: { id: string }) => repertoire.id);
    const deleted = await app.inject({ method: "POST", url: "/api/v1/openings/library/delete", payload: { repertoireIds: ids, confirmed: true } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json().deletedRepertoireIds.sort()).toEqual(ids.sort());
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json()).toEqual({ repertoires: [] });
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/reviews/active" })).json()).toBeNull();
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/preferences" })).json()).toEqual(preferences);
    const db = new BetterSqlite3(settings.databasePath);
    for (const table of ["opening_imports", "opening_moves", "opening_review_items", "opening_move_review_cards", "opening_review_sessions", "opening_lesson_attempts"]) {
      expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
    }
    expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(1);
    expect(db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBeGreaterThan(0);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    db.close();
    await app.close();
    const restarted = await buildApp(settings);
    apps.push(restarted);
    expect((await restarted.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json()).toEqual({ repertoires: [] });
  });

  it("rolls back every repertoire deletion if clearing the library fails part-way through", async () => {
    const settings = config(false);
    const app = await buildApp(settings);
    apps.push(app);
    const ids = (await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json().repertoires.map((repertoire: { id: string }) => repertoire.id).sort();
    const db = new BetterSqlite3(settings.databasePath);
    db.exec("CREATE TRIGGER reject_library_delete BEFORE DELETE ON opening_repertoires WHEN OLD.id = 'repertoire.white-e4-principled' BEGIN SELECT RAISE(ABORT, 'test deletion failure'); END;");
    db.close();
    const failed = await app.inject({ method: "POST", url: "/api/v1/openings/library/delete", payload: { repertoireIds: ids, confirmed: true } });
    expect(failed.statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json().repertoires.map((repertoire: { id: string }) => repertoire.id).sort()).toEqual(ids);
  });

  it("can re-import a repertoire export containing multiple practice lines", async () => {
    const app = await buildApp(config(false, false));
    apps.push(app);
    const repertoireId = (await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: {
      pgn: OPENING_REPERTOIRE_PGN, learnerColor: "black", ownershipConfirmed: true,
    } })).json().repertoireIds[0];
    const exported = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}/export.pgn` });
    const preview = await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn/preview", payload: { pgn: exported.body, learnerColor: "black" } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().lineCount).toBe(2);
  });

  it("previews and confirms a PGN source update through the API without creating another repertoire", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const imported = (await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: {
      pgn: OPENING_REPERTOIRE_PGN, learnerColor: "white", sourceTitle: "My French notes", ownershipConfirmed: true,
    } })).json();
    const repertoireId = imported.repertoireIds[0];
    const base = `/api/v1/openings/repertoires/${repertoireId}`;
    const updatedPgn = OPENING_REPERTOIRE_PGN.replace("Black builds a solid centre.", "Black prepares to challenge the centre.").replace("3. Nc3 *", "3. Nc3 Nf6 4. e5 *");
    const preview = await app.inject({ method: "POST", url: `${base}/updates/preview`, payload: { pgn: updatedPgn } });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ extendedLines: 1, updatedNotes: 1 });
    const payload = { previewId: preview.json().previewId, ownershipConfirmed: true };
    expect((await app.inject({ method: "POST", url: `${base}/updates`, payload: { ...payload, ownershipConfirmed: false } })).statusCode).toBe(400);
    const applied = await app.inject({ method: "POST", url: `${base}/updates`, payload });
    expect(applied.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `${base}/updates`, payload })).json()).toEqual(applied.json());
    const detail = (await app.inject({ method: "GET", url: base })).json();
    expect(detail.chapters[0].lines).toHaveLength(2);
    expect(detail.chapters[0].lines[0].moves.at(-1).moveSan).toBe("e5");
    const catalogue = (await app.inject({ method: "GET", url: "/api/v1/openings/catalog" })).json();
    expect(catalogue.repertoires.filter((repertoire: { origin: string }) => repertoire.origin === "imported")).toHaveLength(1);
  });

  it("refreshes a private study once and applies its preview without downloading again", async () => {
    const settings = config(false);
    settings.lichessApiToken = "test-private-study-token";
    const pgn = '[Event "Private Italian"]\n[ChapterName "Italian"]\n[ChapterURL "https://lichess.org/study/abcdefgh/ABCDEFGH"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *';
    let downloads = 0;
    globalThis.fetch = async (url, options) => {
      expect(String(url)).toContain("variations=true");
      expect(options?.headers).toMatchObject({ Authorization: "Bearer test-private-study-token" });
      downloads += 1;
      return new Response(pgn.replace("2. Nf3 *", "2. Nf3 Nc6 3. Bc4 *"));
    };
    const app = await buildApp(settings);
    apps.push(app);
    const repertoireId = (await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: {
      pgn, learnerColor: "white", sourceType: "lichess_study", sourceTitle: "https://lichess.org/study/abcdefgh", ownershipConfirmed: true,
    } })).json().repertoireIds[0];
    const base = `/api/v1/openings/repertoires/${repertoireId}/updates`;
    const preview = await app.inject({ method: "POST", url: `${base}/preview`, payload: { studyUrl: "https://lichess.org/study/abcdefgh" } });
    expect(preview.statusCode).toBe(200);
    const applied = await app.inject({ method: "POST", url: base, payload: { previewId: preview.json().previewId, ownershipConfirmed: true } });
    expect(applied.statusCode).toBe(200);
    expect(downloads).toBe(1);
  });

  it("finishes a short assisted drill instead of immediately repeating the shown answer forever", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const imported = (await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: {
      pgn: '[Event "One move"]\n[Result "*"]\n\n1. e4 *', learnerColor: "white", name: "One move",
      sourceType: "self_authored", sourceTitle: "My notes", ownershipConfirmed: true,
    } })).json();
    const started = (await app.inject({ method: "POST",
      url: `/api/v1/openings/repertoires/${imported.repertoireIds[0]}/reviews/start` })).json();
    const shown = (await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/reveal` })).json();
    expect(shown).toMatchObject({ outcome: "learning", lapseQueued: false });
    const completed = (await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/continue`,
      payload: { queueEntryId: started.queueEntryId } })).json();
    expect(completed).toMatchObject({ kind: "complete", introduced: 1, remembered: 0 });
  });

  it("persists requested hints and move reveals without completing the answer", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const started = (await app.inject({ method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start", payload: { mode: "new" } })).json();
    for (const kind of ["piece", "move"]) {
      const help = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/help`,
        payload: { kind, queueEntryId: started.queueEntryId } });
      expect(help.statusCode).toBe(200);
      expect(help.json()).toMatchObject({ kind: "exercise", assistance: { pieceHint: true, moveShown: kind === "move" } });
    }
    const restored = (await app.inject({ method: "GET", url: "/api/v1/openings/reviews/active" })).json();
    expect(restored).toMatchObject({ kind: "exercise", assistance: { pieceHint: true, moveShown: true } });
    const answer = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/move`,
      payload: { moveUci: "e2e4", assisted: false, queueEntryId: started.queueEntryId } });
    expect(answer.json()).toMatchObject({ outcome: "learning", assisted: true, revealed: true });
    const repeated = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/move`,
      payload: { moveUci: "e2e4", queueEntryId: started.queueEntryId } });
    expect(repeated.json()).toEqual(answer.json());
    const first = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/continue`,
      payload: { queueEntryId: started.queueEntryId } });
    const retry = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/continue`,
      payload: { queueEntryId: started.queueEntryId } });
    expect(retry.json()).toEqual(first.json());
  });

  it("credits the actual alternative move without mastering another branch", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const imported = (await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: {
      pgn: OPENING_REPERTOIRE_PGN, learnerColor: "black", name: "Branch evidence", sourceType: "self_authored",
      sourceTitle: "My notes", ownershipConfirmed: true,
    } })).json();
    const repertoireId = imported.repertoireIds[0];
    const detail = (await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` })).json();
    const lines = detail.chapters.flatMap((chapter: { lines: Array<{ id: string; moves: Array<{ moveUci: string; id: string }> }> }) => chapter.lines);
    const branch = lines.find((line: { moves: Array<{ moveUci: string }> }) => line.moves.some((move) => move.moveUci === "c7c5"));
    const main = lines.find((line: { moves: Array<{ moveUci: string }> }) => line.moves.some((move) => move.moveUci === "d7d5"));
    const start = (await app.inject({ method: "POST", url: `/api/v1/openings/repertoires/${repertoireId}/lines/${branch.id}/reviews/start` })).json();
    await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${start.sessionId}/move`, payload: { moveUci: "e7e6" } });
    const position = (await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${start.sessionId}/continue` })).json();
    const db = new BetterSqlite3(appConfig.databasePath);
    const c5 = branch.moves.find((move: { moveUci: string }) => move.moveUci === "c7c5");
    const d5 = main.moves.find((move: { moveUci: string }) => move.moveUci === "d7d5");
    db.prepare("UPDATE opening_move_annotations SET summary = 'My c5 explanation' WHERE move_id = ?").run(c5.id);
    // Convert this queue entry to position recall, where both saved moves are accepted.
    db.prepare("UPDATE opening_review_queue SET expected_move_id = NULL, source_line_id = NULL WHERE id = ?").run(position.queueEntryId);
    const feedback = (await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${start.sessionId}/move`, payload: { moveUci: "c7c5" } })).json();
    expect(feedback).toMatchObject({ outcome: "remembered", repertoireMove: { moveId: c5.id, moveUci: "c7c5" },
      explanation: { summary: "My c5 explanation" } });
    expect(db.prepare("SELECT repetitions FROM opening_move_review_cards WHERE move_id = ?").pluck().get(c5.id)).toBe(1);
    expect(db.prepare("SELECT repetitions FROM opening_move_review_cards WHERE move_id = ?").pluck().get(d5.id)).toBeUndefined();
    const progress = (await app.inject({ method: "GET", url: "/api/v1/openings/progress" })).json();
    expect(progress.lines.find((line: { lineId: string }) => line.lineId === branch.id)).toMatchObject({ accuracyPercent: 100, mastered: 0 });
    db.close();
  });

  it("reuses game matches until the repertoire graph or archive state changes", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: ITALIAN_DEVIATION, playerName: "Alice" } });
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).statusCode).toBe(200);
    const db = new BetterSqlite3(appConfig.databasePath);
    const before = db.prepare("SELECT id FROM game_opening_matches ORDER BY id").pluck().all();
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).statusCode).toBe(200);
    expect(db.prepare("SELECT id FROM game_opening_matches ORDER BY id").pluck().all()).toEqual(before);
    await app.inject({ method: "PATCH", url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/archive", payload: { archived: true } });
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" })).statusCode).toBe(200);
    expect(db.prepare("SELECT id FROM game_opening_matches WHERE repertoire_id = 'repertoire.white-e4-principled'").all()).toEqual([]);
    db.close();
  });

  it("varies bounded line rehearsals and rejects archived repertoires", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const start = async () => app.inject({ method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/tree/start" });
    const first = (await start()).json();
    const second = (await start()).json();
    expect(first.lineRun.lineId).not.toBe(second.lineRun.lineId);
    expect(second.totalPositions).toBeLessThanOrEqual(8);
    await app.inject({ method: "PATCH", url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/archive", payload: { archived: true } });
    expect((await start()).statusCode).toBe(400);
  });

  it("stores the player's practical opening context", async () => {
    const appConfig = config(false);
    appConfig.lichessApiToken = "opening-context-token";
    const app = await buildApp(appConfig);
    apps.push(app);

    expect((await app.inject({ method: "GET", url: "/api/v1/openings/preferences" })).json()).toMatchObject({
      configured: false,
      ratingGroup: 1600,
      platform: "not_sure",
      useExplorer: false,
      explorerAvailable: true,
    });

    const saved = await app.inject({
      method: "PATCH",
      url: "/api/v1/openings/preferences",
      payload: { ratingGroup: 1400, platform: "lichess", useExplorer: true },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      configured: true,
      ratingGroup: 1400,
      platform: "lichess",
      useExplorer: true,
      explorerAvailable: true,
      updatedAt: expect.any(String),
    });
    expect((await app.inject({ method: "GET", url: "/api/v1/openings/preferences" })).json())
      .toMatchObject(saved.json());

    expect((await app.inject({
      method: "PATCH",
      url: "/api/v1/openings/preferences",
      payload: { ratingGroup: 1500, platform: "lichess", useExplorer: true },
    })).statusCode).toBe(400);
  });

  it("keeps practical frequencies off when no Lichess token is configured", async () => {
    const app = await buildApp(config(false));
    apps.push(app);

    expect((await app.inject({ method: "GET", url: "/api/v1/openings/preferences" })).json()).toMatchObject({
      useExplorer: false,
      explorerAvailable: false,
    });

    const response = await app.inject({
      method: "PATCH",
      url: "/api/v1/openings/preferences",
      payload: { ratingGroup: 1600, platform: "lichess", useExplorer: true },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: "Add LICHESS_API_TOKEN to Docker before enabling practical frequencies",
    });
  });

  it("serves the independently authored opening preview catalog", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/api/v1/openings/catalog" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      repertoires: expect.arrayContaining([expect.objectContaining({
        id: "repertoire.white-e4-principled",
        learnerColor: "white",
        firstMoveSan: "e4",
        status: "published",
        chapterCount: 7,
      })]),
    });
  });

  it("exposes every named opening line and can practise a selected branch", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const detail = await app.inject({
      method: "GET",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled",
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({
      repertoire: {
        id: "repertoire.white-e4-principled",
        learnerColor: "white",
        origin: "built_in",
      },
      chapters: expect.arrayContaining([expect.objectContaining({
        title: expect.any(String),
        lines: expect.arrayContaining([expect.objectContaining({
          id: expect.any(String),
          sanSequence: expect.stringMatching(/^1\. e4/),
          moves: expect.arrayContaining([expect.objectContaining({
            moveUci: "e2e4",
            role: "learner",
            fenBefore: expect.any(String),
            fenAfter: expect.any(String),
          })]),
        })]),
      })]),
    });
    const body = detail.json() as { chapters: Array<{ lines: Array<{ id: string; title: string }> }> };
    const selected = body.chapters.flatMap((chapter) => chapter.lines).at(-1)!;
    const started = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/repertoire.white-e4-principled/lines/${selected.id}/lessons/start`,
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({ lineTitle: selected.title, learnerColor: "white" });
  });

  it("previews, privately imports, and deduplicates a trainable opening PGN", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const payload = {
      pgn: OPENING_REPERTOIRE_PGN,
      learnerColor: "black",
      name: "My French",
      sourceType: "book_notes",
      sourceTitle: "Private reading notes",
      ownershipConfirmed: true,
    };
    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/pgn/preview",
      payload,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      suggestedName: "My French",
      learnerColors: ["black"],
      firstMoveSan: "e4",
      chapterCount: 1,
      lineCount: 2,
    });

    const imported = await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({ imported: 1, duplicates: 0 });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;

    const catalog = await app.inject({ method: "GET", url: "/api/v1/openings/catalog" });
    expect(catalog.json()).toMatchObject({
      repertoires: expect.arrayContaining([
        expect.objectContaining({
          id: repertoireId,
          name: "My French",
          learnerColor: "black",
          origin: "imported",
          sourceTitle: "Private reading notes",
        }),
      ]),
    });
    const started = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lessons/start`,
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({ learnerColor: "black", opponentMove: { moveSan: "e4" } });
    const attemptId = (started.json() as { attemptId: string }).attemptId;
    const firstMove = await app.inject({
      method: "POST", url: `/api/v1/openings/lessons/${attemptId}/move`, payload: { moveUci: "e7e6" },
    });
    expect(firstMove.json()).toMatchObject({
      whyOptions: [{ value: "imported_note" }],
      message: expect.stringMatching(/personal note/i),
    });
    await app.inject({
      method: "POST", url: `/api/v1/openings/lessons/${attemptId}/why`, payload: { concept: "imported_note" },
    });
    await app.inject({ method: "POST", url: `/api/v1/openings/lessons/${attemptId}/continue` });
    const secondMove = await app.inject({
      method: "POST", url: `/api/v1/openings/lessons/${attemptId}/move`, payload: { moveUci: "d7d5" },
    });
    expect(secondMove.json()).toMatchObject({
      whyOptions: [{ value: "missing_explanation" }],
      message: expect.stringMatching(/reason has not been written/i),
    });
    await app.inject({
      method: "POST", url: `/api/v1/openings/lessons/${attemptId}/why`, payload: { concept: "missing_explanation" },
    });
    const completed = await app.inject({ method: "POST", url: `/api/v1/openings/lessons/${attemptId}/continue` });
    expect(completed.json()).toMatchObject({ kind: "complete" });

    const nextLine = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lessons/start`,
    });
    expect(nextLine.json()).toMatchObject({ lineTitle: "Variation 2" });

    const duplicate = await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload });
    expect(duplicate.json()).toMatchObject({ imported: 0, duplicates: 1 });
  });

  it("authenticates, previews, and imports a private multi-chapter Lichess Study", async () => {
    const authorizationHeaders: Array<string | null> = [];
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toBe("https://lichess.org/api/study/abcdefgh.pgn?comments=true&variations=true&clocks=false");
      authorizationHeaders.push(new Headers(init?.headers).get("Authorization"));
      return new Response(PRIVATE_LICHESS_STUDY_PGN, {
        status: 200,
        headers: { "Content-Type": "application/x-chess-pgn" },
      });
    }) as typeof fetch;
    const appConfig = config(false);
    appConfig.lichessApiToken = "private-study-token";
    const app = await buildApp(appConfig);
    apps.push(app);

    const preview = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/lichess/preview",
      payload: {
        studyUrl: "https://lichess.org/study/abcdefgh",
        learnerColor: "white",
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      suggestedName: "My Private Study",
      chapterCount: 2,
      lineCount: 3,
      chapters: [
        expect.objectContaining({ title: "Italian", lineCount: 2 }),
        expect.objectContaining({ title: "Caro-Kann", lineCount: 1 }),
      ],
    });

    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/lichess",
      payload: {
        studyUrl: "https://lichess.org/study/abcdefgh",
        learnerColor: "white",
        selectedChapterIndexes: [0, 1],
        ownershipConfirmed: true,
      },
    });
    expect(imported.statusCode).toBe(200);
    expect(imported.json()).toMatchObject({ imported: 1, duplicates: 0 });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;
    const detail = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    expect(detail.json()).toMatchObject({
      repertoire: { name: "My Private Study", sourceTitle: "https://lichess.org/study/abcdefgh" },
      chapters: [
        expect.objectContaining({ title: "Italian", lines: expect.arrayContaining([expect.objectContaining({ title: "Variation 2" })]) }),
        expect.objectContaining({ title: "Caro-Kann" }),
      ],
    });
    const importedDetail = detail.json() as { chapters: Array<{ title: string; lines: Array<{ id: string; title: string }> }> };
    const italianVariation = importedDetail.chapters
      .find((chapter) => chapter.title === "Italian")?.lines
      .find((line) => line.title === "Variation 2");
    expect(italianVariation).toBeDefined();
    const practice = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${italianVariation!.id}/lessons/start`,
    });
    expect(practice.statusCode).toBe(200);
    expect(practice.json()).toMatchObject({
      repertoire: { name: "My Private Study" },
      chapter: { title: "Italian" },
      lineTitle: "Variation 2",
      learnerColor: "white",
    });
    expect(authorizationHeaders).toEqual(["Bearer private-study-token", "Bearer private-study-token"]);
  });

  it("edits a private repertoire without overwriting its original line", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/pgn",
      payload: {
        pgn: OPENING_REPERTOIRE_PGN,
        learnerColor: "black",
        name: "Editable French",
        sourceType: "self_authored",
        sourceTitle: "My board",
        ownershipConfirmed: true,
      },
    });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;
    const before = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    const beforeBody = before.json() as {
      repertoire: { editable: boolean };
      chapters: Array<{ lines: Array<{ id: string; moves: Array<{ id: string }> }> }>;
    };
    expect(beforeBody.repertoire.editable).toBe(true);
    const originalLine = beforeBody.chapters[0]!.lines[0]!;
    const originalLineCount = beforeBody.chapters[0]!.lines.length;

    const branched = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${originalLine.id}/moves`,
      payload: { afterPly: 2, moveUci: "c2c4", branchTitle: "French with c4", summary: "Challenges the centre immediately." },
    });
    expect(branched.statusCode).toBe(200);
    expect(branched.json()).toMatchObject({ createdBranch: true, message: expect.stringMatching(/original line is unchanged/i) });
    const branchBody = branched.json() as {
      lineId: string;
      detail: { chapters: Array<{ lines: Array<{ id: string; title: string; moves: Array<{ id: string; moveUci: string; explanation: { summary: string } }> }> }> };
    };
    expect(branchBody.detail.chapters[0]!.lines).toHaveLength(originalLineCount + 1);
    expect(branchBody.detail.chapters[0]!.lines.find((line) => line.id === originalLine.id)!.moves).toHaveLength(5);
    const branch = branchBody.detail.chapters[0]!.lines.find((line) => line.id === branchBody.lineId)!;
    expect(branch.moves.map((move) => move.moveUci)).toEqual(["e2e4", "e7e6", "c2c4"]);

    const changedMove = branch.moves[2]!;
    const explained = await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/moves/${changedMove.id}/explanation`,
      payload: { summary: "Claims space and asks Black how the centre will be defended." },
    });
    expect(explained.statusCode).toBe(200);
    expect(explained.json()).toMatchObject({
      chapters: expect.arrayContaining([expect.objectContaining({
        lines: expect.arrayContaining([expect.objectContaining({
          id: branch.id,
          moves: expect.arrayContaining([expect.objectContaining({
            id: changedMove.id,
            explanation: expect.objectContaining({ summary: "Claims space and asks Black how the centre will be defended." }),
          })]),
        })]),
      })]),
    });
  });

  it("archives built-in opening material without deleting its lines or progress", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const repertoireId = "repertoire.white-e4-principled";
    const before = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    const beforeBody = before.json() as {
      chapters: Array<{ lines: Array<{ id: string; archived: boolean }> }>;
    };
    const lines = beforeBody.chapters.flatMap((chapter) => chapter.lines);
    const lineId = lines[0]!.id;
    const progressBefore = (await app.inject({ method: "GET", url: "/api/v1/openings/progress" })).json() as {
      totalLines: number;
    };

    const archivedLine = await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/archive`,
      payload: { archived: true },
    });
    expect(archivedLine.statusCode).toBe(200);
    expect(archivedLine.json()).toMatchObject({
      entity: "line",
      id: lineId,
      archived: true,
      detail: { chapters: expect.arrayContaining([expect.objectContaining({
        lines: expect.arrayContaining([expect.objectContaining({ id: lineId, archived: true })]),
      })]) },
    });
    const catalogWithLineArchived = await app.inject({ method: "GET", url: "/api/v1/openings/catalog" });
    expect(catalogWithLineArchived.json()).toMatchObject({
      repertoires: expect.arrayContaining([expect.objectContaining({
        id: repertoireId,
        activeLineCount: lines.length - 1,
        archivedLineCount: 1,
      })]),
    });
    const progressAfter = (await app.inject({ method: "GET", url: "/api/v1/openings/progress" })).json() as {
      totalLines: number;
    };
    expect(progressAfter.totalLines).toBe(progressBefore.totalLines - 1);
    expect((await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/lessons/start`,
    })).statusCode).toBe(400);

    expect((await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/archive`,
      payload: { archived: false },
    })).json()).toMatchObject({ archived: false });
    expect((await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/archive`,
      payload: { archived: true },
    })).json()).toMatchObject({ entity: "repertoire", archived: true });
    const catalogArchived = await app.inject({ method: "GET", url: "/api/v1/openings/catalog" });
    expect(catalogArchived.json()).toMatchObject({
      repertoires: expect.arrayContaining([expect.objectContaining({ id: repertoireId, archived: true })]),
    });
    expect((await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/reviews/start`,
      payload: { mode: "new" },
    })).statusCode).toBe(400);
    expect((await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/archive`,
      payload: { archived: false },
    })).json()).toMatchObject({ archived: false });
    const restored = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    expect((restored.json() as typeof beforeBody).chapters.flatMap((chapter) => chapter.lines)).toHaveLength(lines.length);
  });

  it("renames, reorders, exports and immediately undoes changes to a personal repertoire", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/pgn",
      payload: {
        pgn: OPENING_REPERTOIRE_PGN,
        learnerColor: "black",
        name: "Editable French",
        sourceType: "self_authored",
        sourceTitle: "My board",
        ownershipConfirmed: true,
      },
    });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;
    const detail = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    const lines = (detail.json() as {
      chapters: Array<{ lines: Array<{ id: string; title: string; priority: number; moves: Array<{ id: string }> }> }>;
    }).chapters[0]!.lines;
    const firstLine = lines[0]!;
    const secondLine = lines[1]!;

    const renamed = await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}`,
      payload: { name: "My Dependable French" },
    });
    expect(renamed.json()).toMatchObject({ detail: { repertoire: { name: "My Dependable French" } } });
    const reordered = await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${secondLine.id}`,
      payload: { title: "Advance option", direction: "earlier" },
    });
    expect(reordered.statusCode).toBe(200);
    const reorderedLines = (reordered.json() as {
      detail: { chapters: Array<{ lines: Array<{ id: string; title: string }> }> };
    }).detail.chapters[0]!.lines;
    expect(reorderedLines[0]).toMatchObject({ id: secondLine.id, title: "Advance option" });

    const added = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${firstLine.id}/moves`,
      payload: { afterPly: 5, moveUci: "c7c5", summary: "Challenge White's centre." },
    });
    expect(added.statusCode).toBe(200);
    const addedBody = added.json() as { moveId: string; createdBranch: boolean };
    expect(addedBody).toMatchObject({ moveId: expect.any(String), createdBranch: false });
    const undone = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${firstLine.id}/moves/undo`,
      payload: { moveId: addedBody.moveId },
    });
    expect(undone.statusCode).toBe(200);
    expect(undone.json()).toMatchObject({ lineId: firstLine.id, message: expect.stringMatching(/c5 was removed/i) });

    expect((await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${secondLine.id}/archive`,
      payload: { archived: true },
    })).statusCode).toBe(200);
    const exported = await app.inject({
      method: "GET",
      url: `/api/v1/openings/repertoires/${repertoireId}/export.pgn`,
    });
    expect(exported.statusCode).toBe(200);
    expect(exported.headers["content-type"]).toContain("application/x-chess-pgn");
    expect(exported.headers["content-disposition"]).toContain("my-dependable-french.pgn");
    expect(exported.body).toContain('[Event "My Dependable French"]');
    expect(exported.body).toContain('[%tbline Advance%20option]');
    expect(exported.body).not.toContain("Challenge White's centre");
  });

  it("deletes a personal line safely and can remove the whole repertoire to start again", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/pgn",
      payload: {
        pgn: OPENING_REPERTOIRE_PGN,
        learnerColor: "black",
        name: "Temporary French",
        sourceType: "self_authored",
        sourceTitle: "Temporary board",
        ownershipConfirmed: true,
      },
    });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;
    const detail = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    const lines = (detail.json() as {
      chapters: Array<{ lines: Array<{ id: string; title: string }> }>;
    }).chapters.flatMap((chapter) => chapter.lines);
    expect(lines).toHaveLength(2);

    const review = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/reviews/start`,
      payload: { mode: "new" },
    });
    expect(review.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lines[1]!.id}/lessons/start`,
    });
    const deletedLine = await app.inject({
      method: "DELETE",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lines[1]!.id}`,
    });
    expect(deletedLine.statusCode).toBe(200);
    expect(deletedLine.json()).toMatchObject({
      deletedLineId: lines[1]!.id,
      nextLineId: lines[0]!.id,
      message: expect.stringMatching(/shared moves remain/i),
      detail: { chapters: [expect.objectContaining({ lines: [expect.objectContaining({ id: lines[0]!.id })] })] },
    });
    const afterLineDelete = new BetterSqlite3(appConfig.databasePath);
    expect(afterLineDelete.prepare(`
      SELECT COUNT(*)
      FROM opening_review_items ori
      JOIN opening_moves m ON m.id = ori.move_id
      WHERE ori.repertoire_id = ?
        AND NOT EXISTS (SELECT 1 FROM opening_line_moves olm WHERE olm.move_id = m.id)
    `).pluck().get(repertoireId)).toBe(0);
    expect(afterLineDelete.prepare(`
      SELECT COUNT(*) FROM opening_review_sessions
      WHERE repertoire_id = ? AND status = 'active'
    `).pluck().get(repertoireId)).toBe(0);
    afterLineDelete.close();

    const finalLine = await app.inject({
      method: "DELETE",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${lines[0]!.id}`,
    });
    expect(finalLine.statusCode).toBe(200);
    expect(finalLine.json()).toMatchObject({ deletedRepertoireId: repertoireId, detail: null, nextLineId: null });

    const protectedCourse = await app.inject({
      method: "DELETE",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled",
    });
    expect(protectedCourse.statusCode).toBe(200);
    expect(protectedCourse.json()).toMatchObject({ deletedRepertoireId: "repertoire.white-e4-principled" });

    const deletedRepertoire = await app.inject({
      method: "DELETE",
      url: "/api/v1/openings/repertoires/repertoire.black-modern-e4",
    });
    expect(deletedRepertoire.statusCode).toBe(200);
    expect(deletedRepertoire.json()).toMatchObject({
      deletedRepertoireId: "repertoire.black-modern-e4",
      message: expect.stringMatching(/imported games were kept/i),
    });
    expect((await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` })).statusCode).toBe(404);

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_imports WHERE repertoire_id = ?").pluck().get(repertoireId)).toBe(0);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_lesson_attempts WHERE repertoire_id = ?").pluck().get(repertoireId)).toBe(0);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_moves WHERE repertoire_id = ?").pluck().get(repertoireId)).toBe(0);
    connection.close();
  });

  it("connects and incrementally imports public Lichess games through the normal analysis queue", async () => {
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes("/api/user/")) {
        return new Response(JSON.stringify({ id: "alice", username: "Alice" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/games/user/")) {
        return new Response(FOOLS_MATE, {
          status: 200,
          headers: { "Content-Type": "application/x-chess-pgn" },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    }) as typeof fetch;
    const app = await buildApp(config(false));
    apps.push(app);

    const connected = await app.inject({
      method: "POST", url: "/api/v1/lichess/connect", payload: { username: "alice" },
    });
    expect(connected.statusCode).toBe(200);
    expect(connected.json()).toMatchObject({ connected: true, username: "Alice", tokenConfigured: false });

    const synced = await app.inject({
      method: "POST", url: "/api/v1/lichess/sync", payload: { maxGames: 25 },
    });
    expect(synced.statusCode).toBe(202);
    expect(synced.json()).toMatchObject({ imported: 1, duplicates: 0, jobId: expect.any(String) });
    const games = await app.inject({ method: "GET", url: "/api/v1/games" });
    expect(games.json()).toMatchObject({ games: [expect.objectContaining({ white: "Alice", playerColor: "white" })] });

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/lichess/sync", payload: { maxGames: 25 },
    });
    expect(duplicate.json()).toMatchObject({ imported: 0, duplicates: 1, jobId: null });
  });

  it("reports practical opening gaps and reuses cached explorer data", async () => {
    let explorerCalls = 0;
    globalThis.fetch = (async (input) => {
      expect(String(input)).toContain("https://explorer.lichess.org/lichess");
      explorerCalls += 1;
      return new Response(JSON.stringify({
        white: 55,
        draws: 10,
        black: 35,
        moves: [
          { uci: "e7e5", san: "e5", white: 40, draws: 8, black: 32 },
          { uci: "c7c5", san: "c5", white: 15, draws: 2, black: 3 },
        ],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const appConfig = config(false);
    appConfig.lichessApiToken = "coverage-token";
    const app = await buildApp(appConfig);
    apps.push(app);

    const first = await app.inject({
      method: "GET",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/coverage?rating=1600",
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({
      ratingGroup: 1600,
      positionsChecked: expect.any(Number),
      positionsAvailable: expect.any(Number),
      coveragePercent: expect.any(Number),
      gaps: expect.arrayContaining([expect.objectContaining({ moveUci: "e7e5", frequencyPercent: 80 })]),
    });
    const callsAfterFirst = explorerCalls;
    const second = await app.inject({
      method: "GET",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/coverage?rating=1600",
    });
    expect(second.statusCode).toBe(200);
    expect(explorerCalls).toBe(callsAfterFirst);
  });

  it("checks for replies after a pasted repertoire line ends", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      white: 60,
      draws: 20,
      black: 20,
      moves: [{ uci: "g8f6", san: "Nf6", white: 36, draws: 12, black: 12 }],
    }), { status: 200, headers: { "Content-Type": "application/json" } })) as typeof fetch;
    const appConfig = config(false);
    appConfig.lichessApiToken = "coverage-token";
    const app = await buildApp(appConfig);
    apps.push(app);

    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/pgn",
      payload: {
        pgn: `[Event "Short personal line"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *`,
        learnerColor: "white",
        name: "Short personal line",
        sourceType: "self_authored",
        sourceTitle: "Built for coverage testing",
        ownershipConfirmed: true,
      },
    });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;
    const coverage = await app.inject({
      method: "GET",
      url: `/api/v1/openings/repertoires/${repertoireId}/coverage?rating=1600`,
    });

    expect(coverage.statusCode).toBe(200);
    expect(coverage.json()).toMatchObject({
      positionsChecked: 2,
      gaps: expect.arrayContaining([expect.objectContaining({
        moveUci: "g8f6",
        lineTitle: "Main line",
        fen: expect.stringContaining("5N2"),
      })]),
    });
  });

  it("serves cached local analysis and current-position practical moves for the opening studio", async () => {
    let explorerCalls = 0;
    globalThis.fetch = (async (input, init) => {
      expect(String(input)).toContain("https://explorer.lichess.org/lichess");
      expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer explorer-token");
      explorerCalls += 1;
      return new Response(JSON.stringify({
        white: 50,
        draws: 20,
        black: 30,
        opening: { eco: "A00", name: "Starting position" },
        moves: [{ uci: "e2e4", san: "e4", white: 25, draws: 10, black: 15 }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as typeof fetch;
    const appConfig = config(false);
    appConfig.lichessApiToken = "explorer-token";
    const app = await buildApp(appConfig);
    apps.push(app);
    const fen = new Chess().fen();

    const analysis = await app.inject({
      method: "POST", url: "/api/v1/openings/analysis", payload: { fen },
    });
    expect(analysis.statusCode).toBe(200);
    expect(analysis.json()).toMatchObject({
      fen,
      depth: 14,
      lines: expect.arrayContaining([expect.objectContaining({
        rank: 1,
        moveUci: expect.any(String),
        moveSan: expect.any(String),
        score: { kind: "centipawns", value: 0, perspective: "side_to_move" },
      })]),
    });

    const explorerUrl = `/api/v1/openings/explorer?rating=1600&fen=${encodeURIComponent(fen)}`;
    const explorer = await app.inject({ method: "GET", url: explorerUrl });
    expect(explorer.statusCode).toBe(200);
    expect(explorer.json()).toMatchObject({
      ratingGroup: 1600,
      totalGames: 100,
      opening: { eco: "A00", name: "Starting position" },
      replies: [{
        moveUci: "e2e4",
        moveSan: "e4",
        games: 50,
        frequencyPercent: 50,
        whiteWins: 25,
        draws: 10,
        blackWins: 15,
      }],
      cached: false,
    });
    const cached = await app.inject({ method: "GET", url: explorerUrl });
    expect(cached.json()).toMatchObject({ cached: true });
    expect(explorerCalls).toBe(1);
  });

  it("teaches and restores a guided opening line before any PGN is imported", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);

    const noLesson = await app.inject({ method: "GET", url: "/api/v1/openings/lessons/active" });
    expect(noLesson.json()).toBeNull();
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/lessons/start",
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      kind: "step",
      learnerColor: "white",
      decisionNumber: 1,
      totalDecisions: 6,
      opponentMove: null,
      movesBefore: [],
    });
    const attemptId = (started.json() as { attemptId: string }).attemptId;

    const decisions = [
      { move: "e2e4", reason: "central_control", nextOpponent: "e5" },
      { move: "g1f3", reason: "development", nextOpponent: "Nc6" },
      { move: "f1c4", reason: "development", nextOpponent: "Bc5" },
      { move: "d2d3", reason: "pawn_structure", nextOpponent: "Nf6" },
      { move: "e1g1", reason: "king_safety", nextOpponent: "d6" },
      { move: "c2c3", reason: "pawn_break", nextOpponent: null },
    ];
    for (const [index, decision] of decisions.entries()) {
      const move = await app.inject({
        method: "POST",
        url: `/api/v1/openings/lessons/${attemptId}/move`,
        payload: { moveUci: decision.move },
      });
      expect(move.statusCode).toBe(200);
      expect(move.json()).toMatchObject({ moveOutcome: "repertoire" });
      const restoredAfterMove = await app.inject({ method: "GET", url: "/api/v1/openings/lessons/active" });
      expect(restoredAfterMove.json()).toMatchObject({
        decisionNumber: index + 1,
        moveAnswer: { moveOutcome: "repertoire" },
      });
      const why = await app.inject({
        method: "POST",
        url: `/api/v1/openings/lessons/${attemptId}/why`,
        payload: { concept: decision.reason },
      });
      expect(why.statusCode).toBe(200);
      expect(why.json()).toMatchObject({ outcome: "correct" });
      const next = (why.json() as { next: Record<string, unknown> }).next;
      if (index < decisions.length - 1) {
        expect(next).toMatchObject({
          kind: "step",
          decisionNumber: index + 2,
          opponentMove: { moveSan: decision.nextOpponent },
        });
        const restoredFeedback = await app.inject({ method: "GET", url: "/api/v1/openings/lessons/active" });
        expect(restoredFeedback.json()).toMatchObject({ kind: "feedback", outcome: "correct" });
      } else {
        expect(next).toMatchObject({
          kind: "complete",
          decisions: 6,
          repertoireMoves: 6,
          reasonsUnderstood: 6,
        });
      }
      const continued = await app.inject({
        method: "POST",
        url: `/api/v1/openings/lessons/${attemptId}/continue`,
      });
      expect(continued.statusCode).toBe(200);
      if (index < decisions.length - 1) {
        expect(continued.json()).toMatchObject({ kind: "step", decisionNumber: index + 2 });
      } else {
        expect(continued.json()).toMatchObject({ kind: "complete", decisions: 6 });
      }
    }

    const noLongerActive = await app.inject({ method: "GET", url: "/api/v1/openings/lessons/active" });
    expect(noLongerActive.json()).toBeNull();
    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_lesson_answers").pluck().get()).toBe(6);
    expect(connection.prepare("SELECT status FROM opening_lesson_attempts").pluck().get()).toBe("completed");
    connection.close();

    const dashboard = await app.inject({ method: "GET", url: "/api/v1/dashboard" });
    expect(dashboard.json()).toMatchObject({ totals: { games: 0, attempts: 6 } });

    const imported = await app.inject({
      method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: FOOLS_MATE, playerName: "Alice" },
    });
    expect(imported.statusCode).toBe(202);
    const profiles = await app.inject({ method: "GET", url: "/api/v1/profiles" });
    expect(profiles.json()).toMatchObject({ profiles: [{ displayName: "Alice" }] });
  });

  it("keeps due review separate from new learning", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "new" },
    });
    const connection = new BetterSqlite3(appConfig.databasePath);
    connection.prepare(`
      UPDATE opening_review_items
      SET state = 2, repetitions = 2, due_at = '2020-01-01T00:00:00.000Z'
      WHERE move_id IN (SELECT id FROM opening_moves WHERE move_uci = 'e2e4')
    `).run();
    connection.close();

    const due = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "due" },
    });
    expect(due.json()).toMatchObject({ kind: "exercise", totalPositions: 1, learningStage: "review" });

    const fresh = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "new" },
    });
    expect(fresh.json()).toMatchObject({ kind: "exercise", totalPositions: 5, learningStage: "new" });
  });

  it("practises one selected line continuously and keeps its branch move exact", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/openings/imports/pgn",
      payload: {
        pgn: OPENING_REPERTOIRE_PGN,
        learnerColor: "black",
        name: "Exact French line",
        sourceType: "self_authored",
        sourceTitle: "My board",
        ownershipConfirmed: true,
      },
    });
    const repertoireId = (imported.json() as { repertoireIds: string[] }).repertoireIds[0]!;
    const detail = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    const lines = (detail.json() as {
      chapters: Array<{ lines: Array<{ id: string; moves: Array<{ moveUci: string }> }> }>;
    }).chapters.flatMap((chapter) => chapter.lines);
    const c5Line = lines.find((line) => line.moves.some((move) => move.moveUci === "c7c5"));
    expect(c5Line).toBeDefined();

    const started = await app.inject({
      method: "POST",
      url: `/api/v1/openings/repertoires/${repertoireId}/lines/${c5Line!.id}/reviews/start`,
    });
    expect(started.statusCode, started.body).toBe(200);
    expect(started.json()).toMatchObject({
      kind: "exercise",
      totalPositions: 2,
      acceptedMoves: [{ moveUci: "e7e6" }],
    });
    const sessionId = (started.json() as { sessionId: string }).sessionId;
    await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/move`,
      payload: { moveUci: "e7e6" },
    });
    const continued = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/continue`,
    });
    expect(continued.json()).toMatchObject({
      kind: "exercise",
      positionNumber: 2,
      acceptedMoves: [{ moveUci: "c7c5" }],
      introduction: { repertoireMove: { moveUci: "c7c5" } },
    });

    const branchMistake = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/mistakes`,
      payload: { moveUci: "d7d5" },
    });
    expect(branchMistake.statusCode).toBe(200);
    expect(branchMistake.json()).toMatchObject({ moveUci: "d7d5", attemptNumber: 1 });
  });

  it("records an honest answer reveal as assisted learning", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "new" },
    });
    const sessionId = (started.json() as { sessionId: string }).sessionId;
    const revealed = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/reveal`,
    });
    expect(revealed.statusCode).toBe(200);
    expect(revealed.json()).toMatchObject({
      kind: "feedback",
      outcome: "learning",
      assisted: true,
      revealed: true,
      recallSpeed: null,
      repertoireMove: { moveSan: "e4" },
      lapseQueued: true,
    });
    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT assisted FROM opening_review_events").pluck().get()).toBe(1);
    connection.close();
  });

  it("keeps the exact wrong move and prevents a corrected retry counting as independent recall", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "new" },
    });
    const sessionId = (started.json() as { sessionId: string }).sessionId;

    const mistake = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/mistakes`,
      payload: { moveUci: "d2d4" },
    });
    expect(mistake.statusCode).toBe(200);
    expect(mistake.json()).toMatchObject({ moveUci: "d2d4", moveSan: "d4", attemptNumber: 1 });

    const corrected = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/move`,
      payload: { moveUci: "e2e4", assisted: false },
    });
    expect(corrected.statusCode).toBe(200);
    expect(corrected.json()).toMatchObject({ outcome: "learning", assisted: true, lapseQueued: true });

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT played_move_uci FROM opening_review_mistakes").pluck().get()).toBe("d2d4");
    expect(connection.prepare("SELECT assisted FROM opening_review_events").pluck().get()).toBe(1);
    connection.close();
  });

  it("stores a personal learning comment without modifying built-in opening content", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const before = await app.inject({
      method: "GET",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled",
    });
    const beforeBody = before.json() as {
      chapters: Array<{ lines: Array<{ moves: Array<{ id: string; moveUci: string; explanation: { summary: string } }> }> }>;
    };
    const move = beforeBody.chapters.flatMap((chapter) => chapter.lines)
      .flatMap((line) => line.moves)
      .find((candidate) => candidate.moveUci === "e2e4")!;
    const providedSummary = move.explanation.summary;

    const saved = await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/repertoires/repertoire.white-e4-principled/moves/${move.id}/comment`,
      payload: { comment: "  Claim the centre before developing the king's knight.  " },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({
      moveId: move.id,
      comment: "Claim the centre before developing the king's knight.",
    });

    const after = await app.inject({
      method: "GET",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled",
    });
    const afterBody = after.json() as {
      chapters: Array<{ lines: Array<{ moves: Array<{ id: string; explanation: { summary: string; personalComment: string | null } }> }> }>;
    };
    const updatedMove = afterBody.chapters.flatMap((chapter) => chapter.lines)
      .flatMap((line) => line.moves)
      .find((candidate) => candidate.id === move.id)!;
    expect(updatedMove.explanation).toMatchObject({
      summary: providedSummary,
      personalComment: "Claim the centre before developing the king's knight.",
    });

    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "new" },
    });
    expect(started.json()).toMatchObject({
      introduction: {
        repertoireMove: { moveId: move.id },
        explanation: { personalComment: "Claim the centre before developing the king's knight." },
      },
    });
  });

  it("records active recall time and rejects stale or invalid timed attempts", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const started = (await app.inject({ method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start", payload: { mode: "new" } })).json();
    const connection = new BetterSqlite3(appConfig.databasePath);
    connection.prepare("UPDATE opening_review_queue SET started_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(started.queueEntryId);
    const resumed = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${started.sessionId}/resume`, payload: { preserveTiming: true } });
    expect(resumed.statusCode).toBe(200);
    expect(connection.prepare("SELECT started_at FROM opening_review_queue WHERE id = ?").pluck().get(started.queueEntryId)).toBe("2020-01-01T00:00:00.000Z");
    const route = `/api/v1/openings/reviews/${started.sessionId}`;
    expect((await app.inject({ method: "POST", url: `${route}/mistakes`, payload: { moveUci: "d2d4", queueEntryId: "stale", activeResponseMs: 1000 } })).statusCode).toBe(400);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_review_mistakes").pluck().get()).toBe(0);
    expect((await app.inject({ method: "POST", url: `${route}/move`, payload: { moveUci: "e2e4", activeResponseMs: -1 } })).statusCode).toBe(400);
    const answered = await app.inject({ method: "POST", url: `${route}/move`, payload: { moveUci: "e2e4", queueEntryId: started.queueEntryId, activeResponseMs: 2300 } });
    expect(answered.json()).toMatchObject({ outcome: "remembered", recallSpeed: "normal" });
    expect(connection.prepare("SELECT rating, response_ms FROM opening_review_events WHERE session_id = ?").get(started.sessionId)).toEqual({ rating: 3, response_ms: 2300 });
    connection.close();
  });

  it("restarts the response timer when a paused opening review resumes", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
      payload: { mode: "new" },
    });
    const sessionId = (started.json() as { sessionId: string }).sessionId;
    const connection = new BetterSqlite3(appConfig.databasePath);
    connection.prepare(`
      UPDATE opening_review_queue SET started_at = '2020-01-01T00:00:00.000Z'
      WHERE session_id = ? AND status = 'active'
    `).run(sessionId);
    connection.close();

    const resumed = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/resume`,
    });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ kind: "exercise", sessionId });

    const answered = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/move`,
      payload: { moveUci: "e2e4", assisted: false },
    });
    expect(answered.json()).toMatchObject({ outcome: "remembered", recallSpeed: "normal" });
    const verified = new BetterSqlite3(appConfig.databasePath);
    const event = verified.prepare("SELECT rating, response_ms FROM opening_review_events").get() as {
      rating: number;
      response_ms: number;
    };
    expect(event.rating).toBe(3);
    expect(event.response_ms).toBeLessThan(60_000);
    verified.close();
  });

  it("teaches new opening decisions without counting assisted moves as remembered", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);

    const initialCatalog = await app.inject({ method: "GET", url: "/api/v1/openings/catalog" });
    expect(initialCatalog.json()).toMatchObject({
      repertoires: expect.arrayContaining([expect.objectContaining({
        id: "repertoire.white-e4-principled",
        review: { total: 29, due: 0, new: 29, reviewed: 0, learning: 0 },
      })]),
    });

    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      kind: "exercise",
      learnerColor: "white",
      positionNumber: 1,
      totalPositions: 5,
      opponentMove: null,
      learningStage: "new",
      acceptedMoves: [{ moveUci: "e2e4", moveSan: "e4" }],
      introduction: { repertoireMove: { moveSan: "e4" } },
    });
    const sessionId = (started.json() as { sessionId: string }).sessionId;

    const introduced = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/move`,
      payload: { moveUci: "e2e4", assisted: true },
    });
    expect(introduced.statusCode).toBe(200);
    expect(introduced.json()).toMatchObject({
      kind: "feedback",
      outcome: "learning",
      assisted: true,
      revealed: false,
      playedMove: { moveSan: "e4" },
      repertoireMove: { moveSan: "e4" },
      lapseQueued: true,
    });
    const restored = await app.inject({ method: "GET", url: "/api/v1/openings/reviews/active" });
    expect(restored.json()).toMatchObject({ kind: "feedback", outcome: "learning", assisted: true });

    for (let index = 0; index < 5; index += 1) {
      const next = await app.inject({
        method: "POST",
        url: `/api/v1/openings/reviews/${sessionId}/continue`,
      });
      expect(next.statusCode).toBe(200);
      expect(next.json()).toMatchObject({
        kind: "exercise",
        positionNumber: index + 2,
        ...(index === 4 ? { presentationKind: "lapse_repeat" } : {}),
      });
      const nextBody = next.json() as {
        presentationKind: string;
        introduction: { repertoireMove: { moveUci: string } };
      };
      if (index === 4) expect(nextBody.presentationKind).toBe("lapse_repeat");
      const answer = await app.inject({
        method: "POST",
        url: `/api/v1/openings/reviews/${sessionId}/move`,
        payload: { moveUci: nextBody.introduction.repertoireMove.moveUci, assisted: false },
      });
      expect(answer.json()).toMatchObject({ outcome: "remembered" });
    }

    const completed = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/continue`,
    });
    expect(completed.json()).toMatchObject({
      kind: "complete",
      attempts: 6,
      positions: 5,
      remembered: 5,
      introduced: 1,
      lapses: 0,
    });

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_review_items").pluck().get()).toBe(29);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_review_events").pluck().get()).toBe(6);
    expect(connection.prepare("SELECT SUM(assisted) FROM opening_review_events").pluck().get()).toBe(1);
    expect(connection.prepare("SELECT state FROM opening_review_items WHERE move_id IN (SELECT id FROM opening_moves WHERE move_uci = 'e2e4')").pluck().get()).toBe(2);
    connection.close();
  });

  it("records an unassisted off-repertoire move as a lapse", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
    });
    const sessionId = (started.json() as { sessionId: string }).sessionId;

    const missed = await app.inject({
      method: "POST",
      url: `/api/v1/openings/reviews/${sessionId}/move`,
      payload: { moveUci: "d2d4", assisted: false },
    });
    expect(missed.statusCode).toBe(200);
    expect(missed.json()).toMatchObject({
      kind: "feedback",
      outcome: "again",
      assisted: false,
      playedMove: { moveSan: "d4" },
      repertoireMove: { moveSan: "e4" },
      lapseQueued: true,
    });

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT correct FROM opening_review_events").pluck().get()).toBe(0);
    expect(connection.prepare("SELECT assisted FROM opening_review_events").pluck().get()).toBe(0);
    connection.close();
  });

  it("connects a game deviation to its exact repertoire review position", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/imports/pgn",
      payload: { pgn: ITALIAN_DEVIATION, playerName: "Alice" },
    });
    const games = await app.inject({ method: "GET", url: "/api/v1/games" });
    const gameId = (games.json() as { games: Array<{ id: string }> }).games[0]!.id;

    const review = await app.inject({ method: "GET", url: `/api/v1/games/${gameId}/review` });
    expect(review.statusCode).toBe(200);
    expect(review.json()).toMatchObject({
      opening: {
        status: "player_deviation",
        repertoire: {
          id: "repertoire.white-e4-principled",
          name: "Practical 1.e4 Repertoire",
        },
        matchedPlies: 6,
        matchedPlayerMoves: 3,
        lastBookPly: 6,
        departure: {
          ply: 7,
          moveNumber: 4,
          moverColor: "white",
          moveSan: "h3",
          fenBefore: expect.stringContaining(" w "),
          fenAfter: expect.stringContaining(" b "),
        },
        expectedMove: {
          moveUci: "d2d3",
          moveSan: "d3",
          chapterTitle: "1...e5: Italian development",
          explanation: { summary: expect.any(String), changes: expect.any(Array) },
        },
        practiceAvailable: true,
      },
      mistakes: [],
    });

    const practice = await app.inject({
      method: "POST",
      url: `/api/v1/games/${gameId}/opening/practice`,
    });
    expect(practice.statusCode).toBe(200);
    expect(practice.json()).toMatchObject({
      kind: "exercise",
      repertoire: { id: "repertoire.white-e4-principled" },
      learnerColor: "white",
      totalPositions: 1,
      learningStage: "new",
      opponentMove: { moveSan: "Bc5" },
      introduction: { repertoireMove: { moveUci: "d2d3", moveSan: "d3" } },
    });

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT COUNT(*) FROM game_opening_matches WHERE game_id = ?").pluck().get(gameId)).toBe(1);
    expect(connection.prepare("SELECT focus_game_id FROM opening_review_sessions WHERE status = 'active'").pluck().get()).toBe(gameId);
    const answered = await app.inject({ method: "POST", url: `/api/v1/openings/reviews/${practice.json().sessionId}/move`,
      payload: { moveUci: "d2d3", queueEntryId: practice.json().queueEntryId } });
    expect(answered.json().sourceGames).toMatchObject({ occurrences: 1, games: [{ gameId, white: "Alice",
      playedMove: "h3", repertoireMove: "d3", moveNumber: 4 }] });
    expect(practice.json()).not.toHaveProperty("sourceGames");
    connection.close();
  });

  it("groups repeated game deviations in a persistent opening inbox", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const imported = await app.inject({
      method: "POST",
      url: "/api/v1/imports/pgn",
      payload: { pgn: REPEATED_ITALIAN_DEVIATIONS, playerName: "Alice" },
    });
    expect(imported.json()).toMatchObject({ imported: 2 });

    const inbox = await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" });
    expect(inbox.statusCode).toBe(200);
    const body = inbox.json() as {
      groups: Array<{
        key: string;
        occurrenceCount: number;
        unreviewedCount: number;
        opening: { status: string; departure: { moveSan: string }; expectedMove: { moveSan: string } };
      }>;
    };
    const repeated = body.groups.find((group) => group.opening.status === "player_deviation");
    expect(repeated).toMatchObject({
      occurrenceCount: 2,
      unreviewedCount: 2,
      opening: {
        status: "player_deviation",
        departure: { moveSan: "h3" },
        expectedMove: { moveSan: "d3" },
      },
    });

    const reviewed = await app.inject({
      method: "PATCH",
      url: `/api/v1/openings/game-inbox/${repeated!.key}/reviewed`,
    });
    expect(reviewed.statusCode).toBe(200);
    expect(reviewed.json()).toMatchObject({
      unreviewedGroups: 0,
      repeatedGroups: 1,
      groups: [expect.objectContaining({ occurrenceCount: 2, unreviewedCount: 0 })],
    });

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT COUNT(*) FROM game_opening_review_states").pluck().get()).toBe(2);
    connection.close();
  });

  it("builds one recommended opening session from game misses, due work, and limited new material", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/imports/pgn",
      payload: { pgn: REPEATED_ITALIAN_DEVIATIONS, playerName: "Alice" },
    });

    await app.inject({
      method: "GET",
      url: "/api/v1/openings/reviews/recommended",
    });
    const prepared = new BetterSqlite3(appConfig.databasePath);
    prepared.prepare(`
      UPDATE opening_review_items
      SET state = 2, repetitions = 2, due_at = '2020-01-01T00:00:00.000Z'
      WHERE id = (
        SELECT ori.id
        FROM opening_review_items ori
        JOIN opening_moves m ON m.id = ori.move_id
        WHERE ori.repertoire_id = 'repertoire.white-e4-principled'
          AND m.move_uci <> 'd2d3'
        ORDER BY ori.id
        LIMIT 1
      )
    `).run();
    prepared.close();

    const recommended = await app.inject({
      method: "GET",
      url: "/api/v1/openings/reviews/recommended",
    });
    expect(recommended.statusCode).toBe(200);
    expect(recommended.json()).toMatchObject({
      available: true,
      repertoire: {
        id: "repertoire.white-e4-principled",
        learnerColor: "white",
      },
      counts: {
        gameMisses: 1,
        due: 1,
        new: 5,
        total: 7,
      },
      message: expect.stringMatching(/game mistakes come first/i),
    });

    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/reviews/recommended/start",
    });
    expect(started.statusCode).toBe(200);
    expect(started.json()).toMatchObject({
      kind: "exercise",
      repertoire: { id: "repertoire.white-e4-principled" },
      totalPositions: 7,
      practiceReason: {
        kind: "game_miss",
        label: "Missed in 2 of your games",
      },
      introduction: { repertoireMove: { moveUci: "d2d3", moveSan: "d3" } },
    });

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare(`
      SELECT selection_pool FROM opening_review_sessions WHERE status = 'active'
    `).pluck().get()).toBe("mixed");
    connection.close();
  });

  it("does not blame the player when the opponent leaves the repertoire first", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/imports/pgn",
      payload: { pgn: ITALIAN_OPPONENT_DEVIATION, playerName: "Alice" },
    });
    const games = await app.inject({ method: "GET", url: "/api/v1/games" });
    const gameId = (games.json() as { games: Array<{ id: string }> }).games[0]!.id;
    const review = await app.inject({ method: "GET", url: `/api/v1/games/${gameId}/review` });
    expect(review.json()).toMatchObject({
      opening: {
        status: "opponent_deviation",
        matchedPlies: 3,
        matchedPlayerMoves: 2,
        departure: { moveNumber: 2, moverColor: "black", moveSan: "d6" },
        expectedMove: null,
        practiceAvailable: false,
      },
    });
    const practice = await app.inject({
      method: "POST",
      url: `/api/v1/games/${gameId}/opening/practice`,
    });
    expect(practice.statusCode).toBe(400);
  });

  it("turns an opponent surprise into an editable repertoire branch", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/imports/pgn",
      payload: { pgn: ITALIAN_OPPONENT_DEVIATION, playerName: "Alice" },
    });
    const inbox = await app.inject({ method: "GET", url: "/api/v1/openings/game-inbox" });
    const surprise = (inbox.json() as {
      groups: Array<{ key: string; opening: { status: string } }>;
    }).groups.find((group) => group.opening.status === "opponent_deviation")!;

    const invalid = await app.inject({
      method: "POST",
      url: `/api/v1/openings/game-inbox/${surprise.key}/prepare`,
      payload: { replyMoveUci: "d7d5" },
    });
    expect(invalid.statusCode).toBe(400);
    const beforeSave = new BetterSqlite3(appConfig.databasePath);
    expect(beforeSave.prepare("SELECT COUNT(*) FROM opening_imports").pluck().get()).toBe(0);
    beforeSave.close();

    const prepared = await app.inject({
      method: "POST",
      url: `/api/v1/openings/game-inbox/${surprise.key}/prepare`,
      payload: {
        replyMoveUci: "d2d4",
        opponentSummary: "Black supports e5 but blocks the dark-squared bishop.",
        replySummary: "Builds a broad centre before Black develops.",
      },
    });
    expect(prepared.statusCode).toBe(200);
    expect(prepared.json()).toMatchObject({
      repertoire: {
        name: "Practical 1.e4 Repertoire — My repertoire",
        copiedFromBuiltIn: true,
      },
      opponentMove: { moveUci: "d7d6", moveSan: "d6" },
      replyMove: { moveUci: "d2d4", moveSan: "d4" },
      message: expect.stringMatching(/created.*saved d6 with your d4 reply/i),
      inbox: { groups: [] },
    });

    const repertoireId = (prepared.json() as { repertoire: { id: string } }).repertoire.id;
    const detail = await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` });
    expect(detail.json()).toMatchObject({ repertoire: { editable: true, origin: "imported" } });
    const lines = (detail.json() as {
      chapters: Array<{ lines: Array<{ moves: Array<{ moveUci: string; explanation: { summary: string } }> }> }>;
    }).chapters.flatMap((chapter) => chapter.lines);
    expect(lines).toEqual(expect.arrayContaining([expect.objectContaining({
      moves: expect.arrayContaining([
        expect.objectContaining({
          moveUci: "d7d6",
          explanation: expect.objectContaining({ summary: "Black supports e5 but blocks the dark-squared bishop." }),
        }),
        expect.objectContaining({
          moveUci: "d2d4",
          explanation: expect.objectContaining({ summary: "Builds a broad centre before Black develops." }),
        }),
      ]),
    })]));

    const connection = new BetterSqlite3(appConfig.databasePath);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_imports WHERE repertoire_id = ?").pluck().get(repertoireId)).toBe(1);
    expect(connection.prepare("SELECT COUNT(*) FROM opening_repertoires WHERE id = 'repertoire.white-e4-principled'").pluck().get()).toBe(1);
    connection.close();
  });

  it("offers an early opening review when every learned position is scheduled for later", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
    });
    const connection = new BetterSqlite3(appConfig.databasePath);
    connection.prepare(`
      UPDATE opening_review_items
      SET state = 2, repetitions = 3, stability = 20, difficulty = 4,
          due_at = '2099-01-01T00:00:00.000Z', last_reviewed_at = '2026-09-12T00:00:00.000Z'
    `).run();
    connection.close();

    const early = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/reviews/start",
    });
    expect(early.statusCode).toBe(200);
    expect(early.json()).toMatchObject({ kind: "exercise", totalPositions: 5 });
    const verified = new BetterSqlite3(appConfig.databasePath);
    expect(verified.prepare(`
      SELECT selection_pool FROM opening_review_sessions
      WHERE status = 'active'
    `).pluck().get()).toBe("early");
    verified.close();
  });

  it("describes an off-repertoire opening move without calling it a blunder", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/lessons/start",
    });
    const attemptId = (started.json() as { attemptId: string }).attemptId;
    const move = await app.inject({
      method: "POST",
      url: `/api/v1/openings/lessons/${attemptId}/move`,
      payload: { moveUci: "d2d4" },
    });
    expect(move.json()).toMatchObject({
      moveOutcome: "outside_repertoire",
      playedMoveSan: "d4",
      repertoireMove: { moveSan: "e4" },
    });
    expect((move.json() as { message: string }).message).toContain("not being called a blunder");
    const hiddenReason = await app.inject({
      method: "POST",
      url: `/api/v1/openings/lessons/${attemptId}/why`,
      payload: { concept: "space" },
    });
    expect(hiddenReason.statusCode).toBe(400);
    expect(hiddenReason.json()).toMatchObject({ error: "Choose one of the explanation options shown" });
    const revealed = await app.inject({
      method: "POST",
      url: `/api/v1/openings/lessons/${attemptId}/why`,
      payload: { reveal: true },
    });
    expect(revealed.json()).toMatchObject({ outcome: "revealed", correctConcept: "central_control" });
  });

  it("acknowledges an authored secondary benefit without calling it wrong", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/lessons/start",
    });
    const attemptId = (started.json() as { attemptId: string }).attemptId;
    const move = await app.inject({
      method: "POST",
      url: `/api/v1/openings/lessons/${attemptId}/move`,
      payload: { moveUci: "e2e4" },
    });
    expect(move.json()).toMatchObject({
      whyOptions: expect.arrayContaining([expect.objectContaining({ value: "development" })]),
    });
    const reason = await app.inject({
      method: "POST",
      url: `/api/v1/openings/lessons/${attemptId}/why`,
      payload: { concept: "development" },
    });
    expect(reason.json()).toMatchObject({
      outcome: "partial",
      selectedConcept: "development",
      selectedIsPrimary: false,
      correctConcept: "central_control",
    });
  });

  it("abandons an active lesson safely when its curriculum version changes", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const started = await app.inject({
      method: "POST",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled/lessons/start",
    });
    expect(started.statusCode).toBe(200);

    const connection = new BetterSqlite3(appConfig.databasePath);
    connection.prepare(`
      UPDATE opening_repertoires SET content_version = content_version + 1
      WHERE id = 'repertoire.white-e4-principled'
    `).run();
    connection.close();

    const active = await app.inject({ method: "GET", url: "/api/v1/openings/lessons/active" });
    expect(active.statusCode).toBe(200);
    expect(active.json()).toBeNull();
    const verified = new BetterSqlite3(appConfig.databasePath);
    expect(verified.prepare("SELECT status FROM opening_lesson_attempts").pluck().get()).toBe("abandoned");
    verified.close();
  });

  it("restores a failed analysis job for the active player and retries it", async () => {
    const appConfig = config(false);
    const app = await buildApp(appConfig);
    apps.push(app);
    const imported = await app.inject({
      method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: FOOLS_MATE, playerName: "Alice" },
    });
    const jobId = (imported.json() as { jobId: string }).jobId;
    const connection = new BetterSqlite3(appConfig.databasePath);
    connection.prepare("UPDATE jobs SET status = 'failed', error_message = 'Engine stopped' WHERE id = ?").run(jobId);
    connection.close();

    const active = await app.inject({ method: "GET", url: "/api/v1/jobs/active" });
    expect(active.json()).toMatchObject({ id: jobId, status: "failed", error: "Engine stopped" });
    const retry = await app.inject({ method: "POST", url: `/api/v1/jobs/${jobId}/retry` });
    expect(retry.statusCode).toBe(202);
    const queued = await app.inject({ method: "GET", url: `/api/v1/jobs/${jobId}` });
    expect(queued.json()).toMatchObject({ id: jobId, status: "queued", error: null });
  });

  it("previews, imports, and deduplicates PGN", async () => {
    const app = await buildApp(config(false));
    apps.push(app);
    const preview = await app.inject({
      method: "POST", url: "/api/v1/imports/pgn/preview", payload: { pgn: FOOLS_MATE },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ games: [{ white: "Alice", black: "Bob", duplicate: false }] });

    const imported = await app.inject({
      method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: FOOLS_MATE, playerName: "alice" },
    });
    expect(imported.statusCode).toBe(202);
    expect(imported.json()).toMatchObject({ imported: 1, duplicates: 0, rejected: 0 });
    const activeJob = await app.inject({ method: "GET", url: "/api/v1/jobs/active" });
    expect(activeJob.json()).toMatchObject({ id: expect.any(String), status: "queued", progressTotal: 1 });

    const duplicate = await app.inject({
      method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: FOOLS_MATE, playerName: "Alice" },
    });
    expect(duplicate.json()).toMatchObject({ imported: 0, duplicates: 1 });
  });

  it("turns an allowed mate into a Blunder Check and records the answer", async () => {
    const app = await buildApp(config(true));
    apps.push(app);
    const imported = await app.inject({
      method: "POST", url: "/api/v1/imports/pgn", payload: { pgn: FOOLS_MATE, playerName: "Alice" },
    });
    const jobId = (imported.json() as { jobId: string }).jobId;
    await waitForCompleted(app, jobId);
    const noActiveJob = await app.inject({ method: "GET", url: "/api/v1/jobs/active" });
    expect(noActiveJob.json()).toBeNull();

    const games = await app.inject({ method: "GET", url: "/api/v1/games" });
    const gameId = (games.json() as { games: Array<{ id: string }> }).games[0]!.id;
    const review = await app.inject({ method: "GET", url: `/api/v1/games/${gameId}/review` });
    const mistakes = (review.json() as {
      mistakes: Array<{ ply: number; playedMove: string; trainingItemId: string | null }>;
    }).mistakes;
    expect(mistakes).toContainEqual(expect.objectContaining({ playedMove: "g4" }));
    expect(mistakes.every((mistake) => mistake.ply % 2 === 1)).toBe(true);

    const g4Item = mistakes.find((mistake) => mistake.playedMove === "g4")?.trainingItemId;
    expect(g4Item).toBeTruthy();
    const selected = await app.inject({
      method: "POST", url: "/api/v1/training/next", payload: { pool: "early", itemId: g4Item },
    });
    expect(selected.statusCode).toBe(200);
    expect(selected.json()).toMatchObject({
      kind: "exercise", itemId: g4Item, attemptId: null, candidateMoveUci: "g2g4",
    });
    const started = await app.inject({
      method: "POST", url: `/api/v1/training/items/${g4Item}/start`, payload: {},
    });
    expect(started.statusCode).toBe(200);
    const selectedExercise = started.json() as { attemptId: string };

    const missing = await app.inject({
      method: "POST", url: "/api/v1/training/items/not-a-real-item/start", payload: {},
    });
    expect(missing.statusCode).toBe(400);

    const next = await app.inject({ method: "POST", url: "/api/v1/training/next", payload: { pool: "due" } });
    const exercise = next.json() as { kind: string; attemptId: null; candidateMoveUci: string };
    expect(exercise).toMatchObject({ kind: "exercise", candidateMoveUci: "g2g4" });
    expect(exercise.attemptId).toBeNull();
    const answer = await app.inject({
      method: "POST",
      url: `/api/v1/training/attempts/${selectedExercise.attemptId}/answer`,
      payload: { category: "check", moveUci: "d8h4" },
    });
    expect(answer.statusCode).toBe(200);
    expect(answer.json()).toMatchObject({ outcome: "excellent", categoryCorrect: true, moveCorrect: true });

    const punish = await app.inject({ method: "POST", url: "/api/v1/training/punish/next", payload: { pool: "due" } });
    expect(punish.statusCode).toBe(200);
    const punishExercise = punish.json() as { kind: string; attemptId: null; itemId: string; badMoveSan: string };
    expect(punishExercise).toMatchObject({ kind: "exercise", badMoveSan: "g4" });
    const punishStarted = await app.inject({
      method: "POST", url: `/api/v1/training/items/${punishExercise.itemId}/start`, payload: {},
    });
    const punishAttemptId = (punishStarted.json() as { attemptId: string }).attemptId;
    const punishment = await app.inject({
      method: "POST",
      url: `/api/v1/training/punish/attempts/${punishAttemptId}/answer`,
      payload: { moveUci: "d8h4" },
    });
    expect(punishment.json()).toMatchObject({ outcome: "excellent", moveCorrect: true });

    const concepts = await app.inject({ method: "GET", url: "/api/v1/concepts" });
    expect(concepts.json()).toMatchObject({ concepts: expect.arrayContaining([
      expect.objectContaining({ id: "process.blunder_check" }),
      expect.objectContaining({ id: "tactic.allowed_mate" }),
    ]) });
    const classified = await app.inject({
      method: "PATCH",
      url: `/api/v1/training/items/${g4Item}/classification`,
      payload: { conceptIds: ["process.calculation_failure", "tactic.allowed_mate"] },
    });
    expect(classified.statusCode).toBe(200);
    expect(classified.json()).toMatchObject({ concepts: expect.arrayContaining([
      expect.objectContaining({ id: "process.calculation_failure" }),
    ]) });

    const dashboard = await app.inject({ method: "GET", url: "/api/v1/dashboard" });
    expect(dashboard.json()).toMatchObject({
      totals: { games: 1 },
      skills: expect.arrayContaining([expect.objectContaining({ conceptId: "tactic.allowed_mate" })]),
    });
    const session = await app.inject({ method: "POST", url: "/api/v1/training/session", payload: { size: 15 } });
    expect(session.json()).toMatchObject({ items: expect.arrayContaining([
      expect.objectContaining({ mode: "blunder_check" }),
      expect.objectContaining({ mode: "punish_blunder" }),
    ]) });
    const active = await app.inject({ method: "GET", url: "/api/v1/training/session/active" });
    expect(active.json()).toMatchObject({ status: "active", completedCount: 0, currentItem: expect.any(Object) });
    const activeSession = active.json() as {
      id: string; currentItem: { itemId: string; mode: string };
    };
    expect(activeSession.currentItem.mode).toBe("blunder_check");
    const sessionStart = await app.inject({
      method: "POST",
      url: `/api/v1/training/items/${activeSession.currentItem.itemId}/start`,
      payload: { sessionId: activeSession.id },
    });
    const sessionAttempt = (sessionStart.json() as { attemptId: string }).attemptId;
    await app.inject({ method: "POST", url: `/api/v1/training/attempts/${sessionAttempt}/reveal` });
    const progressed = await app.inject({ method: "GET", url: `/api/v1/training/sessions/${activeSession.id}` });
    expect(progressed.json()).toMatchObject({ status: "active", completedCount: 1 });
  });
  it("persists practice switches without changing pasted-game repertoire matching and validates batch boundaries", async () => {
    const appConfig = config(false, false);
    const app = await buildApp(appConfig); apps.push(app);
    await app.inject({ method: "POST", url: "/api/v1/imports/pgn", payload: {
      pgn: '[Event "Paused branch game"]\n[White "Alice"]\n[Black "Bob"]\n[Result "*"]\n\n1. e4 c5 2. Nf3 d6 3. d4 *', playerName: "Alice",
    } });
    const imported = await app.inject({ method: "POST", url: "/api/v1/openings/imports/pgn", payload: {
      pgn: '[Event "Selection API"]\n[Result "*"]\n\n1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bc4 *',
      learnerColor: "white", ownershipConfirmed: true,
    } });
    expect(imported.statusCode).toBe(200);
    const repertoireId = imported.json().repertoireIds[0];
    const path = `/api/v1/openings/repertoires/${repertoireId}/practice-selection`;
    const detail = (await app.inject({ method: "GET", url: `/api/v1/openings/repertoires/${repertoireId}` })).json();
    const lines = detail.chapters[0].lines;
    const gameId = (await app.inject({ method: "GET", url: "/api/v1/games" })).json().games[0].id;
    const before = (await app.inject({ method: "GET", url: `/api/v1/games/${gameId}/review` })).json().opening;
    expect(before.status).toBe("in_repertoire");
    const paused = await app.inject({ method: "PATCH", url: path, payload: { lineIds: [lines[1].id], enabled: false } });
    expect(paused.statusCode).toBe(200);
    expect(paused.json().enabledCount).toBe(1);
    const after = (await app.inject({ method: "GET", url: `/api/v1/games/${gameId}/review` })).json().opening;
    expect(after).toEqual(before);
    for (const payload of [{ lineIds: [lines[0].id, "missing"], enabled: false },
      { lineIds: [lines[0].id, lines[0].id], enabled: false }, { lineIds: [lines[0].id], enabled: "false" }]) {
      expect((await app.inject({ method: "PATCH", url: path, payload })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: "GET", url: path })).json().enabledCount).toBe(1);
    expect((await app.inject({ method: "POST", url: `${path}/frequencies` })).statusCode).toBe(400);
    const db = new BetterSqlite3(appConfig.databasePath);
    expect(db.prepare("SELECT COUNT(*) FROM opening_line_practice_preferences WHERE enabled = 0").pluck().get()).toBe(1);
    expect(db.pragma("foreign_key_check")).toEqual([]); db.close();
  });
});

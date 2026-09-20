import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { Chess } from "chess.js";

import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "./config.js";
import { buildApp } from "./app.js";

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

function config(runWorker: boolean): AppConfig {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "thinking-board-test-"));
  tempDirs.push(directory);
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
    expect(finalLine.statusCode).toBe(400);
    expect(finalLine.json()).toMatchObject({ error: expect.stringMatching(/final line.*delete the repertoire/i) });

    const protectedCourse = await app.inject({
      method: "DELETE",
      url: "/api/v1/openings/repertoires/repertoire.white-e4-principled",
    });
    expect(protectedCourse.statusCode).toBe(400);
    expect(protectedCourse.json()).toMatchObject({ error: expect.stringMatching(/built-in repertoires are read-only/i) });

    const deletedRepertoire = await app.inject({
      method: "DELETE",
      url: `/api/v1/openings/repertoires/${repertoireId}`,
    });
    expect(deletedRepertoire.statusCode).toBe(200);
    expect(deletedRepertoire.json()).toMatchObject({
      deletedRepertoireId: repertoireId,
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
      replies: [{ moveUci: "e2e4", moveSan: "e4", games: 50, frequencyPercent: 50 }],
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
        new: 3,
        total: 5,
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
      totalPositions: 5,
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
});

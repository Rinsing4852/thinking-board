import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "./config.js";
import { buildApp } from "./app.js";

const FOOLS_MATE = `[Event "Checklist fixture"]
[Date "2026.08.14"]
[White "Alice"]
[Black "Bob"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
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
      method: "POST", url: `/api/v1/training/items/${g4Item}/attempt`,
    });
    expect(selected.statusCode).toBe(200);
    const selectedExercise = selected.json() as { attemptId: string };
    expect(selectedExercise).toMatchObject({
      kind: "exercise", itemId: g4Item, candidateMoveUci: "g2g4",
    });

    const missing = await app.inject({
      method: "POST", url: "/api/v1/training/items/not-a-real-item/attempt",
    });
    expect(missing.statusCode).toBe(404);

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

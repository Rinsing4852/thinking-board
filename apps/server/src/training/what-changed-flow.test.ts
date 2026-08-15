import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { WhatChangedGenerator } from "../analysis/what-changed-generator.js";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { id, now } from "../lib/ids.js";
import { TrainingService } from "./training-service.js";
import { AttemptLifecycle } from "./attempt-lifecycle.js";

const RC4_PGN = `[Event "What Changed fixture"]
[SetUp "1"]
[FEN "3qk3/1pp1n1pp/1b6/5b2/r2PN3/2P3PP/4Q3/1RB2RK1 w - - 0 26"]
[White "Alice"]
[Black "Olleyr"]
[Result "*"]

26. Nc5 Rc4 *`;

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("What Changed training flow", () => {
  it("generates, serves, and scores the Nc5 attacked-piece exercise", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "what-changed-test-"));
    tempDirectories.push(directory);
    const database = new Database(path.join(directory, "test.sqlite3"), path.resolve("migrations"));
    const imports = new ImportService(database.connection);
    imports.import(RC4_PGN, "Olleyr");

    const game = database.connection.prepare("SELECT id FROM games").get() as { id: string };
    const move = database.connection.prepare("SELECT id FROM moves WHERE san = 'Rc4'").get() as { id: string };
    const runId = id();
    database.connection.prepare(`
      INSERT INTO analysis_runs(
        id, game_id, engine_name, engine_version, depth, multipv, threads,
        hash_mb, analysis_version, status, started_at, completed_at
      ) VALUES (?, ?, 'Fixture', '1', 1, 1, 1, 1, 1, 'completed', ?, ?)
    `).run(runId, game.id, now(), now());
    database.connection.prepare(`
      INSERT INTO move_assessments(
        id, run_id, move_id, centipawn_loss, comparison_loss, classification, meaningful
      ) VALUES (?, ?, ?, 223, 223, 'mistake', 1)
    `).run(id(), runId, move.id);

    const generator = new WhatChangedGenerator(database.connection);
    expect(generator.generateForGame(game.id, runId)).toBe(1);

    const training = new TrainingService(database.connection);
    const next = training.nextWhatChanged("due");
    expect(next).toMatchObject({
      kind: "exercise",
      mode: "what_changed",
      opponentMoveSan: "Nc5",
      moveNumber: 26,
    });
    if (next.kind !== "exercise") throw new Error("Expected an exercise");
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toMatchObject({ count: 0 });
    const started = new AttemptLifecycle(database.connection).start(next.itemId);
    const answer = training.answerWhatChanged(started.attemptId, "attacked_piece", "a4");
    expect(answer).toMatchObject({
      outcome: "excellent",
      categoryCorrect: true,
      squareCorrect: true,
      correctSquares: ["a4", "e7"],
    });
    database.close();
  });
});

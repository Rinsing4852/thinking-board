import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CandidateGenerator } from "../analysis/candidate-generator.js";
import type { AppConfig } from "../config.js";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { id, now } from "../lib/ids.js";
import { CandidateTrainingService } from "./candidate-training-service.js";
import { AttemptLifecycle } from "./attempt-lifecycle.js";

const RC4_PGN = `[Event "Candidate fixture"]
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

describe("Candidate Generation training flow", () => {
  it("generates a position and grades a legal candidate", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "candidate-generation-test-"));
    tempDirectories.push(directory);
    const databasePath = path.join(directory, "test.sqlite3");
    const database = new Database(databasePath, path.resolve("migrations"));
    new ImportService(database.connection).import(RC4_PGN, "Olleyr");
    const game = database.connection.prepare("SELECT id FROM games").get() as { id: string };
    const move = database.connection.prepare(`
      SELECT id, from_position_id FROM moves WHERE san = 'Rc4'
    `).get() as { id: string; from_position_id: string };
    const runId = id();
    database.connection.prepare(`
      INSERT INTO analysis_runs(
        id, game_id, engine_name, engine_version, depth, multipv, threads,
        hash_mb, analysis_version, status, started_at, completed_at
      ) VALUES (?, ?, 'Fixture', '1', 14, 3, 1, 16, 1, 'completed', ?, ?)
    `).run(runId, game.id, now(), now());
    database.connection.prepare(`
      INSERT INTO move_assessments(id, run_id, move_id, centipawn_loss, comparison_loss, classification, meaningful)
      VALUES (?, ?, ?, 223, 223, 'mistake', 1)
    `).run(id(), runId, move.id);
    const positionAnalysisId = id();
    database.connection.prepare(`
      INSERT INTO position_analyses(
        id, run_id, position_id, centipawns_white, mate_in_white, depth
      ) VALUES (?, ?, ?, 0, NULL, 14)
    `).run(positionAnalysisId, runId, move.from_position_id);
    const insertLine = database.connection.prepare(`
      INSERT INTO engine_lines(
        id, position_analysis_id, rank, move_uci, move_san,
        centipawns_white, mate_in_white, pv_uci_json, pv_san_json
      ) VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `);
    insertLine.run(id(), positionAnalysisId, 1, "a4c4", "Rc4", '["a4c4"]', '["Rc4"]');
    insertLine.run(id(), positionAnalysisId, 2, "b6a7", "Ba7", '["b6a7"]', '["Ba7"]');

    expect(new CandidateGenerator(database.connection).generateForGame(game.id, runId)).toBe(1);
    const config: AppConfig = {
      host: "127.0.0.1",
      port: 0,
      dataDir: directory,
      databasePath,
      migrationsDir: path.resolve("migrations"),
      webDistDir: path.join(directory, "web"),
      stockfishBinary: path.resolve("tests/fake-stockfish.mjs"),
      stockfishDepth: 14,
      stockfishMultiPv: 3,
      stockfishThreads: 1,
      stockfishHashMb: 16,
      acceptableToleranceCp: 40,
      meaningfulLossCp: 150,
      runWorker: false,
    };
    const training = new CandidateTrainingService(database.connection, config);
    const next = training.next("due");
    expect(next).toMatchObject({ kind: "exercise", mode: "candidate_generation", moveNumber: 26 });
    if (next.kind !== "exercise") throw new Error("Expected candidate exercise");
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toMatchObject({ count: 0 });
    const started = new AttemptLifecycle(database.connection).start(next.itemId);
    const feedback = await training.answer(started.attemptId, [{ moveUci: "a4c4", declaredType: "threat" }]);
    expect(feedback).toMatchObject({
      outcome: "partial",
      candidates: [{ moveSan: "Rc4", grade: "excellent", centipawnLoss: 0 }],
    });
    await training.close();
    database.close();
  });
});

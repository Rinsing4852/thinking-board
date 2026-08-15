import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { V1Generator } from "../analysis/v1-generator.js";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { id, now } from "../lib/ids.js";
import { V1TrainingService } from "./v1-training-service.js";
import { AttemptLifecycle } from "./attempt-lifecycle.js";

const QUIET_PGN = `[Event "Quiet fixture"]
[SetUp "1"]
[FEN "8/8/8/8/8/8/P3K3/1N4k1 w - - 0 10"]
[White "Olleyr"]
[Black "Alice"]
[Result "*"]

10. Nc3 *`;

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe("Quiet Position training flow", () => {
  it("generates a quiet improvement, scores it, and exposes it in the player model", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "quiet-position-test-"));
    tempDirectories.push(directory);
    const database = new Database(path.join(directory, "test.sqlite3"), path.resolve("migrations"));
    new ImportService(database.connection).import(QUIET_PGN, "Olleyr");
    const game = database.connection.prepare("SELECT id FROM games").get() as { id: string };
    const move = database.connection.prepare(`
      SELECT id, from_position_id FROM moves WHERE san = 'Nc3'
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
      VALUES (?, ?, ?, 0, 0, 'good', 0)
    `).run(id(), runId, move.id);
    const positionAnalysisId = id();
    database.connection.prepare(`
      INSERT INTO position_analyses(id, run_id, position_id, centipawns_white, mate_in_white, depth)
      VALUES (?, ?, ?, 20, NULL, 14)
    `).run(positionAnalysisId, runId, move.from_position_id);
    const insertLine = database.connection.prepare(`
      INSERT INTO engine_lines(
        id, position_analysis_id, rank, move_uci, move_san,
        centipawns_white, mate_in_white, pv_uci_json, pv_san_json
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)
    `);
    insertLine.run(id(), positionAnalysisId, 1, "b1c3", "Nc3", 20, '["b1c3"]', '["Nc3"]');
    insertLine.run(id(), positionAnalysisId, 2, "b1a3", "Na3", 0, '["b1a3"]', '["Na3"]');

    expect(new V1Generator(database.connection).generateForGame(game.id, runId)).toBe(1);
    const training = new V1TrainingService(database.connection);
    const next = training.nextQuiet("due");
    expect(next).toMatchObject({ kind: "exercise", mode: "quiet_position", playerColor: "white" });
    if (next.kind !== "exercise") throw new Error("Expected quiet-position exercise");
    expect(database.connection.prepare("SELECT COUNT(*) AS count FROM training_attempts").get()).toMatchObject({ count: 0 });
    const started = new AttemptLifecycle(database.connection).start(next.itemId);
    const feedback = training.answerQuiet(started.attemptId, "b1", "b1c3");
    expect(feedback).toMatchObject({ outcome: "excellent", pieceCorrect: true, moveCorrect: true });
    expect(training.dashboard()).toMatchObject({
      totals: { games: 1, attempts: 1 },
      skills: expect.arrayContaining([expect.objectContaining({ conceptId: "process.weakest_piece", successRate: 1 })]),
    });
    database.close();
  });
});

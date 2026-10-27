import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AnalysisService } from "./analysis-service.js";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { loadConfig } from "../config.js";
import { AttemptLifecycle } from "../training/attempt-lifecycle.js";
import { TrainingService } from "../training/training-service.js";
import { V1TrainingService } from "../training/v1-training-service.js";

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });

function fixture(mate: boolean) {
  const database = new Database(":memory:", path.resolve("migrations")); databases.push(database);
  const db = database.connection;
  new ImportService(db).import(`[White "Learner"]\n[Black "Opponent"]\n\n${mate ? "1. f3 e5 2. g4 *" : "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *"}`, "Learner");
  const game = db.prepare("SELECT id,profile_id FROM games").get() as { id: string; profile_id: string };
  const move = db.prepare("SELECT id,from_position_id,to_position_id,uci,san FROM moves WHERE san=?").get(mate ? "g4" : "Bb5") as {
    id: string; from_position_id: string; to_position_id: string; uci: string; san: string;
  };
  db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at)
    VALUES ('run',?,'Saved fixture','1',14,3,1,128,4,'completed','2026-10-26','2026-10-26')`).run(game.id);
  db.prepare(`INSERT INTO move_assessments(id,run_id,move_id,eval_before_cp_white,eval_after_cp_white,eval_after_mate_white,comparison_loss,classification,meaningful)
    VALUES ('assessment','run',?,0,?,?,350,'blunder',1)`).run(move.id, mate ? null : -350, mate ? -1 : null);
  db.prepare(`INSERT INTO position_analyses(id,run_id,position_id,centipawns_white,mate_in_white,depth)
    VALUES ('after','run',?,?,?,14)`).run(move.to_position_id, mate ? null : -350, mate ? -1 : null);
  const response = mate ? "d8h4" : "a7a6", san = mate ? "Qh4#" : "a6";
  db.prepare(`INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,centipawns_white,mate_in_white,pv_uci_json,pv_san_json)
    VALUES ('line','after',1,?,?,?,?,?,'[]')`).run(response, san, mate ? null : -350, mate ? -1 : null,
      JSON.stringify(mate ? [response] : [response, "b5a4", "g8f6", "e1g1", "f8e7", "f1e1"]));
  for (const mode of ["blunder_check", "punish_blunder"]) {
    db.prepare(`INSERT INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at) VALUES (?,?,?,?,?,2,'2026-10-26')`)
      .run(mode, game.profile_id, game.id, move.id, mode);
    db.prepare("INSERT INTO review_states(item_id,due_at,attempts,successes,mastery_level) VALUES (?,'2026-10-26',1,1,1)").run(mode);
    db.prepare(`INSERT INTO acceptable_responses(id,item_id,move_uci,move_san,categories_json,engine_rank,loss_from_best_cp) VALUES (?,?,?,?,?,1,0)`)
      .run(`response-${mode}`, mode, response, san, JSON.stringify([mate ? "check" : "threat"]));
    db.prepare("INSERT INTO training_attempts(id,item_id,answered_at,created_at,outcome,score) VALUES (?,?, '2026-10-26','2026-10-26','excellent',1)")
      .run(`attempt-${mode}`, mode);
  }
  db.prepare(`INSERT INTO blunder_check_items(item_id,before_position_id,after_candidate_position_id,candidate_move_uci,candidate_move_san,explanation,evidence_json)
    VALUES ('blunder_check',?,?,?,?,'Old feedback','{"detector":"immediate-punishment-v2"}')`).run(move.from_position_id, move.to_position_id, move.uci, move.san);
  db.prepare(`INSERT INTO punish_blunder_items(item_id,position_id,bad_move_uci,bad_move_san,explanation,evidence_json)
    VALUES ('punish_blunder',?,?,?,'Old feedback','{"detector":"immediate-punishment-v2"}')`).run(move.to_position_id, move.uci, move.san);
  return { db, game, service: new AnalysisService(db, loadConfig()), training: new V1TrainingService(db) };
}

describe("saved tactical exercise revalidation", () => {
  it("retires a legacy Ruy Lopez false positive without deleting attempts or leaving it in a resumed session", () => {
    const f = fixture(false), session = f.training.createSession();
    const attempt = new AttemptLifecycle(f.db).start("blunder_check", session.id!);
    f.service.backfillBlunderChecks(); f.service.backfillV1();
    expect(f.db.prepare("SELECT COUNT(*) FROM training_items WHERE active=1 AND mode IN ('blunder_check','punish_blunder')").pluck().get()).toBe(0);
    expect(f.db.prepare("SELECT COUNT(*) FROM training_attempts WHERE answered_at IS NOT NULL").pluck().get()).toBe(2);
    expect(f.db.prepare("SELECT attempts,successes FROM review_states WHERE item_id='blunder_check'").get()).toEqual({ attempts: 1, successes: 1 });
    expect(f.training.activeSession()).toBeNull();
    expect(f.training.nextPunish("random")).toMatchObject({ kind: "empty" });
    expect(() => new AttemptLifecycle(f.db).start("punish_blunder")).toThrow("not found");
    expect(() => new TrainingService(f.db).answer(attempt.attemptId, "threat", "a7a6")).toThrow("not found");
    expect(f.db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBe(0);
    expect(f.db.pragma("foreign_key_check")).toEqual([]);
  });

  it("reuses genuine mating exercises and preserves their learning state across repeated revalidation", () => {
    const f = fixture(true);
    for (let run = 0; run < 2; run++) { f.service.backfillBlunderChecks(); f.service.backfillV1(); }
    expect(f.db.prepare("SELECT id FROM training_items WHERE active=1 AND mode IN ('blunder_check','punish_blunder') ORDER BY id").all())
      .toEqual([{ id: "blunder_check" }, { id: "punish_blunder" }]);
    expect(f.db.prepare("SELECT attempts,successes,mastery_level FROM review_states WHERE item_id='punish_blunder'").get())
      .toEqual({ attempts: 1, successes: 1, mastery_level: 1 });
    expect(f.training.nextPunish("early")).toMatchObject({ itemId: "punish_blunder", badMoveSan: "g4" });
    const evidence = JSON.parse(f.db.prepare("SELECT evidence_json FROM punish_blunder_items").pluck().get() as string);
    expect(evidence).toMatchObject({ detector: "tactical-punishment-v4", proof: { kind: "forced_mate" } });
    expect(f.db.prepare("SELECT COUNT(*) FROM training_attempts").pluck().get()).toBe(2);
    expect(f.db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBe(0);
  });
});

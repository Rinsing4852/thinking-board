import fs from "node:fs";
import path from "node:path";
import { Chess } from "chess.js";
import { afterEach, describe, expect, it } from "vitest";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { loadConfig } from "../config.js";
import { AnalysisService } from "./analysis-service.js";
import { TrainingService } from "../training/training-service.js";
import { V1TrainingService } from "../training/v1-training-service.js";
import { AttemptLifecycle } from "../training/attempt-lifecycle.js";

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function fixture() {
  const database=new Database(":memory:",path.resolve("migrations")); databases.push(database); const db=database.connection;
  new ImportService(db).import(fs.readFileSync("scripts/fixtures/missed-queens.pgn","utf8"),"Opportunity learner");
  const game=db.prepare("SELECT id FROM games").pluck().get() as string;
  const move=db.prepare("SELECT * FROM moves WHERE game_id=? AND move_number=28 AND mover_color='black'").get(game) as {id:string;from_position_id:string;to_position_id:string};
  db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at)
    VALUES ('run',?,'Recorded Stockfish fixture','18',18,3,1,128,5,'completed','2026-10-27','2026-10-27')`).run(game);
  db.prepare(`INSERT INTO move_assessments(id,run_id,move_id,eval_before_cp_white,eval_after_cp_white,comparison_loss,classification,meaningful)
    VALUES ('assessment','run',?,-698,425,1123,'blunder',1)`).run(move.id);
  function position(id:string,positionId:string,cp:number,pv:string[]) {
    const fen=db.prepare("SELECT fen FROM positions WHERE id=?").pluck().get(positionId) as string, board=new Chess(fen);
    const uci=pv.map(san=>{const m=board.move(san);return m.from+m.to+(m.promotion??"");});
    db.prepare("INSERT INTO position_analyses(id,run_id,position_id,centipawns_white,depth) VALUES (?,'run',?,?,18)").run(id,positionId,cp);
    db.prepare("INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,centipawns_white,pv_uci_json,pv_san_json) VALUES (?,?,1,?,?,?,?,?)")
      .run(id,id,uci[0],pv[0],cp,JSON.stringify(uci),JSON.stringify(pv));
  }
  position("before",move.from_position_id,-698,["Qxh3","dxe5","Nxe5","f3","Rad8","gxh6"]);
  position("after",move.to_position_id,425,["Qxd7","Ne5","Qxd5","Rad8","Qe4","dxe3"]);
  const service=new AnalysisService(db,loadConfig());service.backfillBlunderChecks();service.backfillWhatChanged();service.backfillV1();
  const item=(mode:string)=>db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode=? AND active=1").pluck().get(move.id,mode) as string;
  return {db,service,item,training:new TrainingService(db),v1:new V1TrainingService(db),attempts:new AttemptLifecycle(db)};
}

describe("missed queen opportunities and exposed pieces",()=>{
  it("asks for Black's missed Qxh3 before exd4 while independently training White's Qxd7 punishment",()=>{
    const f=fixture();
    expect(f.training.next("early",f.item("blunder_check"))).toMatchObject({exerciseKind:"missed_opportunity",playerColor:"black",candidateMoveSan:"exd4",moveNumber:28});
    expect(f.training.answer(f.attempts.start(f.item("blunder_check")).attemptId,"capture","d7h3")).toMatchObject({outcome:"excellent",playedMoveSan:"Qxh3"});
    expect(f.v1.nextPunish("early",f.item("punish_blunder"))).toMatchObject({opponentColor:"white",badMoveSan:"exd4"});
    expect(f.v1.answerPunish(f.attempts.start(f.item("punish_blunder")).attemptId,"h3d7")).toMatchObject({outcome:"excellent",playedMoveSan:"Qxd7"});
  });
  it("accepts the winning capture, opened diagonal and danger to Black's queen as distinct correct observations",()=>{
    const f=fixture(), item=f.item("what_changed"); expect(item).toBeTruthy();
    for(const [category,square] of [["available_capture","h3"],["opened_line","d7"],["attacked_piece","d7"]] as const)
      expect(f.training.answerWhatChanged(f.attempts.start(item).attemptId,category,square).outcome).toBe("excellent");
    expect(f.training.answerWhatChanged(f.attempts.start(item).attemptId,"available_capture","d7").outcome).toBe("partial");
  });
  it("invalidates an open attempt when the exercise changes perspective without deleting past answers",()=>{
    const f=fixture(),item=f.item("blunder_check");
    f.training.answer(f.attempts.start(item).attemptId,"capture","d7h3");
    f.db.prepare("UPDATE blunder_check_items SET evidence_json='{}' WHERE item_id=?").run(item);
    const open=f.attempts.start(item);f.service.backfillBlunderChecks();
    expect(()=>f.training.answer(open.attemptId,"capture","d7h3")).toThrow("not found");
    expect(f.db.prepare("SELECT COUNT(*) FROM training_attempts WHERE answered_at IS NOT NULL").pluck().get()).toBe(1);
  });
});

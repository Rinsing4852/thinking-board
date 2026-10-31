import path from "node:path";
import { Chess } from "chess.js";
import { afterEach,describe,expect,it,vi } from "vitest";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { OpeningContentService } from "../openings/opening-content-service.js";
import { OpeningPgnImportService } from "../openings/opening-pgn-import.js";
import { OpeningGameService } from "../openings/opening-game-service.js";
import { OpeningReviewService } from "../openings/opening-review-service.js";
import { GameReplayService } from "./game-replay-service.js";
import type { GameReplayAction,GameReplayResponse } from "../../../../packages/contracts/src/api.js";
import { setActiveProfile } from "../training/profile.js";
import { CandidateGenerator } from "../analysis/candidate-generator.js";

const databases:Database[]=[];
afterEach(()=>{databases.splice(0).forEach(db=>db.close());vi.useRealTimers();});
function setup(color:"white"|"black"="white",moves="1. f3 e5 2. e4 Nf6 3. Nc3 Nc6 *",line="1. e4 e5 2. Nf3 Nc6 *") {
  const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);const db=database.connection;
  new ImportService(db).import(`[White "${color==="white"?"Learner":"Opponent"}"]\n[Black "${color==="black"?"Learner":"Opponent"}"]\n[Result "*"]\n\n${moves}`,"Learner");
  const gameId=db.prepare("SELECT id FROM games").pluck().get() as string;
  const imported=new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn:line,learnerColor:color,ownershipConfirmed:true});
  const reviews=new OpeningReviewService(db),replay=new GameReplayService(db,new OpeningGameService(db),reviews,40);
  return {db,gameId,replay,reviews,repertoireId:imported.repertoireIds[0]!};
}
function act(replay:GameReplayService,state:GameReplayResponse,action:GameReplayAction["action"],rest:Partial<GameReplayAction>={}) {
  return replay.act(state.gameId,{snapshotId:state.snapshotId,version:state.version,action,...rest});
}
function analysis(f:ReturnType<typeof setup>,ply:number,lines:Array<[string,string,number|null,number|null]>,run="analysis-1") {
  const move=f.db.prepare("SELECT id,from_position_id FROM moves WHERE game_id=? AND ply=?").get(f.gameId,ply) as {id:string;from_position_id:string};
  f.db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at)
    VALUES(?,?,'test','1',14,3,1,16,1,'completed','2026-10-18','2026-10-18')`).run(run,f.gameId);
  f.db.prepare("INSERT INTO position_analyses(id,run_id,position_id,centipawns_white,depth) VALUES(?,?,?,0,14)").run(`${run}-position`,run,move.from_position_id);
  for(const [index,line] of lines.entries())f.db.prepare(`INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,centipawns_white,mate_in_white,pv_uci_json,pv_san_json)
    VALUES(?,?,?,?,?,?,?,'[]','[]')`).run(`${run}-${index}`,`${run}-position`,index+1,...line);
  f.db.prepare(`INSERT INTO move_assessments(id,run_id,move_id,centipawn_loss,comparison_loss,classification,meaningful)
    VALUES(?,?,?,200,200,'mistake',1)`).run(`${run}-mistake`,run,move.id);
  return move;
}
describe("saved game replay and local recall",()=>{
  it("saves a full replay with hidden answers and local retries without changing scheduled recall or coverage data",()=>{
    const f=setup();f.reviews.start(f.repertoireId,"new");
    const tables=["games","opening_moves","opening_review_items","opening_move_review_cards","opening_review_events","training_attempts","review_states"];
    const snapshot=()=>tables.map(table=>f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before=snapshot();let state=f.replay.get(f.gameId);
    expect(state.moves).toHaveLength(6);expect(state.phase).toBe("question");expect(state.feedback).toBeNull();
    expect(JSON.stringify(state.checkpoints)).not.toContain("e2e4");
    state=act(f.replay,state,"answer",{moveUci:"d2d4"});
    expect(state.phase).toBe("question");expect(state.feedback?.answers).toEqual([]);expect(state.feedback?.message).toContain("may still be a good");
    state=act(f.replay,state,"answer",{moveUci:"e2e4"});
    expect(state.phase).toBe("feedback");expect(state.feedback?.outcome).toBe("after_retry");
    expect(state.displayFen).toContain("4P3");expect(snapshot()).toEqual(before);
    expect(f.replay.get(f.gameId)).toEqual(state);
    state=act(f.replay,state,"next");expect(state.currentPly).toBe(1);expect(state.moves[0]?.san).toBe("f3");expect(state.displayFen).toContain("5P2");
    expect(snapshot()).toEqual(before);
  });
  it("accepts saved alternatives, retains feedback after repertoire changes, and rejects stale tabs",()=>{
    const f=setup("white",undefined,'[Event "Primary"]\n\n1. e4 e5 *\n\n[Event "Alternative"]\n\n1. d4 d5 *');
    const original=f.replay.get(f.gameId);let state=act(f.replay,original,"answer",{moveUci:"d2d4"});
    expect(state.feedback?.outcome).toBe("recalled");expect(state.feedback?.explanation).toContain("Saved notes for d4:");expect(state.feedback?.answers.map(move=>move.san)).toEqual(expect.arrayContaining(["e4","d4"]));
    expect(()=>act(f.replay,original,"reveal")).toThrow(/another tab/);
    f.db.prepare("UPDATE opening_move_annotations SET summary='Changed later'").run();
    state=f.replay.get(f.gameId);expect(state.updatesAvailable).toBe(true);expect(state.feedback?.explanation).not.toContain("Changed later");
    const oldId=state.snapshotId;state=act(f.replay,state,"refresh");expect(state.snapshotId).not.toBe(oldId);
    expect(f.db.prepare("SELECT id FROM game_review_snapshots WHERE id=?").get(oldId)).toBeTruthy();
    expect(f.db.prepare("SELECT * FROM game_review_local_attempts WHERE snapshot_id=?").all(oldId)).toHaveLength(1);
    expect(()=>act(f.replay,original,"answer",{moveUci:"e2e4"})).toThrow(/another tab/);
  });
  it("marks later departures after re-entering a known position and distinguishes opponent surprises and gaps",()=>{
    const f=setup("white","1. Nf3 Nf6 2. Ng1 Ng8 3. f3 e5 *","1. e4 e5 *");
    const state=f.replay.get(f.gameId);expect(state.checkpoints.filter(point=>point.kind==="opening").map(point=>point.ply)).toEqual([0,4]);
    const surprise=setup("white","1. e4 d5 2. exd5 Qxd5 *","1. e4 e5 2. Nf3 *");
    let other=surprise.replay.get(surprise.gameId);other=act(surprise.replay,other,"next");
    expect(other.checkpoints[0]?.kind).toBe("opponent");expect(other.phase).toBe("replay");expect(other.checkpoints[0]?.canRecall).toBe(false);
    const gap=setup("white","1. e4 e5 2. Nf3 Nc6 *","1. e4 e5 *");expect(gap.replay.get(gap.gameId).checkpoints[0]?.kind).toBe("gap");
  });
  it("uses the player's side when accepting multiple engine candidates and treats unlisted moves as unverified",()=>{
    const f=setup("black","1. e4 f6 2. d4 e5 *","1. e4 e5 *");
    analysis(f,2,[["e7e5","e5",-100,null],["c7c5","c5",-75,null],["d7d5","d5",100,null]]);
    new CandidateGenerator(f.db).generateForGame(f.gameId);
    let state=f.replay.get(f.gameId);const point=state.checkpoints.find(point=>point.kind==="engine")!;
    state=act(f.replay,state,"jump",{ply:point.ply,checkpointId:point.id});
    state=act(f.replay,state,"answer",{moveUci:"b8c6"});expect(state.feedback?.outcome).toBe("unverified");expect(state.feedback?.answers).toHaveLength(0);
    state=act(f.replay,state,"answer",{moveUci:"c7c5"});expect(state.feedback?.answers.map(move=>move.uci)).toEqual(["e7e5","c7c5"]);
    const count=f.db.prepare("SELECT COUNT(*) FROM training_items").pluck().get();
    f.db.prepare("UPDATE review_states SET due_at='2099-01-01'").run();
    state=act(f.replay,state,"schedule");expect(state.feedback?.message).toContain("Candidates practice");
    expect(f.db.prepare("SELECT COUNT(*) FROM training_items").pluck().get()).toBe(count);
    expect(f.db.prepare("SELECT attempts FROM review_states").pluck().get()).toBe(0);
    expect(String(f.db.prepare("SELECT due_at FROM review_states").pluck().get())).not.toContain("2099");
  });
  it("keeps mate scores distinct from pawn scores and records reveals as helped local practice",()=>{
    const f=setup();analysis(f,1,[["e2e4","e4",null,3],["d2d4","d4",900,null]]);
    let state=f.replay.get(f.gameId);const point=state.checkpoints.find(point=>point.kind==="engine")!;
    state=act(f.replay,state,"jump",{ply:0,checkpointId:point.id});state=act(f.replay,state,"reveal");
    expect(state.feedback?.answers).toEqual([{uci:"e2e4",san:"e4"}]);expect(state.feedback?.outcome).toBe("shown");
    expect(state.checkpoints.find(p=>p.id===point.id)?.recalled).toBe(false);
    state=act(f.replay,state,"retry");expect(state.feedback).toBeNull();expect(state.phase).toBe("question");
  });
  it("preserves custom starting positions and updates an unused pre-analysis replay when analysis finishes",()=>{
    const board=new Chess();board.move("e4");const fields=board.fen().split(" ");fields[5]="12";
    const f=setup("black",`[SetUp "1"]\n[FEN "${fields.join(" ")}"]\n\n12... e5 13. Nf3 Nc6 *`,"1. e4 e5 2. Nf3 Nc6 *");
    let state=f.replay.get(f.gameId);
    expect(state.initialFen).toBe(fields.join(" "));expect(state.moves[0]).toMatchObject({moveNumber:12,moverColor:"black",san:"e5"});
    expect(state.analysisPending).toBe(true);
    analysis(f,1,[["e7e5","e5",-100,null],["c7c5","c5",-80,null]]);
    const old=state.snapshotId;state=f.replay.get(f.gameId);expect(state.snapshotId).not.toBe(old);expect(state.updatesAvailable).toBe(false);
    expect(state.analysisPending).toBe(false);expect(state.checkpoints.some(point=>point.kind==="engine")).toBe(true);
    expect(f.db.prepare("SELECT id FROM game_review_snapshots WHERE id=?").get(old)).toBeTruthy();
  });
  it("isolates games and profiles, rejects invalid positions and leaves illegal answers unsaved",()=>{
    const f=setup();const state=f.replay.get(f.gameId);
    expect(()=>act(f.replay,state,"answer",{moveUci:"a1a8"})).toThrow();expect(f.replay.get(f.gameId).version).toBe(state.version);
    expect(()=>act(f.replay,state,"jump",{ply:999})).toThrow(/inside this game/);
    f.db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-10-18')").run();setActiveProfile(f.db,"other");
    expect(()=>f.replay.get(f.gameId)).toThrow(/not found/);expect(()=>act(f.replay,state,"reveal")).toThrow(/not found/);
  });
  it("schedules an existing repertoire position without recording recall and prevents scheduling changed feedback",()=>{
    const f=setup();let state=f.replay.get(f.gameId);state=act(f.replay,state,"reveal");
    state=act(f.replay,state,"schedule");const count=f.db.prepare("SELECT COUNT(*) FROM opening_review_items").pluck().get();
    state=act(f.replay,state,"schedule");expect(f.db.prepare("SELECT COUNT(*) FROM opening_review_items").pluck().get()).toBe(count);
    expect(f.db.prepare("SELECT COUNT(*) FROM opening_review_events").pluck().get()).toBe(0);
    expect(f.db.prepare("SELECT MAX(repetitions) FROM opening_review_items").pluck().get()).toBe(0);
    f.db.prepare("UPDATE opening_repertoires SET name='Changed'").run();
    expect(()=>act(f.replay,state,"schedule")).toThrow(/Refresh saved feedback/);
  });
  it("opens latest analysis in one action while retaining a used replay and its attempts",()=>{
    const f=setup();let state=f.replay.get(f.gameId);state=act(f.replay,state,"reveal");
    const old=state.snapshotId;analysis(f,3,[["g1f3","Nf3",40,null],["b1c3","Nc3",20,null]]);
    expect(f.replay.get(f.gameId).snapshotId).toBe(old);
    state=act(f.replay,state,"latest",{ply:2});
    expect(state.snapshotId).not.toBe(old);expect(state.currentPly).toBe(2);
    expect(state.analysisPending).toBe(false);expect(state.activeCheckpointId).toMatch(/^engine:/);
    expect(f.db.prepare("SELECT COUNT(*) FROM game_review_local_attempts WHERE snapshot_id=?").pluck().get(old)).toBe(1);
    expect(()=>act(f.replay,state,"latest",{ply:999})).toThrow("inside this game");
    expect(f.replay.get(f.gameId).snapshotId).toBe(state.snapshotId);
  });

});


it("schedules a one-answer game decision tomorrow exactly once without recording recall or analysis",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));
  const f=setup('black','1. e4 f6 2. d4 e5 *','1. e4 e5 *');
  analysis(f,2,[['e7e5','e5',-100,null]]);
  expect(new CandidateGenerator(f.db).generateForGame(f.gameId)).toBe(0);
  let state=f.replay.get(f.gameId);const point=state.checkpoints.find(point=>point.kind==='engine')!;
  expect(point.canSchedule).toBe(true);
  state=act(f.replay,state,'jump',{ply:point.ply,checkpointId:point.id});state=act(f.replay,state,'reveal');
  state=act(f.replay,state,'schedule');
  expect(f.db.prepare('SELECT due_at,attempts,successes FROM review_states').get()).toMatchObject({due_at:'2026-10-29T12:00:00.000Z',attempts:0,successes:0});
  const item=f.db.prepare('SELECT item_id FROM game_review_practice_followups').pluck().get();
  vi.advanceTimersByTime(2*60*60_000);state=act(f.replay,state,'schedule');
  expect(state.feedback?.message).toContain('already in Candidates practice');
  expect(f.db.prepare('SELECT COUNT(*) FROM training_items').pluck().get()).toBe(1);
  expect(f.db.prepare('SELECT due_at FROM review_states WHERE item_id=?').pluck().get(item)).toBe('2026-10-29T12:00:00.000Z');
  expect(f.db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(0);
  expect(f.db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
});

it("offers at most three key decisions with hidden answers and persists completion of the short review",()=>{
  const f=setup('white','1. f3 e5 2. e4 Nf6 3. Nc3 Nc6 4. d3 d6 *','1. e4 e5 *');
  const cases:Array<[number,string,string,number]>=[[1,'d2d4','d4',100],[3,'b1c3','Nc3',400],[5,'g1e2','Ne2',300],[7,'g1h3','Nh3',200]];
  for(const [ply,uci,san,loss] of cases){
    const move=analysis(f,ply,[[uci,san,50,null]],`run-${ply}`);
    f.db.prepare('UPDATE move_assessments SET comparison_loss=? WHERE move_id=?').run(loss,move.id);
  }
  f.db.prepare("UPDATE move_assessments SET run_id='run-7'").run();f.db.prepare("UPDATE position_analyses SET run_id='run-7'").run();
  f.db.prepare("DELETE FROM analysis_runs WHERE id!='run-7'").run();
  let state=f.replay.get(f.gameId);const keys=state.checkpoints.filter(point=>point.keyDecision);
  expect(keys).toHaveLength(3);expect(keys.map(point=>point.ply)).toEqual([2,4,6]);
  expect(state.feedback).toBeNull();expect(keys.every(point=>!('teachingLines' in point))).toBe(true);
  state=act(f.replay,state,'jump',{ply:keys[2]!.ply,checkpointId:keys[2]!.id});
  state=act(f.replay,state,'reveal');state=act(f.replay,state,'next_key');
  expect(state.keyStudyComplete).toBe(false);expect(state.currentPly).toBe(keys[0]!.ply);
  state=act(f.replay,state,'key_study');expect(state.currentPly).toBe(2);
  expect(()=>act(f.replay,state,'next_key')).toThrow('Try the decision');
  for(let i=0;i<3;i++){state=act(f.replay,state,'reveal');expect(state.feedback?.teachingLines?.[0]?.steps).toHaveLength(1);state=act(f.replay,state,'next_key');}
  expect(state.keyStudyComplete).toBe(true);expect(f.replay.get(f.gameId).keyStudyComplete).toBe(true);
  state=act(f.replay,state,'jump',{ply:0});expect(state.keyStudyComplete).toBe(true);
  state=act(f.replay,state,'key_study');expect(state.keyStudyComplete).toBe(false);
  expect(f.db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(0);
});

it("shows legal defensive replies to the game move only after the answer is revealed",()=>{
  const f=setup('white','1. f3 e5 2. g4 Qh4# 0-1','1. e4 e5 *');const move=analysis(f,3,[['g2g3','g3',0,null]]);
  f.db.prepare('UPDATE engine_lines SET pv_uci_json=?').run(JSON.stringify(['g2g3','d7d5']));
  const after=f.db.prepare('SELECT to_position_id FROM moves WHERE id=?').pluck().get(move.id);
  f.db.prepare("INSERT INTO position_analyses(id,run_id,position_id,mate_in_white,depth) VALUES ('after','analysis-1',?,-1,14)").run(after);
  f.db.prepare("INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,mate_in_white,pv_uci_json,pv_san_json) VALUES ('mate','after',1,'d8h4','Qh4#',-1,'[\"d8h4\"]','[\"Qh4#\"]')").run();
  let state=f.replay.get(f.gameId);const point=state.checkpoints.find(point=>point.kind==='engine')!;
  state=act(f.replay,state,'jump',{ply:point.ply,checkpointId:point.id});expect(state.feedback).toBeNull();
  state=act(f.replay,state,'reveal');const lines=state.feedback!.teachingLines!;
  expect(lines[0]!.steps.map(step=>step.san)).toEqual(['g3','d5']);
  expect(lines[1]!.steps.map(step=>step.san)).toEqual(['g4','Qh4#']);
  expect(new Chess(lines[1]!.steps.at(-1)!.fen).isCheckmate()).toBe(true);
});

describe('focused practice rounds on the saved replay',()=>{
  it('combines categories once per position, keeps answers hidden and retains the snapshot',()=>{
    const f=setup();analysis(f,1,[['d2d4','d4',50,null]]);
    let state=f.replay.get(f.gameId);const snapshot=state.snapshotId;
    const existing=f.db.prepare('SELECT * FROM opening_review_events').all();
    state=act(f.replay,state,'practice_start',{filters:['opening','mistakes']});
    expect(state.snapshotId).toBe(snapshot);expect(state.practice?.checkpointIds).toHaveLength(1);
    expect(state.activeCheckpointId).toMatch(/^engine:/);expect(state.phase).toBe('question');expect(state.feedback).toBeNull();
    expect(JSON.stringify(state.practice)).not.toContain('d2d4');
    expect(f.db.prepare('SELECT COUNT(*) FROM game_review_local_attempts').pluck().get()).toBe(0);
    expect(f.db.prepare('SELECT * FROM opening_review_events').all()).toEqual(existing);
    expect(f.db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
    expect(f.replay.get(f.gameId)).toEqual(state);
  });

  it('runs only the selected opening positions, skips without exposure and restores completion',()=>{
    const f=setup('white','1. Nf3 Nf6 2. Ng1 Ng8 3. f3 e5 *','1. e4 e5 *');
    let state=f.replay.get(f.gameId);
    state=act(f.replay,state,'practice_start',{filters:['opening']});expect(state.currentPly).toBe(0);
    expect(()=>act(f.replay,state,'practice_next')).toThrow('Try the position');
    expect(()=>act(f.replay,state,'jump',{ply:4})).toThrow('exit focused practice');
    state=act(f.replay,state,'practice_skip');expect(state.currentPly).toBe(4);
    expect(state.practice?.skippedIds).toHaveLength(1);expect(state.phase).toBe('question');
    expect(f.db.prepare('SELECT COUNT(*) FROM game_review_local_attempts').pluck().get()).toBe(0);
    state=act(f.replay,state,'answer',{moveUci:'e2e4'});expect(state.feedback?.outcome).toBe('recalled');
    state=act(f.replay,state,'practice_next');expect(state.practice?.status).toBe('completed');
    expect(state.practice?.reviewedIds).toHaveLength(1);expect(state.practice?.skippedIds).toHaveLength(1);
    expect(f.replay.get(f.gameId)).toEqual(state);
    state=act(f.replay,state,'practice_exit');expect(state.practice).toBeUndefined();
    state=act(f.replay,state,'jump',{ply:0});expect(state.currentPly).toBe(0);
    expect(f.db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(0);
  });

  it('does not reclassify a same-day revealed answer as unaided when restarting a round',()=>{
    const f=setup();let state=f.replay.get(f.gameId);
    state=act(f.replay,state,'practice_start',{filters:['opening']});state=act(f.replay,state,'reveal');
    const round=state.practice;state=act(f.replay,state,'retry');expect(state.practice).toEqual(round);
    state=act(f.replay,state,'answer',{moveUci:'e2e4'});expect(state.feedback?.outcome).toBe('after_retry');
    expect(state.feedback?.message).toContain('earlier practice today');
    state=act(f.replay,state,'practice_next');state=act(f.replay,state,'practice_start',{filters:['opening']});
    state=act(f.replay,state,'answer',{moveUci:'e2e4'});expect(state.feedback?.outcome).toBe('after_retry');
    expect(f.db.prepare('SELECT result FROM game_review_local_attempts ORDER BY rowid').pluck().all()).toEqual(['shown','after_retry','after_retry']);
  });

  it('rejects invalid and empty categories without altering a legacy saved review',()=>{
    const f=setup();const state=f.replay.get(f.gameId);
    for(const filters of [[],['mistakes'],['recommended','opening'],['opening','opening'],['bogus']]) {
      expect(()=>act(f.replay,state,'practice_start',{filters:filters as NonNullable<GameReplayAction['filters']>})).toThrow();
      expect(f.replay.get(f.gameId)).toEqual(state);
    }
    const other=setup('white','1. e4 d5 2. exd5 Qxd5 *','1. e4 e5 *');
    expect(()=>act(other.replay,other.replay.get(other.gameId),'practice_start',{filters:['opening']})).toThrow('No saved answers');
  });

  it('keeps black-side engine answers and normal scheduling in focused practice',()=>{
    const f=setup('black','1. e4 f6 2. d4 e5 *','1. e4 e5 *');
    analysis(f,2,[['e7e5','e5',-100,null],['c7c5','c5',-75,null]]);
    let state=f.replay.get(f.gameId);state=act(f.replay,state,'practice_start',{filters:['mistakes']});
    const version=state;
    state=act(f.replay,state,'answer',{moveUci:'c7c5'});expect(state.feedback?.outcome).toBe('recalled');
    expect(()=>act(f.replay,version,'practice_skip')).toThrow('another tab');
    state=act(f.replay,state,'schedule');expect(state.practice?.status).toBe('active');
    expect(f.db.prepare('SELECT COUNT(*) FROM game_review_practice_followups').pluck().get()).toBe(1);
    state=act(f.replay,state,'practice_next');expect(state.practice?.status).toBe('completed');
    expect(f.db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(0);
  });

  it('finishes an entirely skipped round with no phantom question or review credit',()=>{
    const f=setup();let state=f.replay.get(f.gameId);
    state=act(f.replay,state,'practice_start',{filters:['recommended']});state=act(f.replay,state,'practice_skip');
    expect(state.practice?.status).toBe('completed');expect(state.practice?.reviewedIds).toHaveLength(0);
    expect(state.phase).toBe('replay');expect(state.activeCheckpointId).toBeNull();expect(state.feedback).toBeNull();
    expect(f.db.prepare('SELECT COUNT(*) FROM game_review_local_attempts').pluck().get()).toBe(0);
  });
});

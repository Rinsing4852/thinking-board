import path from "node:path";
import { Chess } from "chess.js";
import { afterEach,describe,expect,it } from "vitest";
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
afterEach(()=>databases.splice(0).forEach(db=>db.close()));
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
  it("preserves custom starting positions and adds completed analysis only on an explicit refresh",()=>{
    const board=new Chess();board.move("e4");const fields=board.fen().split(" ");fields[5]="12";
    const f=setup("black",`[SetUp "1"]\n[FEN "${fields.join(" ")}"]\n\n12... e5 13. Nf3 Nc6 *`,"1. e4 e5 2. Nf3 Nc6 *");
    let state=f.replay.get(f.gameId);
    expect(state.initialFen).toBe(fields.join(" "));expect(state.moves[0]).toMatchObject({moveNumber:12,moverColor:"black",san:"e5"});
    expect(state.analysisPending).toBe(true);
    analysis(f,1,[["e7e5","e5",-100,null],["c7c5","c5",-80,null]]);
    const old=state.snapshotId;state=f.replay.get(f.gameId);expect(state.snapshotId).toBe(old);expect(state.updatesAvailable).toBe(true);
    expect(state.checkpoints.some(point=>point.kind==="engine")).toBe(false);
    state=act(f.replay,state,"refresh");expect(state.analysisPending).toBe(false);expect(state.checkpoints.some(point=>point.kind==="engine")).toBe(true);
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
});

import path from "node:path";
import {afterEach,describe,expect,it,vi} from "vitest";
import {Chess} from "chess.js";
import {Database} from "../db/database.js";
import {OpeningPgnImportService} from "./opening-pgn-import.js";
import {OpeningContentService} from "./opening-content-service.js";
import {OpeningCoverageService} from "./opening-coverage-service.js";
import {OpeningExplorerService} from "./opening-explorer-service.js";
import {OpeningWorkspaceService} from "./opening-workspace-service.js";
import {ensureActiveProfile,setActiveProfile} from "../training/profile.js";
const databases:Database[]=[];
afterEach(()=>databases.splice(0).forEach(db=>db.close()));
function setup(pgn:string,color:"white"|"black"="white") {
  const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);const db=database.connection;
  const id=new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn,learnerColor:color,ownershipConfirmed:true}).repertoireIds[0]!;
  const fetcher=vi.fn<typeof fetch>().mockImplementation(async input=>{
    const fen=new URL(String(input)).searchParams.get("fen")!;
    const move=new Chess(fen).moves({verbose:true})[0]!;
    return Response.json({white:10000,draws:0,black:0,moves:[{uci:`${move.from}${move.to}${move.promotion??""}`,san:move.san,white:10000,draws:0,black:0}]});
  });
  const service=new OpeningCoverageService(db,"test-token",new OpeningExplorerService(db,"test-token",fetcher));
  const workspace=new OpeningWorkspaceService(db);
  const rows=()=>workspace.repertoire(id).chapters.flatMap(c=>c.lines.flatMap(l=>l.moves));
  const stop=()=>{for(const position of db.prepare("SELECT DISTINCT to_position_id FROM opening_moves WHERE repertoire_id=? AND role='learner' AND active=1").pluck().all(id) as string[]) service.boundary(id,position,true);};
  const sample=(fen:string,moves:Array<[string,number]>,rating=1600,speeds="blitz,rapid,classical",old=false)=>{
    const board=new Chess(fen);const legal=new Map(board.moves({verbose:true}).map(m=>[`${m.from}${m.to}${m.promotion??""}`,m.san]));
    db.prepare("INSERT OR REPLACE INTO opening_explorer_cache(position_key,fen,rating_group,speeds,total_games,moves_json,fetched_at) VALUES(?,?,?,?,10000,?,?)")
      .run(fen.split(" ").slice(0,4).join(" "),fen,rating,speeds,JSON.stringify(moves.map(([uci,count])=>({uci,san:legal.get(uci),white:count,draws:0,black:0}))),old?"2000-01-01":new Date().toISOString());
  };
  return {db,id,service,fetcher,workspace,rows,stop,sample};
}
describe("whole repertoire encounter goal",()=>{
  it("binds continuation to sample content and freshness rather than cache delivery metadata",async()=>{
    const f=setup("1. e4 e5 2. Nf3 Nc6 3. Bc4 *");
    const fetched=await f.service.wholeRepertoire(f.id);
    const cached=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(fetched.planScan.snapshot).toBe(cached.planScan.snapshot);expect(f.fetcher).toHaveBeenCalledTimes(2);
    f.db.prepare("UPDATE opening_explorer_cache SET fetched_at='2000-01-01'").run();
    const stale=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(stale.planScan.snapshot).not.toBe(cached.planScan.snapshot);
    await expect(f.service.wholeRepertoire(f.id,1600,{local:true,planOffset:1,snapshot:cached.planScan.snapshot})).rejects.toThrow(/changed/);
    expect(f.fetcher).toHaveBeenCalledTimes(2);
  });
  it("checks both Black first-move responses together and keeps White alternatives separate",async()=>{
    const black=setup("1. e4 (1. d4 g6) g6 *","black");black.stop();
    black.sample(new Chess().fen(),[["e2e4",5000],["d2d4",5000]]);
    const result=await black.service.wholeRepertoire(black.id,1600,{local:true});
    expect(result.plansAvailable).toBe(1);expect(result.met).toBe(true);expect(result.gaps).toHaveLength(0);
    expect(result.plans[0]!.outcomes.stopped).toBe(100);
    const white=setup("1. e4 (1. d4 d5) e5 *");white.stop();
    const alternatives=await white.service.wholeRepertoire(white.id,1600,{local:true});
    expect(alternatives.plansAvailable).toBe(2);expect(alternatives.met).toBe(true);
    expect(alternatives.plans.every(plan=>plan.outcomes.stopped===100)).toBe(true);
  });
  it("finds a missing reply outside the selected saved branch and resolves it after an answer is saved",async()=>{
    const f=setup("1. e4 g6 *","black");f.stop();f.sample(new Chess().fen(),[["e2e4",5000],["d2d4",5000]]);
    let result=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(result.met).toBe(false);expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({moveUci:"d2d4",reachPercent:50,status:"missing_response"});
    const line=f.workspace.repertoire(f.id).chapters[0]!.lines[0]!;
    f.workspace.addSequence(f.id,line.id,0,["d2d4","g7g6"],"answer-d4");f.stop();
    result=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(result.met).toBe(true);expect(result.gaps).toHaveLength(0);
  });
  it("never turns a safety cap or missing/stale/mismatched samples into completion",async()=>{
    const f=setup("1. e4 e5 2. Nf3 Nc6 3. Bc4 *");
    const board=new Chess();board.move("e4");f.sample(board.fen(),[["e7e5",10000]]);
    let result=await f.service.wholeRepertoire(f.id,1600,{local:true,maxPlies:2});
    expect(result.met).toBe(false);expect(result.plans[0]!.outcomes.depth).toBe(100);
    result=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(result.met).toBe(false);expect(result.plans[0]!.outcomes.unknown).toBe(100);
    f.sample(board.fen(),[["e7e5",10000]],1600,"blitz,rapid,classical",true);
    expect((await f.service.wholeRepertoire(f.id,1600,{local:true})).plans[0]!.outcomes.unknown).toBe(100);
    f.stop(); // A different player's stopping points must not leak.
    f.db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-10-17')").run();setActiveProfile(f.db,"other");
    expect((await f.service.wholeRepertoire(f.id,1800,{local:true})).met).toBe(false);
  });
  it("uses the encounter threshold without letting a skipped task count as preparation",async()=>{
    const f=setup("1. e4 g6 *","black");f.stop();f.sample(new Chess().fen(),[["e2e4",9960],["d2d4",40]]);
    expect((await f.service.wholeRepertoire(f.id,1600,{local:true})).met).toBe(true);
    f.db.prepare("INSERT INTO opening_quality_preferences(profile_id,goal_games,speeds) VALUES(?,500,'blitz,rapid,classical')").run(ensureActiveProfile(f.db));
    const result=await f.service.wholeRepertoire(f.id,1600,{local:true});expect(result.met).toBe(false);expect(result.gaps).toHaveLength(1);
    await f.service.chooseTask(f.id,`prepare:${result.gaps[0]!.positionId}:d2d4`,"skip");
    expect((await f.service.wholeRepertoire(f.id,1600,{local:true})).met).toBe(false);
  });
  it("bounds remote refresh to two positions per request and offers a continuation",async()=>{
    const f=setup("1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 *");
    const result=await f.service.wholeRepertoire(f.id);
    expect(f.fetcher).toHaveBeenCalledTimes(2);expect(result.scan.remaining).toBeGreaterThan(0);expect(result.scan.nextOffset).not.toBeNull();
    await f.service.wholeRepertoire(f.id,1600,{offset:result.scan.nextOffset!});expect(f.fetcher).toHaveBeenCalledTimes(3);
  });
  it("keeps refresh progress bounded and failed requests uncertain",async()=>{
    const f=setup("1. e4 e5 2. Nf3 Nc6 3. Bc4 *");
    let result=await f.service.wholeRepertoire(f.id);
    await f.service.wholeRepertoire(f.id,1600,{offset:result.scan.nextOffset!});
    result=await f.service.wholeRepertoire(f.id,1600,{refresh:true});
    expect(result.scan).toMatchObject({checked:2,remaining:1,mode:"refresh"});
    result=await f.service.wholeRepertoire(f.id,1600,{refresh:true,offset:result.scan.nextOffset!});
    expect(result.scan.remaining).toBe(0);expect(result.scan.checked).toBe(1);
    f.db.prepare("DELETE FROM opening_explorer_cache").run();f.fetcher.mockRejectedValue(new Error("offline"));
    result=await f.service.wholeRepertoire(f.id);
    expect(result.scan.failed).toBe(2);expect(result.met).toBe(false);
    expect(result.plans[0]!.outcomes.unknown).toBe(100);
  });
  it("keeps paused practice content in scope and excludes archived lines",async()=>{
    const f=setup("1. e4 (1. d4 d5) e5 *");
    const e4=f.db.prepare("SELECT to_position_id FROM opening_moves WHERE repertoire_id=? AND move_uci='e2e4'").pluck().get(f.id) as string;
    f.service.boundary(f.id,e4,true);
    const other=f.workspace.repertoire(f.id).chapters[0]!.lines.find(line=>line.moves[0]?.moveUci==="d2d4")!;
    const profile=ensureActiveProfile(f.db);
    f.db.prepare("INSERT INTO opening_line_practice_preferences(profile_id,line_id,enabled,updated_at) VALUES(?,?,0,'2026-10-17')").run(profile,other.id);
    expect((await f.service.wholeRepertoire(f.id,1600,{local:true})).plansAvailable).toBe(2);
    expect((await f.service.wholeRepertoire(f.id,1600,{local:true})).met).toBe(false);
    f.db.prepare("INSERT INTO opening_line_preferences(profile_id,line_id,archived_at,updated_at) VALUES(?,?,'2026-10-17','2026-10-17')").run(profile,other.id);
    const result=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(result.plansAvailable).toBe(1);expect(result.met).toBe(true);
  });
  it("reports cycles and contradictory repeated choices without looping or claiming completion",async()=>{
    const f=setup("1. Nf3 Nf6 2. Ng1 Ng8 *");
    const rows=f.rows();f.sample(rows[0]!.fenAfter,[["g8f6",10000]]);f.sample(rows[2]!.fenAfter,[["f6g8",10000]]);
    const result=await f.service.wholeRepertoire(f.id,1600,{local:true});
    expect(result.met).toBe(false);expect(result.plans[0]!.outcomes.cycle).toBe(100);
    const conflict=setup("1. Nf3 Nf6 2. Ng1 Ng8 3. e4 *");
    const invalid=await conflict.service.wholeRepertoire(conflict.id,1600,{local:true});
    expect(invalid.met).toBe(false);expect(invalid.plans[0]!.conflict).toBe(true);
  });

  it("does not turn unassessed plans into a whole-repertoire success",async()=>{
    const games:string[]=[];
    for(const first of new Chess().moves().slice(0,12)) {
      const start=new Chess();start.move(first);
      for(const reply of start.moves().slice(0,6)) {
        const position=new Chess(start.fen());position.move(reply);
        for(const own of position.moves().slice(0,2)) {
          const game=new Chess();game.header("Event",`Plan ${games.length}`);
          game.move(first);game.move(reply);game.move(own);games.push(game.pgn());
        }
      }
    }
    const many=setup(games.join("\n\n"));many.stop();
    const bounded=await many.service.wholeRepertoire(many.id,1600,{local:true});
    expect(bounded.plansAvailable).toBeGreaterThan(64);expect(bounded.plansOmitted).toBeGreaterThan(0);
    expect(bounded.plans.every(plan=>plan.met)).toBe(true);expect(bounded.met).toBe(false);
    const ids=new Set(bounded.plans.map(plan=>plan.id));
    let nextOffset=bounded.planScan.nextOffset;
    while(nextOffset!==null) {
      const next=await many.service.wholeRepertoire(many.id,1600,{local:true,planOffset:nextOffset,snapshot:bounded.planScan.snapshot});
      expect(next.planScan.snapshot).toBe(bounded.planScan.snapshot);expect(next.met).toBe(false);
      expect(next.plans.every(plan=>plan.met)).toBe(true);
      for(const plan of next.plans) {expect(ids.has(plan.id)).toBe(false);ids.add(plan.id);}
      nextOffset=next.planScan.nextOffset;
    }
    expect(ids.size).toBe(bounded.plansAvailable);
    await expect(many.service.wholeRepertoire(many.id,1600,{local:true,planOffset:64,snapshot:"different"})).rejects.toThrow(/changed/);
    many.db.prepare("UPDATE opening_quality_preferences SET goal_games=500 WHERE profile_id=?").run(ensureActiveProfile(many.db));
    // An absent preference row is possible; insert explicitly to ensure a changed goal.
    many.db.prepare("INSERT OR IGNORE INTO opening_quality_preferences(profile_id,goal_games,speeds) VALUES(?,500,'blitz,rapid,classical')").run(ensureActiveProfile(many.db));
    await expect(many.service.wholeRepertoire(many.id,1600,{local:true,planOffset:64,snapshot:bounded.planScan.snapshot})).rejects.toThrow(/changed/);
    await expect(many.service.wholeRepertoire(many.id,1600,{local:true,planOffset:-1})).rejects.toThrow(/valid/);
    await expect(many.service.wholeRepertoire(many.id,1600,{planOffset:64,snapshot:bounded.planScan.snapshot})).rejects.toThrow(/local/);
  });

});

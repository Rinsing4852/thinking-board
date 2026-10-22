import path from "node:path";
import Fastify from "fastify";
import { registerOpeningStudyRoutes } from "./opening-study-routes.js";
import { afterEach,describe,expect,it,vi } from "vitest";
import { Database } from "../db/database.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningStudyService } from "./opening-study-service.js";
import { OpeningStudyDiscoveryService } from "./opening-study-discovery.js";
import { ensureActiveProfile,setActiveProfile } from "../training/profile.js";
import { OpeningWorkspaceService } from "./opening-workspace-service.js";

const databases:Database[]=[];
afterEach(()=>{databases.splice(0).forEach(db=>db.close());vi.restoreAllMocks();});
const pgn=(moves="1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7",white="1900",black="1800",result="1/2-1/2")=>`[Event "Example"]\n[White "Stronger White"]\n[Black "Stronger Black"]\n[WhiteElo "${white}"]\n[BlackElo "${black}"]\n[Result "${result}"]\n\n${moves} ${result}`;
function setup(color:"white"|"black"="white") {
  const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);const db=database.connection;
  const imported=new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn:"1. d4 d5 2. Nf3 Nf6 3. c4 e6 *",learnerColor:color,ownershipConfirmed:true});
  const repertoireId=imported.repertoireIds[0]!,workspace=new OpeningWorkspaceService(db),lineId=workspace.repertoire(repertoireId).chapters[0]!.lines[0]!.id;
  const study=new OpeningStudyService(db),state=study.list(repertoireId,lineId,6);
  const target={repertoireId,lineId,savedPly:6,expectedFen:state.fen};
  return {db,study,target,workspace};
}
function provider(games:Record<string,string>,status=200) {
  return vi.fn(async(input:URL|RequestInfo,init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.hostname==="explorer.lichess.org") return new Response(JSON.stringify({topGames:Object.keys(games).map(id=>({id})),recentGames:[]}),{status});
    return new Response(games[url.pathname.split("/").at(-1)!]??"missing",{status:200});
  });
}
describe("automatic stronger-player model games",()=>{
  it("selects master and combined pools without comparing master ratings to Lichess or losing saved study",async()=>{
    const {db,study,target}=setup();
    const fetcher=vi.fn<typeof fetch>(async input=>{
      const url=new URL(String(input));
      if(url.pathname==="/masters")return Response.json({topGames:[{id:"master01"}]});
      if(url.pathname==="/lichess")return Response.json({topGames:[{id:"online01"},{id:"online02"},{id:"online03"}],recentGames:[]});
      return new Response(pgn(undefined,url.pathname.includes("masters/pgn")?"1500":"1900","1800"));
    });
    const service=new OpeningStudyDiscoveryService(db,study,undefined,fetcher);
    const masters=await service.discover(target,2000,"masters");expect(masters.games).toHaveLength(1);expect(masters.games[0]?.source).toBe("masters");
    const replay=service.start(target,masters.games[0]!.id);expect(replay.replay?.game.source).toContain("/masters/pgn/master01");
    const combined=await service.discover(target,1600,"both");expect(new Set(combined.games.map(g=>g.source))).toEqual(new Set(["online","masters"]));expect(combined.games).toHaveLength(3);expect(combined.games[0]?.source).toBe("online");expect(combined.games[1]?.source).toBe("masters");
    expect(study.list(target.repertoireId,target.lineId,6).replay?.game.id).toBe(replay.replay?.game.id);
    const empty=new OpeningStudyDiscoveryService(db,study,undefined,vi.fn(async()=>Response.json({topGames:[]})));
    expect((await empty.discover(target,1600,"masters")).games).toHaveLength(0);
    expect(study.list(target.repertoireId,target.lineId,6).replay?.game.id).toBe(replay.replay?.game.id);
  });
  it("verifies both colours and exact transpositions, ranks direct routes, and starts a replay without changing recall",async()=>{
    for(const color of ["white","black"] as const) {
      const {db,study,target}=setup(color);
      const fetcher=provider({direct01:pgn(),transp01:pgn("1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7","1750","1700"),weaker01:pgn(undefined,"1500","1500"),wrong001:pgn("1. e4 e5 2. Nf3 Nc6")});
      const discovery=new OpeningStudyDiscoveryService(db,study,"test-token",fetcher as typeof fetch);
      const snapshot=()=>["games","opening_moves","opening_review_items","opening_move_review_cards","opening_review_events"].map(table=>db.prepare(`SELECT * FROM ${table}`).all());
      const before=snapshot(),result=await discovery.discover(target,1600);
      expect(result.games).toHaveLength(2);expect(result.games[0]?.transposition).toBe(false);expect(result.games[1]?.transposition).toBe(true);
      expect(result.games[0]?.learnerRating).toBe(color==="white"?1900:1800);
      expect(study.library().games).toHaveLength(0);expect(snapshot()).toEqual(before);
      const replay=discovery.start(target,result.games[0]!.id);
      expect(replay.replay?.currentPly).toBe(6);expect(replay.replay?.game.source).toBe("https://lichess.org/direct01");
      expect(study.list(target.repertoireId,target.lineId,6).replay?.currentPly).toBe(6);expect(snapshot()).toEqual(before);
      expect(study.list(target.repertoireId,target.lineId,6).searchRating).toBe(1600);
      const [url,options]=fetcher.mock.calls[0]!;expect(new URL(String(url)).searchParams.get("fen")).toBe(target.expectedFen);
      expect(options?.headers).toMatchObject({Authorization:"Bearer test-token"});
    }
  });
  it("checks the player on the learner side rather than the opponent, and rejects unknown, unfinished and mismatched games",async()=>{
    const {db,study,target}=setup("black");
    const fetcher=provider({opponent:pgn(undefined,"2900","1500"),unknown1:pgn(undefined,"2900","?"),equal001:pgn(undefined,"1600","1600"),endmatch:pgn("1. d4 d5 2. Nf3 Nf6 3. c4 e6"),ongoing1:pgn(undefined,"1900","1900","*")});
    await expect(new OpeningStudyDiscoveryService(db,study,undefined,fetcher as typeof fetch).discover(target,1600)).rejects.toThrow(/could not be downloaded or verified/);
    const weaker=provider({opponent:pgn(undefined,"2900","1500"),unknown1:pgn(undefined,"2900","?"),equal001:pgn(undefined,"1600","1600"),endmatch:pgn("1. d4 d5 2. Nf3 Nf6 3. c4 e6")});
    expect((await new OpeningStudyDiscoveryService(db,study,undefined,weaker as typeof fetch).discover(target,1600)).games).toHaveLength(0);
  });
  it("reports missing samples, provider failures and partial downloads without discarding saved study",async()=>{
    const {db,study,target}=setup();
    const empty=new OpeningStudyDiscoveryService(db,study,undefined,provider({}) as typeof fetch);
    expect((await empty.discover(target,1600)).message).toContain("not an exhaustive search");
    for(const status of [401,429,503]) {
      const failed=new OpeningStudyDiscoveryService(db,study,undefined,provider({},status) as typeof fetch);
      await expect(failed.discover(target,1600)).rejects.toThrow(status===401?/authorised connection/:status===429?/Wait a minute/:/HTTP 503/);
    }
    const limited=provider({},429),throttled=new OpeningStudyDiscoveryService(db,study,undefined,limited as typeof fetch);
    await expect(throttled.discover(target,1600)).rejects.toThrow(/Wait a minute/);
    await expect(throttled.discover(target,1600)).rejects.toThrow(/Wait a minute/);
    expect(limited).toHaveBeenCalledTimes(1);
    const fetcher=provider({direct01:pgn(),broken01:"not a game"});
    const partial=await new OpeningStudyDiscoveryService(db,study,undefined,fetcher as typeof fetch).discover(target,1600);
    expect(partial.partial).toBe(true);expect(partial.games).toHaveLength(1);
    expect(study.library().games).toHaveLength(0);
  });
  it("rejects expired, wrong-profile and changed-position selections, including a profile switch during search",async()=>{
    const {db,study,target,workspace}=setup(),fetcher=provider({direct01:pgn()});
    const discovery=new OpeningStudyDiscoveryService(db,study,undefined,fetcher as typeof fetch);
    const result=await discovery.discover(target,1600),example=result.games[0]!.id,profile=ensureActiveProfile(db);
    db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-01-01')").run();
    setActiveProfile(db,"other");expect(()=>discovery.start(target,example)).toThrow(/expired or belongs/);setActiveProfile(db,profile);
    const now=Date.now();vi.spyOn(Date,"now").mockReturnValue(now+11*60_000);
    expect(()=>discovery.start(target,example)).toThrow(/expired/);vi.restoreAllMocks();
    const second=await discovery.discover(target,1600);
    const last=workspace.repertoire(target.repertoireId).chapters[0]!.lines[0]!.moves.at(-1)!;
    workspace.undoLastMove(target.repertoireId,target.lineId,last.id);workspace.addMove({repertoireId:target.repertoireId,lineId:target.lineId,afterPly:5,moveUci:"c7c6"});
    expect(()=>discovery.start(target,second.games[0]!.id)).toThrow(/position changed/);
    expect(study.library().games).toHaveLength(0);
    const changed={...target,expectedFen:study.list(target.repertoireId,target.lineId,6).fen};
    const switching=vi.fn(async()=>{setActiveProfile(db,"other");return new Response(JSON.stringify({topGames:[],recentGames:[]}));});
    await expect(new OpeningStudyDiscoveryService(db,study,undefined,switching as typeof fetch).discover(changed,1600)).rejects.toThrow(/active player changed/);
    expect(db.prepare("SELECT * FROM opening_study_preferences WHERE profile_id='other'").all()).toHaveLength(0);
  });
  it("retains the online game's identity and can replay it when saved examples already fill the shortlist",async()=>{
    const {db,study,target}=setup();
    study.import(pgn(undefined,"1200","1300"),"Different players, identical moves");
    study.import(pgn("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. g3 {First note} Be7 {Second note}"),"Other example one");
    study.import(pgn("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. e3 {First note} Be7 {Second note}"),"Other example two");
    const discovery=new OpeningStudyDiscoveryService(db,study,undefined,provider({direct01:pgn()}) as typeof fetch);
    const result=await discovery.discover(target,1600),example=result.games[0]!;
    const started=discovery.start(target,example.id);
    expect(started.replay?.game).toMatchObject({whiteRating:"1900",source:"https://lichess.org/direct01"});
    expect(started.matches.some(game=>game.id===started.replay?.game.id)).toBe(true);
    expect(study.library().games).toHaveLength(4);
    expect(discovery.start(target,example.id).replay?.game.id).toBe(started.replay?.game.id);
    expect(study.library().games).toHaveLength(4);
  });
  it("serves search and selection through validated routes and catches asynchronous provider failures",async()=>{
    const {db,study,target}=setup(),fetcher=provider({direct01:pgn()});
    const service=new OpeningStudyDiscoveryService(db,study,undefined,fetcher as typeof fetch);
    const app=Fastify();registerOpeningStudyRoutes(app,study,service,{assessMove:vi.fn()} as never);
    const base=`/api/v1/openings/repertoires/${target.repertoireId}/lines/${target.lineId}/study`;
    try {
      expect((await app.inject({method:"POST",url:`${base}/discover`,payload:{savedPly:6,expectedFen:target.expectedFen,rating:0}})).statusCode).toBe(400);
      expect(fetcher).not.toHaveBeenCalled();
      const result=await app.inject({method:"POST",url:`${base}/discover`,payload:{savedPly:6,expectedFen:target.expectedFen,rating:1600}});
      expect(result.statusCode).toBe(200);
      const start=await app.inject({method:"POST",url:`${base}/discover/start`,payload:{savedPly:6,expectedFen:target.expectedFen,exampleId:result.json().games[0].id}});
      expect(start.statusCode).toBe(200);expect(start.json().replay.currentPly).toBe(6);
      fetcher.mockRejectedValueOnce(new TypeError("offline"));
      const failed=await app.inject({method:"POST",url:`${base}/discover`,payload:{savedPly:6,expectedFen:target.expectedFen,rating:1600}});
      expect(failed.statusCode).toBe(400);expect(failed.json().error).toContain("Check your connection");
    } finally {await app.close();}
  });
  it("grades only a persisted submitted guess and never alters study or recall credit",async()=>{
    const {db,study,target}=setup(),discovery=new OpeningStudyDiscoveryService(db,study,undefined,provider({direct01:pgn()}) as typeof fetch);
    const found=await discovery.discover(target,1600),selected=discovery.start(target,found.games[0]!.id),base=`/api/v1/openings/repertoires/${target.repertoireId}/lines/${target.lineId}/study`;
    const assessMove=vi.fn(async()=>({verdict:"playable" as const,message:"Fixture",depth:16}));
    const app=Fastify();registerOpeningStudyRoutes(app,study,discovery,{assessMove} as never);
    try {
      const quiz=study.quiz(target.repertoireId,target.lineId,{savedPly:6,gameId:selected.replay!.game.id,expectedFen:target.expectedFen,version:selected.replay!.version,action:"start"});
      expect((await app.inject({method:"POST",url:`${base}/quality`,payload:{savedPly:6,version:quiz.quiz!.version}})).statusCode).toBe(400);expect(assessMove).not.toHaveBeenCalled();
      const after=study.quiz(target.repertoireId,target.lineId,{savedPly:6,gameId:quiz.quiz!.game.id,expectedFen:target.expectedFen,version:quiz.quiz!.version,action:"answer",moveUci:"b1c3"});
      const events=db.prepare("SELECT * FROM opening_review_events").all();
      const result=await app.inject({method:"POST",url:`${base}/quality`,payload:{savedPly:6,version:after.quiz!.version}});
      expect(result.statusCode).toBe(200);expect(result.json().message).toContain("historical move");expect(assessMove).toHaveBeenCalledTimes(1);
      expect(study.list(target.repertoireId,target.lineId,6).quiz).toEqual(after.quiz);expect(db.prepare("SELECT * FROM opening_review_events").all()).toEqual(events);
      expect((await app.inject({method:"POST",url:`${base}/quality`,payload:{savedPly:6,version:quiz.quiz!.version}})).statusCode).toBe(400);
    }finally {await app.close();}
  });
  it("does not follow hostile references and rejects invalid ratings before contacting the provider",async()=>{
    const {db,study,target}=setup();const fetcher=vi.fn(async()=>new Response(JSON.stringify({topGames:[{id:"https://evil.test"},{id:"../local"}],recentGames:[]})));
    const service=new OpeningStudyDiscoveryService(db,study,undefined,fetcher as typeof fetch);
    await expect(service.discover(target,0)).rejects.toThrow(/Lichess rating/);expect(fetcher).not.toHaveBeenCalled();
    await expect(service.discover(target,1600)).rejects.toThrow(/invalid game references/);expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

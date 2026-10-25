import { Chess } from "chess.js";
import path from "node:path";
import { afterEach,describe,expect,it } from "vitest";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { OpeningGameService } from "../openings/opening-game-service.js";
import { GameQualityService,qualityWindow,sideSummary,timeControl } from "./game-quality-service.js";
import { assessMove,chances } from "./move-quality.js";
import { loadConfig } from "../config.js";
import type { GameQualityMove } from "../../../../packages/contracts/src/api.js";
const cp=(n:number)=>({centipawnsWhite:n,mateInWhite:null});
const mate=(n:number)=>({centipawnsWhite:null,mateInWhite:n});
const dbs:Database[]=[];afterEach(()=>{for(const db of dbs.splice(0))db.close();});
function setup(){const database=new Database(":memory:",path.resolve("migrations"));dbs.push(database);const db=database.connection;
 return {db,imports:new ImportService(db),service:new GameQualityService(db,loadConfig(),new OpeningGameService(db))};}
function move(grade:GameQualityMove["grade"],moveNumber=1,accuracy=100):GameQualityMove{return {ply:2*moveNumber-1,moveNumber,color:"white",san:"e4",grade,accuracy,chanceLoss:0,chancesBefore:50,chancesAfter:50,bestSan:"e4"};}
describe("shared move quality",()=>{
 it("uses the mover's perspective and treats equal losses differently in settled positions",()=>{
   expect(assessMove(cp(0),cp(-300),"white",false).grade).toBe("blunder");
   expect(assessMove(cp(0),cp(300),"black",false).grade).toBe("blunder");
   expect(assessMove(cp(1800),cp(1500),"white",false).grade).toBe("good");
   expect(assessMove(cp(20),cp(20),"white",true)).toMatchObject({grade:"best",accuracy:100,loss:0});
   expect(assessMove(cp(20),cp(20),"white",false).grade).toBe("good");
 });
 it("handles mate outcomes without inventing centipawn differences or penalising a slower forced mate",()=>{
   expect(assessMove(mate(2),mate(8),"white",false)).toMatchObject({loss:0,grade:"good"});
   expect(assessMove(cp(0),mate(-2),"white",false)).toMatchObject({loss:50,grade:"blunder"});
   expect(assessMove(mate(2),cp(0),"white",false)).toMatchObject({loss:50,grade:"blunder"});
   expect(assessMove(mate(-2),mate(-1),"white",false).loss).toBe(0);
   expect(()=>chances({centipawnsWhite:null,mateInWhite:null},"white")).toThrow("Missing");
 });
 it("does not give blunder-free games a fake first-error move or treat unobserved endings as success",()=>{
   const safe=Array.from({length:30},(_,i)=>move("good",i+1));const early=[move("blunder",1,10)];const short=[move("good")];
   expect(sideSummary(safe)).toMatchObject({firstMistake:null,firstBlunder:null,counts:{blunder:0}});
   const window=qualityWindow([safe,early,short].map(moves=>({side:sideSummary(moves),moves})));
   expect(window).toMatchObject({games:3,moves:32,blunderFreeGames:2,firstBlunderMedian:1,errorsPer100Moves:3.1});
   expect(window.checkpoints[0]).toEqual({move:10,observed:2,withoutBlunder:1,endedEarlier:1});
 });
 it("normalises loss rates by the player's moves and keeps time controls distinct",()=>{
   expect(sideSummary([move("mistake"),move("blunder",2),move("good",3),move("best",4)]).errorsPer100Moves).toBe(50);
   expect(["60+0","300+0","600+5","1800+0","1/86400","?"].map(TimeControl=>timeControl(JSON.stringify({TimeControl})))).toEqual(["bullet","blitz","rapid","classical","correspondence","unknown"]);
 });
 it("saves imports without starting analysis, scopes all/selected requests and deduplicates pending work atomically",()=>{
   const {db,imports,service}=setup();
   const result=imports.import('[White "Alice"]\n[Black "Opponent"]\n\n1. e4 e5 *',"Alice");
   expect(result.jobId).toBeNull();expect(db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBe(0);
   imports.import('[White "Alice"]\n[Black "Second"]\n\n1. d4 d5 *',"Alice");
   imports.import('[White "Bob"]\n[Black "Third"]\n\n1. c4 e5 *',"Bob");
   const alice=db.prepare("SELECT id FROM player_profiles WHERE display_name='Alice'").pluck().get() as string;
   const bobGame=db.prepare("SELECT id FROM games WHERE white_name='Bob'").pluck().get() as string;
   expect(()=>service.enqueue(alice,{gameIds:[bobGame]})).toThrow("not found");
   const requested=service.enqueue(alice,{all:true});expect(requested.queued).toBe(2);
   expect(service.enqueue(alice,{all:true})).toMatchObject({id:null,queued:0,alreadyQueued:2});
   const payload=JSON.parse(db.prepare("SELECT payload_json FROM jobs").pluck().get() as string);
   expect(payload).toMatchObject({profileId:alice,requestedByUser:true});expect(payload.gameIds).not.toContain(bobGame);
 });
 it("counts only complete reports once and separates settings, date eligibility and playing speed",()=>{
   const {db,imports,service}=setup();
   const add=(n:number,speed:string,date:string,result:string,depth=14)=>{
     imports.import(`[White "Alice"]\n[Black "Opponent ${n}"]\n[Date "${date}"]\n[TimeControl "${speed}"]\n[Result "${result}"]\n\n1. ${["","e4","d4","c4","Nf3","g3"][n]} e5 ${result}`,"Alice");
     const gameId=db.prepare("SELECT id FROM games WHERE black_name=?").pluck().get(`Opponent ${n}`) as string;
     db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at) VALUES (?,?,'Fixture','v1',?,3,1,128,3,'completed','2026-01-01','2026-02-01')`).run(`run${n}`,gameId,depth);
     for(const m of db.prepare("SELECT id,mover_color FROM moves WHERE game_id=?").all(gameId) as {id:string;mover_color:string}[])db.prepare(`INSERT INTO game_move_quality VALUES (?,?,'chances-v1',50,50,0,100,'good','e2e4','e4')`).run(`run${n}`,m.id);
     return gameId;
   };
   const first=add(1,"600+0","2026.01.01","1-0");add(2,"60+0","2026.01.02","1-0");add(3,"600+0","????.??.??","1-0");add(4,"600+0","2026.01.04","*");add(5,"600+0","2026.01.05","1-0",18);
   const alice=db.prepare("SELECT id FROM player_profiles WHERE display_name='Alice'").pluck().get() as string;
   const report=service.report(first,alice)!;expect(report.white.moves).toBe(1);expect(report.black.moves).toBe(1);
   const trends=service.trends(alice,report.cohort,"rapid");expect(trends).toMatchObject({totalGames:5,analyzedGames:5,excludedGames:2,recent:{games:1,blunderFreeGames:1},previous:{games:0}});
   expect(trends.cohorts).toHaveLength(2);expect(trends.timeControls).toEqual(["bullet","rapid"]);
   db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at) SELECT 'new-failed',game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,'failed','2099-01-01','2099-01-01' FROM analysis_runs WHERE id='run1'`).run();
   db.prepare(`INSERT INTO game_move_quality SELECT 'new-failed',move_id,rule_version,chances_before,chances_after,chance_loss,accuracy,grade,best_uci,best_san FROM game_move_quality WHERE run_id='run1'`).run();
   db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at) SELECT 'new-partial',game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,'completed','2099-02-01','2099-02-01' FROM analysis_runs WHERE id='run1'`).run();
   db.prepare(`INSERT INTO game_move_quality SELECT 'new-partial',move_id,rule_version,chances_before,chances_after,chance_loss,accuracy,grade,best_uci,best_san FROM game_move_quality WHERE run_id='run1' LIMIT 1`).run();
   expect(service.report(first,alice)?.analyzedAt).toBe(report.analyzedAt);
   db.prepare("UPDATE analysis_runs SET status='failed' WHERE id='run1'").run();expect(service.report(first,alice)).toBeNull();
 });
 it("compares the latest twenty played games with the preceding twenty rather than import order",()=>{
   const {db,imports,service}=setup();
   for(let n=42;n>=1;n--){
     const board=new Chess();let seed=n;
     for(let ply=0;ply<20&&!board.isGameOver();ply++){const options=board.moves();seed=(seed*1664525+1013904223)>>>0;board.move(options[seed%options.length]!);}
     const date=new Date(Date.UTC(2026,0,n)).toISOString().slice(0,10).replaceAll("-",".");
     for(const [key,value] of Object.entries({White:"Alice",Black:`Opponent ${n}`,Date:date,TimeControl:"600+0",Result:"1-0"}))board.setHeader(key,value);
     expect(imports.import(board.pgn(),"Alice").imported).toBe(1);
     const gameId=db.prepare("SELECT id FROM games WHERE black_name=?").pluck().get(`Opponent ${n}`) as string;
     db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at) VALUES (?,?,'Fixture','v1',14,3,1,128,3,'completed','2026-03-01','2026-03-01')`).run(`series${n}`,gameId);
     const quality=n>22?{accuracy:100,grade:"good",loss:0}:assessMove(cp(0),cp(-300),"white",false);
     for(const m of db.prepare("SELECT id FROM moves WHERE game_id=?").all(gameId) as {id:string}[])db.prepare(`INSERT INTO game_move_quality VALUES (?,?,'chances-v1',50,25,?,?,?,'e2e4','e4')`).run(`series${n}`,m.id,quality.loss,quality.accuracy,quality.grade);
   }
   const alice=db.prepare("SELECT id FROM player_profiles WHERE display_name='Alice'").pluck().get() as string;
   const result=service.trends(alice);
   expect(result).toMatchObject({totalGames:42,analyzedGames:42,recent:{games:20,accuracy:100,goodMovePercent:100,blunderFreeGames:20},previous:{games:20,goodMovePercent:0,blunderFreeGames:0}});
   expect(result.previous.accuracy).toBeLessThan(result.recent.accuracy!);
 });

});

describe("versioned game accuracy",()=>{
 it("gives an isolated serious error more influence than a simple average, without inventing scores for empty games",()=>{
  const moves=[move("good",1,100),move("good",2,100),move("blunder",3,10)];
  expect(sideSummary(moves).accuracy).toBe(47.5);
  expect(sideSummary(moves,moves,"chances-v1").accuracy).toBe(70);
  expect(sideSummary([]).accuracy).toBeNull();
  expect(sideSummary([move("blunder",1,0)]).accuracy).toBe(0);
  expect(sideSummary([move("best")]).accuracy).toBe(100);
 });
 it("averages complete game scores in progress rather than letting long games dominate",()=>{
  const long=Array.from({length:20},(_,i)=>move("good",i+1,100));
  const short=[move("blunder",1,0)];
  const rows=[long,short].map(moves=>({moves,side:sideSummary(moves)}));
  expect(qualityWindow(rows).accuracy).toBe(50);
  expect(qualityWindow(rows,"chances-v1").accuracy).toBe(95.2);
 });
 it("keeps old reports readable and in separate comparison groups while allowing an explicit upgrade",()=>{
  const {db,imports,service}=setup();
  for(const [n,version] of [[1,"chances-v1"],[2,"chances-v2"]] as const){
   imports.import(`[White "Alice"]\n[Black "Version ${n}"]\n[Date "2026.10.0${n}"]\n[TimeControl "600+0"]\n[Result "1-0"]\n\n1. ${n===1?"e4":"d4"} e5 1-0`,"Alice");
   const game=db.prepare("SELECT id FROM games WHERE black_name=?").pluck().get(`Version ${n}`) as string;
   db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at) VALUES (?,?,'Fixture','v1',14,3,1,128,3,'completed','2026-01-01','2026-02-01')`).run(`version${n}`,game);
   for(const row of db.prepare("SELECT id FROM moves WHERE game_id=?").all(game) as {id:string}[])db.prepare(`INSERT INTO game_move_quality VALUES (?,?,?,50,50,0,100,'good','e2e4','e4')`).run(`version${n}`,row.id,version);
  }
  const profile=db.prepare("SELECT id FROM player_profiles WHERE display_name='Alice'").pluck().get() as string;
  const old=db.prepare("SELECT id FROM games WHERE black_name='Version 1'").pluck().get() as string;
  expect(service.report(old,profile)).toMatchObject({ruleVersion:"chances-v1",white:{accuracy:100}});
  expect(service.trends(profile).cohorts.map(c=>c.ruleVersion).sort()).toEqual(["chances-v1","chances-v2"]);
  expect(service.trends(profile).recent.games).toBe(1);
  expect(service.enqueue(profile,{all:true})).toMatchObject({queued:1,alreadyAnalyzed:1});
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
 });
});

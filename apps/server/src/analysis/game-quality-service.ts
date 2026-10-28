import { createHash } from "node:crypto";
import { Chess } from "chess.js";
import type { GameQualityMove,GameQualityReport,GameQualitySide,GameQualityTrends,GameQualityWindow,GameQualitySource } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import type { AppConfig } from "../config.js";
import { id,now } from "../lib/ids.js";
import { QUALITY_VERSION, gameAccuracy } from "./move-quality.js";
import type { OpeningGameService } from "../openings/opening-game-service.js";

type Run={id:string;game_id:string;engine_name:string;engine_version:string;depth:number;multipv:number;threads:number;hash_mb:number;completed_at:string;rule_version:string};
type Game={white_name:string;black_name:string;id:string;player_color:"white"|"black";headers_json:string;played_at:string|null;created_at:string;initial_fen:string;result:string};
const round=(n:number)=>Math.round(n*10)/10;
function cohort(run:Run):string{return createHash("sha256").update(JSON.stringify([run.rule_version,run.engine_name,run.engine_version,run.depth,run.multipv,run.threads,run.hash_mb])).digest("hex").slice(0,20);}
export function timeControl(headers:string):string {
  const value=JSON.parse(headers).TimeControl as string|undefined;
  if(!value||value==="-"||value==="?")return "unknown";
  if(value.includes("/"))return "correspondence";
  const match=/^(\d+)(?:\+(\d+))?$/.exec(value);if(!match)return "unknown";
  const seconds=Number(match[1])+40*Number(match[2]??0);
  return seconds<180?"bullet":seconds<480?"blitz":seconds<1500?"rapid":"classical";
}
export function sideSummary(moves:GameQualityMove[],timeline=moves,ruleVersion=QUALITY_VERSION):GameQualitySide {
  const counts={best:0,good:0,inaccuracy:0,mistake:0,blunder:0};for(const m of moves)counts[m.grade]++;
  return {moves:moves.length,accuracy:moves.length?round(ruleVersion==="chances-v1"?moves.reduce((s,m)=>s+m.accuracy,0)/moves.length:gameAccuracy(timeline,moves[0]!.color)!):null,counts,
    errorsPer100Moves:moves.length?round(100*(counts.mistake+counts.blunder)/moves.length):null,
    firstMistake:moves.find(m=>m.grade==="mistake"||m.grade==="blunder")?.moveNumber??null,
    firstBlunder:moves.find(m=>m.grade==="blunder")?.moveNumber??null};
}
export function qualityWindow(rows:Array<{side:GameQualitySide;moves:GameQualityMove[]}>,ruleVersion=QUALITY_VERSION):GameQualityWindow {
  const moves=rows.flatMap(r=>r.moves);const summary=sideSummary(moves,moves,"chances-v1");
  const median=(values:number[])=>{values.sort((a,b)=>a-b);return values.length?round((values[Math.floor((values.length-1)/2)]!+values[Math.floor(values.length/2)]!)/2):null;};
  return {games:rows.length,moves:moves.length,accuracy:ruleVersion==="chances-v1"?sideSummary(moves,moves,"chances-v1").accuracy:rows.some(r=>r.side.accuracy!==null)?round(rows.reduce((sum,r)=>sum+(r.side.accuracy??0),0)/rows.filter(r=>r.side.accuracy!==null).length):null,goodMovePercent:moves.length?round(100*(summary.counts.best+summary.counts.good)/moves.length):null,
    blundersPerGame:rows.length?round(summary.counts.blunder/rows.length):null,mistakesPerGame:rows.length?round(summary.counts.mistake/rows.length):null,
    errorsPer100Moves:summary.errorsPer100Moves,firstMistakeMedian:median(rows.flatMap(r=>r.side.firstMistake===null?[]:[r.side.firstMistake])),
    firstBlunderMedian:median(rows.flatMap(r=>r.side.firstBlunder===null?[]:[r.side.firstBlunder])),blunderFreeGames:rows.filter(r=>r.side.counts.blunder===0).length,
    checkpoints:[10,20,30].map(move=>{const observed=rows.filter(r=>r.side.moves>=move||(r.side.firstBlunder!==null&&r.side.firstBlunder<=move));
      return {move,observed:observed.length,withoutBlunder:observed.filter(r=>r.side.firstBlunder===null||r.side.firstBlunder>move).length,endedEarlier:rows.length-observed.length};})};
}
export class GameQualityService {
  constructor(private readonly db:SqliteDatabase,private readonly config:AppConfig,private readonly openings:OpeningGameService){}
  private game(gameId:string,profileId:string):Game {
    const game=this.db.prepare("SELECT * FROM games WHERE id=? AND profile_id=?").get(gameId,profileId) as Game|undefined;
    if(!game)throw new Error("Game not found");return game;
  }
  private run(gameId:string):Run|undefined {
    return this.db.prepare(`SELECT ar.*, (SELECT rule_version FROM game_move_quality WHERE run_id=ar.id LIMIT 1) AS rule_version FROM analysis_runs ar WHERE ar.game_id=? AND ar.status='completed'
      AND (SELECT COUNT(*) FROM game_move_quality q WHERE q.run_id=ar.id AND q.rule_version IN ('chances-v1','chances-v2','chances-v3'))=(SELECT COUNT(*) FROM moves m WHERE m.game_id=ar.game_id)
      AND (SELECT COUNT(DISTINCT rule_version) FROM game_move_quality q WHERE q.run_id=ar.id)=1
      AND EXISTS(SELECT 1 FROM game_move_quality q WHERE q.run_id=ar.id)
      ORDER BY ar.completed_at DESC,ar.rowid DESC LIMIT 1`).get(gameId) as Run|undefined;
  }
  report(gameId:string,profileId:string,includeOpening=true):GameQualityReport|null {
    const game=this.game(gameId,profileId),run=this.run(gameId);if(!run)return null;
    const rows=this.db.prepare(`SELECT m.ply,m.move_number AS moveNumber,m.mover_color AS color,m.san,q.grade,q.accuracy,
      q.chance_loss AS chanceLoss,q.chances_before AS chancesBefore,q.chances_after AS chancesAfter,q.best_san AS bestSan,
      v.reason,v.initial_grade AS initialGrade,v.depth AS verificationDepth
      FROM game_move_quality q JOIN moves m ON m.id=q.move_id
      LEFT JOIN game_move_verification v ON v.run_id=q.run_id AND v.move_id=q.move_id
      WHERE q.run_id=? ORDER BY m.ply`).all(run.id) as Array<GameQualityMove & {reason:string|null;initialGrade:GameQualityMove["grade"]|null;verificationDepth:number|null}>;
    const moves=rows.map(({reason,initialGrade,verificationDepth,...move}):GameQualityMove=>({...move,
      verification:reason&&initialGrade&&verificationDepth!==null?{reason,initialGrade,depth:verificationDepth}:null}));
    return {gameId,analyzedAt:run.completed_at,cohort:cohort(run),engine:run.engine_name,depth:run.depth,ruleVersion:run.rule_version,
      playerColor:game.player_color,timeControl:timeControl(game.headers_json),moves,white:sideSummary(moves.filter(m=>m.color==="white"),moves,run.rule_version),black:sideSummary(moves.filter(m=>m.color==="black"),moves,run.rule_version),opening:includeOpening?this.openings.matchGame(gameId,profileId):null};
  }
  enqueue(profileId:string,selection:{all?:boolean;gameIds?:string[];reanalyse?:boolean}) {
    return this.db.transaction(()=>{
      const gameIds=selection.all?(this.db.prepare("SELECT id FROM games WHERE profile_id=? ORDER BY created_at,id").all(profileId) as {id:string}[]).map(g=>g.id):[...new Set(selection.gameIds??[])];
      if(!gameIds.length)throw new Error("Choose at least one game");
      for(const gameId of gameIds)this.game(gameId,profileId);
      const active=new Set<string>();
      for(const row of this.db.prepare("SELECT payload_json FROM jobs WHERE kind='analyze_games' AND status IN ('queued','running')").all() as {payload_json:string}[]) {
        const payload=JSON.parse(row.payload_json);for(const gameId of payload.gameIds??[])active.add(gameId);
      }
      let alreadyQueued=0,alreadyAnalyzed=0;
      const pending=gameIds.filter(gameId=>{
        if(active.has(gameId)){alreadyQueued++;return false;}
        const run=this.run(gameId);
        if(!selection.reanalyse&&run&&run.rule_version===QUALITY_VERSION&&run.depth===this.config.stockfishDepth&&run.multipv===this.config.stockfishMultiPv&&run.threads===this.config.stockfishThreads&&run.hash_mb===this.config.stockfishHashMb){alreadyAnalyzed++;return false;}
        return true;
      });
      if(!pending.length)return {id:null,queued:0,alreadyQueued,alreadyAnalyzed};
      const jobId=id();this.db.prepare(`INSERT INTO jobs(id,kind,status,progress_total,payload_json,created_at) VALUES (?,'analyze_games','queued',?,?,?)`)
        .run(jobId,pending.length,JSON.stringify({gameIds:pending,profileId,requestedByUser:true}),now());
      return {id:jobId,queued:pending.length,alreadyQueued,alreadyAnalyzed};
    })();
  }
  trends(profileId:string,requestedCohort?:string,requestedControl?:string):GameQualityTrends {
    const games=this.db.prepare("SELECT * FROM games WHERE profile_id=? ORDER BY played_at DESC,created_at DESC,id").all(profileId) as Game[];
    const available=games.flatMap(game=>{const run=this.run(game.id);return run?[{game,run,cohort:cohort(run),timeControl:timeControl(game.headers_json)}]:[];});
    const cohorts=[...new Map(available.map(r=>[r.cohort,{id:r.cohort,engine:r.run.engine_name,depth:r.run.depth,ruleVersion:r.run.rule_version}])).values()];
    const chosen=requestedCohort??[...available].sort((a,b)=>b.run.completed_at.localeCompare(a.run.completed_at))[0]?.cohort??null;
    if(requestedCohort&&!cohorts.some(c=>c.id===requestedCohort))throw new Error("Analysis settings not found");
    const same=available.filter(r=>r.cohort===chosen);
    const eligible=same.filter(({game})=>game.played_at&&Number.isFinite(Date.parse(game.played_at))&&game.result!=="*"&&game.initial_fen===new Chess().fen()&&Boolean(this.db.prepare("SELECT 1 FROM moves WHERE game_id=? AND mover_color=? LIMIT 1").get(game.id,game.player_color)));
    const timeControls=[...new Set(eligible.map(r=>r.timeControl))].sort();
    const control=requestedControl??(timeControls.includes("rapid")?"rapid":timeControls[0]??null);
    if(requestedControl&&!timeControls.includes(requestedControl))throw new Error("No comparable games for this time control");
    const selected=eligible.filter(r=>r.timeControl===control).slice(0,40);
    const rows=selected.map(({game})=>{
      const report=this.report(game.id,profileId,false)!;
      return {side:report[report.playerColor],moves:report.moves.filter(m=>m.color===report.playerColor)};
    });
    const sources:GameQualitySource[]=selected.map(({game},index)=>{
      const row=rows[index]!,first=row.moves.find(m=>m.grade==='blunder')??row.moves.find(m=>m.grade==='mistake');
      const practice=this.db.prepare(`SELECT ti.id FROM training_items ti JOIN moves m ON m.id=ti.source_move_id
        JOIN review_states rs ON rs.item_id=ti.id WHERE ti.game_id=? AND ti.profile_id=? AND ti.active=1
        AND ti.mode='blunder_check' AND m.mover_color=? ORDER BY rs.due_at,m.ply LIMIT 1`).pluck().get(game.id,profileId,game.player_color) as string|undefined;
      return {gameId:game.id,white:game.white_name,black:game.black_name,playedAt:game.played_at!,playerColor:game.player_color,result:game.result,
        accuracy:row.side.accuracy,blunders:row.side.counts.blunder,mistakes:row.side.counts.mistake,
        firstError:first?{ply:first.ply,moveNumber:first.moveNumber,san:first.san,grade:first.grade as 'mistake'|'blunder'}:null,practiceItemId:practice??null};
    });
    return {sources:{recent:sources.slice(0,20),previous:sources.slice(20,40)},totalGames:games.length,analyzedGames:available.length,excludedGames:same.length-eligible.length,cohorts,cohort:chosen,timeControls,timeControl:control,recent:qualityWindow(rows.slice(0,20),same[0]?.run.rule_version),previous:qualityWindow(rows.slice(20,40),same[0]?.run.rule_version)};
  }
}

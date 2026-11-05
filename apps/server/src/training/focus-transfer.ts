import type {FocusTransfer,FocusTransferWindow} from '../../../../packages/contracts/src/api.js';
import type {SqliteDatabase} from '../db/database.js';
import {gameSource} from '../games/game-source.js';
import {completedTrainingReview} from '../games/training-review-link.js';
export type TransferGame={id:string;run_id:string;played_at:string;player_color:'white'|'black';headers_json:string;identity_key:string|null};
/** Descriptive, bounded follow-up of one observed pattern; never an attribution of causality. */
export function focusTransfer(db:SqliteDatabase,games:TransferGame[],items:Array<{id:string;game_id:string}>,profile:string):FocusTransfer|null {
 const byItem=new Map(items.map(item=>[item.id,item]));
 if(!items.length)return null;
 const attempts=db.prepare(`SELECT ta.id,ta.item_id,ta.answered_at FROM training_attempts ta JOIN training_items ti ON ti.id=ta.item_id
   JOIN training_game_review_context c ON c.attempt_id=ta.id WHERE ti.profile_id=? AND ti.id IN (${items.map(()=>'?').join(',')}) AND ta.answered_at IS NOT NULL AND ta.abandoned_at IS NULL
   ORDER BY ta.answered_at,ta.rowid`).all(profile,...items.map(item=>item.id)) as Array<{id:string;item_id:string;answered_at:string}>;
 const first=attempts.find(attempt=>{
  const item=byItem.get(attempt.item_id);if(!item)return false;const context=completedTrainingReview(db,attempt.id);
  return item&&context&&Number.isFinite(Date.parse(attempt.answered_at))&&games.some(g=>g.id===item.game_id&&g.run_id===context.analysis_run_id);
 });
 if(!first)return null;
 const anchor=games.find(game=>game.id===byItem.get(first.item_id)!.game_id);if(!anchor)return null;
 const source=gameSource(anchor.identity_key,anchor.headers_json),cutoff=Date.parse(first.answered_at);
 // Do not compare colours or playing platforms. Caller has already separated engine settings and time control.
 const scoped=games.filter(game=>game.player_color===anchor.player_color&&gameSource(game.identity_key,game.headers_json)===source);
 const matching=new Set(items.map(item=>item.game_id));let incompleteGames=0,timingExcludedGames=0;
 const complete=scoped.filter(game=>{
  const headers=JSON.parse(game.headers_json);
  // A date-only export cannot establish whether a game on the study date came before or after practice.
  if(game.played_at.slice(0,10)===first.answered_at.slice(0,10)&&!/^\d{2}:\d{2}:\d{2}$/.test(headers.UTCTime??'')){timingExcludedGames++;return false;}

  const count=db.prepare(`SELECT COUNT(*) AS total,COUNT(ma.move_id) AS assessed,COUNT(q.move_id) AS graded,COUNT(DISTINCT q.rule_version) AS methods FROM moves m LEFT JOIN game_move_quality q ON q.move_id=m.id AND q.run_id=? LEFT JOIN move_assessments ma ON ma.move_id=m.id AND ma.run_id=?
    WHERE m.game_id=? AND m.mover_color=?`).get(game.run_id,game.run_id,game.id,game.player_color) as {total:number;assessed:number;graded:number;methods:number};
  if(!count.total||count.total!==count.assessed||count.total!==count.graded||count.methods!==1){incompleteGames++;return false;}return true;
 });
 const range=(values:number[])=>values.length?{min:Math.min(...values),max:Math.max(...values),known:values.length}:null;
 const window=(rows:TransferGame[]):FocusTransferWindow=>{
  let ownMoves=0,seriousErrors=0,blunders=0;const ratings:number[]=[],opponents:number[]=[];
  for(const game of rows){
   const counts=db.prepare(`SELECT COUNT(*) AS moves,SUM(CASE WHEN q.grade IN ('mistake','blunder') THEN 1 ELSE 0 END) AS serious,
     SUM(CASE WHEN q.grade='blunder' THEN 1 ELSE 0 END) AS blunders FROM moves m JOIN game_move_quality q ON q.move_id=m.id
     WHERE q.run_id=? AND m.game_id=? AND m.mover_color=?`).get(game.run_id,game.id,game.player_color) as {moves:number;serious:number;blunders:number};
   ownMoves+=counts.moves;seriousErrors+=counts.serious;blunders+=counts.blunders;
   const h=JSON.parse(game.headers_json),rating=Number(h[game.player_color==='white'?'WhiteElo':'BlackElo']),opponent=Number(h[game.player_color==='white'?'BlackElo':'WhiteElo']);
   if(Number.isFinite(rating)&&rating>0)ratings.push(rating);if(Number.isFinite(opponent)&&opponent>0)opponents.push(opponent);
  }
  return {games:rows.length,ownMoves,flaggedGames:rows.filter(g=>matching.has(g.id)).length,seriousErrors,blunders,
   errorsPer100Moves:ownMoves?Math.round(1000*seriousErrors/ownMoves)/10:null,
   from:rows.map(g=>g.played_at).sort()[0]??null,to:rows.map(g=>g.played_at).sort().at(-1)??null,
   learnerRatings:range(ratings),opponentRatings:range(opponents),gameIds:rows.map(g=>g.id)};
 };
 const before=complete.filter(g=>Date.parse(g.played_at)<=cutoff).sort((a,b)=>b.played_at.localeCompare(a.played_at)).slice(0,20);
 const after=complete.filter(g=>Date.parse(g.played_at)>cutoff).sort((a,b)=>b.played_at.localeCompare(a.played_at)).slice(0,20);
 return {practisedAt:first.answered_at,source,playerColor:anchor.player_color,incompleteGames,timingExcludedGames,before:window(before),after:window(after)};
}

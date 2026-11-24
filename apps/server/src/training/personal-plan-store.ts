import {createHash} from 'node:crypto';
import {Chess} from 'chess.js';
import type {LearningFocusPlan,PersonalLearningPlan,PlanMeasure} from '../../../../packages/contracts/src/api.js';
import type {SqliteDatabase} from '../db/database.js';
import {trainingExerciseFingerprint} from '../games/training-review-link.js';
import {gameSource} from '../games/game-source.js';
import {id,now} from '../lib/ids.js';
import {timeControl} from '../analysis/game-quality-service.js';

type Row={id:string;profile_id:string;chosen_at:string;reviewed_at:string;snapshot_json:string;evidence_json:string;baseline_json:string;kept_suggestion:string|null;first_studied_at:string|null};
type Evidence={itemId:string;gameId:string;runId:string;hash:string};
type Sample={id:string;run:string;date:string;source:PlanMeasure['source'];color:PlanMeasure['playerColor'];moves:number;serious:number;blunders:number;rating:number|null;opponent:number|null};
type Baseline={groups:PlanMeasure[];excludedGames:number;samples:Sample[]};
export type FocusComputer=(days:number|null,control?:string,focusId?:string,cohort?:string,anchorIds?:string[])=>LearningFocusPlan;
export const learningCohort=(row:{engine_name:string;engine_version:string;depth:number;multipv:number;threads:number;hash_mb:number;rule_version:string|null})=>
 createHash('sha256').update(JSON.stringify([row.engine_name,row.engine_version,row.depth,row.multipv,row.threads,row.hash_mb,row.rule_version])).digest('hex').slice(0,20);
const suggestionKey=(plan:LearningFocusPlan)=>JSON.stringify([plan.focus?.id,plan.cohort,plan.gameDays,plan.timeControl]);

/** Persists choices and evidence, never grades answers or owns a review schedule. */
export class PersonalPlanStore {
 constructor(private readonly db:SqliteDatabase){}
 private active(profile:string):Row|undefined{return this.db.prepare("SELECT * FROM personal_learning_plans WHERE profile_id=? AND status='active'").get(profile) as Row|undefined;}
 has(profile:string):boolean{return Boolean(this.active(profile));}

 present(recommended:LearningFocusPlan,compute:FocusComputer):LearningFocusPlan {
  if(!recommended.profileId)return recommended;
  const row=this.active(recommended.profileId);if(!row)return {...recommended,personalPlan:null,suggestion:null};
  const saved=JSON.parse(row.snapshot_json) as LearningFocusPlan,evidence=JSON.parse(row.evidence_json) as Evidence[];
  const stale=evidence.some(item=>{
   const current=this.db.prepare(`SELECT ti.active,(SELECT id FROM analysis_runs WHERE game_id=ti.game_id AND status='completed' ORDER BY completed_at DESC,rowid DESC LIMIT 1) AS run
    FROM training_items ti WHERE ti.id=? AND ti.profile_id=?`).get(item.itemId,row.profile_id) as {active:number;run:string}|undefined;
   return !current?.active||current.run!==item.runId||trainingExerciseFingerprint(this.db,item.itemId,'blunder_check')!==item.hash;
  });
  let current:LearningFocusPlan=saved;
  try{current=compute(saved.gameDays,saved.timeControl??undefined,saved.focus!.id,saved.cohort??undefined,[...new Set(evidence.map(e=>e.gameId))]);}catch{/* Preserve the chosen plan even when its former scope has no current evidence. */}
  const usable=!stale&&current!==saved&&Boolean(current.focus);
  const focus=usable?current.focus!:{...saved.focus!,itemIds:[],dueCount:0,nextDueAt:null,transfer:null,
   nextStep:'Review the changed evidence before continuing this plan.'};
  const study=this.firstStudy(row,evidence);
  const baseline=JSON.parse(row.baseline_json) as Baseline;
  const followUp=study?this.measure(row.profile_id,saved,study):null;
  const history=(this.db.prepare("SELECT id,chosen_at,replaced_at,first_studied_at,snapshot_json FROM personal_learning_plans WHERE profile_id=? AND status='replaced' ORDER BY chosen_at DESC,rowid DESC LIMIT 5").all(row.profile_id) as Array<{id:string;chosen_at:string;replaced_at:string|null;first_studied_at:string|null;snapshot_json:string}>).map(p=>({id:p.id,title:(JSON.parse(p.snapshot_json) as LearningFocusPlan).focus!.title,chosenAt:p.chosen_at,replacedAt:p.replaced_at,studiedAt:p.first_studied_at}));
  const personalPlan:PersonalLearningPlan={id:row.id,chosenAt:row.chosen_at,reviewedAt:row.reviewed_at,studiedAt:study,
   evidenceStatus:usable?'current':'superseded',reasonAtChoice:saved.focus!.reason,
   baseline:{groups:baseline.groups,excludedGames:baseline.excludedGames},followUp:followUp?{groups:followUp.groups,excludedGames:followUp.excludedGames}:null,history};
  const changed=Boolean(recommended.focus)&&(recommended.focus!.id!==saved.focus!.id||recommended.cohort!==saved.cohort||recommended.timeControl!==saved.timeControl);
  const suggestion=changed?{id:recommended.focus!.id,title:recommended.focus!.title,kept:row.kept_suggestion===suggestionKey(recommended),gameDays:recommended.gameDays,timeControl:recommended.timeControl,cohort:recommended.cohort}:null;
  return {...current,profileId:row.profile_id,gameDays:saved.gameDays,timeControl:saved.timeControl,cohort:saved.cohort,focus,personalPlan,suggestion,
   message:usable?'Your chosen focus stays saved until you change it.':'Saved evidence has changed or is no longer available. Your plan and study history are retained; refresh its evidence or choose another focus.'};
 }

 choose(profile:string,recommended:LearningFocusPlan,expectedPlanId:string|null):void {
  if(!recommended.focus||recommended.profileId!==profile)throw new Error('No verified focus is available to save.');
  this.db.transaction(()=>{
   const current=this.active(profile);
   if((current?.id??null)!==expectedPlanId)throw new Error('Your saved plan changed. Reload before choosing a focus.');
   const itemIds=new Set(recommended.focus!.itemIds);
   for(const source of recommended.focus!.sources){
    const item=this.db.prepare(`SELECT ti.id FROM training_items ti JOIN moves m ON m.id=ti.source_move_id
     WHERE ti.profile_id=? AND ti.game_id=? AND m.ply=? AND ti.mode='blunder_check' AND ti.active=1`).pluck().get(profile,source.gameId,source.ply+1) as string|undefined;
    if(item)itemIds.add(item);
   }
   const evidence:Evidence[]=[];
   for(const itemId of itemIds){
    const item=this.db.prepare(`SELECT game_id,(SELECT id FROM analysis_runs WHERE game_id=ti.game_id AND status='completed' ORDER BY completed_at DESC,rowid DESC LIMIT 1) AS run
     FROM training_items ti WHERE id=? AND profile_id=? AND active=1`).get(itemId,profile) as {game_id:string;run:string}|undefined;
    const hash=trainingExerciseFingerprint(this.db,itemId,'blunder_check');
    if(!item?.run||!hash)throw new Error('Supporting evidence changed. Reload the recommendation.');
    evidence.push({itemId,gameId:item.game_id,runId:item.run,hash});
   }
   if(!evidence.length)throw new Error('No supporting evidence is available.');
   const timestamp=now(),baseline=this.measure(profile,recommended);
   if(current){
    this.firstStudy(current,JSON.parse(current.evidence_json) as Evidence[]);
    this.db.prepare("UPDATE personal_learning_plans SET status='replaced',replaced_at=? WHERE id=?").run(timestamp,current.id);
   }
   this.db.prepare(`INSERT INTO personal_learning_plans(id,profile_id,status,chosen_at,reviewed_at,snapshot_json,evidence_json,baseline_json)
    VALUES (?,?,'active',?,?,?,?,?)`).run(id(),profile,timestamp,timestamp,JSON.stringify(recommended),JSON.stringify(evidence),JSON.stringify(baseline));
  })();
 }

 keep(profile:string,planId:string,recommendation:LearningFocusPlan):void {
  const row=this.active(profile);if(!row||row.id!==planId)throw new Error('Your saved plan changed. Reload it.');
  this.db.prepare('UPDATE personal_learning_plans SET reviewed_at=?,kept_suggestion=? WHERE id=?').run(now(),suggestionKey(recommendation),row.id);
 }

 private firstStudy(row:Row,evidence:Evidence[]):string|null {
  if(row.first_studied_at)return row.first_studied_at;
  // Retained start-time provenance remains meaningful even after later reanalysis.
  const candidates=this.db.prepare(`SELECT ta.id,ta.item_id,ta.answered_at,c.analysis_run_id,c.exercise_fingerprint FROM training_attempts ta
   JOIN training_game_review_context c ON c.attempt_id=ta.id JOIN training_items ti ON ti.id=ta.item_id
   WHERE ti.profile_id=? AND ta.answered_at>=? AND ta.abandoned_at IS NULL AND ta.feedback_json IS NOT NULL
   AND ta.outcome IN ('excellent','partial','incorrect','revealed') ORDER BY ta.answered_at,ta.rowid`).all(row.profile_id,row.chosen_at) as Array<{id:string;item_id:string;answered_at:string;analysis_run_id:string;exercise_fingerprint:string}>;
  const first=candidates.find(c=>evidence.some(e=>e.itemId===c.item_id&&e.runId===c.analysis_run_id&&e.hash===c.exercise_fingerprint));
  if(!first)return null;
  this.db.prepare('UPDATE personal_learning_plans SET first_studied_at=?,first_attempt_id=? WHERE id=? AND first_studied_at IS NULL').run(first.answered_at,first.id,row.id);
  return first.answered_at;
 }

 private measure(profile:string,plan:LearningFocusPlan,after?:string):Baseline {
  const rows=this.db.prepare(`SELECT g.*,ar.id AS run,ar.engine_name,ar.engine_version,ar.depth,ar.multipv,ar.threads,ar.hash_mb,
   (SELECT rule_version FROM game_move_quality WHERE run_id=ar.id LIMIT 1) AS rule_version
   FROM games g JOIN analysis_runs ar ON ar.game_id=g.id AND ar.status='completed'
   WHERE g.profile_id=? AND ar.id=(SELECT id FROM analysis_runs WHERE game_id=g.id AND status='completed' ORDER BY completed_at DESC,rowid DESC LIMIT 1)
   ORDER BY g.played_at DESC,g.id LIMIT 100`).all(profile) as Array<{id:string;run:string;played_at:string|null;result:string;initial_fen:string;headers_json:string;identity_key:string|null;player_color:PlanMeasure['playerColor'];engine_name:string;engine_version:string;depth:number;multipv:number;threads:number;hash_mb:number;rule_version:string|null}>;
  let excludedGames=0;const samples:Sample[]=[];
  for(const row of rows){
   if(learningCohort(row)!==plan.cohort||timeControl(row.headers_json)!==plan.timeControl)continue;
   const date=row.played_at,h=JSON.parse(row.headers_json);
   if(!date||!Number.isFinite(Date.parse(date))||Date.parse(date)>Date.now()||row.result==='*'||row.initial_fen!==new Chess().fen()){excludedGames++;continue;}
   if(after){
    if(Date.parse(date)<=Date.parse(after))continue;
    if(date.slice(0,10)===after.slice(0,10)&&!/^\d{2}:\d{2}:\d{2}$/.test(h.UTCTime??'')){excludedGames++;continue;}
   }else if(plan.gameDays&&Date.parse(date)<Date.now()-plan.gameDays*86400000)continue;
   const count=this.db.prepare(`SELECT COUNT(*) AS moves,COUNT(q.move_id) AS graded,COUNT(DISTINCT q.rule_version) AS methods,
    SUM(CASE WHEN q.grade IN ('mistake','blunder') THEN 1 ELSE 0 END) AS serious,SUM(CASE WHEN q.grade='blunder' THEN 1 ELSE 0 END) AS blunders
    FROM moves m LEFT JOIN game_move_quality q ON q.move_id=m.id AND q.run_id=? WHERE m.game_id=? AND m.mover_color=?`).get(row.run,row.id,row.player_color) as {moves:number;graded:number;methods:number;serious:number;blunders:number};
   if(!count.moves||count.moves!==count.graded||count.methods!==1){excludedGames++;continue;}
   const rating=(value:unknown)=>Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
   samples.push({id:row.id,run:row.run,date,source:gameSource(row.identity_key,row.headers_json),color:row.player_color,moves:count.moves,serious:count.serious,blunders:count.blunders,
    rating:rating(h[row.player_color==='white'?'WhiteElo':'BlackElo']),opponent:rating(h[row.player_color==='white'?'BlackElo':'WhiteElo'])});
  }
  const groups:PlanMeasure[]=[];
  for(const key of new Set(samples.map(s=>`${s.source}:${s.color}`))){
   const scoped=samples.filter(s=>`${s.source}:${s.color}`===key).slice(0,20),first=scoped[0]!;
   const sum=(field:'moves'|'serious'|'blunders')=>scoped.reduce((n,s)=>n+s[field],0);
   const range=(values:Array<number|null>)=>{const valid=values.filter((n):n is number=>n!==null);return valid.length?{min:Math.min(...valid),max:Math.max(...valid),known:valid.length}:null;};
   groups.push({source:first.source,playerColor:first.color,games:scoped.length,ownMoves:sum('moves'),seriousErrors:sum('serious'),blunders:sum('blunders'),errorsPer100Moves:sum('moves')?Math.round(1000*sum('serious')/sum('moves'))/10:null,
    from:scoped.map(s=>s.date).sort()[0]??null,to:scoped.map(s=>s.date).sort().at(-1)??null,learnerRatings:range(scoped.map(s=>s.rating)),opponentRatings:range(scoped.map(s=>s.opponent))});
  }
  return {groups,excludedGames,samples};
 }
}

import {createHash} from 'node:crypto';
import {Chess} from 'chess.js';
import type {LearningFocusPlan,TrainingSessionResponse} from '../../../../packages/contracts/src/api.js';
import type {SqliteDatabase} from '../db/database.js';
import {activeProfileId} from './profile.js';
import {now} from '../lib/ids.js';
import {parseGameDays} from './practice-scope.js';
import {timeControl} from '../analysis/game-quality-service.js';
import {significantMistake,tacticalPunishment,type SavedMoveAssessment} from '../analysis/tactical-punishment.js';
import {forcedMate} from '../games/game-tactical-evidence.js';
import type {V1TrainingService} from './v1-training-service.js';

type Game={result:string;id:string;played_at:string;headers_json:string;white_name:string;black_name:string;player_color:'white'|'black';run_id:string;cohort:string;control:string};
type Item={id:string;game_id:string;source_move_id:string;ply:number;fenBefore:string;fenAfter:string;evidence_json:string;due_at:string;chance_loss:number|null;attempts:number;successes:number};
export class LearningFocusService {
 constructor(private readonly db:SqliteDatabase,private readonly training:V1TrainingService){}
 get(gameDays:number|null=null,requestedControl?:string):LearningFocusPlan {
  gameDays=parseGameDays(gameDays);const profile=activeProfileId(this.db);
  if(!profile)return {profileId:null,gameDays,timeControl:null,timeControls:[],cohort:null,eligibleGames:0,analysedGames:0,focus:null,message:'Import and analyse some games to find a learning focus.'};
  const games=(this.db.prepare(`SELECT g.*,ar.id AS run_id,ar.engine_name,ar.engine_version,ar.depth,ar.multipv,ar.threads,ar.hash_mb,
    (SELECT rule_version FROM game_move_quality WHERE run_id=ar.id LIMIT 1) AS rule_version
    FROM games g JOIN analysis_runs ar ON ar.game_id=g.id AND ar.status='completed'
    WHERE g.profile_id=? AND ar.id=(SELECT id FROM analysis_runs WHERE game_id=g.id AND status='completed' ORDER BY completed_at DESC,id DESC LIMIT 1)
    ORDER BY g.played_at DESC,g.id LIMIT 100`).all(profile) as Array<Game&{engine_name:string;engine_version:string;depth:number;multipv:number;threads:number;hash_mb:number;rule_version:string|null;initial_fen:string}>)
    .filter(g=>g.played_at&&Number.isFinite(Date.parse(g.played_at))&&g.result!=='*'&&g.initial_fen===new Chess().fen()&&(!gameDays||Date.parse(g.played_at)>=Date.now()-gameDays*86400000))
    .map(g=>({...g,control:timeControl(g.headers_json),cohort:createHash('sha256').update(JSON.stringify([g.engine_name,g.engine_version,g.depth,g.multipv,g.threads,g.hash_mb,g.rule_version])).digest('hex').slice(0,20)}));
  const controls=[...new Set(games.map(g=>g.control))].sort(),control=requestedControl??(controls.includes('rapid')?'rapid':controls[0]??null);
  if(requestedControl&&!controls.includes(requestedControl))throw new Error('No analysed games for that time control.');
  const sameControl=games.filter(g=>g.control===control),cohort=sameControl[0]?.cohort??null;
  const eligible=sameControl.filter(g=>g.cohort===cohort),byGame=new Map(eligible.map(g=>[g.id,g]));
  const groups=new Map<string,Array<Item&{game:Game;pattern:string}>>();
  const savedMateLimit=Number(this.db.prepare("SELECT value FROM app_state WHERE key=?").pluck().get(`practice_mate:${profile}`)??2);
  const mateLimit=Number.isInteger(savedMateLimit)&&savedMateLimit>=1&&savedMateLimit<=4?savedMateLimit:2;
  let mateChecks=0;
  for(const row of this.db.prepare(`SELECT ti.id,ti.game_id,ti.source_move_id,m.ply,p.fen AS fenBefore,a.fen AS fenAfter,bci.evidence_json,rs.due_at,rs.attempts,rs.successes
    FROM training_items ti JOIN blunder_check_items bci ON bci.item_id=ti.id JOIN moves m ON m.id=ti.source_move_id
    JOIN positions p ON p.id=m.from_position_id JOIN positions a ON a.id=m.to_position_id JOIN review_states rs ON rs.item_id=ti.id
    WHERE ti.profile_id=? AND ti.active=1 AND ti.mode='blunder_check' ORDER BY ti.created_at DESC,m.ply LIMIT 2000`).all(profile) as Item[]){
   const game=byGame.get(row.game_id);if(!game)continue;
   let evidence:{detector?:string;exerciseKind?:string;proof?:{kind:string;mateIn?:number;pvUci?:string[]}};
   try{evidence=JSON.parse(row.evidence_json);}catch{continue;}
   if(evidence.detector!=='tactical-punishment-v4'||!Array.isArray(evidence.proof?.pvUci)||!['safety','missed_opportunity'].includes(evidence.exerciseKind??''))continue;
   const attacking=evidence.exerciseKind==='missed_opportunity',fen=attacking?row.fenBefore:row.fenAfter;
   const line=this.db.prepare(`SELECT el.move_uci AS uci,el.mate_in_white AS mate,el.pv_uci_json AS pv FROM engine_lines el
     JOIN position_analyses pa ON pa.id=el.position_analysis_id JOIN positions p ON p.id=pa.position_id
     WHERE pa.run_id=? AND p.game_id=? AND p.fen=? AND el.move_uci=? ORDER BY el.rank LIMIT 1`)
     .get(game.run_id,game.id,fen,evidence.proof!.pvUci![0]) as {uci:string;mate:number|null;pv:string}|undefined;
   if(!line)continue;
   let pv:string[];try{pv=JSON.parse(line.pv);}catch{continue;}
   if(JSON.stringify(pv)!==JSON.stringify(evidence.proof!.pvUci))continue;
   const proof=tacticalPunishment(row.fenBefore,fen,line.uci,line.pv,line.mate);if(!proof)continue;
   const assessment=this.db.prepare('SELECT * FROM move_assessments WHERE run_id=? AND move_id=?').get(game.run_id,row.source_move_id) as SavedMoveAssessment|undefined;
   if(!assessment||!significantMistake(assessment,game.player_color)&&!(attacking&&proof.kind==='forced_mate'))continue;
   if(proof.kind==='forced_mate'&&(proof.mateIn>mateLimit||++mateChecks>8||forcedMate(fen,line.uci,proof.mateIn,1000)!==true))continue;
   const pattern=proof.kind==='forced_mate'?(attacking?'Finding short mates':'Preventing mating threats'):(attacking?'Taking winning opportunities':'Preventing material loss');
   const key=(attacking?'attack':'defend')+':'+proof.kind;
   row.chance_loss=this.db.prepare('SELECT chance_loss FROM game_move_quality WHERE run_id=? AND move_id=?').pluck().get(game.run_id,row.source_move_id) as number|undefined??null;
   const list=groups.get(key)??[];list.push({...row,game,pattern});groups.set(key,list);
  }
  const ranked=[...groups].map(([key,items])=>{
   const unique=[...new Map([...items].sort((a,b)=>(a.chance_loss??0)-(b.chance_loss??0)).map(item=>[item.game_id,item])).values()];
   const recent=unique.reduce((sum,item)=>sum+Math.exp(-Math.max(0,Date.now()-Date.parse(item.game.played_at))/2592000000),0);
   return {key,items,unique,score:recent,severity:unique.reduce((sum,item)=>sum+(item.chance_loss??0),0)/unique.length};
  }).sort((a,b)=>b.score-a.score||b.severity-a.severity||a.key.localeCompare(b.key));
  const top=ranked[0];
  const due=top?.items.filter(item=>item.due_at<=now()).sort((a,b)=>(a.attempts-a.successes>0?-1:0)-(b.attempts-b.successes>0?-1:0)||b.game.played_at.localeCompare(a.game.played_at))??[];
  const selected:typeof due=[];for(const item of due){if(!selected.some(chosen=>chosen.game_id===item.game_id))selected.push(item);if(selected.length===3)break;}
  const focus=top?{id:top.key,title:top.unique[0]!.pattern,provisional:top.unique.length<2,games:top.unique.length,
    reason:`${top.unique.length<2?'Provisional: one supporting game.':'Recurring pattern.'} Seen in ${top.unique.length} of ${eligible.length} comparable analysed games. Recent recurrence is prioritised, then severity.`,
    nextStep:selected.length?`Practise ${selected.length} due positions from different games, then revisit the supporting decisions.`:'No positions are due. Review a supporting game or return after the next scheduled review.',
    dueCount:selected.length,nextDueAt:top.items.map(item=>item.due_at).sort()[0]??null,
    sources:top.unique.sort((a,b)=>b.game.played_at.localeCompare(a.game.played_at)).slice(0,5).map(item=>({gameId:item.game_id,ply:item.ply-1,white:item.game.white_name,black:item.game.black_name,playedAt:item.game.played_at})),itemIds:selected.map(item=>item.id)}:null;
  return {profileId:profile,gameDays,timeControl:control,timeControls:controls,cohort,eligibleGames:eligible.length,analysedGames:games.length,focus,
    message:focus?'Based on verified tactical exercises in up to 100 recent analysed games. Other weaknesses may be unclassified.':'No verified tactical pattern is available in this evidence window. This is not proof of mistake-free play.'};
 }
 start(profileId:string,focusId:string,gameDays:number|null=null,control?:string):TrainingSessionResponse{
  if(profileId!==activeProfileId(this.db))throw new Error('Your player changed. Reload the learning focus.');
  const active=this.training.activeSession();if(active)return {...active,message:'Resume your existing practice first; the new focus can follow.'};
  const plan=this.get(gameDays,control);
  if(plan.focus?.id!==focusId||!plan.focus.itemIds.length)throw new Error('This focus changed or no positions are due. Refresh the plan.');
  return this.training.createSession(3,gameDays,plan.focus.itemIds);
 }
}

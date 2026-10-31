import {tacticalEvidence,verifiedMatingAnswers} from "./game-tactical-evidence.js";
import { CandidateGenerator } from "../analysis/candidate-generator.js";
import { Chess } from "chess.js";
import type { GameOpeningConnection,GameReplayAction,GameReplayCheckpoint,GameReplayMove,GameReplayResponse,GameReviewTeachingLine,Color,GamePracticeRound } from "../../../../packages/contracts/src/api.js";
import { GAME_PRACTICE_FILTERS, selectGamePractice } from "../../../../packages/contracts/src/game-practice.js";
import type { SqliteDatabase } from "../db/database.js";
import { activeProfileId } from "../training/profile.js";
import { id,now } from "../lib/ids.js";
import { openingPositionKey } from "../openings/opening-content.js";
import type { OpeningGameService } from "../openings/opening-game-service.js";
import type { OpeningReviewService } from "../openings/opening-review-service.js";

type Answer={uci:string;san:string};
type Point=Omit<GameReplayCheckpoint,"attempts"|"recalled"|"canRecall">&{
  matingAnswers?:Record<string,number>; answers:Answer[]; teachingLines?:GameReviewTeachingLine[]; priorityLoss?:number; answerNotes?:Record<string,string>; explanation:string; sourceMoveId:string; repertoireId?:string; positionId?:string|undefined;
};
type Snapshot={playerColor:Color;initialFen:string;moves:GameReplayMove[];points:Point[];analysisPending:boolean;evidenceVersion?:number};
type State={ply:number;point:string|null;phase:GameReplayResponse["phase"];outcome:string;message:string;answerMove:string|null;tries:number;keyStudyComplete?:boolean;keyStudySeen?:string[];practice?:GamePracticeRound};
type Saved={snapshot_id:string;version:number;state_json:string;content_json:string;source_revision:string;created_at:string};
const initial=(ply=0,point:Point|undefined=undefined):State=>({ply,point:point?.id??null,phase:point?.answers.length?"question":"replay",outcome:"",message:"",answerMove:null,tries:0});
const apply=(fen:string,uci:string)=>{const chess=new Chess(fen);const move=chess.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci.slice(4)}:{})});if(!move)throw new Error("Choose a legal move.");return {fen:chess.fen(),san:move.san};};

export class GameReplayService {
  constructor(private readonly db:SqliteDatabase,private readonly openings:OpeningGameService,
    private readonly openingReviews:OpeningReviewService,private readonly tolerance=40) {}

  private game(gameId:string) {
    const profile=activeProfileId(this.db);
    const game=this.db.prepare("SELECT profile_id,player_color,initial_fen FROM games WHERE id=? AND profile_id=?").get(gameId,profile) as {profile_id:string;player_color:Color;initial_fen:string}|undefined;
    if(!game)throw new Error("Game not found.");return game;
  }
  private revision(gameId:string) {
    const run=this.db.prepare("SELECT id FROM analysis_runs WHERE game_id=? AND status='completed' ORDER BY completed_at DESC,id DESC LIMIT 1").pluck().get(gameId) as string|undefined;
    const opening=this.db.prepare("SELECT revision FROM opening_match_revision WHERE id=1").pluck().get();
    return {run,revision:JSON.stringify([run??null,opening,this.tolerance,"teaching-v3"])};
  }
  private saved(gameId:string):Saved|undefined {
    const game=this.game(gameId);
    return this.db.prepare(`SELECT replay.snapshot_id,replay.version,replay.state_json,snapshot.content_json,snapshot.source_revision,snapshot.created_at
      FROM game_review_replays replay JOIN game_review_snapshots snapshot ON snapshot.id=replay.snapshot_id
      WHERE replay.game_id=? AND replay.profile_id=?`).get(gameId,game.profile_id) as Saved|undefined;
  }
  private makeSnapshot(gameId:string) {
    const game=this.game(gameId),source=this.revision(gameId);
    const rows=this.db.prepare(`SELECT m.id,m.ply,m.move_number AS moveNumber,m.mover_color AS moverColor,m.uci,m.san,
      before.fen AS fenBefore,after.fen AS fenAfter,m.from_position_id AS positionId
      FROM moves m JOIN positions before ON before.id=m.from_position_id JOIN positions after ON after.id=m.to_position_id
      WHERE m.game_id=? ORDER BY m.ply`).all(gameId) as Array<GameReplayMove&{id:string;positionId:string}>;
    const points:Point[]=[];
    const opening=this.openings.matchGame(gameId,game.profile_id),departure=opening?.departure;
    if(opening&&departure&&["player_deviation","opponent_deviation","repertoire_ended"].includes(opening.status)) {
      const move=rows.find(move=>move.ply===departure.ply);
      if(move) {
        const answers=opening.status==="player_deviation"?this.openingAnswers(opening.repertoire.id,departure.fenBefore,game.profile_id):[];
        const kind=opening.status==="player_deviation"?"opening":opening.status==="opponent_deviation"?"opponent":"gap";
        points.push({id:`opening:${move.id}`,ply:move.ply-1,kind,label:kind==="opening"?"Repertoire difference":kind==="opponent"?"Opponent left your line":"Preparation ended",
          question:kind==="opening"?"Recall one of your saved repertoire responses.":kind==="opponent"?"Your opponent left the prepared line. There is no taught move to recall here.":"Your saved preparation ends here. This is a content gap, not a chess mistake.",
          answers,...(kind==="opening"?{answerNotes:this.openingNotes(opening.repertoire.id,departure.fenBefore,answers,game.profile_id)}:{}),explanation:kind==="opening"?this.openingExplanation(opening):"Use the position and opening principles. No answer has been invented for this gap.",
          sourceMoveId:move.id,repertoireId:opening.repertoire.id,
          positionId:this.db.prepare("SELECT id FROM opening_positions WHERE position_key=?").pluck().get(openingPositionKey(departure.fenBefore)) as string|undefined,
          canSchedule:answers.length>0});
      }
    }
    // A game may transpose back into preparation after its first departure.
    // Keep later learner departures at known positions as separate decisions.
    if(opening)for(const move of rows) {
      if(move.moverColor!==game.player_color||points.some(point=>point.id===`opening:${move.id}`))continue;
      const answers=this.openingAnswers(opening.repertoire.id,move.fenBefore,game.profile_id);
      if(!answers.length||answers.some(answer=>answer.uci===move.uci))continue;
      const positionId=this.db.prepare("SELECT id FROM opening_positions WHERE position_key=?").pluck().get(openingPositionKey(move.fenBefore)) as string;
      const annotation=this.db.prepare(`SELECT a.summary FROM opening_moves m JOIN opening_move_annotations a ON a.move_id=m.id
        WHERE m.repertoire_id=? AND m.from_position_id=? AND m.move_uci=?`).pluck().get(opening.repertoire.id,positionId,answers[0]!.uci) as string|undefined;
      points.push({id:`opening:${move.id}`,ply:move.ply-1,kind:"opening",label:"Repertoire difference",
        question:"Recall one of your saved repertoire responses.",answers,answerNotes:this.openingNotes(opening.repertoire.id,move.fenBefore,answers,game.profile_id),
        explanation:`A repertoire difference is not automatically a chess mistake. ${annotation??"These are your saved responses at this position."}`,
        sourceMoveId:move.id,repertoireId:opening.repertoire.id,positionId,canSchedule:true});
    }
    if(source.run) {
      const mistakes=this.db.prepare(`SELECT m.id,ma.classification,ma.comparison_loss,ma.meaningful FROM moves m JOIN move_assessments ma ON ma.move_id=m.id
        WHERE m.game_id=? AND ma.run_id=? AND (ma.meaningful=1 OR ma.eval_before_mate_white * CASE WHEN m.mover_color='white' THEN 1 ELSE -1 END>0) AND m.mover_color=? ORDER BY m.ply`).all(gameId,source.run,game.player_color) as Array<{id:string;classification:string;comparison_loss:number;meaningful:number}>;
      for(const mistake of mistakes) {
        const move=rows.find(move=>move.id===mistake.id);if(!move)continue;
        const lines=this.db.prepare(`SELECT el.move_uci AS uci,el.move_san AS san,el.centipawns_white AS cp,el.mate_in_white AS mate,el.pv_uci_json AS pv
          FROM position_analyses pa JOIN engine_lines el ON el.position_analysis_id=pa.id
          WHERE pa.run_id=? AND pa.position_id=? ORDER BY el.rank`).all(source.run,move.positionId) as Array<Answer&{cp:number|null;mate:number|null;pv:string}>;
        const legal=lines.filter(line=>{try {apply(move.fenBefore,line.uci);return line.cp!==null||line.mate!==null;}catch{return false;}});
        const utility=(line:typeof lines[number])=>(line.cp??((line.mate??0)>0?100_000-Math.min(100,line.mate!)*100:-100_000+Math.min(100,Math.abs(line.mate!))*100))*(game.player_color==="white"?1:-1);
        const best=Math.max(...legal.map(utility));
        let answers=legal.filter(line=>best-utility(line)<=this.tolerance).map(({uci,san})=>({uci,san}));
        const leading=legal.find(line=>utility(line)===best);
        const teachingLines:GameReviewTeachingLine[]=[];
        if(leading)teachingLines.push(this.teachingLine(move.fenBefore,leading.pv,leading.uci,"A better continuation"));
        const reply=this.db.prepare(`SELECT el.move_uci AS uci,el.pv_uci_json AS pv,el.mate_in_white AS mate FROM position_analyses pa
          JOIN engine_lines el ON el.position_analysis_id=pa.id JOIN moves m ON m.to_position_id=pa.position_id
          WHERE m.id=? AND pa.run_id=? AND el.rank=1`).get(move.id,source.run) as {uci:string;pv:string;mate:number|null}|undefined;
        if(reply){let pv:string[]=[];try{pv=JSON.parse(reply.pv);}catch{};
          teachingLines.push(this.teachingLine(move.fenBefore,JSON.stringify([move.uci,...(Array.isArray(pv)&&pv[0]===reply.uci?pv:[reply.uci])]),move.uci,"What the opponent could do after your game move"));}
        const evidence=tacticalEvidence(move.fenBefore,move.fenAfter,move.uci,game.player_color,leading,reply,Boolean(mistake.meaningful));
        const matingAnswers=evidence.mateIn!==undefined?verifiedMatingAnswers(move.fenBefore,legal,game.player_color):undefined;
        if(matingAnswers&&Object.keys(matingAnswers).length){
          evidence.mateIn=Math.min(...Object.values(matingAnswers));evidence.practiceEligible=true;evidence.categories.push('mates');evidence.pattern='missed mate';
          answers=legal.filter(line=>matingAnswers[line.uci]!==undefined).map(({uci,san})=>({uci,san}));
        }
        if(!mistake.meaningful&&evidence.mateIn===undefined)continue;
        const tactical=this.db.prepare(`SELECT bci.explanation FROM training_items ti JOIN blunder_check_items bci ON bci.item_id=ti.id
          WHERE ti.source_move_id=? AND ti.active=1`).pluck().get(move.id) as string|undefined;
        points.push({id:`engine:${move.id}`,ply:move.ply-1,kind:"engine",label:!mistake.meaningful?"Missed mating opportunity":`Analysed ${mistake.classification}`,
          ...evidence,...(matingAnswers?{matingAnswers}:{}),
          question:evidence.categories.includes("mates")?"Find the first move of a forced mate. You can study the continuation after answering.":answers.length?"Find an improvement for your side before seeing the stored analysis.":"This move was flagged by analysis, but a legal answer is not available yet.",
          answers,teachingLines,priorityLoss:mistake.comparison_loss,explanation:(tactical?`${tactical} `:"")+`The stored engine analysis flagged ${move.san} as ${mistake.classification}. Answers shown are legal stored candidates within ${(this.tolerance/100).toFixed(2)} pawns of the best stored evaluation for your side when measured in pawns. Mate outcomes are compared separately. Unlisted moves have not been graded.`,
          sourceMoveId:move.id,canSchedule:answers.length>0});
      }
    }
    points.sort((a,b)=>a.ply-b.ply||(a.kind==="opening"?-1:b.kind==="opening"?1:a.id.localeCompare(b.id)));
    const enginePoints=points.filter(point=>point.kind==='engine'&&point.answers.length&&point.practiceEligible!==false);
    const recent=new Map<string,{ply:number;group:string}>(),groups=new Map<string,string>();
    for(const point of enginePoints){
      const root=point.teachingLines?.[0]?.steps[0]?.uci??point.id,previous=recent.get(root);
      const group=previous&&point.ply-previous.ply<=2?previous.group:point.id;
      groups.set(point.id,group);recent.set(root,{ply:point.ply,group});
    }
    const picked=new Set<string>();let keyCount=0;
    for(const point of [...enginePoints].sort((a,b)=>(b.priorityLoss??0)-(a.priorityLoss??0)||a.ply-b.ply)){
      const group=groups.get(point.id)!;if(picked.has(group)||keyCount>=3)continue;
      picked.add(group);point.keyDecision=true;keyCount++;
    }
    for(const point of points.filter(point=>point.kind==='opening'&&point.answers.length)){
      if(keyCount>=3)break;point.keyDecision=true;keyCount++;
    }
    const content:Snapshot={playerColor:game.player_color,initialFen:game.initial_fen,moves:rows.map(({id:_,positionId:__,...move})=>move),points,analysisPending:!source.run,evidenceVersion:1};
    const snapshot=id(),created=now(),state=initial(0,points.find(point=>point.ply===0));
    this.db.prepare("INSERT INTO game_review_snapshots(id,game_id,profile_id,source_revision,content_json,created_at) VALUES(?,?,?,?,?,?)").run(snapshot,gameId,game.profile_id,source.revision,JSON.stringify(content),created);
    this.db.prepare(`INSERT INTO game_review_replays(game_id,profile_id,snapshot_id,state_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(game_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,state_json=excluded.state_json,version=game_review_replays.version+1,updated_at=excluded.updated_at`).run(gameId,game.profile_id,snapshot,JSON.stringify(state),created);
  }
  private teachingLine(fen:string,pvJson:string,root:string,label:string):GameReviewTeachingLine {
    let pv:unknown;try{pv=JSON.parse(pvJson);}catch{pv=[];}
    const moves=Array.isArray(pv)&&pv[0]===root?pv:[root],steps:GameReviewTeachingLine['steps']=[];
    for(const uci of moves.slice(0,8)){
      if(typeof uci!=='string'||!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))break;
      try{const result=apply(fen,uci);fen=result.fen;steps.push({fen,uci,san:result.san});}catch{break;}
    }
    return {label,steps};
  }
  private practicePoint(point:Point|undefined,state:State):Point|undefined {
    if(!point?.matingAnswers||!state.practice)return point;
    return {...point,answers:point.answers.filter(answer=>point.matingAnswers![answer.uci]!<=(state.practice?.maxMateIn??2))};
  }
  private openingAnswers(repertoireId:string,fen:string,profile:string):Answer[] {
    return this.db.prepare(`SELECT DISTINCT m.move_uci AS uci,m.move_san AS san FROM opening_moves m
      JOIN opening_positions p ON p.id=m.from_position_id
      LEFT JOIN opening_repertoire_preferences rp ON rp.repertoire_id=m.repertoire_id AND rp.profile_id=?
      WHERE m.repertoire_id=? AND p.position_key=? AND m.role='learner' AND m.active=1 AND rp.archived_at IS NULL
        AND EXISTS(SELECT 1 FROM opening_line_moves lm JOIN opening_lines l ON l.id=lm.line_id AND l.active=1
          JOIN opening_chapters c ON c.id=l.chapter_id AND c.active=1
          LEFT JOIN opening_line_preferences lp ON lp.line_id=l.id AND lp.profile_id=?
          WHERE lm.move_id=m.id AND lp.archived_at IS NULL) ORDER BY m.sort_order,m.move_san`)
      .all(profile,repertoireId,openingPositionKey(fen),profile) as Answer[];
  }
  private openingNotes(repertoireId:string,fen:string,answers:Answer[],profile:string):Record<string,string> {
    return Object.fromEntries(answers.map(answer=>{
      const note=this.db.prepare(`SELECT a.summary,a.changes_json,a.resulting_plan,a.tactical_warning,lc.comment
        FROM opening_moves m JOIN opening_positions p ON p.id=m.from_position_id
        JOIN opening_move_annotations a ON a.move_id=m.id
        LEFT JOIN opening_learning_comments lc ON lc.move_id=m.id AND lc.profile_id=?
        WHERE m.repertoire_id=? AND p.position_key=? AND m.move_uci=?`).get(profile,repertoireId,openingPositionKey(fen),answer.uci) as
        {summary:string;changes_json:string;resulting_plan:string|null;tactical_warning:string|null;comment:string|null}|undefined;
      return [answer.uci,["A repertoire difference is not automatically a chess mistake.",`Saved notes for ${answer.san}:`,
        note?.summary,...(note?JSON.parse(note.changes_json) as string[]:[]),note?.resulting_plan,note?.tactical_warning,note?.comment].filter(Boolean).join(" ")];
    }));
  }
  private openingExplanation(opening:GameOpeningConnection) {
    const note=opening.expectedMove?.explanation;
    return ["A repertoire difference is not automatically a chess mistake.",note?.summary,...(note?.changes??[]),note?.resultingPlan,note?.tacticalWarning,note?.personalComment].filter(Boolean).join(" ");
  }
  get(gameId:string):GameReplayResponse {
    const saved=this.saved(gameId);
    const unusedBeforeAnalysis=saved&&saved.version===0&&(JSON.parse(saved.content_json) as Snapshot).analysisPending
      &&Boolean(this.revision(gameId).run)&&!(this.db.prepare("SELECT 1 FROM game_review_local_attempts WHERE snapshot_id=? LIMIT 1").get(saved.snapshot_id));
    if(!saved||unusedBeforeAnalysis)this.db.transaction(()=>this.makeSnapshot(gameId))();
    return this.response(gameId,this.saved(gameId)!);
  }
  private response(gameId:string,saved:Saved):GameReplayResponse {
    const content=JSON.parse(saved.content_json) as Snapshot,state=JSON.parse(saved.state_json) as State;
    const point=this.practicePoint(content.points.find(point=>point.id===state.point),state);
    const fen=state.ply===0?content.initialFen:content.moves[state.ply-1]!.fenAfter;
    const onBoard=state.phase==="feedback"&&state.answerMove?apply(fen,state.answerMove):null;
    const attempts=this.db.prepare("SELECT checkpoint_id,result FROM game_review_local_attempts WHERE snapshot_id=?").all(saved.snapshot_id) as Array<{checkpoint_id:string;result:string}>;
    return {gameId,snapshotId:saved.snapshot_id,savedAt:saved.created_at,version:saved.version,playerColor:content.playerColor,initialFen:content.initialFen,moves:content.moves,
      checkpoints:content.points.map(({matingAnswers:________,answers,answerNotes:_____,teachingLines:______,priorityLoss:_______,explanation:_,sourceMoveId:__,repertoireId:___,positionId:____,...point})=>({...point,canRecall:answers.length>0,
        attempts:attempts.filter(attempt=>attempt.checkpoint_id===point.id&&attempt.result!=="shown").length,
        recalled:attempts.some(attempt=>attempt.checkpoint_id===point.id&&attempt.result==="recalled")})),
      keyStudyComplete:state.keyStudyComplete??false,...(state.practice?{practice:state.practice}:{}),currentPly:state.ply,activeCheckpointId:state.point,phase:state.phase,displayFen:onBoard?.fen??fen,
      displayMove:onBoard?state.answerMove:state.ply?content.moves[state.ply-1]!.uci:null,
      tacticalEvidenceAvailable:content.evidenceVersion===1,maxMateIn:Number(this.db.prepare("SELECT value FROM app_state WHERE key=?").pluck().get(`practice_mate:${this.game(gameId).profile_id}`)??2),
      analysisPending:content.analysisPending,updatesAvailable:this.revision(gameId).revision!==saved.source_revision,
      feedback:state.message||state.phase==="feedback"?{message:state.message,outcome:state.outcome,answers:state.phase==="feedback"?point?.answers??[]:[],explanation:state.phase==="feedback"?(point?.answerNotes?.[state.answerMove??""]??point?.explanation??""):"",...(state.phase==="feedback"&&point?.teachingLines?{teachingLines:point.teachingLines}:{})}:null};
  }
  act(gameId:string,input:GameReplayAction):GameReplayResponse {
    return this.db.transaction(()=>{
      const saved=this.saved(gameId);if(!saved||saved.snapshot_id!==input.snapshotId||saved.version!==input.version)throw new Error("This game review changed in another tab. Reload the saved review before continuing.");
      const content=JSON.parse(saved.content_json) as Snapshot;let state=JSON.parse(saved.state_json) as State;
      const point=this.practicePoint(content.points.find(point=>point.id===state.point),state);
      const at=(ply:number,pointId?:string)=>{
        if(!Number.isSafeInteger(ply)||ply<0||ply>content.moves.length)throw new Error("Choose a position inside this game.");
        const selected=pointId?content.points.find(point=>point.id===pointId&&point.ply===ply):content.points.find(point=>point.ply===ply);
        if(pointId&&!selected)throw new Error("This decision is not in the saved game review.");return {...initial(ply,selected),keyStudyComplete:state.keyStudyComplete??false,...(state.keyStudySeen?{keyStudySeen:state.keyStudySeen}:{})};
      };
      if(state.practice?.status==='active'&&['next','previous','jump','skip','key_study','next_key'].includes(input.action))
        throw new Error('Finish or exit focused practice before navigating the full game.');
      if(input.action==='practice_start') {
        const filters=input.filters;
        if(!filters?.length||filters.some(filter=>!GAME_PRACTICE_FILTERS.includes(filter))||new Set(filters).size!==filters.length
          ||(filters.includes('recommended')&&filters.length>1))throw new Error('Choose Recommended or one or more practice categories.');
        const maxMateIn=input.maxMateIn??2;
        if(!Number.isInteger(maxMateIn)||maxMateIn<1||maxMateIn>4)throw new Error('Choose a mate limit from 1 to 4 moves.');
        if(filters.some(filter=>['attacking','defending','mates'].includes(filter))&&content.evidenceVersion!==1)throw new Error('Refresh saved feedback to enable verified tactical filters.');
        const selected=selectGamePractice(content.points.map(candidate=>({...candidate,canRecall:candidate.answers.length>0})),filters,maxMateIn);
        this.db.prepare("INSERT INTO app_state(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(`practice_mate:${this.game(gameId).profile_id}`,String(maxMateIn));
        if(!selected.length)throw new Error(content.analysisPending?'No saved answers match. Engine analysis has not been included in this review.':'No saved answers match these practice categories.');
        state={...at(selected[0]!.ply,selected[0]!.id),practice:{filters,maxMateIn,checkpointIds:selected.map(candidate=>candidate.id),reviewedIds:[],skippedIds:[],status:'active'}};
      } else if(input.action==='practice_next'||input.action==='practice_skip') {
        const round=state.practice;
        if(round?.status!=='active'||!point||!round.checkpointIds.includes(point.id))throw new Error('Start focused practice first.');
        if(input.action==='practice_next'&&state.phase!=='feedback')throw new Error('Try the position, show the answer or skip it before continuing.');
        if(input.action==='practice_skip'&&state.phase!=='question')throw new Error('This position already has feedback. Continue to the next position.');
        const reviewedIds=input.action==='practice_next'?[...new Set([...round.reviewedIds,point.id])]:round.reviewedIds;
        const skippedIds=input.action==='practice_skip'?[...new Set([...round.skippedIds,point.id])]:round.skippedIds;
        const nextId=round.checkpointIds.find(checkpoint=>!reviewedIds.includes(checkpoint)&&!skippedIds.includes(checkpoint));
        const next=content.points.find(candidate=>candidate.id===nextId);
        const practice:GamePracticeRound={...round,reviewedIds,skippedIds,status:next?'active':'completed'};
        state=next?{...at(next.ply,next.id),practice}:{...state,practice};
        if(!next&&input.action==='practice_skip')state={...initial(state.ply),practice};
      } else if(input.action==='practice_exit') {
        const {practice:_,...replay}=state;state=replay;
      } else if(input.action==='key_study'){
        const first=content.points.find(point=>point.keyDecision&&point.answers.length);
        if(!first)throw new Error('No key decisions have saved answers in this review. Refresh after analysis.');
        state={...at(first.ply,first.id),keyStudySeen:[],keyStudyComplete:false};
      } else if(input.action==='next_key'){
        if(state.phase!=='feedback')throw new Error('Try the decision or show the answer before moving on.');
        const keys=content.points.filter(point=>point.keyDecision&&point.answers.length);
        const index=keys.findIndex(candidate=>candidate.id===point?.id);
        if(index<0)throw new Error('Choose a recommended key decision first.');
        const seen=[...new Set([...(state.keyStudySeen??[]),point!.id])];
        const next=keys.slice(index+1).find(candidate=>!seen.includes(candidate.id))??keys.find(candidate=>!seen.includes(candidate.id));
        state=next?{...at(next.ply,next.id),keyStudySeen:seen}:{...state,keyStudySeen:seen,keyStudyComplete:true};
      } else if(input.action==="latest") {
        if(this.revision(gameId).revision!==saved.source_revision)this.makeSnapshot(gameId);
        const latest=this.saved(gameId)!;
        return this.act(gameId,{snapshotId:latest.snapshot_id,version:latest.version,action:"jump",ply:input.ply??0});
      }
      else if(input.action==="refresh") {this.makeSnapshot(gameId);return this.get(gameId);}
      else if(input.action==="skip")state=at(Math.min(content.moves.length,state.ply+1));
      else if(input.action==="next") {
        if(state.phase==="question")throw new Error("Try a move or show the answer before continuing.");
        state=at(Math.min(content.moves.length,state.ply+1));
      } else if(input.action==="previous")state=at(Math.max(0,state.ply-1));
      else if(input.action==="jump")state=at(input.ply??-1,input.checkpointId);
      else if(input.action==="retry") {if(!point?.answers.length)throw new Error("There is no saved answer at this decision.");state={...initial(point.ply,point),...(state.practice?.status==='active'?{practice:state.practice}:{})};}
      else if(input.action==="answer"||input.action==="reveal") {
        if(!point?.answers.length||state.phase!=="question")throw new Error("Open a recall decision first.");
        const fen=state.ply===0?content.initialFen:content.moves[state.ply-1]!.fenAfter;
        let result="shown",uci:string|null=null;
        if(input.action==="answer") {
          uci=input.moveUci??"";if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error("Choose a legal move on the board.");
          const played=apply(fen,uci);state.tries++;
          if(point.answers.some(answer=>answer.uci===uci)) {
            const earlierPractice=state.practice?.status==='active'&&Boolean(this.db.prepare(`SELECT 1 FROM game_review_local_attempts
              WHERE snapshot_id=? AND checkpoint_id=? AND created_at>=? LIMIT 1`).get(saved.snapshot_id,point.id,now().slice(0,10)));
            result=state.tries===1&&!earlierPractice?"recalled":"after_retry";state.phase="feedback";state.answerMove=uci;
            state.message=`${played.san} is an accepted ${point.kind==="opening"?"repertoire response":"stored engine improvement"}${state.tries>1?" after another try":earlierPractice?" after earlier practice today":""}.`;
          } else {result="unverified";state.message=point.kind==="opening"?`${played.san} is not a saved response in this review. It may still be a good chess move. Try again or show the answer.`:`${played.san} is not among the accepted stored candidates. Other moves have not been graded here. Try again or show the answer.`;}
        } else {state.phase="feedback";state.answerMove=point.answers[0]!.uci;state.message="Answer shown. This was helped practice, not an unassisted recall.";}
        state.outcome=result;
        this.db.prepare("INSERT INTO game_review_local_attempts(id,snapshot_id,checkpoint_id,move_uci,result,created_at) VALUES(?,?,?,?,?,?)").run(id(),saved.snapshot_id,point.id,uci,result,now());
      } else if(input.action==="schedule") {
        if(!point?.canSchedule||state.phase!=="feedback")throw new Error("Reveal or recall this decision before choosing later practice.");
        if(this.revision(gameId).revision!==saved.source_revision)throw new Error("Your analysis or repertoire changed. Refresh saved feedback before scheduling this decision.");
        if(point.kind==="opening"&&point.repertoireId&&point.positionId) {
          this.openingReviews.schedulePosition(point.repertoireId,point.positionId);state.message="Your existing repertoire position is ready for later opening practice. No recall result was recorded.";
        } else {
          const profile=this.game(gameId).profile_id,run=this.revision(gameId).run;
          if(!run)throw new Error('Saved engine analysis is no longer available.');
          const item=new CandidateGenerator(this.db).ensureForMove(gameId,run,point.sourceMoveId);
          const existing=this.db.prepare('SELECT due_at FROM game_review_practice_followups WHERE profile_id=? AND source_move_id=?')
            .get(profile,point.sourceMoveId) as {due_at:string}|undefined;
          const due=existing?String(this.db.prepare('SELECT due_at FROM review_states WHERE item_id=?').pluck().get(item)):new Date(Date.now()+86_400_000).toISOString();
          if(!existing){
            this.db.prepare('INSERT INTO game_review_practice_followups(profile_id,source_move_id,item_id,scheduled_at,due_at) VALUES (?,?,?,?,?)')
              .run(profile,point.sourceMoveId,item,now(),due);
            this.db.prepare('UPDATE review_states SET due_at=? WHERE item_id=?').run(due,item);
          }
          state.message=existing?`This decision is already in Candidates practice. Next review: ${due}. No recall result was added.`:`Saved for Candidates practice from ${due} (24 hours later). No recall result was added.`;
        }
      }
      this.db.prepare("UPDATE game_review_replays SET state_json=?,version=version+1,updated_at=? WHERE game_id=?").run(JSON.stringify(state),now(),gameId);
      return this.response(gameId,this.saved(gameId)!);
    })();
  }
}

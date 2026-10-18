import { Chess } from "chess.js";
import type { GameOpeningConnection,GameReplayAction,GameReplayCheckpoint,GameReplayMove,GameReplayResponse,Color } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { activeProfileId } from "../training/profile.js";
import { id,now } from "../lib/ids.js";
import { openingPositionKey } from "../openings/opening-content.js";
import type { OpeningGameService } from "../openings/opening-game-service.js";
import type { OpeningReviewService } from "../openings/opening-review-service.js";

type Answer={uci:string;san:string};
type Point=Omit<GameReplayCheckpoint,"attempts"|"recalled"|"canRecall">&{
  answers:Answer[]; answerNotes?:Record<string,string>; explanation:string; sourceMoveId:string; repertoireId?:string; positionId?:string|undefined;
};
type Snapshot={playerColor:Color;initialFen:string;moves:GameReplayMove[];points:Point[];analysisPending:boolean};
type State={ply:number;point:string|null;phase:GameReplayResponse["phase"];outcome:string;message:string;answerMove:string|null;tries:number};
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
    return {run,revision:JSON.stringify([run??null,opening,this.tolerance])};
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
      const mistakes=this.db.prepare(`SELECT m.id,ma.classification FROM moves m JOIN move_assessments ma ON ma.move_id=m.id
        WHERE m.game_id=? AND ma.run_id=? AND ma.meaningful=1 AND m.mover_color=? ORDER BY m.ply`).all(gameId,source.run,game.player_color) as Array<{id:string;classification:string}>;
      for(const mistake of mistakes) {
        const move=rows.find(move=>move.id===mistake.id);if(!move)continue;
        const lines=this.db.prepare(`SELECT el.move_uci AS uci,el.move_san AS san,el.centipawns_white AS cp,el.mate_in_white AS mate
          FROM position_analyses pa JOIN engine_lines el ON el.position_analysis_id=pa.id
          WHERE pa.run_id=? AND pa.position_id=? ORDER BY el.rank`).all(source.run,move.positionId) as Array<Answer&{cp:number|null;mate:number|null}>;
        const legal=lines.filter(line=>{try {apply(move.fenBefore,line.uci);return line.cp!==null||line.mate!==null;}catch{return false;}});
        const utility=(line:typeof lines[number])=>(line.cp??((line.mate??0)>0?100_000-Math.min(100,line.mate!)*100:-100_000+Math.min(100,Math.abs(line.mate!))*100))*(game.player_color==="white"?1:-1);
        const best=Math.max(...legal.map(utility));
        const answers=legal.filter(line=>best-utility(line)<=this.tolerance).map(({uci,san})=>({uci,san}));
        const available=this.db.prepare("SELECT 1 FROM training_items WHERE source_move_id=? AND profile_id=? AND mode='candidate_generation' AND active=1").get(move.id,game.profile_id);
        points.push({id:`engine:${move.id}`,ply:move.ply-1,kind:"engine",label:`Analysed ${mistake.classification}`,
          question:answers.length?"Find an improvement for your side before seeing the stored analysis.":"This move was flagged by analysis, but a legal answer is not available yet.",
          answers,explanation:`The stored engine analysis flagged ${move.san} as ${mistake.classification}. Answers shown are legal stored candidates within ${(this.tolerance/100).toFixed(2)} pawns of the best stored evaluation for your side when measured in pawns. Mate outcomes are compared separately. Unlisted moves have not been graded.`,
          sourceMoveId:move.id,canSchedule:Boolean(available)});
      }
    }
    points.sort((a,b)=>a.ply-b.ply||(a.kind==="opening"?-1:b.kind==="opening"?1:a.id.localeCompare(b.id)));
    const content:Snapshot={playerColor:game.player_color,initialFen:game.initial_fen,moves:rows.map(({id:_,positionId:__,...move})=>move),points,analysisPending:!source.run};
    const snapshot=id(),created=now(),state=initial(0,points.find(point=>point.ply===0));
    this.db.prepare("INSERT INTO game_review_snapshots(id,game_id,profile_id,source_revision,content_json,created_at) VALUES(?,?,?,?,?,?)").run(snapshot,gameId,game.profile_id,source.revision,JSON.stringify(content),created);
    this.db.prepare(`INSERT INTO game_review_replays(game_id,profile_id,snapshot_id,state_json,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(game_id) DO UPDATE SET snapshot_id=excluded.snapshot_id,state_json=excluded.state_json,version=game_review_replays.version+1,updated_at=excluded.updated_at`).run(gameId,game.profile_id,snapshot,JSON.stringify(state),created);
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
    if(!this.saved(gameId))this.db.transaction(()=>this.makeSnapshot(gameId))();
    return this.response(gameId,this.saved(gameId)!);
  }
  private response(gameId:string,saved:Saved):GameReplayResponse {
    const content=JSON.parse(saved.content_json) as Snapshot,state=JSON.parse(saved.state_json) as State;
    const point=content.points.find(point=>point.id===state.point);
    const fen=state.ply===0?content.initialFen:content.moves[state.ply-1]!.fenAfter;
    const onBoard=state.phase==="feedback"&&state.answerMove?apply(fen,state.answerMove):null;
    const attempts=this.db.prepare("SELECT checkpoint_id,result FROM game_review_local_attempts WHERE snapshot_id=?").all(saved.snapshot_id) as Array<{checkpoint_id:string;result:string}>;
    return {gameId,snapshotId:saved.snapshot_id,savedAt:saved.created_at,version:saved.version,playerColor:content.playerColor,initialFen:content.initialFen,moves:content.moves,
      checkpoints:content.points.map(({answers,answerNotes:_____,explanation:_,sourceMoveId:__,repertoireId:___,positionId:____,...point})=>({...point,canRecall:answers.length>0,
        attempts:attempts.filter(attempt=>attempt.checkpoint_id===point.id&&attempt.result!=="shown").length,
        recalled:attempts.some(attempt=>attempt.checkpoint_id===point.id&&attempt.result==="recalled")})),
      currentPly:state.ply,activeCheckpointId:state.point,phase:state.phase,displayFen:onBoard?.fen??fen,
      displayMove:onBoard?state.answerMove:state.ply?content.moves[state.ply-1]!.uci:null,
      analysisPending:content.analysisPending,updatesAvailable:this.revision(gameId).revision!==saved.source_revision,
      feedback:state.message||state.phase==="feedback"?{message:state.message,outcome:state.outcome,answers:state.phase==="feedback"?point?.answers??[]:[],explanation:state.phase==="feedback"?(point?.answerNotes?.[state.answerMove??""]??point?.explanation??""):""}:null};
  }
  act(gameId:string,input:GameReplayAction):GameReplayResponse {
    return this.db.transaction(()=>{
      const saved=this.saved(gameId);if(!saved||saved.snapshot_id!==input.snapshotId||saved.version!==input.version)throw new Error("This game review changed in another tab. Reload the saved review before continuing.");
      const content=JSON.parse(saved.content_json) as Snapshot;let state=JSON.parse(saved.state_json) as State;
      const point=content.points.find(point=>point.id===state.point);
      const at=(ply:number,pointId?:string)=>{
        if(!Number.isSafeInteger(ply)||ply<0||ply>content.moves.length)throw new Error("Choose a position inside this game.");
        const selected=pointId?content.points.find(point=>point.id===pointId&&point.ply===ply):content.points.find(point=>point.ply===ply);
        if(pointId&&!selected)throw new Error("This decision is not in the saved game review.");return initial(ply,selected);
      };
      if(input.action==="refresh") {this.makeSnapshot(gameId);return this.get(gameId);}
      if(input.action==="skip")state=at(Math.min(content.moves.length,state.ply+1));
      else if(input.action==="next") {
        if(state.phase==="question")throw new Error("Try a move or show the answer before continuing.");
        state=at(Math.min(content.moves.length,state.ply+1));
      } else if(input.action==="previous")state=at(Math.max(0,state.ply-1));
      else if(input.action==="jump")state=at(input.ply??-1,input.checkpointId);
      else if(input.action==="retry") {if(!point?.answers.length)throw new Error("There is no saved answer at this decision.");state=initial(point.ply,point);}
      else if(input.action==="answer"||input.action==="reveal") {
        if(!point?.answers.length||state.phase!=="question")throw new Error("Open a recall decision first.");
        const fen=state.ply===0?content.initialFen:content.moves[state.ply-1]!.fenAfter;
        let result="shown",uci:string|null=null;
        if(input.action==="answer") {
          uci=input.moveUci??"";if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci))throw new Error("Choose a legal move on the board.");
          const played=apply(fen,uci);state.tries++;
          if(point.answers.some(answer=>answer.uci===uci)) {
            result=state.tries===1?"recalled":"after_retry";state.phase="feedback";state.answerMove=uci;
            state.message=`${played.san} is an accepted ${point.kind==="opening"?"repertoire response":"stored engine improvement"}${state.tries>1?" after another try":""}.`;
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
          const item=this.db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND profile_id=? AND mode='candidate_generation' AND active=1").get(point.sourceMoveId,this.game(gameId).profile_id) as {id:string}|undefined;
          if(!item)throw new Error("A candidate exercise is no longer available. You can still try this decision in the game.");
          this.db.prepare("UPDATE review_states SET due_at=MIN(due_at,?) WHERE item_id=?").run(now(),item.id);
          state.message="Your existing candidate exercise is ready in Candidates practice. No duplicate exercise or recall result was added.";
        }
      }
      this.db.prepare("UPDATE game_review_replays SET state_json=?,version=version+1,updated_at=? WHERE game_id=?").run(JSON.stringify(state),now(),gameId);
      return this.response(gameId,this.saved(gameId)!);
    })();
  }
}

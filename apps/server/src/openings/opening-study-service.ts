import { Chess } from "chess.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { parsePgnText } from "../chess/pgn.js";
import { ensureActiveProfile } from "../training/profile.js";
import { openingPositionKey } from "./opening-content.js";
import { OpeningWorkspaceService } from "./opening-workspace-service.js";
import type { OpeningStudyGame, OpeningStudyMove, OpeningStudyResponse, OpeningStudyQuiz, OpeningStudyQuizAction } from "../../../../packages/contracts/src/api.js";

type Metadata = Pick<OpeningStudyGame,"white"|"black"|"whiteRating"|"blackRating"|"date"|"result"|"event">;
type GameRow = {id:string;source_label:string;metadata_json:string;moves_json:string;initial_fen:string};
const studyFingerprint=(fingerprint:string,onlineSource?:string)=>onlineSource?`online:${onlineSource}:${fingerprint}`:fingerprint;
type QuizState={currentPly:number;hint:boolean;feedback:OpeningStudyQuiz["feedback"];
  attempts:Array<{ply:number;matches:boolean;helped:boolean}>; helpedPlies:number[]};
const key = (fen:string) => openingPositionKey(new Chess(fen).fen());
function readMoves(row:Pick<GameRow,"moves_json"|"initial_fen">):OpeningStudyMove[] {
  const fields=row.initial_fen.split(" "), start=Number(fields[5]), black=fields[1]==="b"?1:0;
  // Older local study imports predate explicit move labels. Derive labels from
  // the supplied root, including games starting with Black to move.
  return (JSON.parse(row.moves_json) as OpeningStudyMove[]).map((move,index)=>({...move,
    moveNumber:start+Math.floor((index+black)/2),moverColor:(index+black)%2===0?"white":"black"}));
}

export class OpeningStudyService {
  constructor(private readonly db:SqliteDatabase) {}

  import(pgn:string,source:string,onlineSource?:string) {
    if (!pgn.trim() || Buffer.byteLength(pgn,"utf8")>2_000_000) throw new Error("Paste up to 2 MB of complete game PGNs.");
    if (!source.trim() || source.length>200) throw new Error("Give these games a source label of up to 200 characters.");
    const parsed=parsePgnText(pgn);
    if(parsed.errors.length) throw new Error(`Game ${parsed.errors[0]!.index+1}: ${parsed.errors[0]!.message}. No study games were added.`);
    if(parsed.games.length>100) throw new Error("Import up to 100 study games at a time.");
    if(parsed.games.some(game=>!["1-0","0-1","1/2-1/2"].includes(game.result))) throw new Error("Use complete games with a result of 1-0, 0-1 or 1/2-1/2. No study games were added.");
    if(parsed.games.some(game=>game.moves.length>1000)) throw new Error("A study game must contain at most 1,000 half-moves.");
    const profile=ensureActiveProfile(this.db);
    const total=(this.db.prepare("SELECT COUNT(*) AS count FROM opening_study_games WHERE profile_id=?").get(profile) as {count:number}).count;
    const fresh=parsed.games.filter(game=>!this.db.prepare("SELECT 1 FROM opening_study_games WHERE profile_id=? AND fingerprint=?").get(profile,studyFingerprint(game.fingerprint,onlineSource)));
    if(total+new Set(fresh.map(game=>studyFingerprint(game.fingerprint,onlineSource))).size>1000) throw new Error("The study library holds up to 1,000 games. Remove a study game before importing more.");
    let added=0,duplicates=0;
    this.db.transaction(()=>{
      for(const game of parsed.games) {
        if(this.db.prepare("SELECT 1 FROM opening_study_games WHERE profile_id=? AND fingerprint=?").get(profile,studyFingerprint(game.fingerprint,onlineSource))) {duplicates++;continue;}
        const chess=new Chess();chess.loadPgn(game.originalPgn,{strict:false});
        const comments=new Map(chess.getComments().map(comment=>[comment.fen,comment.comment]));
        const moves:OpeningStudyMove[]=game.moves.map(move=>({ply:move.ply,moveNumber:move.moveNumber,moverColor:move.moverColor,san:move.san,uci:move.uci,fenAfter:move.fenAfter,comment:comments.get(move.fenAfter)??null}));
        const metadata:Metadata={white:game.white,black:game.black,whiteRating:game.headers.WhiteElo??null,blackRating:game.headers.BlackElo??null,
          date:game.playedAt,result:game.result,event:game.headers.Event??null};
        const gameId=id();
        this.db.prepare(`INSERT INTO opening_study_games(id,profile_id,fingerprint,source_label,pgn,metadata_json,moves_json,initial_fen,created_at)
          VALUES(?,?,?,?,?,?,?,?,?)`).run(gameId,profile,studyFingerprint(game.fingerprint,onlineSource),source.trim(),game.originalPgn,JSON.stringify(metadata),JSON.stringify(moves),game.initialFen,now());
        const insert=this.db.prepare("INSERT INTO opening_study_positions(game_id,position_key,ply) VALUES(?,?,?)");
        insert.run(gameId,key(game.initialFen),0);
        for(const move of moves) insert.run(gameId,key(move.fenAfter),move.ply);
        added++;
      }
    })();
    return {added,duplicates,message:`${added} study games added; ${duplicates} duplicates kept unchanged.`};
  }

  target(repertoireId:string,lineId:string,savedPly:number) {
    const detail=new OpeningWorkspaceService(this.db).repertoire(repertoireId);
    if(detail.repertoire.archived) throw new Error("Restore this repertoire before studying it.");
    const line=detail.chapters.flatMap(chapter=>chapter.lines).find(line=>line.id===lineId);
    if(!line || line.archived || !line.moves.length) throw new Error("Choose an active saved line to study.");
    if(!Number.isSafeInteger(savedPly)||savedPly<0||savedPly>line.moves.length) throw new Error("Choose a saved position in this line.");
    const fen=savedPly===0?line.moves[0]!.fenBefore:line.moves[savedPly-1]!.fenAfter;
    return {line,fen,positionKey:key(fen),learnerColor:detail.repertoire.learnerColor};
  }

  list(repertoireId:string,lineId:string,savedPly:number,preferredId?:string):OpeningStudyResponse {
    const profile=ensureActiveProfile(this.db), target=this.target(repertoireId,lineId,savedPly);
    const rows=this.db.prepare(`SELECT g.id,g.source_label,g.metadata_json,g.moves_json,g.initial_fen,p.ply AS match_ply FROM opening_study_games g
      JOIN opening_study_positions p ON p.game_id=g.id WHERE g.profile_id=? AND p.position_key=? ORDER BY g.id,p.ply`)
      .all(profile,target.positionKey) as Array<GameRow&{match_ply:number}>;
    const candidates=new Map<string,{game:OpeningStudyGame;row:GameRow;moves:OpeningStudyMove[];score:number}>();
    const parsedMoves=new Map<string,OpeningStudyMove[]>();
    const ownPath=target.line.moves.slice(0,savedPly).map(move=>move.moveUci).join(" ");
    for(const row of rows) {
      const moves=parsedMoves.get(row.id)??readMoves(row),remaining=moves.length-row.match_ply;
      parsedMoves.set(row.id,moves);
      if(!remaining) continue;
      // Compare routes as well as positions; move counters are deliberately not identity.
      const gamePath=moves.slice(0,row.match_ply).map(move=>move.uci).join(" ");
      const transposition=key(target.line.moves[0]!.fenBefore)!==key(row.initial_fen)||ownPath!==gamePath;
      const annotationCount=moves.slice(row.match_ply,row.match_ply+20).filter(move=>move.comment).length;
      const score=(transposition?0:100)+Math.min(annotationCount,10)*2+Math.min(remaining,20)/20;
      const matchedMove=moves[row.match_ply-1];
      const game:OpeningStudyGame={...JSON.parse(row.metadata_json) as Metadata,id:row.id,source:row.source_label,matchPly:row.match_ply,
        transposition,continuationMoves:remaining,annotationCount,
        reason:row.match_ply===0?(target.positionKey===key(new Chess().fen())?"Matches the starting position only. Choose a later saved move for a more specific example.":"Matches this game's supplied starting position. Earlier game moves are not available.")
          :`Reaches this exact position after ${matchedMove!.moveNumber}${matchedMove!.moverColor==="white"?".":"..."}${matchedMove!.san}${transposition?" via a different move order or starting position":" along your saved move order"}.`};
      const old=candidates.get(row.id);
      if(!old||score>old.score) candidates.set(row.id,{game,row,moves,score});
    }
    const ranked=[...candidates.values()].sort((a,b)=>b.score-a.score||a.game.id.localeCompare(b.game.id));
    const progress=this.db.prepare(`SELECT game_id,match_ply,current_ply,quiz_json,version FROM opening_study_progress WHERE
      profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=? AND position_key=?`)
      .get(profile,repertoireId,lineId,savedPly,target.positionKey) as {game_id:string;match_ply:number;current_ply:number;quiz_json:string|null;version:number}|undefined;
    const resumed=progress?candidates.get(progress.game_id):undefined;
    const valid=resumed&&progress&&resumed.game.matchPly===progress.match_ply&&progress.current_ply>=0&&progress.current_ply<=resumed.moves.length;
    const displayed=ranked.slice(0,3);
    if(valid&&!displayed.includes(resumed)) displayed.splice(2,1,resumed);
    const preferred=preferredId?candidates.get(preferredId):undefined;
    if(preferred&&!displayed.includes(preferred)) displayed.splice(2,1,preferred);
    const rating=this.db.prepare("SELECT lichess_rating FROM opening_study_preferences WHERE profile_id=?").get(profile) as {lichess_rating:number}|undefined;
    return {repertoireId,lineId,savedPly,fen:target.fen,learnerColor:target.learnerColor,
      searchRating:rating?.lichess_rating??null,
      libraryGames:(this.db.prepare("SELECT COUNT(*) AS count FROM opening_study_games WHERE profile_id=?").get(profile) as {count:number}).count,
      matches:displayed.map(item=>item.game),totalMatches:ranked.length,
      quiz:valid&&progress.quiz_json?this.quizView(JSON.parse(progress.quiz_json),progress.version,resumed.game,resumed.row.initial_fen,resumed.moves):null,
      replay:valid&&!progress.quiz_json?{game:resumed.game,initialFen:resumed.row.initial_fen,moves:resumed.moves,currentPly:progress.current_ply,version:progress.version}:null};
  }

  save(repertoireId:string,lineId:string,savedPly:number,gameId:string,expectedFen:string,currentPly?:number):OpeningStudyResponse {
    return this.saveSelected(repertoireId,lineId,savedPly,gameId,expectedFen,currentPly);
  }

  startDiscovered(repertoireId:string,lineId:string,savedPly:number,expectedFen:string,pgn:string,source:string) {
    return this.db.transaction(()=>{
      if(key(this.target(repertoireId,lineId,savedPly).fen)!==key(expectedFen)) throw new Error("This saved repertoire position changed. Reload study before continuing.");
      const parsed=parsePgnText(pgn).games[0];
      if(!parsed) throw new Error("The example game could not be read. Search again.");
      this.import(pgn,source,source);
      const row=this.db.prepare("SELECT id FROM opening_study_games WHERE profile_id=? AND fingerprint=?").get(ensureActiveProfile(this.db),studyFingerprint(parsed.fingerprint,source)) as {id:string};
      return this.saveSelected(repertoireId,lineId,savedPly,row.id,expectedFen,undefined,true);
    })();
  }

  private saveSelected(repertoireId:string,lineId:string,savedPly:number,gameId:string,expectedFen:string,currentPly?:number,discovered=false):OpeningStudyResponse {
    const profile=ensureActiveProfile(this.db), state=this.list(repertoireId,lineId,savedPly,discovered?gameId:undefined);
    if(key(state.fen)!==key(expectedFen)) throw new Error("This saved repertoire position changed. Reload study before continuing.");
    const activeQuiz=this.db.prepare(`SELECT quiz_json FROM opening_study_progress WHERE profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=?`)
      .get(profile,repertoireId,lineId,savedPly) as {quiz_json:string|null}|undefined;
    if(activeQuiz?.quiz_json) throw new Error("Return to replay before choosing another game or replay step.");
    const game=state.matches.find(game=>game.id===gameId);
    if(!game) throw new Error("Choose one of the matching study games.");
    const row=this.db.prepare("SELECT moves_json FROM opening_study_games WHERE id=? AND profile_id=?").get(gameId,profile) as {moves_json:string};
    const moves=JSON.parse(row.moves_json) as OpeningStudyMove[];
    const ply=currentPly??game.matchPly;
    if(!Number.isSafeInteger(ply)||ply<0||ply>moves.length) throw new Error("Choose a position inside this study game.");
    this.db.prepare(`INSERT INTO opening_study_progress(profile_id,repertoire_id,line_id,saved_ply,position_key,game_id,match_ply,current_ply,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(profile_id,repertoire_id,line_id,saved_ply) DO UPDATE SET
      position_key=excluded.position_key,game_id=excluded.game_id,match_ply=excluded.match_ply,current_ply=excluded.current_ply,updated_at=excluded.updated_at,quiz_json=NULL,version=opening_study_progress.version+1`)
      .run(profile,repertoireId,lineId,savedPly,key(state.fen),gameId,game.matchPly,ply,now());
    return this.list(repertoireId,lineId,savedPly);
  }

  quiz(repertoireId:string,lineId:string,input:OpeningStudyQuizAction):OpeningStudyResponse {
    return this.db.transaction(()=>{
      const profile=ensureActiveProfile(this.db),state=this.list(repertoireId,lineId,input.savedPly);
      if(key(state.fen)!==key(input.expectedFen)) throw new Error("This saved repertoire position changed. Reload study.");
      const progress=this.db.prepare(`SELECT * FROM opening_study_progress WHERE profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=?`)
        .get(profile,repertoireId,lineId,input.savedPly) as {game_id:string;version:number;quiz_json:string|null;current_ply:number;match_ply:number}|undefined;
      if(!progress || progress.game_id!==input.gameId || progress.version!==input.version) throw new Error("Study changed in another tab. Reload study before continuing.");
      const row=this.db.prepare("SELECT * FROM opening_study_games WHERE id=? AND profile_id=?").get(input.gameId,profile) as GameRow|undefined;
      if(!row) throw new Error("This study game is no longer available.");
      const moves=readMoves(row),game=state.matches.find(game=>game.id===input.gameId);
      if(!game) throw new Error("This game no longer matches. Reload study.");
      const nextDecision=(ply:number)=>{
        while(ply<moves.length && moves[ply]!.moverColor!==state.learnerColor) ply++;
        return ply;
      };
      const remember=(quiz:QuizState)=>this.db.prepare(`INSERT INTO opening_study_guess_history
        (profile_id,repertoire_id,line_id,saved_ply,position_key,game_id,state_json) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(profile_id,repertoire_id,line_id,saved_ply,position_key,game_id) DO UPDATE SET state_json=excluded.state_json`)
        .run(profile,repertoireId,lineId,input.savedPly,key(state.fen),input.gameId,JSON.stringify(quiz));
      let quiz:QuizState;
      if(input.action==="start") {
        if(progress.quiz_json) throw new Error("Guessing has already started. Reload study to resume.");
        const prior=this.db.prepare(`SELECT state_json FROM opening_study_guess_history WHERE
          profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=? AND position_key=? AND game_id=?`)
          .get(profile,repertoireId,lineId,input.savedPly,key(state.fen),input.gameId) as {state_json:string}|undefined;
        quiz=prior?JSON.parse(prior.state_json):{currentPly:nextDecision(Math.max(progress.current_ply,progress.match_ply)),hint:false,feedback:null,attempts:[],helpedPlies:[]};
      } else {
        if(!progress.quiz_json) throw new Error("Start guessing before answering.");
        quiz=JSON.parse(progress.quiz_json) as QuizState;
        const move=moves[quiz.currentPly];
        if(input.action==="exit") {
          remember(quiz);
          this.db.prepare(`UPDATE opening_study_progress SET quiz_json=NULL,current_ply=?,version=version+1,updated_at=?
            WHERE profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=?`)
            .run(quiz.currentPly,now(),profile,repertoireId,lineId,input.savedPly);
          return this.list(repertoireId,lineId,input.savedPly);
        }
        if(input.action==="restart") {
          if(move)throw new Error("Finish this study before starting it again.");
          quiz.currentPly=nextDecision(progress.match_ply);quiz.feedback=null;quiz.hint=false;
          for(const attempt of quiz.attempts)if(!quiz.helpedPlies.includes(attempt.ply))quiz.helpedPlies.push(attempt.ply);
          remember(quiz);
          this.db.prepare(`UPDATE opening_study_progress SET quiz_json=?,current_ply=?,version=version+1,updated_at=?
            WHERE profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=?`)
            .run(JSON.stringify(quiz),quiz.currentPly,now(),profile,repertoireId,lineId,input.savedPly);
          return this.list(repertoireId,lineId,input.savedPly);
        }
        if(!move) throw new Error("This study is complete. Return to replay to choose another game.");
        if(input.action==="continue") {
          if(!quiz.feedback) throw new Error("Try a move or show the played move before continuing.");
          quiz.currentPly=nextDecision(quiz.currentPly+1);quiz.feedback=null;quiz.hint=false;
        } else if(input.action==="retry") {
          if(!quiz.feedback) throw new Error("Answer before retrying.");
          quiz.feedback=null;quiz.hint=false;
          if(!quiz.helpedPlies.includes(quiz.currentPly)) quiz.helpedPlies.push(quiz.currentPly);
        } else {
          if(quiz.feedback) throw new Error("This question has already been answered. Continue or try again.");
          if(input.action==="hint") {
            quiz.hint=true;
            if(!quiz.helpedPlies.includes(quiz.currentPly))quiz.helpedPlies.push(quiz.currentPly);
          } else {
            let playedSan:string|null=null;
            if(input.action==="answer") {
              if(!input.moveUci || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(input.moveUci)) throw new Error("Play a legal move.");
              const board=new Chess(quiz.currentPly?moves[quiz.currentPly-1]!.fenAfter:row.initial_fen);
              playedSan=board.move({from:input.moveUci.slice(0,2),to:input.moveUci.slice(2,4),...(input.moveUci.length===5?{promotion:input.moveUci.slice(4)}:{})}).san;
            } else if(input.action!=="reveal") throw new Error("Choose a study action.");
            const matches=input.moveUci===move.uci && input.action==="answer",revealed=input.action==="reveal";
            const helped=quiz.helpedPlies.includes(quiz.currentPly)||revealed;
            if(!quiz.attempts.some(attempt=>attempt.ply===quiz.currentPly))quiz.attempts.push({ply:quiz.currentPly,matches,helped});
            if(!quiz.helpedPlies.includes(quiz.currentPly))quiz.helpedPlies.push(quiz.currentPly);
            quiz.feedback={playedSan,historicalSan:move.san,historicalUci:move.uci,matches,revealed,comment:move.comment};
          }
        }
      }
      remember(quiz);
      this.db.prepare(`UPDATE opening_study_progress SET quiz_json=?,current_ply=?,version=version+1,updated_at=?
        WHERE profile_id=? AND repertoire_id=? AND line_id=? AND saved_ply=?`)
        .run(JSON.stringify(quiz),quiz.currentPly,now(),profile,repertoireId,lineId,input.savedPly);
      return this.list(repertoireId,lineId,input.savedPly);
    })();
  }

  private quizView(quiz:QuizState,version:number,game:OpeningStudyGame,initialFen:string,moves:OpeningStudyMove[]):OpeningStudyQuiz {
    const fen=quiz.currentPly?moves[quiz.currentPly-1]!.fenAfter:initialFen;
    const move=moves[quiz.currentPly],board=new Chess(fen);
    const piece=move?board.get(move.uci.slice(0,2) as import("chess.js").Square):null;
    const names:Record<string,string>={p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"};
    return {version,game,currentPly:quiz.currentPly,totalPlies:moves.length,fen,complete:!move,
      hint:quiz.hint&&move?`The player moved the ${names[piece?.type??""]??"piece"} on ${move.uci.slice(0,2)}.`:null,
      feedback:quiz.feedback,progress:{attempted:quiz.attempts.length,
        matchedUnaided:quiz.attempts.filter(a=>a.matches&&!a.helped).length,helped:quiz.attempts.filter(a=>a.helped).length}};
  }

  remove(gameId:string) {
    this.db.prepare("DELETE FROM opening_study_games WHERE id=? AND profile_id=?").run(gameId,ensureActiveProfile(this.db));
    return {message:"Study game removed. Your saved opening moves and recall are unchanged."};
  }

  library() {
    return {games:(this.db.prepare("SELECT id,metadata_json,source_label FROM opening_study_games WHERE profile_id=? ORDER BY created_at DESC,id")
      .all(ensureActiveProfile(this.db)) as GameRow[]).map(row=>({id:row.id,...JSON.parse(row.metadata_json) as Metadata,source:row.source_label}))};
  }
}

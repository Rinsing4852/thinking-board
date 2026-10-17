import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {Chess} from "chess.js";
import {Database} from "../db/database.js";
import {OpeningContentService} from "./opening-content-service.js";
import {OpeningPgnImportService} from "./opening-pgn-import.js";
import {OpeningWorkspaceService} from "./opening-workspace-service.js";
import {OpeningStudyService} from "./opening-study-service.js";
import {OpeningReviewService} from "./opening-review-service.js";
import {OpeningActivityService} from "./opening-activity-service.js";
import {ensureActiveProfile,setActiveProfile} from "../training/profile.js";

const databases:Database[]=[];
afterEach(()=>databases.splice(0).forEach(db=>db.close()));
const game=(moves:string,title="Example")=>`[Event "${title}"]\n[White "Player A"]\n[Black "Player B"]\n[WhiteElo "2400"]\n[BlackElo "2350"]\n[Date "2020.01.02"]\n[Result "1/2-1/2"]\n\n${moves} 1/2-1/2`;
function setup(color:"white"|"black"="white",pgn="1. d4 d5 2. Nf3 Nf6 3. c4 e6 *") {
  const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);
  const db=database.connection;
  const imported=new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn,learnerColor:color,ownershipConfirmed:true});
  const repertoireId=imported.repertoireIds[0]!,workspace=new OpeningWorkspaceService(db);
  const lineId=workspace.repertoire(repertoireId).chapters[0]!.lines[0]!.id;
  return {db,repertoireId,lineId,workspace,study:new OpeningStudyService(db)};
}
describe("contextual model-game study",()=>{
  it("rejects an old browser position even when the same game matches its replacement",()=>{
    const {db,study,repertoireId,lineId,workspace}=setup("white","1. d4 d5 2. Nf3 Nf6 *");
    study.import(game("1. d4 d5 2. Nf3 Nf6 3. Ng1 Ng8 4. Nf3 Nc6 5. c4 e6"),"Repeated route");
    const original=study.list(repertoireId,lineId,4),gameId=original.matches[0]!.id;
    study.save(repertoireId,lineId,4,gameId,original.fen,5);
    const saved=db.prepare("SELECT * FROM opening_study_progress").all();
    const last=workspace.repertoire(repertoireId).chapters[0]!.lines[0]!.moves.at(-1)!;
    workspace.undoLastMove(repertoireId,lineId,last.id);
    workspace.addMove({repertoireId,lineId,afterPly:3,moveUci:"b8c6"});
    const changed=study.list(repertoireId,lineId,4);
    expect(changed.matches[0]?.id).toBe(gameId);expect(changed.matches[0]?.matchPly).toBe(8);
    expect(()=>study.save(repertoireId,lineId,4,gameId,original.fen,6)).toThrow(/position changed/);
    expect(db.prepare("SELECT * FROM opening_study_progress").all()).toEqual(saved);
    expect(changed.replay).toBeNull();
    expect(study.save(repertoireId,lineId,4,gameId,changed.fen,9).replay?.currentPly).toBe(9);
  });
  it("labels Black-to-move custom games correctly including earlier local imports",()=>{
    const board=new Chess();for(const move of ["d4","d5","Nf3","Nf6","c4","e6","Nc3"])board.move(move);
    const headers=`[SetUp "1"]\n[FEN "${board.fen()}"]\n`;
    const {db,study,repertoireId,lineId}=setup("black","1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 *");
    study.import(`${headers}[Result "1/2-1/2"]\n\n4... Be7 5. Bg5 O-O 1/2-1/2`,"Custom black root");
    const state=study.list(repertoireId,lineId,7),gameId=state.matches[0]!.id;
    const row=db.prepare("SELECT moves_json FROM opening_study_games WHERE id=?").get(gameId) as {moves_json:string};
    const legacy=JSON.parse(row.moves_json).map(({moveNumber:_,moverColor:__,...move}:Record<string,unknown>)=>move);
    db.prepare("UPDATE opening_study_games SET moves_json=? WHERE id=?").run(JSON.stringify(legacy),gameId);
    const replay=study.save(repertoireId,lineId,7,gameId,state.fen,1).replay!;
    expect(replay.moves[0]).toMatchObject({moveNumber:4,moverColor:"black",san:"Be7"});
    expect(replay.moves[1]).toMatchObject({moveNumber:5,moverColor:"white",san:"Bg5"});
  });
  it("matches exact positions and transpositions for both colours without relying on opening names",()=>{
    for(const color of ["white","black"] as const) {
      const {study,repertoireId,lineId}=setup(color);
      study.import(game("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 {Develop toward the centre.} Be7 5. Bg5 O-O"),"My annotated collection");
      study.import(game("1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bg5 O-O","Transposed example"),"My games");
      study.import(game("1. e4 e5 2. Nf3 Nc6","Example"),"Same name, other board");
      const result=study.list(repertoireId,lineId,6);
      expect(result.learnerColor).toBe(color);expect(result.totalMatches).toBe(2);
      expect(result.matches[0]).toMatchObject({transposition:false,annotationCount:1,source:"My annotated collection",date:"2020-01-02",whiteRating:"2400"});
      expect(result.matches[1]?.transposition).toBe(true);
      const state=study.save(repertoireId,lineId,6,result.matches[0]!.id,result.fen,7);
      expect(state.replay?.moves[6]?.comment).toBe("Develop toward the centre.");
      expect(study.list(repertoireId,lineId,6).replay?.currentPly).toBe(7);
    }
  });
  it("imports atomically, deduplicates by legal mainline and rejects malformed or unfinished games",()=>{
    const {study}=setup();const pgn=game("1. d4 d5 2. c4 e6");
    expect(study.import(`${pgn}\n\n${pgn}`,"Collection")).toMatchObject({added:1,duplicates:1});
    expect(study.import(pgn,"Another label")).toMatchObject({added:0,duplicates:1});
    expect(study.library().games[0]?.source).toBe("Collection");
    expect(()=>study.import(`${game("1. e4 e5")}\n\n[Event "Broken"]\n\n1. invalid *`,"Broken batch")).toThrow(/No study games/);
    expect(()=>study.import("1. e4 e5 *","Incomplete")).toThrow(/complete games/);
    expect(study.library().games).toHaveLength(1);
  });
  it("handles supplied starting positions and excludes finished matches and wrong castling rights",()=>{
    const {study,db,repertoireId,lineId}=setup();
    const board=new Chess();for(const move of ["d4","d5","Nf3","Nf6","c4","e6"])board.move(move);
    study.import(`[SetUp "1"]\n[FEN "${board.fen()}"]\n[Result "1/2-1/2"]\n\n4. Nc3 Be7 1/2-1/2`,"Supplied start");
    const match=study.list(repertoireId,lineId,6).matches[0]!;
    expect(match.matchPly).toBe(0);expect(match.reason).toContain("Earlier game moves are not available");
    const replay=study.save(repertoireId,lineId,6,match.id,study.list(repertoireId,lineId,6).fen);
    expect(replay.replay?.initialFen).toBe(board.fen());
    expect(()=>study.save(repertoireId,lineId,6,match.id,study.list(repertoireId,lineId,6).fen,999)).toThrow(/inside this study game/);
    study.remove(match.id);expect(study.list(repertoireId,lineId,6).replay).toBeNull();
    expect((db.prepare("SELECT COUNT(*) AS n FROM opening_study_progress").get() as {n:number}).n).toBe(0);
    study.import(game("1. d4 d5 2. Nf3 Nf6 3. c4 e6"),"Ends at match");
    expect(study.list(repertoireId,lineId,6).totalMatches).toBe(0);
    const fields=board.fen().split(" ");fields[2]="-";
    study.import(`[SetUp "1"]\n[FEN "${fields.join(" ")}"]\n[Result "1/2-1/2"]\n\n4. Nc3 Be7 1/2-1/2`,"No castling rights");
    expect(study.list(repertoireId,lineId,6).totalMatches).toBe(0);
  });
  it("isolates profiles, invalidates changed saved positions, and leaves practice and played games untouched",()=>{
    const {db,study,repertoireId,lineId,workspace}=setup();
    const profile=ensureActiveProfile(db);
    const reviews=new OpeningReviewService(db), exercise=reviews.startLine(repertoireId,lineId);
    reviews.answer(exercise.sessionId,exercise.acceptedMoves[0]!.moveUci,false,false,exercise.queueEntryId);
    const activity=new OpeningActivityService(db).get();
    const tables=["games","opening_review_items","opening_review_sessions","opening_review_queue","opening_review_events","opening_move_review_cards","opening_moves","opening_line_moves"];
    const snapshot=()=>tables.map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all());
    const before=snapshot();
    study.import(game("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7"),"Collection");
    const match=study.list(repertoireId,lineId,6).matches[0]!;
    study.save(repertoireId,lineId,6,match.id,study.list(repertoireId,lineId,6).fen,7);study.save(repertoireId,lineId,6,match.id,study.list(repertoireId,lineId,6).fen,8);
    expect(snapshot()).toEqual(before);
    expect(new OpeningActivityService(db).get()).toEqual(activity);
    db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-01-01')").run();
    setActiveProfile(db,"other");expect(study.library().games).toHaveLength(0);
    expect(()=>study.save(repertoireId,lineId,6,match.id,study.list(repertoireId,lineId,6).fen)).toThrow(/matching study games/);
    study.remove(match.id);setActiveProfile(db,profile);expect(study.library().games).toHaveLength(1);
    workspace.setRepertoireArchived(repertoireId,true);
    expect(()=>study.list(repertoireId,lineId,6)).toThrow(/Restore this repertoire/);
    workspace.setRepertoireArchived(repertoireId,false);
    // A saved target which is no longer the same position cannot restore an old replay.
    db.prepare("UPDATE opening_study_progress SET position_key='obsolete' WHERE profile_id=?").run(profile);
    expect(study.list(repertoireId,lineId,6).replay).toBeNull();
  });
  it("does not attach a later comment to an earlier repetition of the same board",()=>{
    const {study,repertoireId,lineId}=setup();
    study.import(game("1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 {This is the second visit.} d5 4. d4 e6"),"Repetition notes");
    const gameId=study.list(repertoireId,lineId,0).matches[0]!.id;
    const replay=study.save(repertoireId,lineId,0,gameId,study.list(repertoireId,lineId,0).fen).replay!;
    expect(replay.moves[0]?.comment).toBeNull();expect(replay.moves[4]?.comment).toBe("This is the second visit.");
  });
});

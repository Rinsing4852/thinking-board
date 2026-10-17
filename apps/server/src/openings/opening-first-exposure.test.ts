import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {Database} from "../db/database.js";
import {ensureActiveProfile,setActiveProfile} from "../training/profile.js";
import {OpeningContentService} from "./opening-content-service.js";
import {OpeningPgnImportService} from "./opening-pgn-import.js";
import {OpeningReviewService} from "./opening-review-service.js";
import {OpeningActivityService} from "./opening-activity-service.js";

const databases:Database[]=[];
afterEach(()=>databases.splice(0).forEach(db=>db.close()));
function setup(color:"white"|"black"="white") {
  const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);
  const db=database.connection;
  const repertoireId=new OpeningPgnImportService(db,new OpeningContentService(db)).import({
    pgn:"1. e4 {Claim space.} e5 2. Nf3 Nc6 3. Bc4 Bc5 *",learnerColor:color,ownershipConfirmed:true,
  }).repertoireIds[0]!;
  return {db,repertoireId,reviews:new OpeningReviewService(db)};
}
describe("learn first, then recall",()=>{
  it("persists three demonstrations before recall without earning review or activity credit",()=>{
    const {db,repertoireId,reviews}=setup();
    let exercise=reviews.start(repertoireId,"new",3,3,true);
    const cards=db.prepare("SELECT * FROM opening_review_items").all();
    const first=exercise;
    for(let index=1;index<=3;index++) {
      expect(exercise.phase).toBe("introduction");
      expect(exercise.introductionProgress).toEqual({current:index,total:3});
      expect(new OpeningReviewService(db).active()).toEqual(exercise);
      expect(reviews.resume(exercise.sessionId).kind).toBe("exercise");
      exercise=reviews.introduce(exercise.sessionId,exercise.queueEntryId,exercise.introduction.repertoireMove.moveUci);
    }
    expect(exercise).toMatchObject({phase:"recall",queueEntryId:first.queueEntryId,positionNumber:1,totalPositions:3,
      assistance:{pieceHint:false,moveShown:false,ideaHint:false}});
    expect(exercise.introductionProgress).toBeUndefined();
    expect(db.prepare("SELECT * FROM opening_review_items").all()).toEqual(cards);
    expect(db.prepare("SELECT COUNT(*) FROM opening_review_events").pluck().get()).toBe(0);
    expect(db.prepare("SELECT COUNT(*) FROM opening_move_review_cards").pluck().get()).toBe(0);
    expect(new OpeningActivityService(db).get()).toMatchObject({completedToday:0,independentToday:0});
    const feedback=reviews.answer(exercise.sessionId,exercise.introduction.repertoireMove.moveUci,false,false,exercise.queueEntryId,1000);
    expect(feedback).toMatchObject({assisted:false,outcome:"remembered"});
    expect(new OpeningActivityService(db).get()).toMatchObject({completedToday:1,independentToday:1});
  });
  it("rejects wrong demonstrations and recall/help bypasses without mutating memory",()=>{
    const {db,repertoireId,reviews}=setup();const e=reviews.start(repertoireId,"new",3,3,true);
    expect(()=>reviews.introduce(e.sessionId,e.queueEntryId,"d2d4")).toThrow(/not a scored attempt/);
    expect(()=>reviews.answer(e.sessionId,"e2e4")).toThrow(/demonstrated/);
    expect(()=>reviews.reveal(e.sessionId)).toThrow(/demonstrated/);
    expect(()=>reviews.recordMistake(e.sessionId,"d2d4")).toThrow(/demonstration/);
    expect(()=>reviews.help(e.sessionId,"move",e.queueEntryId)).toThrow(/already shown/);
    expect(()=>reviews.continue(e.sessionId,e.queueEntryId)).toThrow(/before continuing/);
    expect(reviews.active()).toMatchObject({queueEntryId:e.queueEntryId,phase:"introduction"});
    for(const table of ["opening_review_events","opening_review_mistakes","opening_move_review_cards"])
      expect(db.prepare(`SELECT COUNT(*) FROM ${table}`).pluck().get()).toBe(0);
  });
  it("retries an acknowledged demonstration without advancing a second move",()=>{
    const {repertoireId,reviews}=setup();const first=reviews.start(repertoireId,"new",3,3,true);
    const next=reviews.introduce(first.sessionId,first.queueEntryId,first.introduction.repertoireMove.moveUci);
    expect(reviews.introduce(first.sessionId,first.queueEntryId,first.introduction.repertoireMove.moveUci)).toEqual(next);
    expect(()=>reviews.introduce(first.sessionId,"stale","g1f3")).toThrow(/changed/);
    expect(reviews.active()).toEqual(next);
  });
  it("keeps recalled help separate from the earlier demonstration after reload",()=>{
    const {db,repertoireId,reviews}=setup();const first=reviews.start(repertoireId,"new",1,1,true);
    const recall=reviews.introduce(first.sessionId,first.queueEntryId,first.introduction.repertoireMove.moveUci);
    reviews.help(recall.sessionId,"piece",recall.queueEntryId);
    expect(new OpeningReviewService(db).active()).toMatchObject({phase:"recall",assistance:{pieceHint:true}});
    expect(reviews.answer(recall.sessionId,"e2e4",false,false,recall.queueEntryId)).toMatchObject({assisted:true,outcome:"learning"});
    expect(()=>reviews.introduce(first.sessionId,first.queueEntryId,"e2e4")).toThrow(/feedback/);
    expect(new OpeningActivityService(db).get()).toMatchObject({completedToday:1,independentToday:0});
  });
  it("isolates exposure stages by player and rejects replaced sessions",()=>{
    const {db,repertoireId,reviews}=setup();const first=reviews.start(repertoireId,"new",3,3,true);
    const profile=ensureActiveProfile(db);
    db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES('other','Other','2026-10-17')").run();
    setActiveProfile(db,"other");expect(reviews.active()).toBeNull();
    expect(()=>reviews.introduce(first.sessionId,first.queueEntryId,"e2e4")).toThrow(/not found/);
    setActiveProfile(db,profile);reviews.start(repertoireId,"new");
    expect(()=>reviews.introduce(first.sessionId,first.queueEntryId,"e2e4")).toThrow(/not found/);
  });
  it("keeps existing practice defaults and teaches the learner's colour only",()=>{
    const {repertoireId,reviews}=setup("black");
    expect(reviews.start(repertoireId,"new").phase).toBe("recall");
    expect(()=>reviews.start(repertoireId,"early",3,3,true)).toThrow(/Choose new/);
    const e=reviews.start(repertoireId,"new",1,1,true);
    expect(e).toMatchObject({phase:"introduction",learnerColor:"black",introduction:{repertoireMove:{moveUci:"e7e5"}}});
    expect(reviews.introduce(e.sessionId,e.queueEntryId,"e7e5").phase).toBe("recall");
  });
});

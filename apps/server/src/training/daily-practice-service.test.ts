import path from "node:path";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {Database} from "../db/database.js";
import {ImportService} from "../imports/import-service.js";
import {OpeningContentService} from "../openings/opening-content-service.js";
import {OpeningPgnImportService} from "../openings/opening-pgn-import.js";
import {OpeningTrainingService} from "../openings/opening-training-service.js";
import {OpeningReviewService} from "../openings/opening-review-service.js";
import {DailyPracticeService} from "./daily-practice-service.js";
import {V1TrainingService} from "./v1-training-service.js";
import {AttemptLifecycle} from "./attempt-lifecycle.js";
import {setActiveProfile} from "./profile.js";

describe('short daily practice plan',()=>{
 let database:Database;
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-28T12:00:00Z'));database=new Database(':memory:',path.resolve('migrations'));});
 afterEach(()=>{database.close();vi.useRealTimers();});
 function fixture(opening=true,thinking=true){
  const db=database.connection,saved=new ImportService(db).import('[White "Daily learner"]\n[Black "Opponent"]\n\n1. e4 e5 *','Daily learner');
  const profile=saved.profileId!;setActiveProfile(db,profile);
  if(opening)new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn:'1. e4 e5 2. Nf3 *',learnerColor:'white',ownershipConfirmed:true});
  if(thinking){
   const move=db.prepare('SELECT m.id,m.game_id,m.from_position_id FROM moves m JOIN games g ON g.id=m.game_id WHERE g.profile_id=? AND m.ply=1').get(profile) as {id:string;game_id:string;from_position_id:string};
   db.prepare("INSERT INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at) VALUES ('daily-item',?,?,?,'quiet_position',1,'2026-10-27')").run(profile,move.game_id,move.id);
   db.prepare("INSERT INTO quiet_position_items(item_id,position_id,weakest_squares_json,acceptable_moves_json,explanation,evidence_json) VALUES ('daily-item',?,'[\"g1\"]','[{\"moveUci\":\"g1f3\",\"moveSan\":\"Nf3\",\"centipawnLoss\":0}]','Develop the knight.','{}')").run(move.from_position_id);
   db.prepare("INSERT INTO review_states(item_id,due_at) VALUES ('daily-item','2020-01-01')").run();
  }
  const openings=new OpeningReviewService(db),training=new V1TrainingService(db),service=new DailyPracticeService(db,openings,training);
  return {db,profile,openings,training,service};
 }
 it('links opening recall then game decisions and resumes the same queues without duplicate credit',()=>{
  const f=fixture();const preview=f.service.get();expect(preview).toMatchObject({status:'ready',next:'opening',thinkingCount:1});expect(preview.openingCount).toBeGreaterThan(0);
  expect(f.db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
  let plan=f.service.start(f.profile);const first=f.openings.active()!;
  expect(f.service.start(f.profile).id).toBe(plan.id);expect(f.openings.active()!.sessionId).toBe(first.sessionId);
  // Queue completion is independently verified by opening service tests. Here
  // simulate its persisted completion boundary to test the linking contract.
  f.db.prepare("UPDATE opening_review_sessions SET status='completed' WHERE id=?").run(first.sessionId);
  f.db.prepare("UPDATE opening_review_queue SET status='completed' WHERE session_id=?").run(first.sessionId);
  expect(f.service.get()).toMatchObject({id:plan.id,next:'thinking',openingDone:true,thinkingDone:false});
  plan=f.service.start(f.profile);expect(plan.thinkingSession?.remainingCount).toBe(1);
  const session=plan.thinkingSession!;expect(new DailyPracticeService(f.db,f.openings,f.training).get().thinkingSession?.id).toBe(session.id);
  f.training.answerQuiet(new AttemptLifecycle(f.db).start(session.currentItem!.itemId,session.id!).attemptId,'g1','g1f3');
  expect(f.service.get()).toMatchObject({id:plan.id,status:'completed',next:null,thinkingDone:true});
  expect(f.service.start(f.profile).status).toBe('completed');expect(f.db.prepare('SELECT attempts FROM review_states').pluck().get()).toBe(1);
  expect(f.db.prepare('SELECT COUNT(*) FROM daily_practice_plans').pluck().get()).toBe(1);
  f.db.prepare('DELETE FROM opening_review_sessions WHERE id=?').run(first.sessionId);
  expect(f.service.get().status).toBe('completed');
  expect(f.db.prepare('SELECT COUNT(*) FROM opening_review_events').pluck().get()).toBe(0);
 });
 it('resumes existing thinking practice first and retains its game filter across a restart and midnight',()=>{
  const f=fixture();f.db.prepare("UPDATE games SET played_at='2026-10-28T10:00:00Z'").run();const active=f.training.createSession(2,7);
  const plan=f.service.start(f.profile,30);expect(plan).toMatchObject({next:'thinking',thinkingSession:{id:active.id,gameDays:7}});
  vi.advanceTimersByTime(24*60*60_000);
  expect(new DailyPracticeService(f.db,f.openings,f.training).get(1)).toMatchObject({id:plan.id,date:'2026-10-28',gameDays:7,thinkingSession:{id:active.id}});
 });
 it('keeps profiles isolated and refuses a stale start after switching players',()=>{
  const f=fixture();const plan=f.service.start(f.profile);
  const other=new ImportService(f.db).import('[White "Other daily learner"]\n[Black "Other opponent"]\n\n1. d4 *','Other daily learner');
  setActiveProfile(f.db,other.profileId!);
  expect(()=>f.service.start(f.profile)).toThrow('player changed');expect(f.service.get().id).not.toBe(plan.id);
 });
 it('resumes a guided lesson with its pending answer instead of abandoning it for a new recall session',()=>{
  const f=fixture();const repertoire=f.db.prepare('SELECT id FROM opening_repertoires').pluck().get() as string;
  const lessons=new OpeningTrainingService(f.db),step=lessons.start(repertoire);
  lessons.answerMove(step.attemptId,'e2e4');const saved=lessons.active();
  const plan=f.service.start(f.profile);
  expect(plan).toMatchObject({next:'opening',openingKind:'lesson'});
  expect(lessons.active()).toEqual(saved);
  expect(f.db.prepare('SELECT COUNT(*) FROM opening_review_sessions').pluck().get()).toBe(0);
  expect(f.db.prepare('SELECT status FROM opening_lesson_attempts').pluck().get()).toBe('active');
 });
 it('prioritises opening misses from saved games without visiting the opening page first',()=>{
  const f=fixture(true,false);
  new ImportService(f.db).import('[White "Daily learner"]\n[Black "New opponent"]\n\n1. f3 e5 *','Daily learner');
  expect(f.db.prepare("SELECT COUNT(*) FROM game_opening_matches WHERE status='player_deviation'").pluck().get()).toBe(0);
  f.service.start(f.profile);
  const active=f.openings.active()!;
  const exercise=active.kind==='feedback'?active.exercise:active;
  expect(exercise.practiceReason.kind).toBe('game_miss');
  expect(f.db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
 });
 it('offers a useful empty state and never starts engine analysis',()=>{
  const f=fixture(false,false);expect(f.service.get()).toMatchObject({status:'empty',next:'games'});
  expect(f.service.start(f.profile).id).toBeNull();expect(f.db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
 });
});

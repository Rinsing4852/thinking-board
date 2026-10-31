// Regression based on a supplied game; public fixture has anonymised player headers.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {loadConfig} from '../dist/apps/server/src/config.js';
import {Database} from '../dist/apps/server/src/db/database.js';
import {ImportService} from '../dist/apps/server/src/imports/import-service.js';
import {AnalysisService} from '../dist/apps/server/src/analysis/analysis-service.js';
import {TrainingService} from '../dist/apps/server/src/training/training-service.js';
import {V1TrainingService} from '../dist/apps/server/src/training/v1-training-service.js';
import {CandidateTrainingService} from '../dist/apps/server/src/training/candidate-training-service.js';
import {tacticalSessionGroups} from '../dist/apps/server/src/training/practice-diversity.js';
import {OpeningContentService} from '../dist/apps/server/src/openings/opening-content-service.js';
import {OpeningPgnImportService} from '../dist/apps/server/src/openings/opening-pgn-import.js';
import {OpeningGameService} from '../dist/apps/server/src/openings/opening-game-service.js';
import {OpeningReviewService} from '../dist/apps/server/src/openings/opening-review-service.js';
import {GameReplayService} from '../dist/apps/server/src/games/game-replay-service.js';
import {DailyPracticeService} from '../dist/apps/server/src/training/daily-practice-service.js';
import {AttemptLifecycle} from '../dist/apps/server/src/training/attempt-lifecycle.js';
const config={...loadConfig(),stockfishDepth:12},database=new Database(':memory:',config.migrationsDir),db=database.connection;
const analysis=new AnalysisService(db,config),training=new TrainingService(db),v1=new V1TrainingService(db),candidates=new CandidateTrainingService(db,config),attempts=new AttemptLifecycle(db),results=[];
try{
 const saved=new ImportService(db).import(fs.readFileSync(new URL('./fixtures/missed-queens.pgn',import.meta.url),'utf8'),'Opportunity learner');
 const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
 await analysis.analyzeGames([game],()=>{});
 assert(db.prepare('SELECT engine_name FROM analysis_runs LIMIT 1').pluck().get().startsWith('Stockfish '));
 for(const mode of ['blunder_check','punish_blunder']){
  const items=db.prepare("SELECT ti.id FROM training_items ti JOIN moves m ON m.id=ti.source_move_id WHERE ti.game_id=? AND ti.mode=? AND ti.active=1 AND m.move_number BETWEEN 28 AND 30").pluck().all(game,mode);
  assert.equal(items.length,3);const groups=tacticalSessionGroups(db,items);
  assert.equal(new Set(items.map(item=>groups.get(item))).size,1);
 }
 results.push({name:'The repeated queen opportunity forms one session group per perspective without deleting positions',passed:true});
 for(const number of [28,29,30]){
  const move=db.prepare("SELECT id,san FROM moves WHERE game_id=? AND move_number=? AND mover_color='black'").get(game,number);
  const item=db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode='blunder_check' AND active=1").pluck().get(move.id);
  assert(item,`Missing capture on move ${number} must create a blunder exercise`);
  const exercise=training.next('early',item);assert.equal(exercise.exerciseKind,'missed_opportunity');
  assert(db.prepare("SELECT 1 FROM acceptable_responses WHERE item_id=? AND move_uci='d7h3'").get(item));
  const response=training.answer(attempts.start(item).attemptId,'capture','d7h3');assert.equal(response.outcome,'excellent');
  const punishment=db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode='punish_blunder' AND active=1").pluck().get(move.id);
  assert(punishment);assert(db.prepare("SELECT 1 FROM acceptable_responses WHERE item_id=? AND move_uci='h3d7'").get(punishment));
  assert.equal(v1.answerPunish(attempts.start(punishment).attemptId,'h3d7').outcome,'excellent');
  const quality=db.prepare('SELECT grade,chance_loss FROM game_move_quality WHERE move_id=?').get(move.id);
  results.push({name:`${number}...${move.san}: missed Qxh3 and allowed Qxd7`,passed:true,...quality});
 }
 const source=db.prepare("SELECT id FROM moves WHERE game_id=? AND move_number=28 AND mover_color='black'").pluck().get(game);
 const changed=db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode='what_changed' AND active=1").pluck().get(source);
 assert(changed);const feedback=training.answerWhatChanged(attempts.start(changed).attemptId,'available_capture','h3');assert.equal(feedback.outcome,'excellent');
 assert.equal(training.answerWhatChanged(attempts.start(changed).attemptId,'opened_line','d7').outcome,'excellent');
 assert.equal(training.answerWhatChanged(attempts.start(changed).attemptId,'attacked_piece','d7').outcome,'excellent');
 results.push({name:'After g5, capture opportunity and danger on the opened queen diagonal are both valid observations',passed:true});
 const candidate=db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode='candidate_generation' AND active=1").pluck().get(source);
 assert(candidate);const graded=await candidates.answer(attempts.start(candidate).attemptId,[{moveUci:'d7h3',declaredType:'capture'}]);
 assert.equal(graded.outcome,'excellent');assert.equal(graded.candidates[0].grade,'excellent');results.push({name:'A single winning queen capture receives full candidate credit',passed:true});
 const correct=db.prepare("SELECT id FROM moves WHERE game_id=? AND move_number=31 AND mover_color='black'").pluck().get(game);
 assert.equal(db.prepare("SELECT COUNT(*) FROM training_items WHERE source_move_id=? AND mode IN ('blunder_check','punish_blunder') AND active=1").pluck().get(correct),0);
 assert.equal(db.prepare("SELECT COUNT(*) FROM training_items ti JOIN moves m ON m.id=ti.source_move_id WHERE ti.game_id=? AND ti.mode='quiet_position' AND ti.active=1 AND m.move_number BETWEEN 28 AND 30").pluck().get(game),0);
 results.push({name:'Taking the queen on move 31 is correct; tactical errors are not quiet-plan exercises',passed:true});
 const openingReviews=new OpeningReviewService(db),replay=new GameReplayService(db,new OpeningGameService(db),openingReviews);
 let review=replay.get(game);
 assert(review.checkpoints.filter(point=>point.keyDecision).length<=3);
 assert.equal(review.checkpoints.filter(point=>point.kind==='engine'&&[55,57,59].includes(point.ply)&&point.keyDecision).length,1);
 if(process.argv.includes('--learning-quality'))for(const ply of [55,57,59]){
  const point=review.checkpoints.find(p=>p.kind==='engine'&&p.ply===ply);
  assert(point?.categories?.includes('attacking'),`Missed queen capture at ply ${ply} must be attacking practice`);
  assert(point?.categories?.includes('defending'),`Allowed queen capture at ply ${ply} must also be defensive practice`);
 }
 const key=review.checkpoints.find(point=>point.kind==='engine'&&point.ply===55);assert(key?.canSchedule);
 const act=(action,details={})=>{review=replay.act(game,{snapshotId:review.snapshotId,version:review.version,action,...details});return review;};
 act('jump',{ply:key.ply,checkpointId:key.id});assert.equal(review.feedback,null);act('reveal');
 assert.equal(review.feedback.teachingLines[0].steps[0].san,'Qxh3');
 assert.deepEqual(review.feedback.teachingLines[1].steps.slice(0,2).map(step=>step.san),['exd4','Qxd7']);
 const attemptCount=db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get();act('schedule');
 assert.equal(db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get(),attemptCount);
 assert(Date.parse(db.prepare('SELECT due_at FROM game_review_practice_followups').pluck().get())>=Date.now()+86_390_000);
 results.push({name:'Key review groups repeated queens, hides answers, demonstrates Qxd7 and schedules next-day recall without credit',passed:true});
 new OpeningPgnImportService(db,new OpeningContentService(db)).import({pgn:'1. e4 g6 *',learnerColor:'black',ownershipConfirmed:true});
 const routine=new DailyPracticeService(db,openingReviews,v1),profile=db.prepare('SELECT profile_id FROM games WHERE id=?').pluck().get(game);
 let plan=routine.start(profile);assert.equal(plan.next,'opening');const planId=plan.id;
 for(let step=0;step<8;step++){
  const active=openingReviews.active();if(!active)break;
  if(active.kind==='feedback')openingReviews.continue(active.sessionId,active.exercise.queueEntryId);
  else if(active.phase==='introduction')openingReviews.introduce(active.sessionId,active.queueEntryId,'g7g6');
  else openingReviews.answer(active.sessionId,'g7g6',false,false,active.queueEntryId);
 }
 assert.equal(openingReviews.active(),null);plan=routine.start(profile);assert.equal(plan.next,'thinking');
 assert(plan.thinkingSession?.items.length>0);assert.equal(routine.get().id,planId);
 results.push({name:'Daily routine links completed opening recall to saved game practice without starting another analysis',passed:true});
 analysis.backfillBlunderChecks();analysis.backfillWhatChanged();analysis.backfillCandidates();analysis.backfillV1();
 assert.equal(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get(),0);assert.deepEqual(db.pragma('foreign_key_check'),[]);
 console.log(JSON.stringify({learningQuality:process.argv.includes('--learning-quality'),measuredAt:new Date().toISOString(),engine:db.prepare('SELECT engine_name FROM analysis_runs LIMIT 1').pluck().get(),depth:12,scope:'Anonymised full-game regression, not site-equivalent centipawn scores',results},null,2));
}finally{await candidates.close();await analysis.close();database.close();}

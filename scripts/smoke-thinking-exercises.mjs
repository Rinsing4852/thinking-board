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
import {AttemptLifecycle} from '../dist/apps/server/src/training/attempt-lifecycle.js';
const config={...loadConfig(),stockfishDepth:12},database=new Database(':memory:',config.migrationsDir),db=database.connection;
const analysis=new AnalysisService(db,config),training=new TrainingService(db),v1=new V1TrainingService(db),candidates=new CandidateTrainingService(db,config),attempts=new AttemptLifecycle(db),results=[];
try{
 const saved=new ImportService(db).import(fs.readFileSync(new URL('./fixtures/missed-queens.pgn',import.meta.url),'utf8'),'Opportunity learner');
 const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
 await analysis.analyzeGames([game],()=>{});
 assert(db.prepare('SELECT engine_name FROM analysis_runs LIMIT 1').pluck().get().startsWith('Stockfish '));
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
 analysis.backfillBlunderChecks();analysis.backfillWhatChanged();analysis.backfillCandidates();analysis.backfillV1();
 assert.equal(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get(),0);assert.deepEqual(db.pragma('foreign_key_check'),[]);
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),engine:'Stockfish 18',depth:12,scope:'Anonymised full-game regression, not site-equivalent centipawn scores',results},null,2));
}finally{await candidates.close();await analysis.close();database.close();}

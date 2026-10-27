// On-request engine checks and session persistence, using disposable data only.
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {loadConfig} from '../dist/apps/server/src/config.js';
import {Database} from '../dist/apps/server/src/db/database.js';
import {ImportService} from '../dist/apps/server/src/imports/import-service.js';
import {AttemptLifecycle} from '../dist/apps/server/src/training/attempt-lifecycle.js';
import {V1TrainingService} from '../dist/apps/server/src/training/v1-training-service.js';
import {setActiveProfile} from '../dist/apps/server/src/training/profile.js';
const config={...loadConfig(),stockfishDepth:12},database=new Database(':memory:',config.migrationsDir),db=database.connection;
const service=new V1TrainingService(db,config),results=[];
try{
 for(const color of ['white','black']){
  const learner=`Quiet ${color}`,pgn=`[White "${color==='white'?learner:'Opponent W'}"]\n[Black "${color==='black'?learner:'Opponent B'}"]\n\n1. e4 e5 2. Nf3 Nc6 *`;
  const saved=new ImportService(db).import(pgn,learner);setActiveProfile(db,saved.profileId);
  const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
  const source=db.prepare('SELECT id,from_position_id FROM moves WHERE game_id=? AND ply=?').get(game,color==='white'?3:4);
  const item=`quiet-${color}`,reference=color==='white'?'g1f3':'b8c6',alternative=color==='white'?'f1c4':'g8f6';
  db.prepare("INSERT INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at) VALUES (?,?,?,?,'quiet_position',2,'2026-10-27')").run(item,saved.profileId,game,source.id);
  db.prepare("INSERT INTO quiet_position_items(item_id,position_id,weakest_squares_json,acceptable_moves_json,explanation,evidence_json) VALUES (?,?,?,?, 'Develop a piece.','{}')")
    .run(item,source.from_position_id,JSON.stringify([reference.slice(0,2)]),JSON.stringify([{moveUci:reference,moveSan:color==='white'?'Nf3':'Nc6',centipawnLoss:0}]));
  db.prepare("INSERT INTO review_states(item_id,due_at) VALUES (?,'2020-01-01')").run(item);
  const attempt=new AttemptLifecycle(db).start(item).attemptId;
  const checked=await service.answerQuietChecked(attempt,alternative.slice(0,2),alternative);
  assert.equal(checked.engineCheck?.status,'useful');assert.equal(checked.outcome,'excellent');assert.equal(checked.moveVerified,true);
  assert.equal(JSON.parse(db.prepare('SELECT feedback_json FROM training_attempts WHERE id=?').pluck().get(attempt)).engineCheck.status,'useful');
  await assert.rejects(()=>service.answerQuietChecked(attempt,alternative.slice(0,2),alternative));
  results.push({name:`${color}: unlisted alternative receives engine-supported credit once`,passed:true,engineCheck:checked.engineCheck});
 }
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),engine:'Stockfish 18',scope:'On-request quiet alternatives; real engine, full game history, disposable data',results},null,2));
}finally{await service.close();database.close();}

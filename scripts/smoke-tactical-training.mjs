// Focused real-engine checks. Disposable memory database; never a live library.
import assert from 'node:assert/strict';
import {loadConfig} from '../dist/apps/server/src/config.js';
import {Database} from '../dist/apps/server/src/db/database.js';
import {ImportService} from '../dist/apps/server/src/imports/import-service.js';
import {AnalysisService} from '../dist/apps/server/src/analysis/analysis-service.js';
const config={...loadConfig(),stockfishDepth:12};
const database=new Database(':memory:',config.migrationsDir),db=database.connection;
const imports=new ImportService(db),analysis=new AnalysisService(db,config),results=[];
const fixtures=[
 {name:'Ruy Lopez Bb5 is not punished by a6',color:'white',moves:'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *',san:'Bb5',number:3,expected:false},
 {name:'A routine Modern a6 is not a tactical blunder',color:'black',moves:'1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. Nf3 a6 *',san:'a6',number:4,expected:false},
 {name:'Ruy Lopez equal exchange is not winning material',color:'white',moves:'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 *',san:'Bxc6',number:4,expected:false},
 {name:'Black can still deliver the actual mate after g4',color:'white',moves:'1. f3 e5 2. g4 Qh4# 0-1',san:'g4',number:2,expected:true},
 {name:'White can still deliver the actual mate after g5',color:'black',moves:'1. e4 f6 2. d4 g5 3. Qh5# 1-0',san:'g5',number:2,expected:true},
 {name:'A queen genuinely left en prise retains its capture tactic',color:'white',moves:'1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 *',san:'Qxe5+',number:3,expected:true},
];
try {
 for(let index=0;index<fixtures.length;index++){
  const f=fixtures[index],learner=`Tactic fixture ${index}`;
  const saved=imports.import(`[White "${f.color==='white'?learner:'Opponent'}"]\n[Black "${f.color==='black'?learner:'Opponent'}"]\n\n${f.moves}`,learner);
  const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
  await analysis.analyzeGames([game],()=>{});
  const move=db.prepare('SELECT id FROM moves WHERE game_id=? AND move_number=? AND san=?').pluck().get(game,f.number,f.san);
  const row=db.prepare(`SELECT q.grade,q.chance_loss,q.best_san,ar.engine_name FROM game_move_quality q
   JOIN analysis_runs ar ON ar.id=q.run_id WHERE q.move_id=? ORDER BY ar.rowid DESC LIMIT 1`).get(move);
  assert(row.engine_name.startsWith('Stockfish ')&&!row.engine_name.includes('Fake'));
  const items=db.prepare("SELECT id,mode FROM training_items WHERE source_move_id=? AND active=1 AND mode IN ('blunder_check','punish_blunder')").all(move);
  assert.equal(items.length,f.expected?2:0,f.name);
  if(index===0)assert(['best','good','inaccuracy'].includes(row.grade));
  const responses=items.length?db.prepare('SELECT move_san FROM acceptable_responses WHERE item_id=?').all(items[0].id).map(r=>r.move_san):[];
  results.push({name:f.name,passed:true,grade:row.grade,chanceLoss:row.chance_loss,exercises:items.length,responses});
 }
 const before=db.prepare('SELECT COUNT(*) FROM training_items WHERE active=1 AND mode IN (\'blunder_check\',\'punish_blunder\')').pluck().get();
 const attempts=db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get();
 analysis.backfillBlunderChecks();analysis.backfillV1();
 assert.equal(db.prepare("SELECT COUNT(*) FROM training_items WHERE active=1 AND mode IN ('blunder_check','punish_blunder')").pluck().get(),before);
 assert.equal(db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get(),attempts);
 assert.equal(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get(),0);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
 results.push({name:'Saved-analysis revalidation is idempotent and creates no engine job',passed:true});
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),engine:db.prepare('SELECT engine_name FROM analysis_runs LIMIT 1').pluck().get(),scope:'Curated tactical regression cases, not an engine-strength benchmark',results},null,2));
}finally{await analysis.close();database.close();}

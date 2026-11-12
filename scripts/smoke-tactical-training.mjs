import {worthwhileTacticalLine,tacticalPunishment} from '../dist/apps/server/src/analysis/tactical-punishment.js';
import {LearningFocusService} from '../dist/apps/server/src/training/learning-focus-service.js';
import {V1TrainingService} from '../dist/apps/server/src/training/v1-training-service.js';
import {UciEngine} from "../dist/apps/server/src/analysis/uci-engine.js";
import {forcedMate} from "../dist/apps/server/src/games/game-tactical-evidence.js";
import {GameReplayService} from "../dist/apps/server/src/games/game-replay-service.js";
import {OpeningGameService} from "../dist/apps/server/src/openings/opening-game-service.js";
import {OpeningReviewService} from "../dist/apps/server/src/openings/opening-review-service.js";
import {setActiveProfile} from "../dist/apps/server/src/training/profile.js";
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
 {name:'Ruy Lopez Bb5 is not punished by a6',motif:'sound_development',color:'white',moves:'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 *',san:'Bb5',number:3,expected:false},
 {name:'A routine Modern a6 is not a tactical blunder',motif:'sound_development',color:'black',moves:'1. e4 g6 2. d4 Bg7 3. Nc3 d6 4. Nf3 a6 *',san:'a6',number:4,expected:false},
 {name:'Ruy Lopez equal exchange is not winning material',motif:'equal_exchange',color:'white',moves:'1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Bxc6 dxc6 *',san:'Bxc6',number:4,expected:false},
 {name:'A sound exchange remains sound when recapture is delayed in the game',motif:'delayed_recapture',color:'black',fen:'6k1/8/1r6/8/8/6K1/2r5/1R5R b - - 0 1',moves:'1... Rcb2 2. Rxb2 Kf7 3. Rb3 Rxb3 *',san:'Rcb2',number:1,expected:false},
 {name:'Sound queen offer in the Legal mating pattern is not punished',motif:'sound_sacrifice',color:'white',moves:'1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0',san:'Nxe5',number:5,expected:false},
 {name:'Quiet g3 prevents the immediate queen mate',motif:'quiet_defence',color:'white',moves:'1. f3 e5 2. g3 Nc6 *',san:'g3',number:2,expected:false},
 {name:'A pinned knight cannot recapture the hanging queen',motif:'pinned_defender',color:'black',fen:'r3k3/4n3/3q4/8/2B5/8/8/3QR2K b - - 0 1',moves:'1... Qd5+ *',san:'Qd5+',number:1,expected:true},
 {name:'Moving the protecting rook really loses the queen',motif:'removed_defender',color:'white',fen:'2k5/3b4/8/8/6Q1/8/8/6RK w - - 0 1',moves:'1. Rf1 *',san:'Rf1',number:1,expected:true},
 {name:'Black can still deliver the actual mate after g4',motif:'forced_mate',color:'white',moves:'1. f3 e5 2. g4 Qh4# 0-1',san:'g4',number:2,expected:true},
 {name:'White misses a non-capturing royal fork',motif:'missed_fork',color:'white',fen:'r3k3/7p/4N3/8/8/8/7P/6K1 w - - 0 1',moves:'1. Kf2 *',san:'Kf2',number:1,expected:true,missedFork:'e6c7'},
 {name:'Black misses a non-capturing royal fork',motif:'missed_fork',color:'black',fen:'6k1/7p/8/8/8/4n3/7P/R3K3 b - - 0 1',moves:'1... Kf7 *',san:'Kf7',number:1,expected:true,missedFork:'e3c2'},
 {name:'An opening fork reaches the cross-game focus',motif:'missed_fork',color:'black',moves:'1. d4 Nc6 2. c4 a6 3. d5 Nb4 4. Qd4 h6 1-0',san:'h6',number:4,expected:true,missedFork:'b4c2',focus:true},
 {name:'White can still deliver the actual mate after g5',motif:'forced_mate',color:'black',moves:'1. e4 f6 2. d4 g5 3. Qh5# 1-0',san:'g5',number:2,expected:true},
 {name:'A queen genuinely left en prise retains its capture tactic',motif:'hanging_queen',color:'white',moves:'1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 *',san:'Qxe5+',number:3,expected:true},
];
try {
 for(let index=0;index<fixtures.length;index++){
  const f=fixtures[index],learner=`Tactic fixture ${index}`;
  const saved=imports.import(`[White "${f.color==='white'?learner:'Opponent'}"]\n[Black "${f.color==='black'?learner:'Opponent'}"]${f.focus?`\n[Date "2026.11.05"]\n[TimeControl "600+0"]\n[Result "1-0"]`:""}${f.fen?`\n[SetUp "1"]\n[FEN "${f.fen}"]`:""}\n\n${f.moves}`,learner);
  assert.equal(saved.imported,1,`${f.name}: the labelled PGN must import successfully (${JSON.stringify(saved)})`);
  const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
  await analysis.analyzeGames([game],()=>{});
  const move=db.prepare('SELECT id FROM moves WHERE game_id=? AND move_number=? AND san=?').pluck().get(game,f.number,f.san);
  const row=db.prepare(`SELECT q.grade,q.chance_loss,q.best_san,ar.engine_name FROM game_move_quality q
   JOIN analysis_runs ar ON ar.id=q.run_id WHERE q.move_id=? ORDER BY ar.rowid DESC LIMIT 1`).get(move);
  assert(row.engine_name.startsWith('Stockfish ')&&!row.engine_name.includes('Fake'));
  const items=db.prepare("SELECT id,mode FROM training_items WHERE source_move_id=? AND active=1 AND mode IN ('blunder_check','punish_blunder')").all(move);
  if(f.missedFork){
    const item=items.find(item=>item.mode==='blunder_check');assert(item,`${f.name}: generated practice`);
    assert.equal(JSON.parse(db.prepare('SELECT evidence_json FROM blunder_check_items WHERE item_id=?').pluck().get(item.id)).exerciseKind,'missed_opportunity');
    assert(db.prepare('SELECT 1 FROM acceptable_responses WHERE item_id=? AND move_uci=?').get(item.id,f.missedFork));
    assert(db.prepare("SELECT 1 FROM training_item_concepts WHERE item_id=? AND concept_id='tactic.fork' AND active=1").get(item.id));
    if(f.focus){
      setActiveProfile(db,saved.profileId);
      const focus=new LearningFocusService(db,new V1TrainingService(db)).get().focus;
      assert.equal(focus?.title,'Spotting winning forks');assert(focus.itemIds.includes(item.id));
    }
  }else assert.equal(items.length,f.expected?2:0,f.name);
  if(index===0)assert(['best','good','inaccuracy'].includes(row.grade));
  const responses=items.length?db.prepare('SELECT move_san FROM acceptable_responses WHERE item_id=?').all(items[0].id).map(r=>r.move_san):[];
  if(process.argv.includes('--learning-quality')){
    setActiveProfile(db,saved.profileId);
    const replay=new GameReplayService(db,new OpeningGameService(db),new OpeningReviewService(db)).get(game);
    const point=replay.checkpoints.find(p=>p.id===`engine:${move}`);
    if(f.missedFork)assert(point?.categories?.includes('attacking')&&point.pattern==='fork',`${f.name}: source review`);
    else assert.equal(Boolean(point?.categories?.includes('defending')),f.expected,`${f.name}: defensive filter`);
  }
  results.push({name:f.name,motif:f.motif??'existing_regression',expectedTactical:f.expected,passed:true,missedFork:Boolean(f.missedFork),grade:row.grade,chanceLoss:row.chance_loss,exercises:items.length,responses});
 }
 if(process.argv.includes('--learning-quality')){
  const mateEngine=new UciEngine(config.stockfishBinary,1,32);
  try{for(const fixture of [
    {fen:'7k/8/6K1/8/8/8/Q7/8 w - - 0 1',mate:1},
    {fen:'7k/8/5K2/8/8/8/Q7/8 w - - 0 1',mate:2},
    {fen:'7k/8/8/5K2/8/8/Q7/8 w - - 0 1',mate:3},
    {fen:'7k/8/8/8/5K2/8/Q7/8 w - - 0 1',mate:4},
  ]){const analysed=await mateEngine.analyze(fixture.fen,16,1),line=analysed.lines[0];assert.equal(line.mateInWhite,fixture.mate);assert.equal(forcedMate(fixture.fen,line.moveUci,fixture.mate),true);results.push({name:`Real Stockfish mate in ${fixture.mate} verified against all legal defences`,passed:true});}}
  finally{await mateEngine.close();}
 }
 // A superficially profitable queen capture must survive counterplay,
 // and agree with the engine's assessment of the complete position.
 const valueEngine=new UciEngine(config.stockfishBinary,1,32);
 try{for(const fixture of [
   {color:'white',fen:'6k1/8/1r6/8/8/8/1r6/1Q4K1 w - - 0 1',trap:'b1b2'},
   {color:'black',fen:'1q4k1/1R6/8/8/8/1R6/8/6K1 b - - 0 1',trap:'b8b7'},
 ]){
   const best=(await valueEngine.analyze(fixture.fen,14,3)).lines[0];
   const trap=(await valueEngine.analyze(fixture.fen,14,1,[fixture.trap])).lines[0];
   assert(best&&trap);assert.equal(trap.moveUci,fixture.trap);
   assert.equal(worthwhileTacticalLine(best,trap,fixture.color),false,`${fixture.color}: rook capture sacrifices too much position value`);
   assert.equal(tacticalPunishment(fixture.fen,fixture.fen,fixture.trap,JSON.stringify(trap.pvUci),trap.mateInWhite),null,
     `${fixture.color}: net material must include the lost queen`);
   results.push({name:`${fixture.color}: winning a rook at the cost of the queen is rejected by material and engine value`,passed:true,
     bestMove:best.moveSan,bestCp:best.centipawnsWhite,trapCp:trap.centipawnsWhite});
 }}finally{await valueEngine.close();}
 const before=db.prepare('SELECT COUNT(*) FROM training_items WHERE active=1 AND mode IN (\'blunder_check\',\'punish_blunder\')').pluck().get();
 const attempts=db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get();
 analysis.backfillBlunderChecks();analysis.backfillV1();
 assert.equal(db.prepare("SELECT COUNT(*) FROM training_items WHERE active=1 AND mode IN ('blunder_check','punish_blunder')").pluck().get(),before);
 assert.equal(db.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get(),attempts);
 assert.equal(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get(),0);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
 results.push({name:'Saved-analysis revalidation is idempotent and creates no engine job',passed:true});
 console.log(JSON.stringify({learningQuality:process.argv.includes('--learning-quality'),measuredAt:new Date().toISOString(),engine:db.prepare('SELECT engine_name FROM analysis_runs LIMIT 1').pluck().get(),scope:'Small labelled tactical-selection regression corpus; not general precision, recall or an engine-strength benchmark',selection:{negativeCases:fixtures.filter(f=>!f.expected).length,falseTacticalCases:results.filter(r=>r.expectedTactical===false&&r.exercises>0).length,positiveCases:fixtures.filter(f=>f.expected).length,missedTacticalCases:results.filter(r=>r.expectedTactical===true&&(r.missedFork?r.exercises<1:r.exercises!==2)).length},results},null,2));
}finally{await analysis.close();database.close();}

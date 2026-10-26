// Real-engine regression checks against a disposable in-memory database.
import assert from 'node:assert/strict';
import {Chess} from 'chess.js';
import {loadConfig} from '../dist/apps/server/src/config.js';
import {Database} from '../dist/apps/server/src/db/database.js';
import {ImportService} from '../dist/apps/server/src/imports/import-service.js';
import {AnalysisService} from '../dist/apps/server/src/analysis/analysis-service.js';
import {GameQualityService} from '../dist/apps/server/src/analysis/game-quality-service.js';
import {OpeningGameService} from '../dist/apps/server/src/openings/opening-game-service.js';
import {OpeningReviewService} from '../dist/apps/server/src/openings/opening-review-service.js';
import {GameReplayService} from '../dist/apps/server/src/games/game-replay-service.js';
import {UciEngine} from '../dist/apps/server/src/analysis/uci-engine.js';
const config={...loadConfig(),stockfishDepth:12},database=new Database(':memory:',config.migrationsDir),db=database.connection;
const imports=new ImportService(db),analysis=new AnalysisService(db,config),openings=new OpeningGameService(db),quality=new GameQualityService(db,config,openings),replay=new GameReplayService(db,openings,new OpeningReviewService(db));
const engine=new UciEngine(config.stockfishBinary,1,128),results=[];
try{
 await engine.initialize();assert(engine.name.startsWith('Stockfish ')&&!engine.name.includes('Fake'));
 for(const color of ['white','black']){
  const initial=color==='white'?'6k1/8/8/8/8/8/8/3Q2K1 w - - 0 1':'3q2k1/8/8/8/8/8/8/6K1 b - - 0 1';
  const board=new Chess(initial),cycle=color==='white'?['d1d2','g8h7','d2d1','h7g8']:['d8d7','g1h2','d7d8','h2g1'];
  for(const uci of [...cycle,...cycle])board.move({from:uci.slice(0,2),to:uci.slice(2)});
  assert(board.isThreefoldRepetition());
  board.setHeader('White',color==='white'?'Reliability learner':'Opponent W');board.setHeader('Black',color==='black'?'Reliability learner':'Opponent B');board.setHeader('Result','1/2-1/2');
  const saved=imports.import(board.pgn(),'Reliability learner');assert.equal(saved.jobId,null);
  const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
  await analysis.analyzeGames([game],()=>{});const report=quality.report(game,saved.profileId);
  assert.equal(report.ruleVersion,'chances-v3');assert.equal(report.moves.at(-1).chancesAfter,50,'Repetition is a draw');
  assert(report[color].counts.mistake+report[color].counts.blunder>0,'Drawing away the advantage must be noticed');
  assert(report[color].accuracy<100);
  results.push({name:`History-aware repetition as ${color}`,passed:true,accuracy:report[color].accuracy,counts:report[color].counts,finalBalance:report.moves.at(-1).chancesAfter});
 }
 const positions=['r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3','rnbqkbnr/pppppp1p/6p1/8/3PP3/8/PPP2PPP/RNBQKBNR b KQkq - 0 2',new Chess().fen()];
 for(let index=0;index<12;index++){
  const result=await engine.analyze(positions[index%positions.length],14,3,[],200_000);
  assert.equal(new Set(result.lines.map(line=>line.moveUci)).size,result.lines.length);assert.equal(result.lines[0].rank,1);
  assert.equal(new Set(result.lines.map(line=>line.depth)).size,1);
  results.push({name:`Distinct bounded candidate set ${index+1}`,passed:true,depth:result.depth,moves:result.lines.map(line=>line.moveSan)});
 }
 const saved=imports.import('[White "Reliability learner"]\n[Black "Mate opponent"]\n[Date "2026.10.26"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1','Reliability learner');
 const game=db.prepare('SELECT id FROM games WHERE import_batch_id=?').pluck().get(saved.batchId);
 let state=replay.get(game);const old=state.snapshotId;
 state=replay.act(game,{snapshotId:old,version:state.version,action:'jump',ply:1});
 await analysis.analyzeGames([game],()=>{});assert.equal(replay.get(game).snapshotId,old);
 state=replay.act(game,{snapshotId:state.snapshotId,version:state.version,action:'latest',ply:2});
 assert.notEqual(state.snapshotId,old);assert.equal(state.analysisPending,false);assert(state.activeCheckpointId.startsWith('engine:'));
 assert(db.prepare('SELECT 1 FROM game_review_snapshots WHERE id=?').get(old));
 results.push({name:'Latest real-engine replay preserves the earlier snapshot',passed:true});
 assert.equal(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get(),0);
 assert.deepEqual(db.pragma('foreign_key_check'),[]);
 console.log(JSON.stringify({measuredAt:new Date().toISOString(),engine:engine.name,scope:'Curated regression cases, not a strength or parity benchmark.',results},null,2));
}finally{await analysis.close();await engine.close();database.close();}

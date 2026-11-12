import path from 'node:path';
import {Chess} from 'chess.js';
import {afterEach,expect,it} from 'vitest';
import {Database} from '../db/database.js';
import {ImportService} from '../imports/import-service.js';
import {AnalysisService} from './analysis-service.js';
import {loadConfig} from '../config.js';
import {tacticalPunishment} from './tactical-punishment.js';
import {tacticalMotif} from './tactical-motif.js';
import {GameReplayService} from '../games/game-replay-service.js';
import {OpeningGameService} from '../openings/opening-game-service.js';
import {OpeningReviewService} from '../openings/opening-review-service.js';
import {setActiveProfile} from '../training/profile.js';

const databases:Database[]=[];
afterEach(()=>{for(const database of databases.splice(0))database.close();});

it.each([
 {color:'white',fen:'r3k3/7p/4N3/8/8/8/7P/6K1 w - - 0 1',played:'Kf2',pv:['Nc7+','Kd7','Nxa8','Kc6','Nc7','Kd6']},
 {color:'black',fen:'6k1/7p/8/8/8/4n3/7P/R3K3 b - - 0 1',played:'Kf7',pv:['Nc2+','Kd2','Nxa1','Kc3','Nc2','Kd3']},
])('[G2_PROOF] keeps a missed non-capturing $color fork in generated training and source review',({color,fen,played,pv})=>{
 const database=new Database(':memory:',path.resolve('migrations'));databases.push(database);const db=database.connection;
 const saved=new ImportService(db).import(`[White "${color==='white'?'Learner':'Opponent'}"]\n[Black "${color==='black'?'Learner':'Opponent'}"]\n[SetUp "1"]\n[FEN "${fen}"]\n\n${color==='white'?'1.':'1...'} ${played} *`,'Learner');
 expect(saved.imported).toBe(1);setActiveProfile(db,saved.profileId!);
 const game=db.prepare('SELECT id FROM games').pluck().get() as string;
 const move=db.prepare('SELECT id,from_position_id,to_position_id FROM moves WHERE game_id=?').get(game) as {id:string;from_position_id:string;to_position_id:string};
 const sign=color==='white'?1:-1;
 db.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at)
  VALUES ('run',?,'Recorded fixture','1',18,3,1,128,5,'completed','2026-11-06','2026-11-06')`).run(game);
 db.prepare(`INSERT INTO move_assessments(id,run_id,move_id,eval_before_cp_white,eval_after_cp_white,comparison_loss,classification,meaningful)
  VALUES ('assessment','run',?,?,?,500,'blunder',1)`).run(move.id,300*sign,-200*sign);
 db.prepare(`INSERT INTO position_analyses(id,run_id,position_id,centipawns_white,depth) VALUES ('before','run',?,?,18)`).run(move.from_position_id,300*sign);
 db.prepare(`INSERT INTO position_analyses(id,run_id,position_id,centipawns_white,depth) VALUES ('after','run',?,?,18)`).run(move.to_position_id,-200*sign);
 const board=new Chess(fen),uci=pv.map(san=>{const m=board.move(san);return m.from+m.to;});
 db.prepare(`INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,centipawns_white,pv_uci_json,pv_san_json)
  VALUES ('line','before',1,?,?,?,?,?)`).run(uci[0],pv[0],300*sign,JSON.stringify(uci),JSON.stringify(pv));
 const service=new AnalysisService(db,loadConfig());service.backfillBlunderChecks();service.backfillV1();
 const item=db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode='blunder_check' AND active=1").pluck().get(move.id) as string;
 expect(item).toBeTruthy();
 expect(JSON.parse(db.prepare('SELECT evidence_json FROM blunder_check_items WHERE item_id=?').pluck().get(item) as string)).toMatchObject({exerciseKind:'missed_opportunity',proof:{kind:'material',gainPawns:5}});
 expect(db.prepare('SELECT move_uci,categories_json FROM acceptable_responses WHERE item_id=?').get(item)).toMatchObject({move_uci:uci[0],categories_json:'["check","threat"]'});
 expect(db.prepare("SELECT concept_id FROM training_item_concepts WHERE item_id=? AND concept_id LIKE 'tactic.%' AND active=1").pluck().all(item)).toEqual(['tactic.fork']);
 const replayService=new GameReplayService(db,new OpeningGameService(db),new OpeningReviewService(db),75);
 const replay=replayService.get(game);
 expect(replay.checkpoints.find(point=>point.id===`engine:${move.id}`)).toMatchObject({pattern:'fork',categories:['attacking'],canRecall:true});
 db.prepare("INSERT INTO training_attempts(id,item_id,answered_at,created_at,outcome,score) VALUES ('past',?,'2026-11-06','2026-11-06','excellent',1)").run(item);
 db.prepare("INSERT INTO training_item_concepts(item_id,concept_id,source,confidence,is_primary) VALUES (?,'tactic.hanging_piece','manual',1,0)").run(item);
 db.prepare("UPDATE review_states SET attempts=2,successes=1,mastery_level=1,due_at='2026-12-01' WHERE item_id=?").run(item);
 service.backfillBlunderChecks();service.backfillV1();
 expect(db.prepare("SELECT id FROM training_items WHERE source_move_id=? AND mode='blunder_check' AND active=1").pluck().get(move.id)).toBe(item);
 expect(db.prepare('SELECT attempts,successes,mastery_level,due_at FROM review_states WHERE item_id=?').get(item)).toEqual({attempts:2,successes:1,mastery_level:1,due_at:'2026-12-01'});
 expect(db.prepare("SELECT outcome,score FROM training_attempts WHERE id='past'").get()).toEqual({outcome:'excellent',score:1});
 expect(db.prepare("SELECT source,active FROM training_item_concepts WHERE item_id=? AND concept_id='tactic.hanging_piece'").get(item)).toEqual({source:'manual',active:1});
 expect(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
 // A material-winning fork must not survive as a solution if a stronger
 // stored quiet move makes that fork an inaccuracy, even within 0.75 pawns.
 db.prepare("UPDATE engine_lines SET rank=2,centipawns_white=0 WHERE id='line'").run();
 const better=color==='white'?'g1f1':'g8f8';
 db.prepare(`INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,centipawns_white,pv_uci_json,pv_san_json)
  VALUES ('better','before',1,?,'Kf1',?,?, '[]')`).run(better,75*sign,JSON.stringify([better]));
 service.backfillBlunderChecks();service.backfillV1();
 expect(db.prepare('SELECT active FROM training_items WHERE id=?').pluck().get(item)).toBe(0);
 expect(db.prepare("SELECT outcome FROM training_attempts WHERE id='past'").pluck().get()).toBe('excellent');
 // A previous policy's feedback remains readable until the learner loads
 // the new revision. The inferior fork must then stop earning recall credit.
 db.prepare("UPDATE game_review_snapshots SET source_revision=json_set(source_revision,'$[3]','review-v4-inaccuracies') WHERE id=?").run(replay.snapshotId);
 const legacy=replayService.get(game);expect(legacy.updatesAvailable).toBe(true);expect(legacy.snapshotId).toBe(replay.snapshotId);
 const latest=replayService.act(game,{snapshotId:legacy.snapshotId,version:legacy.version,action:'latest',ply:0,checkpointId:`engine:${move.id}`});
 expect(latest.snapshotId).not.toBe(legacy.snapshotId);
 const answer=replayService.act(game,{snapshotId:latest.snapshotId,version:latest.version,action:'answer',moveUci:uci[0]!});
 expect(answer.phase).toBe('question');
 expect(db.prepare('SELECT COUNT(*) FROM game_review_snapshots WHERE game_id=?').pluck().get(game)).toBe(2);
 expect(db.prepare("SELECT outcome FROM training_attempts WHERE id='past'").pluck().get()).toBe('excellent');
 expect(db.pragma('foreign_key_check')).toEqual([]);
});

it('does not call a two-target attack a winning fork without retained material and a capture of a forked target',()=>{
 const fen='r3k3/7p/4N3/8/8/8/7P/6K1 w - - 0 1';
 const pv='["e6c7","e8d7","c7b5","d7c6"]';
 expect(tacticalPunishment(fen,fen,'e6c7',pv,null)).toBeNull();
 // A different later gain must not be used to prove this particular double attack.
 expect(tacticalMotif(fen,{uci:'e6c7'},{kind:'material',gainPawns:5,pvUci:JSON.parse(pv)})).toBe('material threat');
});

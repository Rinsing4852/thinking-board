import {AttemptLifecycle} from './attempt-lifecycle.js';
import {TrainingService} from './training-service.js';
import {DailyPracticeService} from "./daily-practice-service.js";
import {OpeningReviewService} from "../openings/opening-review-service.js";
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {afterEach,expect,it,vi} from 'vitest';
import {Database} from '../db/database.js';
import {ImportService} from '../imports/import-service.js';
import {AnalysisService} from '../analysis/analysis-service.js';
import {loadConfig} from '../config.js';
import {V1TrainingService} from './v1-training-service.js';
import {LearningFocusService} from './learning-focus-service.js';
import {setActiveProfile} from './profile.js';
let db:Database|undefined,analysis:AnalysisService|undefined,training:V1TrainingService|undefined;
afterEach(async()=>{await analysis?.close();await training?.close();db?.close();vi.useRealTimers();});
async function fixture(filename=':memory:'){
 db=new Database(filename,path.resolve('migrations'));const sql=db.connection,imports=new ImportService(sql);
 const text=(opponent:string,date:string,clock='600+0')=>`[White "Focus learner"]\n[Black "${opponent}"]\n[UTCDate "${date}"]\n[UTCTime "12:00:00"]\n[TimeControl "${clock}"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`;
 const saved=imports.import(text('One','2026.10.30')+'\n\n'+text('Two','2026.10.31'),'Focus learner');setActiveProfile(sql,saved.profileId!);
 analysis=new AnalysisService(sql,{...loadConfig(),stockfishBinary:path.resolve('tests/fake-stockfish.mjs')});
 const games=(sql.prepare('SELECT id FROM games').pluck().all() as string[]);await analysis.analyzeGames(games,()=>{});
 training=new V1TrainingService(sql);return {sql,imports,profile:saved.profileId!,games,service:new LearningFocusService(sql,training),text};
}
it('[G3_PLAN] builds an explainable recurring focus with distinct games and bounded due practice',async()=>{
 const f=await fixture();const before=f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all();
 const plan=f.service.get();expect(plan.focus?.title).toBe('Preventing mating threats');expect(plan.focus?.games).toBe(2);expect(plan.focus?.provisional).toBe(false);
 expect(plan.focus?.lesson?.habit).toContain('escape squares');expect(plan.focus?.lesson?.warning).toContain('saved analysis');
 expect(plan.focus?.sources).toHaveLength(2);expect(plan.focus?.dueCount).toBe(2);expect(plan.focus?.reason).toContain('2 of 2 comparable');
 expect(f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all()).toEqual(before);
 expect(f.sql.prepare('SELECT COUNT(*) FROM game_review_snapshots').pluck().get()).toBe(0);
 const daily=new DailyPracticeService(f.sql,new OpeningReviewService(f.sql),training!);
 expect(daily.get().thinkingCount).toBe(2);
 const session=daily.start(f.profile).thinkingSession!;expect(session.items).toHaveLength(2);
 expect(new Set(session.items.map(item=>item.itemId)).size).toBe(2);
 expect(f.sql.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(0);
 expect(f.sql.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
 expect(f.service.start(f.profile,plan.focus!.id).id).toBe(session.id);
});
it('[G3_HISTORY] isolates cohorts, filters and profiles without resetting completed practice',async()=>{
 const f=await fixture();f.sql.prepare("UPDATE analysis_runs SET engine_version='different' WHERE game_id=?").run(f.games[0]);
 const plan=f.service.get();expect(plan.eligibleGames).toBe(1);expect(plan.focus?.provisional).toBe(true);
 f.sql.prepare("UPDATE games SET played_at='2020-01-01' ").run();expect(f.service.get(7).focus).toBeNull();
 f.sql.prepare("UPDATE review_states SET due_at='2999-01-01'").run();expect(f.service.get().focus?.dueCount).toBe(0);
 const other=f.imports.import('[White "Other focus"]\n[Black "Other opponent"]\n\n1. d4 d5 *','Other focus');setActiveProfile(f.sql,other.profileId!);
 expect(f.service.get().focus).toBeNull();expect(()=>f.service.start(f.profile,plan.focus!.id)).toThrow('player changed');
});

it('[G3_HISTORY] excludes stale exercise evidence when the latest assessment is no longer a mistake',async()=>{
 const f=await fixture();expect(f.service.get().focus).not.toBeNull();
 f.sql.prepare('UPDATE move_assessments SET meaningful=0').run();
 expect(f.service.get().focus).toBeNull();
});

it('[G3_TRANSFER] separates later games, colour/platform and incomplete grading around recorded study',async()=>{
 const f=await fixture();const focus=f.service.get().focus!,item=focus.itemIds[0]!;
 const attempt=new AttemptLifecycle(f.sql).start(item);new TrainingService(f.sql).reveal(attempt.attemptId);
 f.sql.prepare("UPDATE training_attempts SET answered_at='2026-11-01T12:00:00.000Z' WHERE id=?").run(attempt.attemptId);
 const later=f.imports.import(f.text('Later','2026.11.02')+'\n\n'+f.text('Other speed','2026.11.02','60+0'),'Focus learner');
 const more=f.sql.prepare("SELECT id FROM games WHERE id NOT IN (?,?)").pluck().all(...f.games) as string[];
 await analysis!.analyzeGames(more,()=>{});
 let transfer=f.service.get(null,'rapid').focus!.transfer!;
 expect(transfer.before.games).toBe(2);expect(transfer.after.games).toBe(1);expect(transfer.after.flaggedGames).toBe(1);
 expect(transfer.after.ownMoves).toBe(2);expect(transfer.after.errorsPer100Moves).not.toBeNull();expect(transfer.after.learnerRatings).toBeNull();
 const laterGame=f.sql.prepare("SELECT id FROM games WHERE black_name='Later'").pluck().get() as string;
 f.sql.prepare("UPDATE games SET headers_json=json_set(headers_json,'$.Site','https://chess.com/game/live/123') WHERE id=?").run(laterGame);
 expect(f.service.get(null,'rapid').focus!.transfer!.after.games).toBe(0);
 f.sql.prepare("UPDATE games SET headers_json=json_remove(headers_json,'$.Site') WHERE id=?").run(laterGame);
 f.sql.prepare("DELETE FROM game_move_quality WHERE move_id=(SELECT id FROM moves WHERE game_id=? AND mover_color='white' LIMIT 1)").run(laterGame);
 transfer=f.service.get(null,'rapid').focus!.transfer!;expect(transfer.after.games).toBe(0);expect(transfer.incompleteGames).toBe(1);
 // Merely reading the plan creates no extra attempts or analysis jobs.
 expect(f.sql.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(1);
 expect(f.sql.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
 expect(later.profileId).toBe(f.profile);
});
it('[G3_TRANSFER] does not infer a study date from old unbound or unfinished practice',async()=>{
 const f=await fixture(),item=f.service.get().focus!.itemIds[0]!;
 const attempt=new AttemptLifecycle(f.sql).start(item);expect(f.service.get().focus!.transfer).toBeNull();
 new TrainingService(f.sql).reveal(attempt.attemptId);expect(f.service.get().focus!.transfer).not.toBeNull();
 f.sql.prepare('DELETE FROM training_game_review_context').run();expect(f.service.get().focus!.transfer).toBeNull();
});

it('[G3_TRANSFER] excludes uncertain study-day timing, future games and stale exercise provenance',async()=>{
 const f=await fixture(),item=f.service.get().focus!.itemIds[0]!;
 const attempt=new AttemptLifecycle(f.sql).start(item);new TrainingService(f.sql).reveal(attempt.attemptId);
 f.sql.prepare("UPDATE training_attempts SET answered_at='2026-10-31T13:00:00.000Z' WHERE id=?").run(attempt.attemptId);
 const uncertain=f.games.find(id=>(f.sql.prepare('SELECT played_at FROM games WHERE id=?').pluck().get(id) as string).startsWith('2026-10-31'))!;
 f.sql.prepare("UPDATE games SET headers_json=json_remove(headers_json,'$.UTCTime') WHERE id=?").run(uncertain);
 expect(f.service.get().focus!.transfer!.timingExcludedGames).toBe(1);
 const old=f.sql.prepare('SELECT played_at FROM games WHERE id=?').pluck().get(uncertain);
 f.sql.prepare("UPDATE games SET played_at='2999-01-01T00:00:00Z' WHERE id=?").run(uncertain);
 expect(f.service.get().eligibleGames).toBe(1);
 f.sql.prepare('UPDATE games SET played_at=? WHERE id=?').run(old,uncertain);
 f.sql.prepare("UPDATE blunder_check_items SET explanation=explanation||' Updated' WHERE item_id=?").run(item);
 expect(f.service.get().focus!.transfer).toBeNull();
});

it('keeps a completed focus round complete instead of refilling it with the broader queue',async()=>{
 const f=await fixture(),daily=new DailyPracticeService(f.sql,new OpeningReviewService(f.sql),training!);
 const focus=f.service.get().focus!,session=f.service.start(f.profile,focus.id);
 expect(daily.get()).toMatchObject({thinkingCount:2,next:'thinking',openingCount:0});
 const lifecycle=new AttemptLifecycle(f.sql),answer=new TrainingService(f.sql);
 for(const item of session.items){const attempt=lifecycle.start(item.itemId,session.id!);answer.reveal(attempt.attemptId);}
 const states=f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all();
 expect(training!.dashboard().practice!.available).toBeGreaterThan(0);
 expect(daily.get()).toMatchObject({status:'completed',thinkingDone:true,thinkingCount:2,next:null});
 expect(new DailyPracticeService(f.sql,new OpeningReviewService(f.sql),training!).get(7)).toMatchObject({status:'completed',thinkingCount:2});
 expect(daily.start(f.profile).status).toBe('completed');
 expect(f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all()).toEqual(states);
 expect(f.sql.prepare('SELECT COUNT(*) FROM daily_practice_plans').pluck().get()).toBe(1);
 f.sql.prepare("UPDATE review_states SET due_at='2000-01-01'").run();
 const optional=f.service.start(f.profile,focus.id);expect(optional.id).not.toBe(session.id);
 expect(daily.get()).toMatchObject({status:'completed',thinkingCount:2});
 expect(f.sql.prepare('SELECT COUNT(*) FROM daily_practice_plans').pluck().get()).toBe(1);
});

it('saves a stable personal focus and baseline across scopes and restarts without scheduling study',async()=>{
 const f=await fixture(),recommendation=f.service.get(),before=f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all();
 const saved=f.service.choose(f.profile,recommendation.focus!.id,null,'rapid',null,recommendation.cohort!);
 expect(saved.personalPlan).toMatchObject({evidenceStatus:'current',studiedAt:null,baseline:{groups:[{games:2,ownMoves:4,playerColor:'white',source:'pgn'}]}});
 expect(new LearningFocusService(f.sql,training!).get(1).personalPlan?.id).toBe(saved.personalPlan!.id);
 expect(f.service.get(1).gameDays).toBeNull();
 expect(new DailyPracticeService(f.sql,new OpeningReviewService(f.sql),training!).get(1).gameDays).toBeNull();
 expect(f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all()).toEqual(before);
 expect(f.sql.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(0);
 expect(()=>f.service.choose(f.profile,recommendation.focus!.id,null,'rapid',null)).toThrow('saved plan changed');
 const session=f.service.start(f.profile,recommendation.focus!.id,1);expect(session.items).toHaveLength(2);
});

it('flags changed evidence, keeps the chosen baseline and explicitly replaces plans with history',async()=>{
 const f=await fixture(),rec=f.service.get(),saved=f.service.choose(f.profile,rec.focus!.id,null,'rapid',null);
 const baseline=saved.personalPlan!.baseline;
 f.sql.prepare("UPDATE analysis_runs SET engine_version='new version'").run();
 const changed=f.service.get();expect(changed.personalPlan).toMatchObject({id:saved.personalPlan!.id,evidenceStatus:'superseded',baseline});
 expect(changed.focus!.dueCount).toBe(0);expect(changed.suggestion).toMatchObject({id:rec.focus!.id});
 expect(()=>f.service.start(f.profile,rec.focus!.id)).toThrow('no positions are due');
 f.service.keep(f.profile,saved.personalPlan!.id,null,'rapid');expect(f.service.get().suggestion).toMatchObject({kept:true});
 expect(f.service.get().personalPlan!.baseline).toEqual(baseline);
 const replaced=f.service.choose(f.profile,rec.focus!.id,null,'rapid',saved.personalPlan!.id);
 expect(replaced.personalPlan).toMatchObject({evidenceStatus:'current',history:[{id:saved.personalPlan!.id,title:rec.focus!.title,studiedAt:null}]});
 expect(replaced.personalPlan!.id).not.toBe(saved.personalPlan!.id);
 expect(()=>f.service.keep(f.profile,saved.personalPlan!.id,null)).toThrow('saved plan changed');
 expect(f.sql.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('records study from provenance-bound attempts, retains it after evidence changes and never calls it mastery',async()=>{
 const f=await fixture(),rec=f.service.get(),saved=f.service.choose(f.profile,rec.focus!.id,null,'rapid',null);
 const lifecycle=new AttemptLifecycle(f.sql),answer=new TrainingService(f.sql),started=lifecycle.start(rec.focus!.itemIds[0]!);
 expect(f.service.get().personalPlan!.studiedAt).toBeNull();
 answer.reveal(started.attemptId);
 const studied=f.service.get().personalPlan!;expect(studied.studiedAt).not.toBeNull();expect(studied.followUp!.groups).toEqual([]);
 f.sql.prepare("UPDATE blunder_check_items SET explanation=explanation||' new proof' WHERE item_id=?").run(rec.focus!.itemIds[0]);
 expect(f.service.get().personalPlan).toMatchObject({id:saved.personalPlan!.id,studiedAt:studied.studiedAt,evidenceStatus:'superseded'});
 expect(f.sql.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(1);
 const other=f.imports.import('[White "Separate learner"]\n[Black "Someone"]\n\n1. d4 d5 *','Separate learner');setActiveProfile(f.sql,other.profileId!);
 expect(f.service.get().personalPlan).toBeNull();expect(()=>f.service.keep(f.profile,saved.personalPlan!.id,null)).toThrow('player changed');
});

it('does not infer automatic thinking causes and preserves superseded learner reports',async()=>{
 const f=await fixture(),item=f.service.get().focus!.itemIds[0]!;
 f.sql.prepare("INSERT OR REPLACE INTO training_item_concepts(item_id,concept_id,source,confidence,is_primary,active) VALUES (?,'process.calculation_failure','automatic',0.4,1,1)").run(item);
 expect(training!.dashboard().skills.find(skill=>skill.conceptId==='process.calculation_failure')?.realGameOccurrences??0).toBe(0);
 training!.classify(item,['process.calculation_failure']);
 expect(training!.dashboard().skills.find(skill=>skill.conceptId==='process.calculation_failure')?.label).toBe('Your report: Calculation failure');
 training!.classify(item,['process.cause_unknown']);
 expect(f.sql.prepare("SELECT active FROM training_item_concepts WHERE item_id=? AND concept_id='process.calculation_failure' AND source='manual'").pluck().get(item)).toBe(0);
 expect(training!.dashboard().skills.some(skill=>skill.conceptId==='process.cause_unknown')).toBe(false);
});

it('retains the original baseline and measures later games in platform/colour groups after study',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-11-01T12:00:00Z'));
 const f=await fixture(),rec=f.service.get(),saved=f.service.choose(f.profile,rec.focus!.id,null,'rapid',null);
 const attempt=new AttemptLifecycle(f.sql).start(rec.focus!.itemIds[0]!);new TrainingService(f.sql).reveal(attempt.attemptId);
 vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
 f.imports.import(f.text('Chesscom later','2026.11.02')+'\n\n'+f.text('Lichess later','2026.11.03'),'Focus learner');
 const later=f.sql.prepare('SELECT id FROM games WHERE id NOT IN (?,?)').pluck().all(...f.games) as string[];await analysis!.analyzeGames(later,()=>{});
 f.sql.prepare("UPDATE games SET headers_json=json_set(headers_json,'$.Site','https://chess.com/game/live/123','$.WhiteElo','500','$.BlackElo','550') WHERE black_name='Chesscom later'").run();
 f.sql.prepare("UPDATE games SET headers_json=json_set(headers_json,'$.Site','https://lichess.org/abcdefgh','$.WhiteElo','900','$.BlackElo','1000') WHERE black_name='Lichess later'").run();
 const plan=f.service.get();expect(plan.personalPlan!.baseline).toEqual(saved.personalPlan!.baseline);
 expect(plan.personalPlan!.followUp!.groups).toEqual(expect.arrayContaining([
  expect.objectContaining({source:'chesscom',playerColor:'white',games:1,ownMoves:2,learnerRatings:{min:500,max:500,known:1}}),
  expect.objectContaining({source:'lichess',playerColor:'white',games:1,ownMoves:2,learnerRatings:{min:900,max:900,known:1}}),
 ]));
 expect(plan.personalPlan!.id).toBe(saved.personalPlan!.id);expect(plan.personalPlan!.evidenceStatus).toBe('current');
 // New games are suggestions/evidence, never a silent plan replacement or new analysis request.
 expect(f.sql.prepare('SELECT COUNT(*) FROM personal_learning_plans').pluck().get()).toBe(1);
 expect(f.sql.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
});

it('retains supporting games when they leave the rolling recommendation window',async()=>{
 const f=await fixture(),rec=f.service.get(),saved=f.service.choose(f.profile,rec.focus!.id,null,'rapid',null);
 const template=f.sql.prepare("SELECT ar.*,q.rule_version FROM analysis_runs ar JOIN game_move_quality q ON q.run_id=ar.id LIMIT 1").get() as {id:string;rule_version:string};
 for(let i=0;i<101;i++){
  f.imports.import(f.text(`Window ${i}`,'2026.11.20'),'Focus learner');
  const game=f.sql.prepare('SELECT id FROM games WHERE black_name=?').pluck().get(`Window ${i}`) as string,run=`window-${i}`;
  f.sql.prepare(`INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at)
   SELECT ?,?,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at FROM analysis_runs WHERE id=?`).run(run,game,template.id);
  for(const move of f.sql.prepare('SELECT id FROM moves WHERE game_id=?').pluck().all(game))f.sql.prepare("INSERT INTO game_move_quality VALUES (?,?,?,50,50,0,100,'good','e2e4','e4')").run(run,move,template.rule_version);
 }
 const retained=f.service.get();expect(retained.personalPlan).toMatchObject({id:saved.personalPlan!.id,evidenceStatus:'current',baseline:saved.personalPlan!.baseline});
 expect(retained.focus!.dueCount).toBe(2);expect(retained.focus!.sources.map(source=>source.gameId).sort()).toEqual(f.games.sort());
});

it('restores the chosen plan, baseline and provenance-bound study after a database restart',async()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'thinking-personal-plan-')),filename=path.join(directory,'trainer.sqlite3');
 try{
  const f=await fixture(filename),rec=f.service.get(),saved=f.service.choose(f.profile,rec.focus!.id,null,'rapid',null);
  const attempt=new AttemptLifecycle(f.sql).start(rec.focus!.itemIds[0]!);new TrainingService(f.sql).reveal(attempt.attemptId);
  await analysis!.close();analysis=undefined;await training!.close();training=undefined;db!.close();db=undefined;
  db=new Database(filename,path.resolve('migrations'));training=new V1TrainingService(db.connection);
  const restored=new LearningFocusService(db.connection,training).get();
  expect(restored.personalPlan).toMatchObject({id:saved.personalPlan!.id,evidenceStatus:'current',baseline:saved.personalPlan!.baseline});
  expect(restored.personalPlan!.studiedAt).toBeTruthy();expect(db.connection.prepare('SELECT COUNT(*) FROM training_attempts').pluck().get()).toBe(1);
  expect(db.connection.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
 }finally{await analysis?.close();analysis=undefined;await training?.close();training=undefined;db?.close();db=undefined;fs.rmSync(directory,{recursive:true,force:true});}
});

it('never silently substitutes broad practice when a saved focus loses its supporting evidence',async()=>{
 const f=await fixture(),rec=f.service.get();f.service.choose(f.profile,rec.focus!.id,null,'rapid',null);
 f.sql.prepare("INSERT INTO daily_practice_plans(id,profile_id,local_day,opening_count,thinking_count,created_at) VALUES ('pending-focus',?,'2026-11-24',0,2,'2026-11-24T00:00:00Z')").run(f.profile);
 f.sql.prepare("UPDATE blunder_check_items SET explanation=explanation||' updated'").run();
 const daily=new DailyPracticeService(f.sql,new OpeningReviewService(f.sql),training!);
 expect(()=>daily.start(f.profile)).toThrow('Saved focus evidence changed');
 expect(daily.get()).toMatchObject({status:'active',thinkingCount:2});
 expect(f.sql.prepare('SELECT COUNT(*) FROM training_sessions').pluck().get()).toBe(0);
 expect(f.service.get().personalPlan!.evidenceStatus).toBe('superseded');
});

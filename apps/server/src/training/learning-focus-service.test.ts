import {DailyPracticeService} from "./daily-practice-service.js";
import {OpeningReviewService} from "../openings/opening-review-service.js";
import path from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {Database} from '../db/database.js';
import {ImportService} from '../imports/import-service.js';
import {AnalysisService} from '../analysis/analysis-service.js';
import {loadConfig} from '../config.js';
import {V1TrainingService} from './v1-training-service.js';
import {LearningFocusService} from './learning-focus-service.js';
import {setActiveProfile} from './profile.js';
let db:Database|undefined,analysis:AnalysisService|undefined,training:V1TrainingService|undefined;
afterEach(async()=>{await analysis?.close();await training?.close();db?.close();});
async function fixture(){
 db=new Database(':memory:',path.resolve('migrations'));const sql=db.connection,imports=new ImportService(sql);
 const text=(opponent:string,date:string,clock='600+0')=>`[White "Focus learner"]\n[Black "${opponent}"]\n[UTCDate "${date}"]\n[UTCTime "12:00:00"]\n[TimeControl "${clock}"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`;
 const saved=imports.import(text('One','2026.10.30')+'\n\n'+text('Two','2026.10.31'),'Focus learner');setActiveProfile(sql,saved.profileId!);
 analysis=new AnalysisService(sql,{...loadConfig(),stockfishBinary:path.resolve('tests/fake-stockfish.mjs')});
 const games=(sql.prepare('SELECT id FROM games').pluck().all() as string[]);await analysis.analyzeGames(games,()=>{});
 training=new V1TrainingService(sql);return {sql,imports,profile:saved.profileId!,games,service:new LearningFocusService(sql,training),text};
}
it('[G3_PLAN] builds an explainable recurring focus with distinct games and bounded due practice',async()=>{
 const f=await fixture();const before=f.sql.prepare('SELECT * FROM review_states ORDER BY item_id').all();
 const plan=f.service.get();expect(plan.focus?.title).toBe('Preventing mating threats');expect(plan.focus?.games).toBe(2);expect(plan.focus?.provisional).toBe(false);
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

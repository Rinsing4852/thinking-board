import {describe,expect,it} from 'vitest';
import {gameReviewProgress} from './game-review-progress.js';
describe('review progress, separate from learning performance',()=>{
 it('does not count skips, failed answers or events from other decisions',()=>{
  expect(gameReviewProgress(['a','b'],[{checkpoint_id:'a',result:'unverified'},{checkpoint_id:'b',result:'skipped'},{checkpoint_id:'old',result:'recalled'}])).toMatchObject({status:'not_started',reviewedCount:0});
 });
 it('applies manual resets and later help in event order, including games without marked moves',()=>{
  expect(gameReviewProgress([],[{checkpoint_id:'review:game',result:'game_complete'}])).toMatchObject({status:'complete',totalCount:0});
  expect(gameReviewProgress([],[]).status).toBe('not_started');
  expect(gameReviewProgress(['a','b'],[{checkpoint_id:'review:game',result:'game_complete'},{checkpoint_id:'review:game',result:'game_not_started'},{checkpoint_id:'a',result:'shown'}])).toMatchObject({status:'in_progress',reviewedIds:['a']});
 });
});

import {expect,it} from 'vitest';
import {tacticalLesson} from './tactical-lessons.js';
it('keeps attacking and defensive warnings distinct and makes no diagnosis for unknown evidence',()=>{
 expect(tacticalLesson('fork',false)?.warning).toContain('you can create');
 expect(tacticalLesson('fork',true)?.warning).toContain('the opponent can create');
 expect(tacticalLesson('fork',true)?.habit).toContain('not automatically winning');
 expect(tacticalLesson('missed mate',false)?.habit).toContain('every legal defence');
 expect(tacticalLesson('mating threat',true)?.habit).toContain('escape squares');
 expect(tacticalLesson('unclassified decision',false)).toBeNull();
});

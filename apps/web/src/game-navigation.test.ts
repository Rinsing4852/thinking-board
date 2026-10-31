import {expect,it} from 'vitest';
import {gameRoute} from './game-navigation';
it('[G1_NAV] preserves focused game and position links while keeping library and patterns separate',()=>{
 expect(gameRoute('#games')).toEqual({view:'library',gameId:null,ply:null});
 expect(gameRoute('#games?view=patterns').view).toBe('patterns');
 expect(gameRoute('#games?game=my%20game&ply=12')).toEqual({view:'game',gameId:'my game',ply:12});
 for(const ply of ['-1','abc','1.5','10001'])expect(gameRoute(`#games?game=a&ply=${ply}`).ply).toBeNull();
 expect(gameRoute('#games?add').view).toBe('library');
});

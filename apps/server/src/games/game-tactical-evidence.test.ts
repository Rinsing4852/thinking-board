import {expect,it} from 'vitest';
import {Chess} from 'chess.js';
import {forcedMate,tacticalEvidence,verifiedMatingAnswers} from './game-tactical-evidence.js';
import {selectGamePractice} from '../../../../packages/contracts/src/game-practice.js';
it('[G2_PROOF] refuses neutral development and malformed proof while identifying a legal mating threat',()=>{
 const board=new Chess();board.move('e4');board.move('e5');board.move('Nf3');board.move('Nc6');const before=board.fen();board.move('Bb5');
 expect(tacticalEvidence(before,board.fen(),'f1b5','white',{uci:'f1b5',mate:null,pv:'["f1b5"]'},{uci:'a7a6',mate:null,pv:'["a7a6"]'},true).categories).toEqual([]);
 const game=new Chess();for(const m of ['f3','e5'])game.move(m);const safe=game.fen();game.move('g4');
 const evidence=tacticalEvidence(safe,game.fen(),'g2g4','white',undefined,{uci:'d8h4',mate:-1,pv:'["d8h4"]'},true);
 expect(evidence.categories).toEqual(['defending']);expect(evidence.pattern).toBe('mating threat');
 expect(tacticalEvidence(safe,game.fen(),'g2g4','white',undefined,{uci:'d8h4',mate:-1,pv:'["bad"]'},true).categories).toEqual([]);
});
it('[G2_MATE] verifies both colours, alternatives, 1–4 limits and rejects long or unproved mates',()=>{
 const white='7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
 expect(forcedMate(white,'f7g7',1)).toBe(true);expect(forcedMate(white,'f7f8',1)).toBe(true);
 const answers=verifiedMatingAnswers(white,[{uci:'f7g7',mate:1,pv:'[]'},{uci:'f7f8',mate:1,pv:'[]'},{uci:'f7e7',mate:1,pv:'[]'}],'white');
 expect(answers).toEqual({'f7g7':1,'f7f8':1});
 const black='8/8/8/8/8/6k1/5q2/7K b - - 0 1';expect(forcedMate(black,'f2g2',1)).toBe(true);
 expect(verifiedMatingAnswers(black,[{uci:'f2g2',mate:-1,pv:'[]'}],'black')).toEqual({'f2g2':1});
 const mates=[{fen:'7k/8/5K2/8/8/8/Q7/8 w - - 0 1',root:'a2a7',moves:2},{fen:'7k/8/8/5K2/8/8/Q7/8 w - - 0 1',root:'a2a7',moves:3},{fen:'7k/8/8/8/5K2/8/Q7/8 w - - 0 1',root:'f4g5',moves:4}];
 for(const example of mates){expect(forcedMate(example.fen,example.root,example.moves)).toBe(true);expect(forcedMate(example.fen,example.root,example.moves-1)).toBe(false);}
 expect(forcedMate(white,'f7e7',1)).toBe(false);expect(forcedMate(white,'f7g7',17)).toBeNull();expect(forcedMate(white,'f7g7',1,0)).toBeNull();
 for(let limit=1;limit<=4;limit++){
  const points=[1,2,3,4,17].map((mateIn,i)=>({id:String(i),ply:i,kind:'engine' as const,canRecall:true,categories:['mates'] as ['mates'],mateIn}));
  expect(selectGamePractice(points,['mates'],limit).length).toBe(limit);
 }
 expect(verifiedMatingAnswers(white,[{uci:'f7g7',mate:17,pv:'[]'}],'white')).toEqual({});
});
it('[G2_PROOF] recognises missed captures and forks only with retained material evidence',()=>{
 const capture='q6k/8/8/8/8/8/8/R6K w - - 0 1',board=new Chess(capture);board.move('Kg1');
 expect(tacticalEvidence(capture,board.fen(),'h1g1','white',{uci:'a1a8',mate:null,pv:JSON.stringify(['a1a8','h8g7','a8a7','g7f6'])},undefined,true)).toMatchObject({categories:['attacking'],pattern:'material capture'});
 const fork='7k/8/1q3r2/8/8/2N5/8/7K w - - 0 1',other=new Chess(fork);other.move('Kh2');
 const proof={uci:'c3d5',mate:null,pv:JSON.stringify(['c3d5','b6a7','d5f6','a7a8','f6e4','a8b8'])};
 expect(tacticalEvidence(fork,other.fen(),'h1h2','white',proof,undefined,true)).toMatchObject({categories:['attacking'],pattern:'fork'});
 expect(tacticalEvidence(fork,other.fen(),'h1h2','white',{...proof,pv:'["c3d5"]'},undefined,true).categories).toEqual([]);
});

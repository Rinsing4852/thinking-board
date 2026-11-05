import {Chess} from 'chess.js';
import {expect,it} from 'vitest';
import {openingBranchTree} from './opening-branch-tree';
import type {OpeningLineDetail} from '../../../packages/contracts/src/api';
function line(id:string,sans:string,fen?:string):OpeningLineDetail{
 const chess=new Chess(fen);return {id,title:id,moves:sans.split(' ').map((san,index)=>{const fenBefore=chess.fen(),move=chess.move(san);return {ply:index+1,moveUci:move.from+move.to,moveSan:move.san,fenBefore,fenAfter:chess.fen()};})} as OpeningLineDetail;
}
it('[G1_BRANCH_TREE] groups first replies and nested alternatives independently of import order',()=>{
 const lines=[line('lopez','e4 e5 Nf3 Nc6 Bb5 a6 Ba4'),line('exchange','e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'),line('berlin','e4 e5 Nf3 Nc6 Bb5 Nf6'),line('scandi','e4 d5 exd5 Qxd5'),line('scandi-knight','e4 d5 exd5 Nf6'),line('queen','d4 d5')];
 const tree=openingBranchTree(lines);expect(openingBranchTree([...lines].reverse())).toEqual(tree);
 const e4=tree[0]!.children.find(n=>n.label==='1.e4')!;expect(e4.lineIds).toHaveLength(5);
 expect(e4.children.map(n=>n.label)).toEqual(expect.arrayContaining(['1...d5 2.exd5','1...e5 2.Nf3 2...Nc6 3.Bb5']));
 const e5=e4.children.find(n=>n.label.startsWith('1...e5'))!;expect(e5.children.find(n=>n.label==='3...a6')?.children).toHaveLength(2);
});
it('[G1_BRANCH_TREE] preserves ended lines, duplicate routes, archives and different starting boards',()=>{
 const a=line('ended','e4'),b=line('extended','e4 e5'),duplicate={...b,id:'archived',archived:true};
 const tree=openingBranchTree([a,b,duplicate,line('custom','e5','rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')]);
 expect(tree).toHaveLength(2);const root=tree.find(n=>n.lineIds.includes('ended'))!;
 expect(root.endingLineIds).toEqual(['ended']);expect(root.children[0]?.endingLineIds).toEqual(['archived','extended']);
});

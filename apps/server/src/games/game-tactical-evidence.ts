import {Chess} from 'chess.js';
import {tacticalPunishment} from '../analysis/tactical-punishment.js';
export type SavedLine={uci:string;mate:number|null;pv:string};
export type TacticalEvidence={categories:Array<'attacking'|'defending'|'mates'>;pattern:string;mateIn?:number;practiceEligible?:boolean};
const play=(board:Chess,uci:string)=>board.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci[4]!}:{})});
const mateCache=new Map<string,boolean>();
/** Exact bounded AND/OR search: unknown is never accepted as a forced mate. */
export function forcedMate(fen:string,root:string,maxMoves:number,budget=12000):boolean|null {
 if(!Number.isInteger(maxMoves)||maxMoves<1||maxMoves>4||budget<=0)return null;
 const cacheKey=fen+' '+root+' '+maxMoves;if(mateCache.has(cacheKey))return mateCache.get(cacheKey)!;
 try{
  const board=new Chess(fen),attacker=board.turn();play(board,root);const cache=new Map<string,boolean>();let left=budget;
  function solve(plies:number):boolean|null {
   if(--left<0)return null;
   if(board.isCheckmate())return board.turn()!==attacker;
   if(!plies||board.isDraw())return false;
   const key=board.fen()+':'+plies;if(cache.has(key))return cache.get(key)!;
   const attack=board.turn()===attacker;
   const moves=board.moves({verbose:true}).sort((a,b)=>Number(b.san.includes('#'))-Number(a.san.includes('#'))||Number(b.san.includes('+'))-Number(a.san.includes('+')));
   let unknown=false;
   for(const move of moves){board.move(move);const result=solve(plies-1);board.undo();if(result===null)unknown=true;
    else if(attack&&result||!attack&&!result){cache.set(key,attack);return attack;}}
   if(unknown)return null;cache.set(key,!attack);return !attack;
  }
  const result=solve(2*maxMoves-2);if(result!==null){if(mateCache.size>=512)mateCache.delete(mateCache.keys().next().value!);mateCache.set(cacheKey,result);}return result;
 }catch{return false;}
}
export function verifiedMatingAnswers(fen:string,lines:SavedLine[],color:'white'|'black'):Record<string,number>{
 const answers:Record<string,number>={};
 for(const line of lines){if(line.mate===null||line.mate*(color==='white'?1:-1)<=0||Math.abs(line.mate)>4)continue;
  for(let distance=1;distance<=Math.abs(line.mate);distance++){const result=forcedMate(fen,line.uci,distance);if(result===null)break;if(result){answers[line.uci]=distance;break;}}}
 return answers;
}
function motif(fen:string,line:SavedLine,proof:NonNullable<ReturnType<typeof tacticalPunishment>>):string{
 if(proof.kind==='forced_mate')return 'mating threat';
 try{const board=new Chess(fen),move=play(board,line.uci);let targets=0;
  for(const piece of board.board().flat())if(piece&&piece.color!==move.color&&['n','b','r','q','k'].includes(piece.type)&&board.attackers(piece.square,move.color).includes(move.to))targets++;
  return targets>=2?'fork':move.captured?'material capture':'material threat';
 }catch{return 'tactical opportunity';}
}
export function tacticalEvidence(before:string,after:string,played:string,color:'white'|'black',best:SavedLine|undefined,reply:SavedLine|undefined,significant:boolean):TacticalEvidence{
 const result:TacticalEvidence={categories:[],pattern:'unclassified decision'};
 if(best&&best.uci!==played){const proof=tacticalPunishment(before,before,best.uci,best.pv,best.mate);
  if(proof&&(significant||proof.kind==='forced_mate')){result.categories.push('attacking');result.pattern=motif(before,best,proof);}}
 if(reply&&significant){const proof=tacticalPunishment(before,after,reply.uci,reply.pv,reply.mate);
  if(proof){result.categories.push('defending');if(!result.categories.includes('attacking'))result.pattern=motif(after,reply,proof);}}
 if(best?.mate!==null&&best?.mate!==undefined&&best.mate*(color==='white'?1:-1)>0&&best.uci!==played){
  result.mateIn=Math.abs(best.mate);result.practiceEligible=false;
 }
 return result;
}

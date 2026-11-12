import {Chess} from 'chess.js';
import type {PunishmentProof} from './tactical-punishment.js';
const play=(board:Chess,uci:string)=>board.move({from:uci.slice(0,2),to:uci.slice(2,4),...(uci.length===5?{promotion:uci[4]!}:{})});

/** Describe only motifs supported by the retained engine continuation. */
export function tacticalMotif(fen:string,line:{uci:string;mate?:number|null;pv?:string},proof:PunishmentProof):string{
 if(proof.kind==='forced_mate')return 'mating threat';
 try{const board=new Chess(fen),move=play(board,line.uci);
  // Explain an immediate winning capture directly; incidental attacks after it
  // must not relabel a missed queen capture as a missed fork.
  if(move.captured)return 'material capture';
  const targets=new Set<string>();
  for(const piece of board.board().flat())if(piece&&piece.color!==move.color&&['n','b','r','q','k'].includes(piece.type)&&board.attackers(piece.square,move.color).includes(move.to))targets.add(piece.square);
  const followup=proof.pvUci[2];
  const takesForkedTarget=followup?.slice(0,2)===move.to&&targets.has(followup.slice(2,4));
  return targets.size>=2&&takesForkedTarget?'fork':'material threat';
 }catch{return 'tactical opportunity';}
}

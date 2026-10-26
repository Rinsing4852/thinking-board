import { assessMove, chances, type MoveGrade } from "./move-quality.js";
import type { EngineAnalysis, EngineLine, EngineScore, EngineHistory, UciEngine } from "./uci-engine.js";

// Frozen by chances-v3: changes to this policy require a new method version.
export const VERIFICATION_NODES = 2_000_000;
export const verificationDepth = (base:number) => Math.max(base,Math.min(24,base+4));
export function verificationReason(best:EngineScore,played:EngineScore,after:EngineScore|undefined,color:"white"|"black"):string|null {
  const loss=assessMove(best,played,color,false).loss;
  if(best.mateInWhite!==null||played.mateInWhite!==null)return "mate";
  if(loss>=4)return "possible-error";
  if(chances(played,color)>chances(best,color)+1)return "search-disagreement";
  if(after&&Math.abs(chances(played,color)-chances(after,color))>=3)return "search-disagreement";
  return null;
}
export async function verifyMove(engine:Pick<UciEngine,"analyze">,fen:string,moveUci:string,baseDepth:number,multiPv:number,history?:EngineHistory) {
  const depth=verificationDepth(baseDepth);
  const analysis=await engine.analyze(fen,depth,multiPv,[],undefined,VERIFICATION_NODES,history);
  let best=analysis.lines[0];
  if(!best)throw new Error("No verification line");
  let played=analysis.lines.find(line=>line.moveUci===moveUci);
  if(!played)played=(await engine.analyze(fen,depth,1,[moveUci],undefined,VERIFICATION_NODES,history)).lines[0];
  if(!played||Math.min(best.depth,played.depth)<baseDepth)throw new Error("Verification search did not reach the original depth");
  // A restricted search can discover that the played move is stronger than the
  // unrestricted result. Never publish a worse alternative as the best move.
  const color=fen.split(" ")[1]==="w"?"white":"black";
  if(chances(played,color)>chances(best,color))best=played;
  const lines=[best,...analysis.lines.filter(line=>line.moveUci!==best.moveUci)]
    .map((line,rank):EngineLine=>({...line,rank:rank+1}));
  return {analysis:{depth:Math.min(best.depth,played.depth),lines} satisfies EngineAnalysis,played,best};
}
export type VerificationEvidence = {reason:string;initialGrade:MoveGrade;depth:number};

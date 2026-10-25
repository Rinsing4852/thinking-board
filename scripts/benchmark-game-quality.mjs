// Offline, repeatable comparison using public cached Lichess samples plus
// deeper local Stockfish searches. Never opens the app database or uploads games.
import fs from "node:fs";
import assert from "node:assert/strict";
import { Chess } from "chess.js";
import { UciEngine } from "../dist/apps/server/src/analysis/uci-engine.js";
import { assessMove,chances } from "../dist/apps/server/src/analysis/move-quality.js";
import { verificationReason,verifyMove } from "../dist/apps/server/src/analysis/verify-move.js";
const references=JSON.parse(fs.readFileSync(new URL("../docs/chessbook-audit/evidence/lichess-quality-reference-2026-10-25.json",import.meta.url))).results;
const cases=[...references.filter(r=>r.status===200),
 {name:"White hangs mate",fen:"rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2",move:"g2g4",expected:"blunder"},
 {name:"Black hangs mate",fen:"r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3",move:"g8f6",expected:"blunder"},
 {name:"White misses queen",fen:"6k1/8/8/8/8/8/1q6/1R4K1 w - - 0 1",move:"b1a1",expected:"blunder"},
 {name:"Black misses queen",fen:"1r4k1/1Q6/8/8/8/8/8/6K1 b - - 0 1",move:"b8a8",expected:"blunder"},
 {name:"White mate",fen:"6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1",move:"e1e8",expected:"best"},
 {name:"Black mate",fen:"4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1",move:"e8e1",expected:"best"}];
const results=[];
for(const item of cases){
 const engine=new UciEngine(process.env.STOCKFISH_BINARY??"stockfish",1,128);
 const reference=new UciEngine(process.env.STOCKFISH_BINARY??"stockfish",1,128);
 try{
  await engine.initialize();assert(!engine.name.includes("Fake"));
  const began=performance.now(),color=new Chess(item.fen).turn()==="w"?"white":"black";
  const base=await engine.analyze(item.fen,14,3);
  const played=base.lines.find(l=>l.moveUci===item.move)??(await engine.analyze(item.fen,14,1,[item.move])).lines[0];
  const child=new Chess(item.fen);child.move({from:item.move.slice(0,2),to:item.move.slice(2,4)});
  const after=(await engine.analyze(child.fen(),14,3)).lines[0];
  const reason=verificationReason(base.lines[0],played,after,color);
  const checked=reason?await verifyMove(engine,item.fen,item.move,14,3):{best:base.lines[0],played,analysis:base};
  const grade=assessMove(checked.best,checked.played,color,checked.best.moveUci===item.move);
  const elapsedMs=Math.round(performance.now()-began);
  const deep=await reference.analyze(item.fen,24,3,[],undefined,8_000_000);
  const deepPlayed=deep.lines.find(l=>l.moveUci===item.move)??(await reference.analyze(item.fen,24,1,[item.move],undefined,8_000_000)).lines[0];
  const deepBest=chances(deepPlayed,color)>chances(deep.lines[0],color)?deepPlayed:deep.lines[0];
  const referenceGrade=assessMove(deepBest,deepPlayed,color,deepBest.moveUci===item.move);
  const cached=item.data?.pvs.find(pv=>pv.moves.split(" ")[0]===item.move);
  const score=pv=>({centipawnsWhite:pv.cp??null,mateInWhite:pv.mate??null});
  const cloud=cached?assessMove(score(item.data.pvs[0]),score(cached),color,item.data.pvs[0].moves.split(" ")[0]===item.move):null;
  const row={name:item.name,fen:item.fen,move:item.move,engine:engine.name,initialGrade:assessMove(base.lines[0],played,color,base.lines[0].moveUci===item.move).grade,
   grade:grade.grade,chanceLoss:grade.loss,checked:!!reason,depth:checked.analysis.depth,elapsedMs,
   deeperReference:{depth:Math.min(deepBest.depth,deepPlayed.depth),grade:referenceGrade.grade,chanceLoss:referenceGrade.loss},
   seriousErrorAgreement:["mistake","blunder"].includes(grade.grade)===["mistake","blunder"].includes(referenceGrade.grade),
   lichess:cloud?{source:item.source,depth:item.data.depth,bestCpWhite:item.data.pvs[0].cp,playedCpWhite:cached.cp,chanceLoss:cloud.loss,gradeUsingOurRules:cloud.grade}:null};
  if(item.expected)assert.equal(row.grade,item.expected,item.name);
  assert(row.seriousErrorAgreement,`${item.name}: disagreement with deeper reference`);
  results.push(row);
 }finally{await engine.close();await reference.close();}
}
console.log(JSON.stringify({measuredAt:new Date().toISOString(),scope:"Small curated diagnostic sample, not a product parity score or live Lichess whole-game benchmark.",
 method:"Base depth14/MultiPV3; flagged moves target depth18 with 2M node ceiling per search; independent fresh-engine reference target depth24/8M ceiling. Lichess cached scores use our grading rules, not Lichess move labels. Cache engine version unknown.",results},null,2));

import { describe, expect, it, vi } from "vitest";

import { parseInfoLine, UciEngine } from "./uci-engine.js";
import path from "node:path";
import { Chess } from "chess.js";

describe("UCI info parsing", () => {
  it("parses MultiPV centipawn lines", () => {
    expect(parseInfoLine("info depth 14 multipv 2 score cp 37 nodes 100 pv e2e4 e7e5")).toEqual({
      depth: 14,
      rank: 2,
      centipawns: 37,
      mateIn: null,
      pv: ["e2e4", "e7e5"],
    });
  });

  it("keeps mate scores separate", () => {
    expect(parseInfoLine("info depth 18 score mate -3 pv h7h8q")).toMatchObject({
      rank: 1,
      centipawns: null,
      mateIn: -3,
    });
  });
});

describe("UCI process failures", () => {
  it("restricts a root search to the played move", async () => {
    const engine = new UciEngine(path.resolve("tests/fake-stockfish.mjs"), 1, 16);
    const result = await engine.analyze(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      8,
      3,
      ["e2e4"],
    );
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.moveUci).toBe("e2e4");
    await engine.close();
  });

  it("rejects initialization instead of crashing when the engine cannot start", async () => {
    const engine = new UciEngine("/definitely/missing/stockfish", 1, 16);
    await expect(engine.initialize()).rejects.toThrow(/Stockfish|ENOENT/);
    await engine.close();
  });
});

describe("reliable score bounds",()=>{
  it("does not treat a score bound or an unsupported score as exact",()=>{
    expect(parseInfoLine("info depth 14 score cp 20 lowerbound pv e2e4")).toBeNull();
    expect(parseInfoLine("info depth 14 score cp 20 upperbound pv e2e4")).toBeNull();
    expect(parseInfoLine("info depth 14 score unknown 20 pv e2e4")).toBeNull();
  });
});


describe("engine recovery after failed searches",()=>{
  it("discards the failed process before accepting another position",async()=>{
    const engine=new UciEngine(path.resolve("tests/fake-stockfish.mjs"),1,16);
    const close=vi.spyOn(engine,"close");
    const fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    try {
      await expect(engine.analyze(fen,10,1,["invalid"])).rejects.toThrow(/Invalid UCI/);
      expect(close).toHaveBeenCalledTimes(1);
      expect((await engine.analyze(fen,10,1,["e2e4"])).lines[0]?.moveUci).toBe("e2e4");
    } finally {await engine.close();}
  });
});

describe("completed MultiPV iterations",()=>{
 it("does not mix a new best line with older alternatives after a bounded search",async()=>{
  const engine=new UciEngine(path.resolve("tests/partial-stockfish.mjs"),1,16);
  try {
   const result=await engine.analyze("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",18,2,[],undefined,2000);
   expect(result.depth).toBe(14);
   expect(result.lines.map(line=>[line.moveUci,line.depth,line.centipawnsWhite])).toEqual([["e2e4",14,20],["d2d4",14,10]]);
  }finally{await engine.close();}
 });
});

describe("history and same-depth engine updates",()=>{
 it("retains a complete candidate set when same-depth reordering is interrupted",async()=>{
  const engine=new UciEngine(path.resolve("tests/partial-stockfish.mjs"),1,16);
  try{
   const result=await engine.analyze(new Chess().fen(),14,2,[],undefined,2000);
   expect(result.lines.map(line=>[line.moveUci,line.centipawnsWhite])).toEqual([["e2e4",20],["d2d4",10]]);
   expect(new Set(result.lines.map(line=>line.moveUci)).size).toBe(result.lines.length);
  }finally{await engine.close();}
 });
 it("keeps repetition history and rejects a history belonging to another board",async()=>{
  const board=new Chess("6k1/8/8/8/8/8/8/3Q2K1 w - - 0 1"),initialFen=board.fen();
  const moves=["d1d2","g8h7","d2d1","h7g8","d1d2","g8h7","d2d1","h7g8"];
  for(const move of moves)board.move({from:move.slice(0,2),to:move.slice(2)});
  const engine=new UciEngine(path.resolve("tests/fake-stockfish.mjs"),1,16);
  try{
   const result=await engine.analyze(board.fen(),14,3,[],undefined,undefined,{initialFen,moves,drawClaimed:true});
   expect(result.lines[0]).toMatchObject({moveUci:"(none)",centipawnsWhite:0,mateInWhite:null});
   const unclaimed=await engine.analyze(board.fen(),14,1,[],undefined,undefined,{initialFen,moves});
   expect(unclaimed.lines[0]?.moveUci).not.toBe("(none)");
   await expect(engine.analyze(new Chess().fen(),14,3,[],undefined,undefined,{initialFen,moves})).rejects.toThrow("history does not match");
   const start=new Chess();start.move("e4");start.move("e5");
   expect((await engine.analyze(start.fen(),14,1,[],undefined,undefined,{initialFen:new Chess().fen(),moves:["e2e4","e7e5"]})).lines).toHaveLength(1);
  }finally{await engine.close();}
 });
});


it("cancels an active search on close and allows a clean retry",async()=>{
  const engine=new UciEngine(path.resolve("tests/fake-stockfish.mjs"),1,16);
  const fen=new Chess().fen();
  await engine.initialize();
  const protocol=engine as unknown as {send:(command:string)=>void};
  const original=protocol.send.bind(engine);
  let searchStarted!:()=>void;const started=new Promise<void>(resolve=>{searchStarted=resolve;});
  const send=vi.spyOn(protocol,'send').mockImplementation(command=>{
    if(command.startsWith('go ')){searchStarted();return;}
    original(command);
  });
  try{
    const pending=engine.analyze(fen,10,1);
    const rejected=expect(pending).rejects.toThrow('Stockfish was closed');
    await started;await engine.close();await rejected;send.mockRestore();
    expect((await engine.analyze(fen,10,1)).lines).toHaveLength(1);
  }finally{send.mockRestore();await engine.close();}
});

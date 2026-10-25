import { describe, expect, it, vi } from "vitest";

import { parseInfoLine, UciEngine } from "./uci-engine.js";
import path from "node:path";

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

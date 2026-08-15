import { describe, expect, it } from "vitest";

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

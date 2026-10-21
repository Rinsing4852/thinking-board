import path from "node:path";
import { Database } from "../db/database.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { loadConfig } from "../config.js";
import { UciEngine, type EngineLine } from "../analysis/uci-engine.js";
import { OpeningAnalysisService } from "./opening-analysis-service.js";
const engineLine = (uci: string, san: string, cp: number, rank = 1): EngineLine => ({
  rank, depth: 12, moveUci: uci, moveSan: san, pvUci: [uci], pvSan: [san], centipawnsWhite: cp, mateInWhite: null,
});
beforeEach(() => { vi.spyOn(UciEngine.prototype,"initialize").mockResolvedValue(); });
afterEach(() => vi.restoreAllMocks());
describe("opening move evaluations", () => {
  it("evaluates popular moves outside the engine top three without replacing the overall score", async () => {
    const game = new Chess(); game.move("e4");
    const analyze = vi.spyOn(UciEngine.prototype, "analyze").mockImplementation(async (_fen, _depth, _pv, moves) => ({ depth: 12,
      lines: moves?.length ? [engineLine(moves[0]!, "e6", 60)] : [engineLine("c7c5", "c5", 25), engineLine("e7e5", "e5", 30, 2), engineLine("d7d5", "d5", 40, 3)],
    }));
    const service = new OpeningAnalysisService(loadConfig());
    const result = await service.analyze(game.fen(), ["e7e6", "e7e6"]);
    expect(analyze).toHaveBeenCalledTimes(2);
    expect(analyze.mock.calls[1]?.[3]).toEqual(["e7e6"]);
    expect(result.lines.find(line => line.rank === 1)?.score).toMatchObject({ value: -25, perspective: "side_to_move" });
    expect(result.lines.find(line => line.moveUci === "e7e6")).toMatchObject({ rank: 100, score: { value: -60 } });
    expect((await service.analyze(game.fen())).lines).toHaveLength(3);
    await service.analyze(game.fen(), ["e7e6"]);
    expect(analyze).toHaveBeenCalledTimes(2);
  });
  it("reuses compatible results after restart and invalidates a changed search budget", async () => {
    const database = new Database(":memory:",path.resolve("migrations"));
    try {
      const analyze=vi.spyOn(UciEngine.prototype,"analyze").mockResolvedValue({depth:12,lines:[engineLine("e2e4","e4",25)]});
      const config=loadConfig();const fen=new Chess().fen();
      const first=await new OpeningAnalysisService(config,database.connection).analyze(fen);
      const second=await new OpeningAnalysisService(config,database.connection).analyze(fen);
      expect(second).toEqual(first);expect(analyze).toHaveBeenCalledTimes(1);
      await new OpeningAnalysisService({...config,openingAnalysisNodes:400000},database.connection).analyze(fen);
      expect(analyze).toHaveBeenCalledTimes(2);
    } finally {database.close();}
  });
  it("rejects malformed, excessive and illegal move requests before using the engine", async () => {
    const analyze = vi.spyOn(UciEngine.prototype, "analyze");
    const service = new OpeningAnalysisService(loadConfig());
    await expect(service.analyze(new Chess().fen(), ["e7e5"])).rejects.toThrow("legal moves");
    await expect(service.analyze(new Chess().fen(), Array(13).fill("e2e4"))).rejects.toThrow("12");
    await expect(service.analyze(new Chess().fen(), null as unknown as string[])).rejects.toThrow("legal moves");
    expect(analyze).not.toHaveBeenCalled();
  });
});

describe("analysis request coordination", () => {
  it("coalesces matching work and drops abandoned queued positions", async () => {
    let finish!: (value: { depth: number; lines: EngineLine[] }) => void;
    const analyze = vi.spyOn(UciEngine.prototype,"analyze").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const service = new OpeningAnalysisService(loadConfig());
    const fen = new Chess().fen();
    const first = service.analyze(fen);
    expect(service.analyze(fen)).toBe(first);
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    const other = new Chess(); other.move("e4");
    const abort = new AbortController();
    const queued = service.analyze(other.fen(),[],abort.signal);
    const rejected = expect(queued).rejects.toThrow("cancelled");
    abort.abort(); finish({ depth: 12, lines: [engineLine("e2e4","e4",25)] });
    await first; await rejected;
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]?.[4]).toBe(200000);
  });
});

describe("chess quality independent of recall",()=>{
  it.each(["white","black"])("compares restricted scores for the %s mover and reuses evidence",async(color)=>{
    const board=new Chess();if(color==="black")board.move("e4");
    const factor=color==="white"?1:-1,best=color==="white"?"e2e4":"e7e5",played=color==="white"?"d2d4":"c7c5";
    const analyze=vi.spyOn(UciEngine.prototype,"analyze").mockImplementation(async(_fen,_depth,_pv,moves)=>({depth:12,lines:[
      engineLine(moves?.length?played:best,"move",(moves?.length?55:80)*factor)]}));
    const service=new OpeningAnalysisService(loadConfig());
    expect(await service.assessMove(board.fen(),played)).toMatchObject({verdict:"playable",lossCp:25,depth:12});
    expect(await service.assessMove(board.fen(),played)).toMatchObject({verdict:"playable",lossCp:25});
    expect(analyze).toHaveBeenCalledTimes(2);
  });
  it("reports a weaker move separately without changing a recall outcome",async()=>{
    vi.spyOn(UciEngine.prototype,"analyze").mockImplementation(async(_f,_d,_p,moves)=>({depth:12,lines:[engineLine(moves?.length?"d2d4":"e2e4","move",moves?.length?-170:25)]}));
    expect(await new OpeningAnalysisService(loadConfig()).assessMove(new Chess().fen(),"d2d4")).toMatchObject({verdict:"weaker",lossCp:195});
  });
  it.each(["failure","shallow","missing"])("keeps %s analysis unverified",async(kind)=>{
    vi.spyOn(UciEngine.prototype,"analyze").mockImplementation(async(_f,_d,_p,moves)=>{
      if(kind==="failure")throw new Error("Timed out");
      return {depth:14,lines:[{...engineLine(moves?.length&&kind!=="missing"?"d2d4":"e2e4","move",0),depth:moves?.length&&kind==="shallow"?3:14}]};
    });
    expect(await new OpeningAnalysisService(loadConfig()).assessMove(new Chess().fen(),"d2d4")).toMatchObject({verdict:"uncertain"});
  });
  it("keeps losing mate evidence distinct and accepts a maintained forced win",async()=>{
    const analyze=vi.spyOn(UciEngine.prototype,"analyze").mockImplementation(async(_f,_d,_p,moves)=>({depth:12,lines:[
      {...engineLine(moves?.length?"d2d4":"e2e4","move",0),centipawnsWhite:null,mateInWhite:moves?.length?4:2}]}));
    expect((await new OpeningAnalysisService(loadConfig()).assessMove(new Chess().fen(),"d2d4")).verdict).toBe("playable");
    analyze.mockImplementation(async(_f,_d,_p,moves)=>({depth:12,lines:[{...engineLine(moves?.length?"d2d4":"e2e4","move",0),centipawnsWhite:null,mateInWhite:moves?.length?-2:2}]}));
    expect((await new OpeningAnalysisService(loadConfig()).assessMove(new Chess().fen(),"d2d4")).verdict).toBe("weaker");
  });
  it("does not grade an illegal move or a finished position",async()=>{
    const analyze=vi.spyOn(UciEngine.prototype,"analyze");
    const service=new OpeningAnalysisService(loadConfig());
    expect((await service.assessMove(new Chess().fen(),"e7e5")).verdict).toBe("uncertain");
    expect((await service.assessMove("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1","h8h7")).verdict).toBe("uncertain");
    expect(analyze).not.toHaveBeenCalled();
  });
});

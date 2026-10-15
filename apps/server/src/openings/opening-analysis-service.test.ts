import { afterEach, describe, expect, it, vi } from "vitest";
import { Chess } from "chess.js";
import { loadConfig } from "../config.js";
import { UciEngine, type EngineLine } from "../analysis/uci-engine.js";
import { OpeningAnalysisService } from "./opening-analysis-service.js";
const engineLine = (uci: string, san: string, cp: number, rank = 1): EngineLine => ({
  rank, depth: 12, moveUci: uci, moveSan: san, pvUci: [uci], pvSan: [san], centipawnsWhite: cp, mateInWhite: null,
});
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
  it("rejects malformed, excessive and illegal move requests before using the engine", async () => {
    const analyze = vi.spyOn(UciEngine.prototype, "analyze");
    const service = new OpeningAnalysisService(loadConfig());
    await expect(service.analyze(new Chess().fen(), ["e7e5"])).rejects.toThrow("legal moves");
    await expect(service.analyze(new Chess().fen(), Array(13).fill("e2e4"))).rejects.toThrow("12");
    await expect(service.analyze(new Chess().fen(), null as unknown as string[])).rejects.toThrow("legal moves");
    expect(analyze).not.toHaveBeenCalled();
  });
});

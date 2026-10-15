import { describe, expect, it } from "vitest";
import { openingEvaluation } from "./opening-evaluation";
import type { OpeningAnalysisLine } from "../../../packages/contracts/src/api";
const line = (value: number, kind: "mate" | "centipawns" = "centipawns"): OpeningAnalysisLine => ({
  rank: 1, moveUci: "e2e4", moveSan: "e4", pvSan: [], score: { kind, value, perspective: "side_to_move" },
});
describe("opening evaluations", () => {
  it("keeps White's perspective when the turn changes", () => {
    expect(openingEvaluation(line(35), "8/8/8/8/8/8/8/8 w - - 0 1")).toBe("+0.35");
    expect(openingEvaluation(line(-35), "8/8/8/8/8/8/8/8 b - - 0 1")).toBe("+0.35");
    expect(openingEvaluation(line(80), "8/8/8/8/8/8/8/8 b - - 0 1")).toBe("-0.80");
  });
  it("preserves mate direction and distinguishes unavailable evidence from equality", () => {
    expect(openingEvaluation(line(-3, "mate"), "fen b")).toBe("+M3");
    expect(openingEvaluation(line(3, "mate"), "fen b")).toBe("−M3");
    expect(openingEvaluation(line(0), "fen w")).toBe("+0.00");
    expect(openingEvaluation(undefined, "fen w")).toBe("—");
  });
});

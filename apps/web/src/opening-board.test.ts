import { describe, expect, it } from "vitest";

import { applyUciMove, getMoveHint } from "./opening-board";

const STARTING_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("opening board helpers", () => {
  it("applies a UCI move to the displayed position", () => {
    expect(applyUciMove(STARTING_FEN, "e2e4")).toContain("4P3");
  });

  it("turns the expected source square into a beginner-friendly piece hint", () => {
    expect(getMoveHint(STARTING_FEN, "g1f3")).toEqual({ square: "g1", piece: "knight" });
  });
});

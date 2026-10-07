import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { boardSquares, legalDestinations, moveSquares } from "./chessboard";

describe("Chessground rules adapter", () => {
  it("orders all 64 accessible squares from either side", () => {
    expect(new Set(boardSquares("white")).size).toBe(64);
    expect(boardSquares("white")[0]).toBe("a8");
    expect(boardSquares("white")[63]).toBe("h1");
    expect(boardSquares("black")).toEqual(boardSquares("white").reverse());
  });
  it("supplies only legal destinations, not pseudo-legal moves", () => {
    const game = new Chess("4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
    const moves = legalDestinations(game).get("e2")!;
    expect(moves).toContain("e8");
    expect(moves).not.toContain("d2"); // pinned rook cannot expose its king
  });
  it("supports castling and en passant", () => {
    const castle = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
    expect(legalDestinations(castle).get("e1")).toEqual(expect.arrayContaining(["c1", "g1"]));
    const ep = new Chess("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
    expect(legalDestinations(ep).get("e5")).toContain("d6");
  });
  it("deduplicates promotions without changing the rules position", () => {
    const game = new Chess("7k/P7/8/8/8/8/8/7K w - - 0 1");
    const fen = game.fen();
    expect(legalDestinations(game).get("a7")).toEqual(["a8"]);
    expect(game.moves({ square: "a7", verbose: true })).toHaveLength(4);
    expect(game.fen()).toBe(fen);
  });
  it("does not offer moves in mate and validates last-move coordinates", () => {
    const game = new Chess();
    for (const move of ["f3", "e5", "g4", "Qh4#"]) game.move(move);
    expect(legalDestinations(game).size).toBe(0);
    expect(moveSquares("a7a8n")).toEqual(["a7", "a8"]);
    expect(moveSquares(null)).toBeUndefined();
    expect(moveSquares("a0h9")).toBeUndefined();
  });
});

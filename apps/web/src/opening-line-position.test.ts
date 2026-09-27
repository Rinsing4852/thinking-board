import { describe, expect, it } from "vitest";

import { findPlyAtFen } from "./opening-line-position";

const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const afterE4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";
const afterE5 = "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2";

const moves = [
  { ply: 1, fenBefore: start, fenAfter: afterE4 },
  { ply: 2, fenBefore: afterE4, fenAfter: afterE5 },
];

describe("opening line position lookup", () => {
  it("finds the initial, intermediate, and terminal board positions", () => {
    expect(findPlyAtFen(moves, start)).toBe(0);
    expect(findPlyAtFen(moves, afterE4)).toBe(1);
    expect(findPlyAtFen(moves, afterE5)).toBe(2);
  });

  it("ignores move counters while preserving the legal position fields", () => {
    expect(findPlyAtFen(moves, `${afterE4.split(" ").slice(0, 4).join(" ")} 18 42`)).toBe(1);
  });

  it("returns null when the position is outside the line", () => {
    expect(findPlyAtFen(moves, "8/8/8/8/8/8/8/8 w - - 0 1")).toBeNull();
  });
});

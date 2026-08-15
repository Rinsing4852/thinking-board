import { describe, expect, it } from "vitest";

import { parsePgnText, splitPgnGames } from "./pgn.js";

const MULTI_PGN = `[Event "One"]
[Date "2026.08.01"]
[White "Alice"]
[Black "Bob"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 *

[Event "Two"]
[Date "2026.08.02"]
[White "Carol"]
[Black "Alice"]
[Result "1/2-1/2"]

1. d4 d5 2. c4 e6 1/2-1/2`;

describe("PGN parsing", () => {
  it("splits and parses multiple games", () => {
    expect(splitPgnGames(MULTI_PGN)).toHaveLength(2);
    const result = parsePgnText(MULTI_PGN);
    expect(result.errors).toEqual([]);
    expect(result.games).toHaveLength(2);
    expect(result.games[0]).toMatchObject({ white: "Alice", black: "Bob" });
    expect(result.games[1]).toMatchObject({ white: "Carol", black: "Alice" });
    expect(result.games[0]?.moves.map((move) => move.uci)).toEqual(["e2e4", "e7e5", "g1f3", "b8c6"]);
  });

  it("uses canonical moves rather than comments in the fingerprint", () => {
    const commented = MULTI_PGN.replace("1. e4", "1. e4 { central control }");
    expect(parsePgnText(commented).games[0]?.fingerprint).toBe(parsePgnText(MULTI_PGN).games[0]?.fingerprint);
  });

  it("reports empty input without throwing", () => {
    expect(parsePgnText(" ").errors[0]?.message).toBe("No PGN games found");
  });
});

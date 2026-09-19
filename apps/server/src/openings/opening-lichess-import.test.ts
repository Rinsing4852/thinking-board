import { describe, expect, it } from "vitest";

import { resolveLichessStudyUrl } from "./opening-lichess-import.js";

describe("Lichess Study import URL", () => {
  it("resolves a complete public study to the official PGN export endpoint", () => {
    expect(resolveLichessStudyUrl("https://lichess.org/study/abcdefgh")).toEqual({
      studyId: "abcdefgh",
      chapterId: null,
      canonicalUrl: "https://lichess.org/study/abcdefgh",
      exportUrl: "https://lichess.org/api/study/abcdefgh.pgn?comments=true&variations=true&clocks=false",
    });
  });

  it("preserves a selected chapter", () => {
    expect(resolveLichessStudyUrl("https://lichess.org/study/abcdefgh/ABCDEFGH?ignored=true")).toMatchObject({
      studyId: "abcdefgh",
      chapterId: "ABCDEFGH",
      canonicalUrl: "https://lichess.org/study/abcdefgh/ABCDEFGH",
      exportUrl: "https://lichess.org/api/study/abcdefgh/ABCDEFGH.pgn?comments=true&variations=true&clocks=false",
    });
  });

  it("rejects non-Lichess and malformed URLs before making a request", () => {
    expect(() => resolveLichessStudyUrl("https://example.com/study/abcdefgh")).toThrow(/only secure lichess\.org/i);
    expect(() => resolveLichessStudyUrl("https://lichess.org/@/player")).toThrow(/does not look like/i);
    expect(() => resolveLichessStudyUrl("not-a-url")).toThrow(/complete Lichess Study URL/i);
  });
});

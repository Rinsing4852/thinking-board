import { describe, expect, it } from "vitest";
import { boardAnnotationPgn, parseBoardAnnotations } from "./board-annotations.js";
describe("PGN board marks", () => {
  it("preserves all four colours, ignores malformed marks and removes duplicates", () => {
    const marks = parseBoardAnnotations("Idea [%csl Ge4,Rd5,Xa1,Ga9,Ge4] [%cal Bf1c4,Yg8f6,Bf1c4,bad] [%eval 0.5]");
    expect(marks).toEqual([{ color: "green", from: "e4", to: "e4" }, { color: "red", from: "d5", to: "d5" },
      { color: "blue", from: "f1", to: "c4" }, { color: "yellow", from: "g8", to: "f6" }]);
    expect(parseBoardAnnotations(boardAnnotationPgn(marks))).toEqual(marks);
  });
  it("bounds imported marks and exports only valid board coordinates", () => {
    const arrows = Array.from({ length: 100 }, (_, index) => `Ga1${"abcdefgh"[index % 8]}${Math.floor(index / 8) % 8 + 1}`);
    expect(parseBoardAnnotations(`[%cal ${arrows.join(",")}]`)).toHaveLength(64);
    expect(boardAnnotationPgn([{ color: "green", from: "outside", to: "a1" }])).toBe("");
  });
});

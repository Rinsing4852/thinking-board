import { describe, expect, it } from "vitest";
import { selectPracticeLine } from "./opening-line-selection.js";
const lines = [
  { lineId: "short", priority: 1, practicalWeight: 0.5, urgency: 6, decisions: 2 },
  { lineId: "long", priority: 2, practicalWeight: 0.5, urgency: 30, decisions: 10 },
];
describe("varied line rehearsal", () => {
  it("does not repeat the previous line when another is available", () => {
    expect(selectPracticeLine(lines, ["short"], () => 0)?.lineId).toBe("long");
    expect(selectPracticeLine(lines, ["long"], () => 0.999)?.lineId).toBe("short");
  });
  it("normalises urgency by depth instead of always choosing the longest line", () => {
    expect(selectPracticeLine(lines, [], () => 0.49)?.lineId).toBe("short");
    expect(selectPracticeLine(lines, [], () => 0.51)?.lineId).toBe("long");
  });
  it("handles a single or empty repertoire", () => {
    expect(selectPracticeLine(lines.slice(0, 1), ["short"])?.lineId).toBe("short");
    expect(selectPracticeLine([], [])).toBeUndefined();
  });
});

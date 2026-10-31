import { describe, expect, it } from "vitest";
import { selectGamePractice } from "./game-practice.js";
import type { GameReplayCheckpoint } from "./api.js";
const point = (id: string, ply: number, kind: GameReplayCheckpoint["kind"], canRecall = true, keyDecision = false) =>
  ({ id, ply, kind, canRecall, keyDecision });
const points = [point("opening1", 0, "opening", true, true), point("engine1", 0, "engine", true, true),
  point("gap", 1, "gap", false), point("engine2", 2, "engine", true, true),
  point("opening2", 4, "opening"), point("engine3", 6, "engine", false)];

describe("practice selection from saved game decisions", () => {
  it("selects the short recommendation with one engine answer at a shared position", () => {
    expect(selectGamePractice(points, ["recommended"]).map(p => p.id)).toEqual(["engine1", "engine2"]);
  });
  it("keeps opening recall distinct and excludes gaps and unavailable answers", () => {
    expect(selectGamePractice(points, ["opening"]).map(p => p.id)).toEqual(["opening1", "opening2"]);
    expect(selectGamePractice(points, ["mistakes"]).map(p => p.id)).toEqual(["engine1", "engine2"]);
  });
  it("unions categories chronologically without duplicates or mutating checkpoints", () => {
    const before = structuredClone(points);
    expect(selectGamePractice(points, ["opening", "mistakes"]).map(p => p.id)).toEqual(["engine1", "engine2", "opening2"]);
    expect(selectGamePractice([...points].reverse(), ["mistakes", "opening"]).map(p => p.id)).toEqual(["engine1", "engine2", "opening2"]);
    expect(points).toEqual(before);
    expect(selectGamePractice(points, [])).toEqual([]);
  });
});

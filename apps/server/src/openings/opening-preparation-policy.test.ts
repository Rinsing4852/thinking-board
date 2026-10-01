import { describe, expect, it } from "vitest";
import type { OpeningPreparationAssessment } from "../../../../packages/contracts/src/api.js";
import { assessPreparation } from "./opening-preparation-policy.js";

const frequency: OpeningPreparationAssessment["frequency"] = {
  status: "known", percent: 0.5, moveGames: 50, positionGames: 10_000,
  ratingGroup: 1600, speeds: ["blitz", "rapid", "classical"], stale: false,
};
const personal = { occurrences: 1, responsesAnalyzed: 1, responseMistakes: 0, opponentMistakes: 0 };

describe("worth preparing policy", () => {
  it("does not demand a line for a rare reply handled well", () => {
    expect(assessPreparation({ frequency, personal, difficulty: "several_replies" })).toMatchObject({
      priority: "low", recommendation: "optional", title: "No new line needed now",
    });
  });
  it("does not call a rare reply easy without response evidence", () => {
    const result = assessPreparation({ frequency });
    expect(result.title).toBe("Optional preparation");
    expect(result.difficulty).toBe("unknown");
    expect(result.reasons.join(" ")).toContain("frequency alone");
  });
  it.each(["precise_reply", "forcing"] as const)("keeps rare but %s replies worth understanding", difficulty => {
    expect(assessPreparation({ frequency, personal, difficulty })).toMatchObject({ priority: "medium", recommendation: "learn_idea" });
  });
  it("prioritises repeated personal encounters even when the move is rare globally", () => {
    expect(assessPreparation({ frequency, personal: { ...personal, occurrences: 3 } })).toMatchObject({ priority: "high", recommendation: "prepare_line" });
  });
  it("does not ignore a weak opponent move that is commonly played", () => {
    expect(assessPreparation({ frequency: { ...frequency, percent: 20 }, personal: { ...personal, opponentMistakes: 1 } }))
      .toMatchObject({ priority: "medium", recommendation: "learn_idea" });
  });
  it("increases priority after repeated response mistakes", () => {
    expect(assessPreparation({ frequency, personal: { ...personal, responsesAnalyzed: 2, responseMistakes: 2 } }))
      .toMatchObject({ priority: "high", recommendation: "prepare_line" });
  });
  it.each(["unknown", "small_sample", "off", "unavailable"] as const)("does not invent rarity from %s evidence", status => {
    expect(assessPreparation({ frequency: { ...frequency, status }, personal })).toMatchObject({ priority: "unknown", recommendation: "inspect" });
  });
  it("does not trust stale frequency for priority", () => {
    expect(assessPreparation({ frequency: { ...frequency, percent: 90, stale: true }, personal })).toMatchObject({ priority: "unknown" });
  });
  it("retains the user's deliberate choice without changing the underlying evidence", () => {
    const decision = { choice: "unprepared" as const, note: "Use normal development.", updatedAt: "2026-10-01T12:00:00Z" };
    const result = assessPreparation({ frequency, personal: { ...personal, occurrences: 5 }, decision });
    expect(result.priority).toBe("high");
    expect(result.decision).toEqual(decision);
  });
});

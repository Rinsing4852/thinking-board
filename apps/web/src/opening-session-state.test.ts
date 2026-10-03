import { describe, expect, it } from "vitest";
import type { OpeningReviewActiveState } from "../../../packages/contracts/src/api";
import { emptyOpeningSession, nextEnabledLineId, openingSessionReducer } from "./opening-session-state";
import { parseOpeningLocation, openingLocationHash } from "./opening-location";

describe("opening session transitions", () => {
  it("cannot pause an empty session and clears pause when replacing a session", () => {
    expect(openingSessionReducer(emptyOpeningSession, { type: "pause", paused: true })).toEqual(emptyOpeningSession);
    const review = { sessionId: "first" } as OpeningReviewActiveState;
    let state = openingSessionReducer(emptyOpeningSession, { type: "replace", review });
    state = openingSessionReducer(state, { type: "pause", paused: true });
    expect(openingSessionReducer(state, { type: "replace", review }).reviewPaused).toBe(true);
    expect(openingSessionReducer(state, { type: "replace", review: { ...review, sessionId: "next" } }).reviewPaused).toBe(false);
    expect(openingSessionReducer(state, { type: "replace", review: null })).toEqual(emptyOpeningSession);
  });
  it("round-trips repertoire/line/move links and normalises malformed cursor values", () => {
    const location = { repertoireId: "notes-1", lineId: "chapter/line", ply: 7 };
    expect(parseOpeningLocation(openingLocationHash(location))).toEqual(location);
    expect(parseOpeningLocation("#games")).toBeNull();
    expect(parseOpeningLocation("#openings?repertoire=notes&ply=-4")?.ply).toBe(0);
    expect(parseOpeningLocation("#openings?repertoire=notes&ply=NaN")?.ply).toBe(0);
  });
  it("advances through chapter order without enabling paused, archived or empty lines", () => {
    const base = { archived: false, practiceEnabled: true, learnerDecisionCount: 2 };
    const lines = [{ ...base, id: "current" }, { ...base, id: "paused", practiceEnabled: false },
      { ...base, id: "archived", archived: true }, { ...base, id: "empty", learnerDecisionCount: 0 }, { ...base, id: "next-chapter" }];
    expect(nextEnabledLineId(lines, "current")).toBe("next-chapter");
    expect(nextEnabledLineId(lines, "next-chapter")).toBeNull();
    expect(nextEnabledLineId(lines, "deleted")).toBeNull();
  });
});

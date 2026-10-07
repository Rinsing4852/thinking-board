import { describe, expect, it } from "vitest";
import { pauseForFeedback, practiceTimings } from "./opening-practice-settings";

describe("practice preferences", () => {
  it("slows observation, success and rejection at relaxed pace", () => {
    const normal = practiceTimings();
    const relaxed = practiceTimings("relaxed");
    for (const key of Object.keys(normal) as Array<keyof typeof normal>) expect(relaxed[key]).toBeGreaterThan(normal[key]);
  });
  it("pauses only at the chosen feedback boundary", () => {
    expect(pauseForFeedback("never", true, true)).toBe(false);
    expect(pauseForFeedback("mistakes", false, true)).toBe(false);
    expect(pauseForFeedback("mistakes", true, false)).toBe(true);
    expect(pauseForFeedback("notes", false, true)).toBe(true);
    expect(pauseForFeedback("notes", true, false)).toBe(false);
    expect(pauseForFeedback("always", false, false)).toBe(true);
  });
});

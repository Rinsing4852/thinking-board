import { describe, expect, it } from "vitest";

import { nextReviewDate } from "./review-scheduler.js";

describe("review scheduling", () => {
  const attemptedAt = "2026-08-15T12:00:00.000Z";

  it("makes a failed item due immediately", () => {
    expect(nextReviewDate(0, false, attemptedAt)).toBe(attemptedAt);
  });

  it("uses the mastery intervals from the recorded attempt time", () => {
    expect(nextReviewDate(1, true, attemptedAt)).toBe("2026-08-18T12:00:00.000Z");
    expect(nextReviewDate(5, true, attemptedAt)).toBe("2026-09-19T12:00:00.000Z");
  });
});

import { describe, expect, it } from "vitest";

import { nextReviewDate } from "./review-scheduler.js";

describe("review scheduling", () => {
  const attemptedAt = "2026-08-15T12:00:00.000Z";

  it("gives a failed item a ten-minute retry interval", () => {
    expect(nextReviewDate(0, false, attemptedAt)).toBe("2026-08-15T12:10:00.000Z");
  });

  it("uses the mastery intervals from the recorded attempt time", () => {
    expect(nextReviewDate(1, true, attemptedAt)).toBe("2026-08-18T12:00:00.000Z");
    expect(nextReviewDate(5, true, attemptedAt)).toBe("2026-09-19T12:00:00.000Z");
  });
});

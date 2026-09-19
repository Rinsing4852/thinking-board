import { describe, expect, it } from "vitest";

import { scheduleOpeningReview, type StoredOpeningReviewCard } from "./opening-review-scheduler.js";

const NEW_CARD: StoredOpeningReviewCard = {
  state: 0,
  due_at: "2026-09-12T10:00:00.000Z",
  stability: 0,
  difficulty: 0,
  scheduled_days: 0,
  learning_steps: 0,
  repetitions: 0,
  lapses: 0,
  last_reviewed_at: null,
};

describe("opening review scheduling", () => {
  it("schedules a first successful recall for the next day", () => {
    const result = scheduleOpeningReview(NEW_CARD, true, "2026-09-12T10:00:00.000Z");
    expect(result.result).toBe("good");
    expect(result.card.state).toBe(2);
    expect(result.card.dueAt).toBe("2026-09-13T10:00:00.000Z");
    expect(result.card.repetitions).toBe(1);
  });

  it("puts a missed move into a short learning step", () => {
    const result = scheduleOpeningReview(NEW_CARD, false, "2026-09-12T10:00:00.000Z");
    expect(result.result).toBe("again");
    expect(result.card.state).toBe(1);
    expect(result.card.dueAt).toBe("2026-09-12T10:10:00.000Z");
  });

  it("uses a shorter hard-recall schedule when a correct answer takes over a minute", () => {
    const result = scheduleOpeningReview(NEW_CARD, true, "2026-09-12T10:00:00.000Z", 65_000);
    expect(result.result).toBe("hard");
    expect(result.rating).toBe(2);
    expect(new Date(result.card.dueAt).getTime()).toBeLessThan(
      new Date("2026-09-13T10:00:00.000Z").getTime(),
    );
  });
});

import { describe, expect, it } from "vitest";
import { openingResponseMs } from "./opening-response-time.js";
describe("opening response time", () => {
  const start = "2026-10-02T12:00:00.000Z", end = "2026-10-02T12:02:00.000Z";
  it("uses active time for new clients, but retains legacy wall time", () => {
    expect(openingResponseMs(start, end, 2300)).toBe(2300);
    expect(openingResponseMs(start, end)).toBe(120000);
    expect(openingResponseMs(start, end, 200000)).toBe(120000);
  });
  it("rejects invalid active time and clamps backwards wall-clock adjustments", () => {
    for (const invalid of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => openingResponseMs(start, end, invalid)).toThrow();
    expect(openingResponseMs(end, start, 5000)).toBe(0);
  });
});

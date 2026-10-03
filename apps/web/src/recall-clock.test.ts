import { describe, expect, it } from "vitest";
import { RecallClock } from "./recall-clock";

describe("active recall clock", () => {
  it("excludes all suspended time and handles overlapping pauses idempotently", () => {
    let time = 0;
    const clock = new RecallClock(() => time);
    clock.setRunning(true); time = 2000;
    clock.setRunning(false); time = 122000;
    clock.setRunning(false); expect(clock.read()).toBe(2000);
    clock.setRunning(true); time += 3000;
    clock.setRunning(true); expect(clock.read()).toBe(5000);
  });
  it("restores saved active time without counting time away", () => {
    const clock = new RecallClock(() => 1000000, 2300);
    expect(clock.read()).toBe(2300);
  });
});

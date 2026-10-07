import type { OpeningPausePolicy, OpeningPracticePace } from "../../../packages/contracts/src/api";

export const practiceTimings = (pace: OpeningPracticePace = "normal") => pace === "relaxed"
  ? { opponent: 800, correct: 1100, helped: 1900, rejectHold: 1100, rejectReturn: 480 }
  : { opponent: 450, correct: 650, helped: 1500, rejectHold: 650, rejectReturn: 360 };

export function pauseForFeedback(policy: OpeningPausePolicy, assisted: boolean, hasNote: boolean): boolean {
  return policy === "always" || policy === "mistakes" && assisted || policy === "notes" && hasNote;
}

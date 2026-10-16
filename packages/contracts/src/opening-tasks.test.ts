import { describe, expect, it } from "vitest";
import { openingTask, rankedOpeningTasks, firstPreparationTask } from "./opening-tasks.js";
import type { OpeningCoverageGap } from "./api.js";
const task = (id: string, patch: Partial<OpeningCoverageGap> = {}): OpeningCoverageGap => ({ positionId: id,
  fen: "start", chapterTitle: "Opening", lineTitle: "Main", moveUci: "e2e4", moveSan: "e4", games: 0,
  frequencyPercent: 0, status: "missing_response", ...patch });
const untested = task("untested", { status: "needs_practice", responseMoveId: "saved", recallAttempts: 0 });
const due = task("review", { status: "needs_practice", responseMoveId: "review", recallAttempts: 3, recallPercent: 40 });
const observed = task("observed", { personalFrequency: { games: 1, positionGames: 10, percent: 10 } });
const repeated = task("repeated", { personalFrequency: { games: 4, positionGames: 10, percent: 40 } });
const common = task("common", { reachPercent: 20 });
const rare = task("rare", { reachPercent: .1 });
// Expected choices are fixed independently of numeric implementation weights.
const scenarios: Array<[string, OpeningCoverageGap[], string | null]> = [
  ["real missing reply before untested content", [untested, observed], "observed"],
  ["repeated encounter before single encounter", [observed, repeated], "repeated"],
  ["memory review before untested content", [untested, due], "review"],
  ["common missing reply before rare reply", [rare, common], "common"],
  ["observed reply before population-only reply", [common, observed], "observed"],
  ["memory review before population-only expansion", [common, due], "review"],
  ["unknown unseen reply excluded", [task("unknown", { status: "unknown" })], null],
  ["unknown encountered reply retained", [task("known-game", { status: "unknown", personalFrequency: { games: 1, positionGames: 1, percent: 100 } })], "known-game"],
  ["prepared reply excluded", [task("prepared", { status: "prepared" })], null],
  ["intentional omission excluded", [task("omit", { status: "unprepared" }), observed], "observed"],
  ["skipped task excluded", [{ ...observed, taskChoice: { choice: "skip", untilAt: null } }, untested], "untested"],
  ["postponed task excluded", [{ ...observed, taskChoice: { choice: "later", untilAt: "2099-01-01" } }, common], "common"],
  ["empty repertoire", [], null],
  ["only untested answer", [untested], "untested"],
  ["only recorded review", [due], "review"],
  ["only real missing reply", [observed], "observed"],
  ["rare supported reply before unsupported guess", [task("guess"), rare], "rare"],
  ["known population gap before unsupported idea", [task("idea", { status: "idea_only" }), common], "common"],
  ["real game evidence independent of input order", [repeated, observed, untested], "repeated"],
  ["untested answer has no invented forgetting penalty", [task("untested2", { status: "needs_practice", recallAttempts: 0, recallPercent: 0 }), observed], "observed"],
];
describe("fixed recommendation scenarios", () => {
  it.each(scenarios)("%s", (_name, gaps, expected) => expect(rankedOpeningTasks(gaps)[0]?.positionId ?? null).toBe(expected));
  it("deduplicates shared memory targets and keeps home preparation aligned with coverage", () => {
    expect(rankedOpeningTasks([untested, { ...untested, positionId: "transposition" }])).toHaveLength(1);
    expect(firstPreparationTask([due, observed])?.positionId).toBe("observed");
    expect(openingTask(untested).reason).not.toMatch(/mistake|failed|forgot/);
  });
});

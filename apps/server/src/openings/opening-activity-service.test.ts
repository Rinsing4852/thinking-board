import { openingQualityMetrics } from "./opening-quality-metrics.js";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { ensureActiveProfile, setActiveProfile } from "../training/profile.js";
import { OpeningContentService } from "./opening-content-service.js";
import { OpeningPgnImportService } from "./opening-pgn-import.js";
import { OpeningReviewService } from "./opening-review-service.js";
import { OpeningPreferencesService } from "./opening-preferences-service.js";
import { OpeningActivityService, calendarDay } from "./opening-activity-service.js";

const databases: Database[] = [];
afterEach(() => { vi.useRealTimers(); databases.splice(0).forEach(database => database.close()); });

function setup() {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
  const database = new Database(":memory:", path.resolve("migrations"));
  databases.push(database);
  const db = database.connection;
  const content = new OpeningContentService(db);
  const repertoireId = new OpeningPgnImportService(db, content).import({
    pgn: "1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. d3 Nf6 5. O-O *", learnerColor: "white", ownershipConfirmed: true,
  }).repertoireIds[0]!;
  const lineId = String(db.prepare("SELECT id FROM opening_lines LIMIT 1").pluck().get());
  const reviews = new OpeningReviewService(db);
  const preferences = new OpeningPreferencesService(db, false);
  const activity = new OpeningActivityService(db);
  const reviewed = (timestamp: string, assisted = false, move = "e2e4") => {
    vi.setSystemTime(new Date(timestamp));
    const exercise = reviews.startLine(repertoireId, lineId);
    reviews.answer(exercise.sessionId, move, assisted, false, exercise.queueEntryId, 1000);
    return exercise;
  };
  return { db, preferences, reviews, activity, reviewed, repertoireId, lineId };
}

describe("daily opening practice", () => {
  it("counts completed scheduled encounters once and keeps assistance separate from recall", () => {
    const { activity, reviewed, reviews, db } = setup();
    const first = reviewed("2026-10-14T10:00:00Z");
    reviews.answer(first.sessionId, "e2e4", false, false, first.queueEntryId, 1000);
    reviewed("2026-10-14T10:01:00Z", true);
    reviewed("2026-10-14T10:02:00Z", false, "d2d4");
    const repeat = reviewed("2026-10-14T10:03:00Z");
    db.prepare("UPDATE opening_review_queue SET presentation_kind = 'lapse_repeat' WHERE id = ?").run(repeat.queueEntryId);
    expect(activity.get("2026-10-14T12:00:00Z"))
      .toMatchObject({ completedToday: 3, independentToday: 1, remaining: 7, goalReached: false, streakDays: 1 });
  });

  it("uses local calendar days across midnight, daylight saving and fractional-hour zones", () => {
    const { preferences, activity, reviewed } = setup();
    preferences.update({ ratingGroup: 1600, platform: "lichess", useExplorer: false, practiceTimeZone: "Europe/London" });
    reviewed("2026-10-13T23:30:00Z");
    expect(activity.get("2026-10-14T00:30:00Z")).toMatchObject({ date: "2026-10-14", completedToday: 1 });
    expect(calendarDay("2026-10-25T00:30:00Z", "Europe/London")).toBe("2026-10-25");
    expect(calendarDay("2026-10-25T01:30:00Z", "Europe/London")).toBe("2026-10-25");
    expect(calendarDay("2026-10-13T18:20:00Z", "Asia/Kathmandu")).toBe("2026-10-14");
    expect(calendarDay("2026-10-13T18:10:00Z", "Asia/Kathmandu")).toBe("2026-10-13");
  });

  it("keeps yesterday's streak available today and resets it after a missed day", () => {
    const { reviewed, activity } = setup();
    reviewed("2026-10-12T12:00:00Z");
    reviewed("2026-10-13T12:00:00Z");
    const today = activity.get("2026-10-14T12:00:00Z");
    expect(today).toMatchObject({ completedToday: 0, streakDays: 2 });
    expect(today.days).toHaveLength(28);
    expect(today.days.at(-2)).toMatchObject({ date: "2026-10-13", completed: 1, independent: 1 });
    expect(activity.get("2026-10-15T12:00:00Z").streakDays).toBe(0);
    expect(activity.get("2026-10-11T12:00:00Z").completedToday).toBe(0);
  });

  it("isolates practice activity and daily targets for each player", () => {
    const { db, reviewed, activity, preferences } = setup();
    const original = ensureActiveProfile(db);
    reviewed("2026-10-14T10:00:00Z");
    db.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES ('other', 'Other player', '2026-10-14')").run();
    setActiveProfile(db, "other");
    preferences.update({ ratingGroup: 1000, platform: "not_sure", useExplorer: false, dailyPracticeGoal: 5 });
    expect(activity.get()).toMatchObject({ goal: 5, completedToday: 0, streakDays: 0 });
    setActiveProfile(db, original);
    expect(activity.get()).toMatchObject({ goal: 10, completedToday: 1 });
  });

  it("sizes recommended batches to the remaining goal and leaves extra practice available", () => {
    const { preferences, reviewed, reviews, activity, repertoireId, lineId } = setup();
    preferences.update({ ratingGroup: 1600, platform: "not_sure", useExplorer: false, newMovesPerSession: 10, dailyPracticeGoal: 3 });
    expect(reviews.recommendation().counts.total).toBe(3);
    reviewed("2026-10-14T10:00:00Z");
    expect(reviews.recommendation().counts.total).toBe(2);
    reviewed("2026-10-14T10:01:00Z");
    reviewed("2026-10-14T10:02:00Z");
    expect(activity.get()).toMatchObject({ goalReached: true, remaining: 0 });
    expect(reviews.recommendation()).toMatchObject({ available: false, activity: { goalReached: true } });
    expect(() => reviews.startRecommended()).toThrow(/Daily goal reached/);
    expect(reviews.startLine(repertoireId, lineId).kind).toBe("exercise");
  });

  it("persists goal and time zone, preserves omitted settings, and rejects invalid input without changes", () => {
    const { preferences } = setup();
    const input = { ratingGroup: 1600, platform: "lichess" as const, useExplorer: false };
    preferences.update({ ...input, dailyPracticeGoal: 15, practiceTimeZone: "Europe/London" });
    expect(preferences.update(input)).toMatchObject({ dailyPracticeGoal: 15, practiceTimeZone: "Europe/London" });
    const before = preferences.get();
    for (const dailyPracticeGoal of [0, 51, 1.5]) expect(() => preferences.update({ ...input, dailyPracticeGoal })).toThrow();
    expect(() => preferences.update({ ...input, practiceTimeZone: "Moon/Base" })).toThrow(/time zone/);
    expect(preferences.get()).toEqual(before);
  });
});


describe("quality outcome measurements", () => {
  it("keeps missing evidence unknown and separates delayed unaided recall from assisted answers", () => {
    const {db,reviewed}=setup();
    expect(openingQualityMetrics(db).delayedRecall.every(cohort=>cohort.percent===null)).toBe(true);
    reviewed("2026-10-01T12:00:00Z");
    reviewed("2026-10-09T12:00:00Z");
    reviewed("2026-10-24T12:00:00Z",true);
    const metrics=openingQualityMetrics(db);
    expect(metrics.delayedRecall).toMatchObject([{encounters:1,independent:1,percent:100},{encounters:1,independent:0,percent:0}]);
    expect(metrics.games.departuresPer100Games).toBeNull();
  });
});


describe("automatic task postponement", () => {
  it("keeps postponed memory work out of automatic sessions and restores it after expiry", () => {
    const {db,reviews,repertoireId}=setup();
    const profile=ensureActiveProfile(db);
    const moves=db.prepare("SELECT id FROM opening_moves WHERE repertoire_id=? AND role='learner'").all(repertoireId) as Array<{id:string}>;
    for(const move of moves) db.prepare("INSERT INTO opening_task_choices(profile_id,repertoire_id,task_id,choice,until_at,updated_at) VALUES(?,?,?,'later',?,?)")
      .run(profile,repertoireId,`practice:${move.id}`,"2026-10-15T12:00:00Z","2026-10-14T12:00:00Z");
    expect(reviews.recommendation().available).toBe(false);
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    expect(reviews.recommendation().available).toBe(true);
  });
});

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { ImportService } from "../imports/import-service.js";
import { AttemptLifecycle } from "./attempt-lifecycle.js";
import { V1TrainingService } from "./v1-training-service.js";
import { parseGameDays } from "./practice-scope.js";

describe("recommended thinking practice", () => {
  let database: Database;
  beforeEach(() => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
    database = new Database(":memory:", path.resolve("migrations"));
  });
  afterEach(() => { database.close(); vi.useRealTimers(); });

  function add(name: string, playedAt: string | null, mode = "quiet_position") {
    const db = database.connection;
    new ImportService(db).import(`[White "Learner"]\n[Black "${name}"]\n[Result "*"]\n\n1. e4 e5 *`, "Learner");
    const game = db.prepare("SELECT id, profile_id FROM games WHERE black_name=?").get(name) as { id: string; profile_id: string };
    db.prepare("UPDATE games SET played_at=? WHERE id=?").run(playedAt, game.id);
    const move = db.prepare("SELECT id, from_position_id FROM moves WHERE game_id=? AND ply=1").get(game.id) as { id: string; from_position_id: string };
    const item = `item-${name}-${mode}`;
    db.prepare("INSERT INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at) VALUES (?,?,?,?,?,1,?)")
      .run(item, game.profile_id, game.id, move.id, mode, "2026-10-26T12:00:00Z");
    db.prepare("INSERT INTO review_states(item_id,due_at) VALUES (?,'2020-01-01')").run(item);
    if (mode === "quiet_position") db.prepare(`INSERT INTO quiet_position_items(item_id,position_id,weakest_squares_json,acceptable_moves_json,explanation,evidence_json)
      VALUES (?,?,'["g1"]','[{"moveUci":"g1f3","moveSan":"Nf3","centipawnLoss":0}]','Develop the knight.','{}')`).run(item, move.from_position_id);
    return item;
  }

  it("reduces due work on success and reveal, preserves session progress and never fills with future reviews", () => {
    const first = add("First", "2026-10-26T10:00:00Z"), second = add("Second", "2026-10-26T11:00:00Z");
    const future = add("Future", "2026-10-26T11:00:00Z");
    database.connection.prepare("UPDATE review_states SET due_at='2099-01-01' WHERE item_id=?").run(future);
    const service = new V1TrainingService(database.connection), attempts = new AttemptLifecycle(database.connection);
    const session = service.createSession(15);
    expect(session.items.map(item => item.itemId).sort()).toEqual([first, second].sort());
    const current = session.currentItem!.itemId;
    service.answerQuiet(attempts.start(current, session.id!).attemptId, "g1", "g1f3");
    expect(service.dashboard()).toMatchObject({ practice: { available: 1 }, totals: { trainingItems: 3, due: 1 } });
    const resumed = new V1TrainingService(database.connection).createSession(15, 7);
    expect(resumed).toMatchObject({ id: session.id, completedCount: 1, remainingCount: 1, gameDays: null,
      remainingMix: [{ mode: "quiet_position", count: 1 }] });
    service.revealQuiet(attempts.start(resumed.currentItem!.itemId, session.id!).attemptId);
    expect(service.session(session.id!)).toMatchObject({ status: "completed", remainingCount: 0, remainingMix: [] });
    expect(service.activeSession()).toBeNull();
    expect(service.dashboard()).toMatchObject({ practice: { available: 0 }, totals: { due: 0 } });
    expect(service.createSession()).toMatchObject({ id: null, items: [] });
    vi.advanceTimersByTime(10 * 60_000);
    expect(service.createSession().items.map(item => item.itemId)).toEqual([resumed.currentItem!.itemId]);
  });

  it("uses the game's played date for rolling windows, excludes unknown/future dates and preserves a session's scope", () => {
    const recent = add("Recent", "2026-10-25T12:00:00Z");
    add("TwoDays", "2026-10-24T12:00:00Z"); add("Week", "2026-10-19T12:00:00Z");
    add("Month", "2026-09-26T12:00:00Z"); add("Old", "2026-06-01");
    add("Unknown", null); add("Future", "2027-01-01");
    const service = new V1TrainingService(database.connection);
    expect([1, 2, 7, 30, 90, null].map(days => service.dashboard(days).practice!.available)).toEqual([1, 2, 3, 4, 4, 7]);
    expect(service.nextQuiet("random", undefined, 1)).toMatchObject({ itemId: recent });
    const started = service.createSession(15, 1);
    expect(started).toMatchObject({ gameDays: 1, items: [{ itemId: recent }] });
    expect(new V1TrainingService(database.connection).activeSession()).toMatchObject({ id: started.id, gameDays: 1 });
    expect(service.createSession(15, 30)).toMatchObject({ id: started.id, gameDays: 1 });
    service.revealQuiet(new AttemptLifecycle(database.connection).start(recent, started.id!).attemptId);
    expect(service.nextQuiet("due", undefined, 1)).toMatchObject({ kind: "empty", options: [{ pool: "early", count: 1 }, { pool: "random", count: 1 }] });
    expect(service.nextQuiet("early", undefined, 1)).toMatchObject({ itemId: recent });
  });

  it("honours small session sizes across modes and excludes inactive and diagnostic items", () => {
    add("Quiet", null); add("Check", null, "blunder_check"); add("Punish", null, "punish_blunder");
    const inactive = add("Inactive", null), diagnostic = add("Diagnostic", null, "diagnosis_only");
    database.connection.prepare("UPDATE training_items SET active=0 WHERE id=?").run(inactive);
    const service = new V1TrainingService(database.connection);
    expect(service.dashboard()).toMatchObject({ practice: { available: 3 }, totals: { due: 3 } });
    expect(service.createSession(1).items).toHaveLength(1);
    expect(service.createSession(1).items.some(item => [inactive, diagnostic].includes(item.itemId))).toBe(false);
  });

  it("validates game windows instead of silently widening them", () => {
    for (const value of [0, -1, 3, "bad", {}, true]) expect(() => parseGameDays(value)).toThrow("Choose all games");
    expect(parseGameDays("7")).toBe(7); expect(parseGameDays("all")).toBeNull();
  });
});

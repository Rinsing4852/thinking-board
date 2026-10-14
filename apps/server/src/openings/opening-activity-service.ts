import type { OpeningPracticeActivity } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";

export function calendarDay(timestamp: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function shiftDay(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Practice effort is separate from unaided recall and long-term mastery. */
export class OpeningActivityService {
  constructor(private readonly db: SqliteDatabase) {}

  get(timestamp = new Date().toISOString()): OpeningPracticeActivity {
    const profileId = ensureActiveProfile(this.db);
    const preferences = this.db.prepare("SELECT daily_practice_goal, practice_time_zone FROM opening_player_preferences WHERE profile_id = ?")
      .get(profileId) as { daily_practice_goal: number; practice_time_zone: string } | undefined;
    const goal = preferences?.daily_practice_goal ?? 10;
    const timeZone = preferences?.practice_time_zone ?? "UTC";
    const today = calendarDay(timestamp, timeZone);
    // One event per scheduled encounter; immediate retries and lapse repeats do
    // not add practice credit. Minute buckets retain fractional-hour zones and
    // daylight-saving boundaries without formatting every historical event.
    const rows = this.db.prepare(`WITH first_answers AS (
      SELECT event.created_at, event.correct, event.assisted,
        ROW_NUMBER() OVER (PARTITION BY event.queue_entry_id ORDER BY event.created_at, event.rowid) AS answer_number
      FROM opening_review_events event
      JOIN opening_review_sessions session ON session.id = event.session_id AND session.profile_id = ?
      JOIN opening_review_queue queue ON queue.id = event.queue_entry_id AND queue.presentation_kind = 'scheduled'
      WHERE event.created_at <= ?
    ) SELECT substr(created_at, 1, 16) || ':00.000Z' AS minute,
        COUNT(*) AS completed, SUM(CASE WHEN correct = 1 AND assisted = 0 THEN 1 ELSE 0 END) AS independent
      FROM first_answers WHERE answer_number = 1 GROUP BY substr(created_at, 1, 16)`)
      .all(profileId, timestamp) as Array<{ minute: string; completed: number; independent: number }>;
    const days = new Map<string, { completed: number; independent: number }>();
    for (const row of rows) {
      const day = calendarDay(row.minute, timeZone);
      const bucket = days.get(day) ?? { completed: 0, independent: 0 };
      bucket.completed += row.completed;
      bucket.independent += row.independent;
      days.set(day, bucket);
    }
    const completedToday = days.get(today)?.completed ?? 0;
    let streakDays = 0;
    let cursor = completedToday > 0 ? today : shiftDay(today, -1);
    while ((days.get(cursor)?.completed ?? 0) > 0) {
      streakDays += 1;
      cursor = shiftDay(cursor, -1);
    }
    return {
      date: today, timeZone, goal, completedToday,
      independentToday: days.get(today)?.independent ?? 0,
      remaining: Math.max(0, goal - completedToday),
      goalReached: completedToday >= goal, streakDays,
      days: Array.from({ length: 28 }, (_, index) => {
        const date = shiftDay(today, index - 27);
        return { date, ...(days.get(date) ?? { completed: 0, independent: 0 }) };
      }),
    };
  }
}

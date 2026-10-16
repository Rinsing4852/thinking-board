import type { SqliteDatabase } from "../db/database.js";
export const DEFAULT_SPEEDS = "blitz,rapid,classical";
export function explorerSpeeds(input: unknown = DEFAULT_SPEEDS): string {
  const values = typeof input === "string" ? input.split(",") : input;
  if (!Array.isArray(values) || !values.length || values.some(value => !["blitz", "rapid", "classical"].includes(value))) throw new Error("Choose blitz, rapid or classical game data");
  return ["blitz", "rapid", "classical"].filter(speed => values.includes(speed)).join(",");
}
export function qualityPreferences(db: SqliteDatabase, profileId: string) {
  const row = db.prepare("SELECT goal_games, speeds FROM opening_quality_preferences WHERE profile_id = ?").get(profileId) as { goal_games: number; speeds: string } | undefined;
  return { coverageGoalGames: row?.goal_games ?? 200, explorerSpeeds: (row?.speeds ?? DEFAULT_SPEEDS).split(",") };
}

import { now } from "../lib/ids.js";

/** Rolling game-play window, never the upload or analysis date. */
export function parseGameDays(value: unknown): number | null {
  if (value === undefined || value === null || value === "all") return null;
  const days = typeof value === "string" ? Number(value) : value;
  if (typeof days !== "number" || ![1, 2, 7, 30, 90].includes(days)) {
    throw new Error("Choose all games or games from the last 1, 2, 7, 30 or 90 days");
  }
  return days;
}

export function practiceScope(gameDays: number | null = null): { sql: string; params: string[] } {
  const days = parseGameDays(gameDays);
  if (days === null) return { sql: "", params: [] };
  const until = now();
  const since = new Date(Date.parse(until) - days * 86_400_000).toISOString();
  return {
    sql: `AND EXISTS (SELECT 1 FROM games practice_game WHERE practice_game.id = ti.game_id
      AND julianday(practice_game.played_at) >= julianday(?)
      AND julianday(practice_game.played_at) <= julianday(?))`,
    params: [since, until],
  };
}

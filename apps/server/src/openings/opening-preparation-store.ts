import type { SqliteDatabase } from "../db/database.js";
import { EXPLORER_CACHE_MS, EXPLORER_SPEEDS, PREPARATION_MIN_SAMPLE } from "./opening-preparation-policy.js";

/** Reads existing evidence only. Practice must not wait for remote services. */
export function practiceReplyFrequency(db: SqliteDatabase, profileId: string, positionKey: string, moveUci: string): number | null {
  const row = db.prepare(`SELECT cache.total_games, cache.moves_json, cache.fetched_at
    FROM opening_player_preferences preference JOIN opening_explorer_cache cache
      ON cache.rating_group = preference.rating_group AND cache.speeds = ?
    WHERE preference.profile_id = ? AND preference.use_explorer = 1 AND cache.position_key = ?`)
    .get(EXPLORER_SPEEDS, profileId, positionKey) as { total_games: number; moves_json: string; fetched_at: string } | undefined;
  if (!row || row.total_games < PREPARATION_MIN_SAMPLE || !Number.isFinite(Date.parse(row.fetched_at))
    || Date.now() - Date.parse(row.fetched_at) >= EXPLORER_CACHE_MS) return null;
  try {
    const moves = JSON.parse(row.moves_json) as Array<{ uci: string; white: number; draws: number; black: number }>;
    const move = moves.find(candidate => candidate.uci === moveUci);
    if (!move) return null;
    const games = move.white + move.draws + move.black;
    return Number.isSafeInteger(games) && games >= 5 && games <= row.total_games ? games / row.total_games : null;
  } catch { return null; }
}

export function preparationNote(db: SqliteDatabase, profileId: string, repertoireId: string, afterPositionKey: string): string | null {
  const row = db.prepare(`SELECT note FROM opening_preparation_decisions
    WHERE profile_id = ? AND repertoire_id = ? AND after_position_key = ? AND choice IN ('idea', 'line') AND note <> ''
    ORDER BY updated_at DESC LIMIT 1`).get(profileId, repertoireId, afterPositionKey) as { note: string } | undefined;
  return row?.note ?? null;
}

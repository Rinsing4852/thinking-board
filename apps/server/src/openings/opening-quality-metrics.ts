import type { SqliteDatabase } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";

export function openingQualityMetrics(db: SqliteDatabase) {
  const profile = ensureActiveProfile(db);
  // Every exposure participates in LAG, including assisted/lapse encounters:
  // a later answer is not a delayed retest if it was rehearsed in between.
  const rows = db.prepare(`WITH exposures AS (
    SELECT event.created_at, event.correct,event.assisted,event.revealed,queue.presentation_kind,
      LAG(event.created_at) OVER(PARTITION BY event.review_item_id ORDER BY event.created_at,event.rowid) AS previous_at
    FROM opening_review_events event JOIN opening_review_sessions session ON session.id=event.session_id
    JOIN opening_review_queue queue ON queue.id=event.queue_entry_id WHERE session.profile_id=?
  ) SELECT *,julianday(created_at)-julianday(previous_at) AS elapsed_days FROM exposures WHERE previous_at IS NOT NULL`)
    .all(profile) as Array<{ correct:number;assisted:number;revealed:number;presentation_kind:string;elapsed_days:number }>;
  const delayedRecall = [7,14].map(days => {
    const tested = rows.filter(row => row.presentation_kind === "scheduled" && row.elapsed_days >= days && (days === 14 || row.elapsed_days < 14));
    const independent = tested.filter(row => row.correct && !row.assisted && !row.revealed).length;
    return { minimumDays: days, maximumDays: days === 7 ? 14 : null, encounters: tested.length, independent,
      percent: tested.length ? Math.round(1000 * independent / tested.length) / 10 : null };
  });
  const games = db.prepare(`WITH matches AS (
    SELECT match.game_id,match.status,ROW_NUMBER() OVER(PARTITION BY match.game_id ORDER BY match.matched_plies DESC,match.repertoire_id) AS ordinal
    FROM game_opening_matches match WHERE match.profile_id=? AND match.matched_plies>0
  ) SELECT COUNT(*) AS gamesMatched,SUM(CASE WHEN status='player_deviation' THEN 1 ELSE 0 END) AS playerDepartures FROM matches WHERE ordinal=1`)
    .get(profile) as { gamesMatched:number;playerDepartures:number|null };
  return { delayedRecall, games: { ...games, playerDepartures:games.playerDepartures ?? 0,
    departuresPer100Games: games.gamesMatched ? Math.round(1000 * (games.playerDepartures ?? 0) / games.gamesMatched) / 10 : null },
    explanation: "Observed results, not proof of learning improvement. Delayed recall uses unrehearsed scheduled encounters. A game departure is leaving a saved line, not necessarily a chess mistake. No data is unknown, not zero." };
}

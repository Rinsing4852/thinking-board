import type { OpeningReviewGameEvidence } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";

/** The same best-match policy as the inbox; one game counts once, not once per repertoire. */
export function openingReviewEvidence(db: SqliteDatabase, profileId: string, repertoireId: string, moveId: string): OpeningReviewGameEvidence {
  const rows = db.prepare(`WITH ranked_matches AS (
    SELECT gom.*, ROW_NUMBER() OVER (PARTITION BY gom.game_id ORDER BY gom.matched_plies DESC,
      gom.matched_player_moves DESC, CASE gom.status WHEN 'in_repertoire' THEN 5 WHEN 'player_deviation' THEN 4
      WHEN 'opponent_deviation' THEN 3 WHEN 'repertoire_ended' THEN 2 ELSE 1 END DESC,
      CASE WHEN oi.repertoire_id IS NULL THEN 0 ELSE 1 END DESC, r.name) AS match_rank
    FROM game_opening_matches gom JOIN opening_repertoires r ON r.id = gom.repertoire_id
    LEFT JOIN opening_imports oi ON oi.repertoire_id = gom.repertoire_id WHERE gom.profile_id = ?
  ) SELECT g.id AS gameId, g.white_name AS white, g.black_name AS black, g.played_at AS playedAt,
    m.san AS playedMove, expected.move_san AS repertoireMove, m.move_number AS moveNumber,
    COUNT(*) OVER () AS occurrences
    FROM ranked_matches match JOIN games g ON g.id = match.game_id
    JOIN moves m ON m.id = match.departure_move_id JOIN opening_moves expected ON expected.id = match.expected_move_id
    WHERE match.match_rank = 1 AND match.repertoire_id = ? AND match.expected_move_id = ? AND match.status = 'player_deviation'
    ORDER BY COALESCE(g.played_at, g.created_at) DESC, g.id LIMIT 3`)
    .all(profileId, repertoireId, moveId) as Array<OpeningReviewGameEvidence["games"][number] & { occurrences: number }>;
  return { occurrences: rows[0]?.occurrences ?? 0, games: rows.map(({ occurrences: _count, ...game }) => game) };
}

import type {SqliteDatabase} from "../db/database.js";
import {practiceLineEligible} from "./opening-practice-eligibility.js";

/** Select unseen responses, rather than treating every alternative as one card.
 * Shared line membership is deduplicated; paused/archived branches stay excluded.
 */
export function unseenOpeningResponses(db:SqliteDatabase, profileId:string, repertoireId:string|null=null, limit=2147483647) {
  return db.prepare(`SELECT move.id AS moveId, move.repertoire_id AS repertoireId, item.id AS itemId,
      MIN(chapter.sort_order) AS chapterOrder, MIN(line.priority) AS linePriority, MIN(member.ply) AS ply
    FROM opening_moves move
    JOIN opening_line_moves member ON member.move_id = move.id
    JOIN opening_lines line ON line.id = member.line_id AND line.active = 1
    JOIN opening_chapters chapter ON chapter.id = line.chapter_id AND chapter.active = 1
    LEFT JOIN opening_line_preferences preference ON preference.line_id = line.id AND preference.profile_id = ?
    LEFT JOIN opening_move_review_cards card ON card.move_id = move.id AND card.profile_id = ?
    LEFT JOIN opening_review_items item ON item.repertoire_id = move.repertoire_id
      AND item.position_id = move.from_position_id AND item.profile_id = ? AND item.knowledge_dimension = 'move'
    WHERE move.active = 1 AND move.role = 'learner' AND (? IS NULL OR move.repertoire_id = ?)
      AND preference.archived_at IS NULL AND ${practiceLineEligible("line", "?")}
      AND COALESCE(card.repetitions, 0) = 0 AND COALESCE(card.state, 0) = 0
    GROUP BY move.id
    ORDER BY chapterOrder, linePriority, ply, move.move_kind DESC, move.sort_order, move.id
    LIMIT ?`).all(profileId,profileId,profileId,repertoireId,repertoireId,profileId,limit) as Array<{
      moveId:string; repertoireId:string; itemId:string|null;
    }>;
}

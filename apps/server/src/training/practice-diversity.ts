import { Chess, type Square } from "chess.js";
import type { SqliteDatabase } from "../db/database.js";

/** Same tactical answer persisting across consecutive learner turns in one game.
 * Different games, perspectives and later recurrences remain independent.
 */
export function tacticalSessionGroups(db: SqliteDatabase, itemIds: string[]): Map<string, string> {
  const groups = new Map(itemIds.map(itemId => [itemId, itemId]));
  const query = db.prepare(`SELECT ti.id,ti.game_id,ti.mode,m.ply,
    COALESCE(bci.evidence_json,pbi.evidence_json) AS evidence,
    COALESCE(before_pos.fen,punish_pos.fen) AS before_fen, after_pos.fen,
    (SELECT move_uci FROM acceptable_responses WHERE item_id=ti.id ORDER BY engine_rank LIMIT 1) AS response
    FROM training_items ti JOIN moves m ON m.id=ti.source_move_id
    LEFT JOIN blunder_check_items bci ON bci.item_id=ti.id
    LEFT JOIN punish_blunder_items pbi ON pbi.item_id=ti.id
    LEFT JOIN positions before_pos ON before_pos.id=bci.before_position_id
    LEFT JOIN positions after_pos ON after_pos.id=bci.after_candidate_position_id
    LEFT JOIN positions punish_pos ON punish_pos.id=pbi.position_id
    WHERE ti.id=? AND ti.mode IN ('blunder_check','punish_blunder')`);
  type Row = {id:string;game_id:string;mode:string;ply:number;evidence:string;before_fen:string;fen:string;response:string};
  const rows = itemIds.map(itemId => query.get(itemId) as Row | undefined).filter((row):row is Row => Boolean(row)).sort((a,b)=>a.ply-b.ply);
  const last = new Map<string, {ply:number;group:string}>();
  for (const row of rows) {
    try {
      const evidence = JSON.parse(row.evidence);
      if (!evidence.proof || !row.response) continue;
      const missed = evidence.exerciseKind === 'missed_opportunity';
      const board = new Chess(missed || row.mode==='punish_blunder' ? row.before_fen : row.fen);
      const target = board.get(row.response.slice(2,4) as Square);
      const key = JSON.stringify([row.game_id,row.mode,missed,row.response,evidence.proof.kind,target?.color,target?.type]);
      const previous = last.get(key);
      const group = previous && row.ply-previous.ply<=2 ? previous.group : row.id;
      groups.set(row.id,group);last.set(key,{ply:row.ply,group});
    } catch { /* Legacy or incomplete evidence keeps its own identity. */ }
  }
  return groups;
}

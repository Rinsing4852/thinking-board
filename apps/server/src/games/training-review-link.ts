import {createHash} from 'node:crypto';
import type {SqliteDatabase} from '../db/database.js';

const tables:Record<string,string>={blunder_check:'blunder_check_items',what_changed:'what_changed_items',candidate_generation:'candidate_generation_items',punish_blunder:'punish_blunder_items',quiet_position:'quiet_position_items'};
function fingerprint(db:SqliteDatabase,itemId:string,mode:string):string|null {
 const table=tables[mode];if(!table)return null;
 const exercise=db.prepare(`SELECT * FROM ${table} WHERE item_id=?`).get(itemId);if(!exercise)return null;
 const answers=db.prepare(`SELECT move_uci,move_san,categories_json,engine_rank,loss_from_best_cp
   FROM acceptable_responses WHERE item_id=? ORDER BY engine_rank,move_uci`).all(itemId);
 return createHash('sha256').update(JSON.stringify([mode,exercise,answers])).digest('hex');
}

/** Capture provenance at start, before an async engine check or reanalysis can change it. */
export function captureTrainingReview(db:SqliteDatabase,attemptId:string):void {
 const row=db.prepare(`SELECT ti.id,ti.mode,ti.source_move_id,ti.game_id,g.profile_id,
   (SELECT ar.id FROM analysis_runs ar WHERE ar.game_id=g.id AND ar.status='completed' ORDER BY ar.completed_at DESC,ar.rowid DESC LIMIT 1) AS run
   FROM training_attempts ta JOIN training_items ti ON ti.id=ta.item_id
   JOIN games g ON g.id=ti.game_id AND g.profile_id=ti.profile_id
   JOIN moves m ON m.id=ti.source_move_id AND m.game_id=g.id AND m.mover_color=g.player_color
   WHERE ta.id=? AND ti.active=1`).get(attemptId) as {id:string;mode:string;source_move_id:string;game_id:string;profile_id:string;run:string|null}|undefined;
 if(!row?.run)return;
 const hash=fingerprint(db,row.id,row.mode);if(!hash)return;
 const saved=db.prepare(`SELECT s.id,s.source_revision FROM game_review_replays r JOIN game_review_snapshots s ON s.id=r.snapshot_id
   WHERE r.game_id=? AND r.profile_id=?`).get(row.game_id,row.profile_id) as {id:string;source_revision:string}|undefined;
 const snapshot=saved&&JSON.parse(saved.source_revision)[0]===row.run?saved.id:null;
 db.prepare(`INSERT INTO training_game_review_context(attempt_id,analysis_run_id,exercise_fingerprint,snapshot_id) VALUES (?,?,?,?)`)
   .run(attemptId,row.run,hash,snapshot);
}

export function completedTrainingReview(db:SqliteDatabase,attemptId:string) {
 const row=db.prepare(`SELECT ta.id,ta.answered_at,ta.outcome,ti.id AS item_id,ti.mode,ti.profile_id,ti.game_id,ti.source_move_id,
   c.analysis_run_id,c.exercise_fingerprint,c.snapshot_id
   FROM training_attempts ta JOIN training_game_review_context c ON c.attempt_id=ta.id
   JOIN training_items ti ON ti.id=ta.item_id JOIN games g ON g.id=ti.game_id AND g.profile_id=ti.profile_id
   JOIN moves m ON m.id=ti.source_move_id AND m.game_id=g.id AND m.mover_color=g.player_color
   WHERE ta.id=? AND ta.answered_at IS NOT NULL AND ta.abandoned_at IS NULL AND ti.active=1
   AND ta.outcome IN ('excellent','partial','incorrect','revealed') AND ta.feedback_json IS NOT NULL`).get(attemptId) as
   {id:string;answered_at:string;outcome:string;item_id:string;mode:string;profile_id:string;game_id:string;source_move_id:string;analysis_run_id:string;exercise_fingerprint:string;snapshot_id:string|null}|undefined;
 if(!row||row.exercise_fingerprint!==fingerprint(db,row.item_id,row.mode))return null;
 return row;
}

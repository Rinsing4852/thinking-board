import type {SqliteDatabase} from '../db/database.js';
import type {TrainingSessionResponse} from '../../../../packages/contracts/src/api.js';
import {OpeningActivityService} from '../openings/opening-activity-service.js';
import {id,now} from '../lib/ids.js';

/** A deliberately chosen round has a stopping point; linking it never awards recall. */
export function linkFocusRound(db:SqliteDatabase,profile:string,session:TrainingSessionResponse):void {
 if(!session.id)return;
 db.transaction(()=>{
  if(db.prepare('SELECT 1 FROM daily_practice_plans WHERE profile_id=? AND thinking_session_id=?').get(profile,session.id))return;
  const active=db.prepare("SELECT id,thinking_session_id FROM daily_practice_plans WHERE profile_id=? AND status='active' ORDER BY created_at DESC,rowid DESC LIMIT 1").get(profile) as {id:string;thinking_session_id:string|null}|undefined;
  if(active&&!active.thinking_session_id){
   db.prepare('UPDATE daily_practice_plans SET thinking_session_id=?,thinking_count=? WHERE id=?').run(session.id,session.items.length,active.id);
  }else if(!active){
   const day=new OpeningActivityService(db).get().date;
   // Further deliberately chosen practice must not reopen or duplicate today's completed plan.
   if(db.prepare('SELECT 1 FROM daily_practice_plans WHERE profile_id=? AND local_day=?').get(profile,day))return;
   db.prepare(`INSERT INTO daily_practice_plans(id,profile_id,local_day,game_days,opening_count,thinking_count,thinking_session_id,created_at)
    VALUES (?,?,?,?,0,?,?,?)`).run(id(),profile,day,session.gameDays??null,session.items.length,session.id,now());
  }
 })();
}

import type { DailyPracticePlan } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { OpeningTrainingService } from "../openings/opening-training-service.js";
import { OpeningGameService } from "../openings/opening-game-service.js";
import { OpeningActivityService } from "../openings/opening-activity-service.js";
import type { OpeningReviewService } from "../openings/opening-review-service.js";
import { activeProfileId } from "./profile.js";
import { parseGameDays } from "./practice-scope.js";
import type { V1TrainingService } from "./v1-training-service.js";

type Plan = {id:string;profile_id:string;local_day:string;game_days:number|null;opening_count:number;thinking_count:number;
  opening_lesson_id:string|null;opening_session_id:string|null;thinking_session_id:string|null;status:'active'|'completed'};

/** Links two existing review queues; it neither analyses games nor records recall. */
export class DailyPracticeService {
  constructor(private readonly db:SqliteDatabase, private readonly openings:OpeningReviewService,
    private readonly thinking:V1TrainingService) {}

  get(gameDays:number|null=null):DailyPracticePlan {
    gameDays=parseGameDays(gameDays);
    const activity=new OpeningActivityService(this.db).get(),profile=activeProfileId(this.db)!;
    const plan=this.db.prepare(`SELECT * FROM daily_practice_plans WHERE profile_id=? AND
      (status='active' OR local_day=?) ORDER BY status='active' DESC,created_at DESC LIMIT 1`).get(profile,activity.date) as Plan|undefined;
    if(plan){
      const result=this.describe(plan);
      if(result.status==='active'&&plan.local_day!==activity.date)result.message=`Continue your saved plan from ${plan.local_day}. ${result.message}`;
      return result;
    }
    // Use the same local game matching as the opening recommendations page.
    new OpeningGameService(this.db).inbox(profile);
    const activeOpening=this.openings.active(),activeThinking=this.thinking.activeSession();
    const activeLesson=activeOpening?null:this.lesson();
    const recommendation=this.openings.recommendation(Math.min(5,activity.remaining));
    const openingCount=activeLesson?Math.max(1,activeLesson.totalDecisions-activeLesson.decisionNumber+1):activeOpening ? Number(this.db.prepare(`SELECT COUNT(*) FROM opening_review_queue
      WHERE session_id=? AND presentation_kind='scheduled'`).pluck().get(activeOpening.sessionId)) : recommendation.counts.total;
    const resolvedGameDays=activeThinking?activeThinking.gameDays??null:gameDays;
    const dashboard=this.thinking.dashboard(resolvedGameDays);
    const thinkingCount=activeThinking?.remainingCount ?? Math.min(5,dashboard.practice?.available??0);
    const next=activeThinking?'thinking':openingCount?'opening':thinkingCount?'thinking':dashboard.totals.games?'games':'build';
    return {id:null,openingKind:activeLesson?"lesson":"recall",profileId:profile,date:activity.date,gameDays:resolvedGameDays,status:openingCount||thinkingCount?'ready':'empty',next,
      openingCount,thinkingCount,openingDone:openingCount===0,thinkingDone:thinkingCount===0,
      message:activeOpening||activeThinking||activeLesson?'Finish your saved session first; your place is kept.'
        :openingCount&&thinkingCount?'Recall your opening moves, then revisit decisions from your games.'
        :openingCount?'Strengthen your saved opening responses with a short recall session.'
        :thinkingCount?'Practise decisions from games you chose to analyse.'
        :dashboard.totals.awaitingAnalysis?'Choose saved games to analyse before building game practice.'
        :'Nothing is due in this plan. You can review a game or work on your repertoire.'};
  }

  start(profileId:string,gameDays:number|null=null):DailyPracticePlan {
    if(profileId!==activeProfileId(this.db))throw new Error('Your player changed. Reload today’s plan.');
    return this.db.transaction(()=>{
      let state=this.get(gameDays);
      if(state.status==='completed'||state.status==='empty')return state;
      if(!state.id){
        const opening=this.openings.active(),thinking=this.thinking.activeSession(),lesson=opening?null:this.lesson(),planId=id();
        this.db.prepare(`INSERT INTO daily_practice_plans(id,profile_id,local_day,game_days,opening_count,thinking_count,
          opening_session_id,thinking_session_id,opening_lesson_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
          .run(planId,profileId,state.date,state.gameDays,state.openingCount,state.thinkingCount,opening?.sessionId??null,thinking?.id??null,lesson?.attemptId??null,now());
        state=this.get(gameDays);
      }
      const plan=this.db.prepare('SELECT * FROM daily_practice_plans WHERE id=? AND profile_id=?').get(state.id,profileId) as Plan;
      if(state.next==='opening'){
        const lesson=this.lesson();
        if(lesson){
          this.db.prepare('UPDATE daily_practice_plans SET opening_lesson_id=?,opening_session_id=NULL,opening_count=? WHERE id=?')
            .run(lesson.attemptId,Math.max(1,lesson.totalDecisions-lesson.decisionNumber+1),plan.id);
          return this.get(gameDays);
        }
        const active=this.openings.active();
        if(!active){
          const remaining=new OpeningActivityService(this.db).get().remaining;
          const recommendation=this.openings.recommendation(Math.min(plan.opening_count,remaining));
          if(!recommendation.available){
            this.db.prepare('UPDATE daily_practice_plans SET opening_count=0 WHERE id=?').run(plan.id);
            return this.start(profileId,plan.game_days);
          }
        }
        const review=active??this.openings.startRecommended(Math.max(1,Math.min(plan.opening_count,new OpeningActivityService(this.db).get().remaining)));
        const count=Number(this.db.prepare('SELECT initial_item_count FROM opening_review_sessions WHERE id=?').pluck().get(review.sessionId));
        this.db.prepare('UPDATE daily_practice_plans SET opening_lesson_id=NULL,opening_session_id=?,opening_count=? WHERE id=?').run(review.sessionId,count,plan.id);
      } else if(state.next==='thinking'){
        const session=this.thinking.createSession(Math.max(1,plan.thinking_count),plan.game_days);
        if(!session.id){this.db.prepare('UPDATE daily_practice_plans SET thinking_count=0 WHERE id=?').run(plan.id);}
        else this.db.prepare('UPDATE daily_practice_plans SET thinking_session_id=?,thinking_count=? WHERE id=?')
          .run(session.id,session.items.length,plan.id);
      }
      return this.get(gameDays);
    })();
  }

  private lesson(){
    const active=new OpeningTrainingService(this.db).active();
    return active?.kind==='feedback'?active.step:active;
  }

  private describe(plan:Plan):DailyPracticePlan {
    const lessonStatus=plan.opening_lesson_id?this.db.prepare('SELECT status FROM opening_lesson_attempts WHERE id=? AND profile_id=?').pluck().get(plan.opening_lesson_id,plan.profile_id):null;
    const openingStatus=plan.opening_session_id?this.db.prepare('SELECT status FROM opening_review_sessions WHERE id=? AND profile_id=?')
      .pluck().get(plan.opening_session_id,plan.profile_id):null;
    const session=plan.thinking_session_id?this.thinking.session(plan.thinking_session_id):undefined;
    const openingDone=plan.status==='completed'||plan.opening_count===0||openingStatus==='completed'||lessonStatus==='completed';
    const thinkingDone=plan.status==='completed'||plan.thinking_count===0||session?.status==='completed';
    const complete=openingDone&&thinkingDone;
    if(complete&&plan.status!=='completed')this.db.prepare("UPDATE daily_practice_plans SET status='completed' WHERE id=?").run(plan.id);
    const next=complete?null:session?.status==='active'?'thinking':!openingDone?'opening':'thinking';
    return {id:plan.id,openingKind:plan.opening_lesson_id?"lesson":"recall",profileId:plan.profile_id,date:plan.local_day,gameDays:plan.game_days,status:complete?'completed':'active',next,
      openingCount:plan.opening_count,thinkingCount:plan.thinking_count,openingDone,thinkingDone,
      ...(session?.status==='active'?{thinkingSession:session}:{}),
      message:complete?'Your short plan is complete. More positions may remain due in your library; progress and scores stay with each practice type.'
        :next==='opening'?plan.opening_lesson_id?'Finish your saved guided opening lesson, then return here for game practice.':'Recall the opening responses in your saved session, then return here for the next step.'
        :openingDone&&plan.opening_count>0?'Opening practice finished. Continue with decisions from your games.'
        :'Continue your saved game-practice session.'};
  }
}

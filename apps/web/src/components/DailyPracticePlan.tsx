import { useEffect, useRef, useState } from "react";
import type { DailyPracticePlan as Plan, TrainingSessionResponse } from "../../../../packages/contracts/src/api";
import {get,post} from "../api";

export function DailyPracticePlan({refreshToken,gameDays,onOpening,onThinking,onGames,onBuild,onStateChange}:{
  refreshToken:number;gameDays:number|null;onOpening:()=>void;onThinking:(session:TrainingSessionResponse)=>void;
  onGames:()=>void;onBuild:()=>void;onStateChange:(active:boolean)=>void;
}){
  const [plan,setPlan]=useState<Plan|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef<AbortController|null>(null),version=useRef(0);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController(),generation=++version.current;request.current=controller;
    setPlan(null);setError('');setBusy(false);
    const load=()=>void get<Plan>(`/api/v1/practice/daily${gameDays===null?'':`?gameDays=${gameDays}`}`,controller.signal)
      .then(result=>{if(generation===version.current&&!controller.signal.aborted){setPlan(result);onStateChange(result.status==='active');}})
      .catch(problem=>{if(!controller.signal.aborted)setError(problem.message);});
    load();window.addEventListener('training-completed',load);
    return()=>{controller.abort();version.current++;window.removeEventListener('training-completed',load);};
  },[refreshToken,gameDays,retry]);
  const start=async()=>{
    if(!plan||busy)return;
    if(plan.status==='empty'){if(plan.next==='games')onGames();else onBuild();return;}
    const generation=version.current;setBusy(true);setError('');
    try{
      const result=await post<Plan>('/api/v1/practice/daily/start',{profileId:plan.profileId,gameDays:plan.gameDays},request.current?.signal);
      if(generation!==version.current)return;
      setPlan(result);onStateChange(result.status==='active');
      if(result.next==='opening')onOpening();
      else if(result.next==='thinking'&&result.thinkingSession)onThinking(result.thinkingSession);
    }catch(problem){if(generation===version.current)setError(problem instanceof Error?problem.message:'Could not start your plan');}
    finally{if(generation===version.current)setBusy(false);}
  };
  return <section aria-label="Your daily practice plan">
    <h1>Your daily practice</h1>
    {!plan&&!error&&<p role="status">Preparing your short practice plan…</p>}
    {plan&&<>
      <p>{plan.message}</p>
      {(plan.openingCount>0||plan.thinkingCount>0)&&<ol className="daily-practice-steps">
        {plan.openingCount>0&&<li>{plan.openingKind==='lesson'?'Guided opening lesson':'Opening recall'} · {plan.openingCount} {plan.openingCount===1?'position':'positions'}{plan.openingDone?' · finished':''}</li>}
        {plan.thinkingCount>0&&<li>Game decisions · {plan.thinkingCount} {plan.thinkingCount===1?'exercise':'exercises'}{plan.thinkingDone?' · finished':''}</li>}
      </ol>}
      {plan.status!=='completed'&&<button disabled={busy} onClick={()=>void start()}>{busy?'Starting…':plan.status==='ready'?'Start daily practice':plan.status==='empty'?plan.next==='games'?'Choose games to review':'Open my repertoires':plan.next==='opening'?'Resume opening practice':'Continue game practice'}</button>}
      {plan.gameDays!==null&&plan.thinkingCount>0&&<small>Game practice uses games played in the last {plan.gameDays} days. A saved plan keeps its original filter.</small>}
      <small>One short routine. Opening recall and game-practice results keep their own records.</small>
    </>}
    {error&&<p role="alert">{error} <button className="secondary" onClick={()=>setRetry(value=>value+1)}>Retry plan</button></p>}
  </section>;
}

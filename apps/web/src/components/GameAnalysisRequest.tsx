import { useState } from "react";
import { post } from "../api";

export async function requestGameAnalysis(selection:{gameIds:string[];reanalyse:boolean}) {
  const result=await post<{id:string|null;queued:number;alreadyQueued:number;alreadyAnalyzed:number}>("/api/v1/games/analysis",selection);
  window.dispatchEvent(new Event("analysis-requested"));return result;
}
export function GameAnalysisRequest({gameId,hasReport}:{gameId:string;hasReport:boolean}) {
  const [busy,setBusy]=useState(false),[message,setMessage]=useState("");
  return <div className="game-analysis-request">
    <button disabled={busy} className={hasReport?"secondary":""} onClick={()=>{
      if(busy)return;setBusy(true);setMessage("");
      void requestGameAnalysis({gameIds:[gameId],reanalyse:hasReport}).then(r=>setMessage(r.queued?"Analysis requested. You can keep browsing while it runs.":r.alreadyQueued?"This game is already waiting for analysis.":"A saved report is already available.")).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));
    }}>{busy?"Requesting…":hasReport?"Analyse this game again":"Analyse this game"}</button>
    {message&&<p role="status">{message}</p>}
  </div>;
}

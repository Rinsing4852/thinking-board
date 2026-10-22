import { useEffect, useState } from "react";
import type { OpeningMasterPosition, OpeningExplorerPositionResponse } from "../../../../packages/contracts/src/api";
import { get } from "../api";

export function OpeningMasterEvidence({fen,practical}:{fen:string;practical:OpeningExplorerPositionResponse|null}) {
  const [open,setOpen]=useState(false),[data,setData]=useState<OpeningMasterPosition|null>(null),[error,setError]=useState("");
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    setData(null);setError("");if(!open)return;
    const controller=new AbortController();
    void get<OpeningMasterPosition>(`/api/v1/openings/masters?fen=${encodeURIComponent(fen)}`,controller.signal)
      .then(result=>{if(!controller.signal.aborted)setData(result);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return ()=>controller.abort();
  },[fen,open,retry]);
  const current=data?.fen===fen?data:null;
  return <details className="opening-master-evidence" open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
    <summary>Compare master-game evidence</summary>
    <p>Master games and games at your level are different samples. The table shows up to ten common master moves. Popularity is not proof of the best move.</p>
    {open&&!current&&!error&&<p role="status">Loading master games…</p>}
    {error&&<p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry master data</button></p>}
    {current&&<>
      <p><strong>Masters: {current.totalGames} games</strong> · retrieved {new Date(current.fetchedAt).toLocaleDateString()}</p>
      <p>{practical?.fen===fen?`Lichess ${practical.ratingGroup} band: ${practical.totalGames} games · ${practical.speeds.join(" / ")}${practical.fetchedAt?" · retrieved "+new Date(practical.fetchedAt).toLocaleDateString():" · retrieval date unknown"}${practical.stale?" · older sample":""}`:"Rating-band sample unavailable; its frequency is unknown."}</p>
      {current.totalGames===0?<p>No master sample at this position. Popularity and results are unknown.</p>:<div className="opening-table-scroll"><table><thead><tr><th>Move</th><th>Masters</th><th>At your level</th></tr></thead><tbody>
        {[...current.replies].sort((a,b)=>b.games-a.games).slice(0,10).map(move=>{const other=practical?.fen===fen?practical.replies.find(m=>m.moveUci===move.moveUci):null;return <tr key={move.moveUci}><td>{move.moveSan}</td><td>{move.frequencyPercent===null?"Unknown":`${move.frequencyPercent.toFixed(1)}%`}<small>{move.games} games</small></td><td>{other&&practical!.totalGames>0?`${other.frequencyPercent}% (${other.games} games)`:"Unknown"}</td></tr>;})}
      </tbody></table></div>}
      {current.totalGames>0&&<details><summary>Master game results</summary><ul>{[...current.replies].sort((a,b)=>b.games-a.games).slice(0,10).map(move=><li key={move.moveUci}><strong>{move.moveSan}:</strong> White wins {move.whiteWins}, draws {move.draws}, Black wins {move.blackWins}.</li>)}</ul></details>}
    </>}
  </details>;
}

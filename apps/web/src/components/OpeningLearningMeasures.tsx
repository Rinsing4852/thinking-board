import { useEffect,useState } from "react";
import { get } from "../api";
type Metrics={delayedRecall:Array<{minimumDays:number;maximumDays:number|null;encounters:number;independent:number;percent:number|null}>;games:{gamesMatched:number;playerDepartures:number;departuresPer100Games:number|null};explanation:string};
export function OpeningLearningMeasures({refreshToken=0}:{refreshToken?:number}) {
  const [open,setOpen]=useState(false),[data,setData]=useState<Metrics|null>(null),[error,setError]=useState("");
  useEffect(()=>{if(!open)return;const controller=new AbortController();setData(null);setError("");
    void get<Metrics>("/api/v1/openings/quality/metrics",controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});return ()=>controller.abort();},[open,refreshToken]);
  return <details className="panel opening-learning-measures" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary>What am I remembering over time?</summary>
    <p>Daily activity counts completed practice. This view checks later recall without hints or immediate corrections.</p>
    {error&&<p role="alert">{error} Close and reopen this section to retry.</p>}
    {open&&!data&&!error&&<p role="status">Loading your learning results…</p>}
    {data&&<><ul>{data.delayedRecall.map(row=><li key={row.minimumDays}><strong>{row.maximumDays?`${row.minimumDays}–${row.maximumDays-1} days`:`${row.minimumDays}+ days`} since the previous recorded encounter:</strong> {row.percent===null?"Not enough delayed practice yet":`${row.independent}/${row.encounters} recalled without help (${row.percent}%)`}</li>)}</ul>
      <p>Played-game comparison: {data.games.gamesMatched} matched games; {data.games.playerDepartures} left your preparation. {data.games.departuresPer100Games===null?"The rate is unknown until games are matched.":`${data.games.departuresPer100Games} departures per 100 matched games.`}</p><p>{data.explanation}</p>
      <p>Study-game guesses are tracked separately. Matching a historical move does not prove it is the strongest move, and assisted completion does not prove long-term retention.</p></>}
  </details>;
}

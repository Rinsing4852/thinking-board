import { useEffect,useState } from "react";
import type { GameQualityTrends } from "../../../../packages/contracts/src/api";
import { get } from "../api";
const value=(n:number|null,suffix="")=>n===null?"Not enough data":`${n.toFixed(1)}${suffix}`;
export function GameQualityProgress({refreshToken,onOpenGames}:{refreshToken:number;onOpenGames:()=>void}) {
  const [data,setData]=useState<GameQualityTrends|null>(null),[cohort,setCohort]=useState(""),[control,setControl]=useState(""),[error,setError]=useState(""),[retry,setRetry]=useState(0),[loading,setLoading]=useState(false);
  useEffect(()=>{const controller=new AbortController();setLoading(true);setError("");
    const params=new URLSearchParams();if(cohort)params.set("cohort",cohort);if(control)params.set("timeControl",control);
    void get<GameQualityTrends>(`/api/v1/game-quality/progress?${params}`,controller.signal).then(r=>{if(!controller.signal.aborted)setData(r);}).catch(e=>{if(!controller.signal.aborted){setData(null);setError(e.message);}}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[refreshToken,cohort,control,retry]);
  const recent=data?.recent,previous=data?.previous;
  return <section className="panel game-quality-progress" aria-label="Move quality over time" aria-busy={loading}>
    <h2>Are your game decisions improving?</h2>
    <p>These results come from games you chose to analyse. Practice answers are tracked separately.</p>
    {loading&&<p role="status">Loading saved game results…</p>}
    {error&&<p role="alert">{error} <button className="secondary" onClick={()=>{setCohort("");setControl("");setRetry(r=>r+1);}}>Retry game progress</button></p>}
    {!loading&&data&&<>
      <p>{data.analyzedGames} of {data.totalGames} saved games have a move-quality report.</p>
        <div className="workflow-actions">
          {data.timeControls.length>0&&<label>Time control<select value={data.timeControl??""} onChange={e=>setControl(e.target.value)}>{data.timeControls.map(t=><option key={t} value={t}>{t==="unknown"?"Time control unknown":t}</option>)}</select></label>}
          {data.cohorts.length>1&&<label>Analysis settings<select value={data.cohort??""} onChange={e=>{setCohort(e.target.value);setControl("");}}>{data.cohorts.map((c,index)=><option key={c.id} value={c.id}>{c.engine} · depth {c.depth} · {c.ruleVersion==="chances-v1"?"original method":"verified method"} · group {index+1}</option>)}</select></label>}
        </div>
      {recent?.games?<>
        {data.timeControl==="unknown"&&<p>Time controls are missing for this group. Different playing speeds may affect these comparisons.</p>}
        <p>Your latest {recent.games} eligible games by date played{previous?.games?`, compared with the previous ${previous.games}`:". Analyse more completed, dated games for an earlier comparison"}. {data.timeControl==="unknown"?"Same engine settings and grading method; playing speeds are unknown.":"Same time control, engine settings and grading method."}</p>
        {recent.games<10&&<p>Small sample: treat these figures as a starting point, not a trend.</p>}
        <div className="quality-table-wrap"><table className="quality-trends-table"><thead><tr><th>Measure</th><th>Recent</th><th>Earlier</th></tr></thead><tbody>
          <tr><th>Average game accuracy</th><td>{value(recent.accuracy,"%")}</td><td>{value(previous?.accuracy??null,"%")}</td></tr>
          <tr><th>Best or good moves</th><td>{value(recent.goodMovePercent,"%")}</td><td>{value(previous?.goodMovePercent??null,"%")}</td></tr>
          <tr><th>Blunders per game</th><td>{value(recent.blundersPerGame)}</td><td>{value(previous?.blundersPerGame??null)}</td></tr>
          <tr><th>Mistakes per game</th><td>{value(recent.mistakesPerGame)}</td><td>{value(previous?.mistakesPerGame??null)}</td></tr>
          <tr><th>Mistakes + blunders per 100 moves</th><td>{value(recent.errorsPer100Moves)}</td><td>{value(previous?.errorsPer100Moves??null)}</td></tr>
          <tr><th>Games without a blunder</th><td>{recent.blunderFreeGames}/{recent.games}</td><td>{previous?.games?`${previous.blunderFreeGames}/${previous.games}`:"Not enough data"}</td></tr>
        </tbody></table></div>
        <details><summary>How far do you get before a blunder?</summary>
          {recent.checkpoints.map(point=><p key={point.move}><strong>Through move {point.move}:</strong> {point.observed?`${point.withoutBlunder}/${point.observed} observed recent games without a blunder`:"Not observed yet"}. {point.endedEarlier} games ended earlier without a blunder and are not counted here.
            {previous?.games?(previous.checkpoints.find(p=>p.move===point.move)?.observed?` Earlier: ${previous.checkpoints.find(p=>p.move===point.move)?.withoutBlunder}/${previous.checkpoints.find(p=>p.move===point.move)?.observed} observed games.`:" Earlier: not observed yet."):""}</p>)}
          <p>Among games with an error, the median first mistake or blunder was {recent.firstMistakeMedian===null?"not recorded":`move ${recent.firstMistakeMedian}`}; the first blunder was {recent.firstBlunderMedian===null?"not recorded":`move ${recent.firstBlunderMedian}`}. Blunder-free games have no artificial first-blunder number.</p>
        </details>
      </>:<p>No comparable completed games yet. Analyse dated games from the normal starting position to begin tracking progress.</p>}
      {data.excludedGames>0&&<p>{data.excludedGames} reports in the selected analysis group are excluded from trends because dates, complete results, your played moves or the normal starting position are missing.</p>}
    </>}
    <p>Only completed analyses appear here.</p><div className="workflow-actions"><button className="secondary" disabled={loading} onClick={()=>setRetry(r=>r+1)}>Refresh saved results</button>
    <button className="secondary" onClick={onOpenGames}>Choose games to analyse</button></div>
  </section>;
}

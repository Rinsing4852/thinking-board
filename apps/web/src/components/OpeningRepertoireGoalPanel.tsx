import {useEffect,useRef,useState} from "react";
import type {OpeningCoverageGap,OpeningRepertoireGoal} from "../../../../packages/contracts/src/api";
import {get} from "../api";

interface Props {
  repertoireId:string; graphKey:string; rating:number; speeds:string; useExplorer:boolean; disabled:boolean;
  onInspect:(gap:OpeningCoverageGap)=>void;
}
export function OpeningRepertoireGoalPanel({repertoireId,graphKey,rating,speeds,useExplorer,disabled,onInspect}:Props) {
  const [data,setData]=useState<OpeningRepertoireGoal|null>(null);
  const [showAll,setShowAll]=useState(false);
  const [limit,setLimit]=useState("30"), [busy,setBusy]=useState(false), [error,setError]=useState("");
  const request=useRef<AbortController|null>(null);
  const valid=limit.trim()!==""&&Number.isInteger(Number(limit))&&Number(limit)>=1&&Number(limit)<=60;
  useEffect(()=>{
    request.current?.abort();setData(null);setBusy(false);setError("");setShowAll(false);
    return ()=>request.current?.abort();
  },[repertoireId,graphKey,rating,speeds,useExplorer,limit]);
  const load=async(offset=0,refresh=false)=>{
    if(busy||disabled||!valid) return;
    const controller=new AbortController();request.current?.abort();request.current=controller;
    setBusy(true);setError("");setData(null);
    try {
      const result=await get<OpeningRepertoireGoal>(`/api/v1/openings/repertoires/${encodeURIComponent(repertoireId)}/coverage/repertoire?rating=${rating}&maxPlies=${Number(limit)*2}&offset=${offset}&refresh=${refresh}&local=${!useExplorer}`,controller.signal);
      if(!controller.signal.aborted) setData(result);
    } catch(problem) {
      if(!controller.signal.aborted) setError(problem instanceof Error?problem.message:"Could not check the repertoire. Your saved moves are unchanged.");
    } finally {if(!controller.signal.aborted) setBusy(false);}
  };
  const unknown=data?.plans.filter(plan=>plan.outcomes.unknown>1e-9).length??0;
  const limited=data?.plans.filter(plan=>plan.outcomes.depth+plan.outcomes.cycle+plan.outcomes.work>1e-9).length??0;
  const stopped=data?.plans.filter(plan=>plan.outcomes.stopped>1e-9).length??0;
  const omitted=data?.plans.filter(plan=>plan.outcomes.omitted>1e-9).length??0;
  return <section className="opening-coverage-panel" aria-label="Whole repertoire coverage">
    <h3>Does my whole repertoire meet my goal?</h3>
    <p>Check every saved plan, including alternative first moves. This checks saved answers, not how well you remember them.</p>
    <button disabled={busy||disabled||!valid} onClick={()=>void load()}>{busy?"Checking repertoire…":data?"Recheck whole repertoire":"Check whole repertoire"}</button>
    {!useExplorer&&<p className="opening-coverage-note">Common-move data is off. This check uses saved Lichess samples only. The one-line check also shows gaps observed in your games.</p>}
    {error&&<p role="alert" className="error">{error} Retry the check when ready; your saved moves are unchanged.</p>}
    {data&&<>
      {data.scan.failed>0&&<p role="status">Some common-move samples could not be refreshed. Try again later; older or missing data stays uncertain.</p>}
      <section className="opening-personal-coverage" aria-label="Repertoire preparation result">
        <h4>{data.met?"Goal reached for all saved plans":"Preparation goal not confirmed yet"}</h4>
        <p>Prepare positions expected at least once in {data.games} games under each plan.</p>
        <p>{data.plans.length} of {data.plansAvailable} distinct saved plans checked · Lichess {data.ratingGroup} band · {data.speeds.join(" / ")}.</p>
        {data.gaps.length>0&&<p><strong>{data.gaps.length}</strong> relevant {data.gaps.length===1?"position still needs":"positions still need"} an answer.</p>}
        {unknown>0&&<p>{unknown} {unknown===1?"plan needs":"plans need"} more reliable frequency data.</p>}
        {limited>0&&<p>{limited} {limited===1?"plan has":"plans have"} unchecked continuations. A checking limit or repeated position is not completion.</p>}
        {data.plansOmitted>0&&<p>{data.plansOmitted} additional plans exceed this check's work budget and remain unchecked.</p>}
        {data.conditionalStarts>0&&<p>{data.conditionalStarts} {data.conditionalStarts===1?"plan starts":"plans start"} from a custom position. Its chance of being reached from the initial board is unknown.</p>}
        {stopped>0&&<p>{stopped} {stopped===1?"plan uses":"plans use"} a preparation stopping point you chose. The result includes those stopping points.</p>}
        {omitted>0&&<p>{omitted} {omitted===1?"plan includes":"plans include"} a reply you deliberately left unprepared. That choice is not counted as a saved answer.</p>}
        {!data.plansAvailable&&<p>Add a saved line before checking a preparation goal.</p>}
      </section>
      {data.gaps.length>0&&<><h4>Answers still missing</h4><div className="opening-coverage-tasks">
        {data.gaps.slice(0,showAll?data.gaps.length:3).map(gap=><article key={`${gap.positionId}:${gap.moveUci}`}>
          <strong>{gap.status==="idea_only"?"Finish your answer to":"Prepare a response to"} {gap.moveSan}</strong>
          <p>{gap.chapterTitle} · {gap.lineTitle}</p>
          <small>Estimated reach: {Number((gap.reachPercent??0).toFixed(2))}% in at least one saved plan · {gap.games.toLocaleString()} sampled replies at this position.</small>
          <div className="answer-actions"><button className="secondary" disabled={busy||disabled} onClick={()=>onInspect(gap)}>Inspect position</button></div>
        </article>)}
      </div>{data.gaps.length>3&&<button className="text-button" onClick={()=>setShowAll(value=>!value)}>{showAll?"Show just three answers":`Show all ${data.gaps.length} missing answers`}</button>}</>}
      {useExplorer&&data.scan.remaining>0&&<button disabled={busy||disabled||!valid} onClick={()=>void load(data.scan.nextOffset??0,data.scan.mode==="refresh")}>Continue repertoire scan · {data.scan.remaining} positions left</button>}
      <details><summary>Saved plans and checking details</summary>
        <p>{data.policy}</p>
        <p>Replies use conditional Lichess samples. Uncertain samples are not treated as rare. A higher encounter goal includes rarer positions. Change that goal and the game population in Opening settings.</p>
        {data.plans.map(plan=><article className="opening-personal-coverage" key={plan.id}>
          <strong>{plan.title}</strong>
          <p>{plan.met?"Goal reached within the chosen stopping points":plan.conflict?"This line chooses different moves at a repeated position. Review the plan before claiming completion.":plan.conditional?"Custom starting position; whole-game reach unknown":`${plan.relevantMissing} relevant positions need answers; ${plan.outcomes.unknown>1e-9?"frequency data is uncertain":plan.outcomes.depth+plan.outcomes.cycle+plan.outcomes.work>1e-9?"some continuations remain unchecked":plan.outcomes.omitted>1e-9?"deliberate omissions remain":"checking complete for this plan"}.`}</p>
        </article>)}
        {useExplorer&&<button className="secondary" disabled={busy||disabled||!valid} onClick={()=>void load(0,true)}>Refresh repertoire samples</button>}
      </details>
    </>}
    <details className="opening-coverage-settings"><summary>Change the checking limit</summary>
      <label>Safety limit in full moves<input type="number" min={1} max={60} value={limit} aria-invalid={!valid} disabled={disabled} onChange={event=>setLimit(event.target.value)}/></label>
      <p>This is a work limit from each plan's starting position. Reaching it leaves that continuation unchecked.</p>
      {!valid&&<p role="alert">Enter a whole number from 1 to 60.</p>}
    </details>
  </section>;
}

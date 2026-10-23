import { useEffect, useRef, useState } from "react";
import type { OpeningGeneratedDraft,OpeningRepertoireDetailResponse } from "../../../../packages/contracts/src/api";
import { get,post } from "../api";
export function OpeningGapDraft({repertoireId,lineId,afterPly,fen,opponentMoveUci,disabled,onChanged}:{repertoireId:string;lineId:string;afterPly:number;fen:string;opponentMoveUci?:string;disabled:boolean;onChanged:(detail:OpeningRepertoireDetailResponse,lineId:string)=>void}) {
  const [draft,setDraft]=useState<OpeningGeneratedDraft|null>(null),[saved,setSaved]=useState<OpeningGeneratedDraft[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const request=useRef<AbortController|null>(null);
  const key=`${repertoireId}|${lineId}|${afterPly}|${fen}|${opponentMoveUci??""}`;
  useEffect(()=>{request.current?.abort();setDraft(null);setSaved([]);setError("");setBusy(false);
    const controller=new AbortController();request.current=controller;
    void get<{drafts:OpeningGeneratedDraft[]}>(`/api/v1/openings/repertoires/${repertoireId}/drafts`,controller.signal).then(r=>{if(!controller.signal.aborted)setSaved(r.drafts);}).catch(()=>{});
    return ()=>controller.abort();
  },[key]);
  const run=async(action:"preview"|"apply"|"undo",id?:string)=>{
    if(busy||disabled)return;setBusy(true);setError("");const controller=new AbortController();request.current?.abort();request.current=controller;
    try {
      const result=await post<OpeningGeneratedDraft>(action==="preview"?"/api/v1/openings/gap-drafts":`/api/v1/openings/gap-drafts/${id}/${action}`,action==="preview"?{repertoireId,lineId,afterPly,expectedFen:fen,...(opponentMoveUci?{opponentMoveUci}:{})}:{},controller.signal);
      if(controller.signal.aborted)return;setDraft(result);
      if(result.detail&&result.lineId)onChanged(result.detail,result.lineId);
      setSaved(current=>action==="apply"?[result,...current.filter(d=>d.id!==result.id)]:action==="undo"?current.filter(d=>d.id!==id):current);
    } catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:"Could not prepare this gap.");}
    finally {if(!controller.signal.aborted)setBusy(false);}
  };
  return <section className="opening-gap-draft" aria-label="Prepare one gap">
    <details><summary>Prepare one missing response</summary>
    <p>Preview an engine suggestion for this position. Existing responses and notes are kept. Nothing is saved until you apply it.</p>
    <button className="secondary" disabled={disabled||busy} onClick={()=>void run("preview")}>{busy?"Working…":"Preview suggested response"}</button>
    {draft&&<div role="status"><p>{draft.message}</p><p>{draft.moves.map(m=>m.san).join(" → ")} · {draft.source}</p>
      {draft.state==="preview"&&<div className="answer-actions"><button disabled={busy||disabled} onClick={()=>void run("apply",draft.id)}>Add this response</button><button className="secondary" disabled={busy} onClick={()=>setDraft(null)}>Discard preview</button></div>}
    </div>}
    {error&&<p role="alert">{error}</p>}
    </details>
    {saved.length>0&&<details><summary>Generated responses · undo</summary><p>Undo protects later edits. If preparation has changed, review the line manually.</p>{saved.map(item=><div key={item.id}><span>{item.moves.map(m=>m.san).join(" → ")}</span> <button className="secondary" disabled={busy||disabled} onClick={()=>void run("undo",item.id)}>Undo generated response</button></div>)}</details>}
  </section>;
}

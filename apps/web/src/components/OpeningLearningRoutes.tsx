import { useState } from "react";

export function OpeningLearningRoutes({repertoires,busy,onPractice,onStudyGame,onReviewPlayedGame,resuming=false}:{
  repertoires:Array<{id:string;name:string}>;busy:boolean;resuming?:boolean;
  onPractice:()=>void;
  onStudyGame:(id:string)=>void;onReviewPlayedGame:(()=>void)|undefined;
}) {
  const [studyRepertoire,setStudyRepertoire]=useState("");
  const selectedStudy=repertoires.some(item=>item.id===studyRepertoire)?studyRepertoire:repertoires[0]?.id??"";
  return <section className="panel opening-learning-routes" aria-label="Choose how to learn">
    <h1>Your openings</h1>

    <div className="workflow-actions">
      <button disabled={busy||!repertoires.length} onClick={onPractice}>{resuming?"Resume opening practice":"Practise my repertoire"}</button>
      {onReviewPlayedGame&&<button className="secondary" onClick={onReviewPlayedGame}>Review my played game</button>}
    </div>
    <details className="study-route">
      <summary>Study a stronger player’s game</summary>
      <p>Choose a repertoire, or use “Study a game from here” on a line’s board.</p>
      {repertoires.length>0?<><label>Repertoire for model-game study<select value={selectedStudy} onChange={event=>setStudyRepertoire(event.target.value)}>
        {repertoires.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <button className="secondary" disabled={busy||!selectedStudy} onClick={()=>onStudyGame(selectedStudy)}>Find a study game</button></>:<p>Save an opening line first to search for a matching game.</p>}
    </details>
  </section>;
}

import { useState } from "react";
export function OpeningLearningRoutes({repertoires,busy,onPractice,onStudyGame,onReviewPlayedGame}:{
  repertoires:Array<{id:string;name:string}>;busy:boolean;
  onPractice:()=>void;
  onStudyGame:(id:string)=>void;onReviewPlayedGame:(()=>void)|undefined;
}) {
  const [studyRepertoire,setStudyRepertoire]=useState("");
  const selectedStudy=repertoires.some(item=>item.id===studyRepertoire)?studyRepertoire:repertoires[0]?.id??"";
  return (
        <section className="panel opening-learning-routes" aria-label="Choose how to learn">
          <h3>Choose how to learn</h3>
          <p><strong>Practise my repertoire</strong> — recall your saved moves or resume your saved session.</p>
          <button className="secondary" disabled={busy||!repertoires.length} onClick={onPractice}>Practise my repertoire</button>
          {onReviewPlayedGame&&<div><p><strong>Review my played game</strong> — replay your own game, revisit differences and recall the prepared response.</p>
            <button className="secondary" onClick={onReviewPlayedGame}>Review my played game</button></div>}
          {onStudyGame&&<div><p><strong>Study a stronger player’s game</strong> — find a game at your saved position, replay it or guess the player’s moves.</p>
            {repertoires.length>0?<><label>Repertoire for model-game study<select value={selectedStudy} onChange={event=>setStudyRepertoire(event.target.value)}>
              {repertoires.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <button className="secondary" disabled={busy||!selectedStudy} onClick={()=>onStudyGame(selectedStudy)}>Study a stronger player’s game</button></>:<p>Save an opening line first to search for a matching game.</p>}</div>}
        </section>

  );
}

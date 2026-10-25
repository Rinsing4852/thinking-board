import { useEffect,useState } from "react";
import type { GameQualityReport } from "../../../../packages/contracts/src/api";
import { get } from "../api";
import { GameAnalysisRequest } from "./GameAnalysisRequest";
const gradeName={best:"Best",good:"Good",inaccuracy:"Inaccuracy",mistake:"Mistake",blunder:"Blunder"};
export function GameMoveReport({gameId,refreshToken,onInspect}:{gameId:string;refreshToken:number;onInspect:(ply:number)=>void}) {
  const [report,setReport]=useState<GameQualityReport|null|undefined>(),[error,setError]=useState(""),[retry,setRetry]=useState(0);
  useEffect(()=>{const controller=new AbortController();setReport(undefined);setError("");
    void get<GameQualityReport|null>(`/api/v1/games/${gameId}/quality`,controller.signal).then(r=>{if(!controller.signal.aborted)setReport(r);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[gameId,refreshToken,retry]);
  const own=report?.[report.playerColor];
  const ownMoves=report?.moves.filter(m=>m.color===report.playerColor)??[];
  const firstReviewMove=ownMoves.find(m=>m.grade==="mistake"||m.grade==="blunder")??ownMoves[0];
  const departure=report?.opening?.departure;
  const outside=departure?ownMoves.find(m=>m.ply>=departure.ply):null;
  return <section className="panel game-quality-report" aria-label="Game move-quality report">
    <h2>How well did you play?</h2>
    {error?<p role="alert">{error} <button className="secondary" onClick={()=>setRetry(r=>r+1)}>Retry move report</button></p>:report===undefined?<p role="status">Loading saved analysis…</p>:!report?<>
      <p>No move-quality report yet. Your game and opening comparison are saved. Request engine analysis when you are ready.</p>
      <GameAnalysisRequest gameId={gameId} hasReport={false}/>
    </>:own&&<>
      <p>Your moves as {report.playerColor} · {own.moves} moves analysed</p>
      <div className="quality-summary">
        <div><strong>{own.accuracy?.toFixed(1)??"—"}%</strong><span>Engine accuracy</span></div>
        <div><strong>{own.counts.blunder}</strong><span>Blunders</span></div>
        <div><strong>{own.firstMistake===null?"None":`Move ${own.firstMistake}`}</strong><span>First mistake or blunder</span></div>
      </div>
      {own.firstBlunder===null?<p>No blunders in your {own.moves} moves.</p>:<p>Your first blunder was on move {own.firstBlunder}.</p>}
      <button onClick={()=>onInspect(firstReviewMove?firstReviewMove.ply-1:0)}>Review on the board</button>
      <svg className="quality-chart" viewBox="0 0 600 100" role="img" aria-label="Position balance through the game, White’s perspective">
        <line x1="0" y1="50" x2="600" y2="50" stroke="currentColor" opacity=".3"/>
        <polyline fill="none" stroke="currentColor" strokeWidth="2" points={report.moves.map((m,i)=>`${report.moves.length>1?i*600/(report.moves.length-1):0},${100-(m.color==="white"?m.chancesAfter:100-m.chancesAfter)}`).join(" ")}/>
      </svg>
      <small>Position balance · higher favours White, lower favours Black. This is an engine estimate.</small>
      {outside&&<p className="quality-opening-context">{departure?.moverColor===report.playerColor?"Your first move outside preparation":"Your first move after the prepared line ended"}: <strong>{outside.moveNumber}{outside.color==="white"?".":"…"}{outside.san} — {gradeName[outside.grade]}</strong>. Compared with your current repertoire. Leaving preparation is not automatically a chess mistake.</p>}
      <details><summary>Move grades and positions</summary>
        <p>{Object.entries(own.counts).map(([grade,count])=>`${gradeName[grade as keyof typeof gradeName]}: ${count}`).join(" · ")}</p>
        <div className="quality-moves">{ownMoves.map(move=><button className={`secondary quality-move grade-${move.grade}`} key={move.ply} onClick={()=>onInspect(move.ply-1)}>
          <span><strong>{move.moveNumber}{move.color==="white"?".":"…"}{move.san}</strong> · {gradeName[move.grade]}</span>
          <small>{move.chanceLoss.toFixed(1)} percentage-point loss · Engine choice: {move.bestSan}</small><small>Review position →</small>
        </button>)}</div>
      </details>
      <details><summary>Opponent’s move quality</summary><p>{Object.entries(report[report.playerColor==="white"?"black":"white"].counts).map(([grade,count])=>`${gradeName[grade as keyof typeof gradeName]}: ${count}`).join(" · ")}</p></details>
      <details><summary>How this report is calculated</summary>
        <p>Best is the engine’s leading move with less than 0.5 percentage points lost. Inaccuracy: at least 5 points lost; mistake: at least 10; blunder: at least 20. Other moves are Good. Mate outcomes are handled separately from pawn scores.</p>
        <p>Accuracy averages the estimated accuracy of your moves, including forced moves. Our aggregation is not the same as other sites’ accuracy scores. It is not a rating or a guarantee of improvement.</p>
        <p>{report.engine} · depth {report.depth} · method {report.ruleVersion} · analysed {new Date(report.analyzedAt).toLocaleString()}. A limited search can miss a stronger defence. Older saved reports remain available if a new analysis fails.</p>
        <GameAnalysisRequest gameId={gameId} hasReport/>
      </details>
    </>}
  </section>;
}

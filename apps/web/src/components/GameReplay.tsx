import { useEffect,useRef,useState } from "react";
import type { GameReplayAction,GameReplayResponse } from "../../../../packages/contracts/src/api";
import { get,post } from "../api";
import { ChessBoard } from "./ChessBoard";

export function GameReplay({gameId,onRefreshed,requestedPosition}:{gameId:string;onRefreshed?:()=>void;requestedPosition?:{ply:number;requestId:number}|null}) {
  const [data,setData]=useState<GameReplayResponse|null>(null),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[needsReload,setNeedsReload]=useState(false);
  const lock=useRef(false),request=useRef<AbortController|null>(null),board=useRef<HTMLDivElement|null>(null);
  const endpoint=`/api/v1/games/${encodeURIComponent(gameId)}/replay`;
  const run=async(action:(signal:AbortSignal)=>Promise<void>,saving=false)=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError("");
    const controller=new AbortController();request.current=controller;
    try {await action(controller.signal);} catch(problem) {
      if(!controller.signal.aborted){setError(problem instanceof Error?problem.message:"Could not load this saved review.");if(saving)setNeedsReload(true);}
    } finally {lock.current=false;if(!controller.signal.aborted)setBusy(false);}
  };
  const load=()=>void run(async signal=>{const response=await get<GameReplayResponse>(endpoint,signal);if(!signal.aborted){setData(response);setNeedsReload(false);}});
  useEffect(()=>{load();return()=>request.current?.abort();},[endpoint]);
  const act=(action:GameReplayAction["action"],details:Partial<Pick<GameReplayAction,"ply"|"checkpointId"|"moveUci">>={},focus=false)=>{
    if(!data||needsReload)return;
    void run(async signal=>{
      const response=await post<GameReplayResponse>(endpoint,{snapshotId:data.snapshotId,version:data.version,action,...details},signal);
      if(signal.aborted)return;setData(response);
      if(action==="refresh")onRefreshed?.();
      if(focus)requestAnimationFrame(()=>{board.current?.focus({preventScroll:true});board.current?.scrollIntoView({block:"start"});});
    },true);
  };
  const consumedPosition=useRef<number|null>(null);
  useEffect(()=>{
    if(!requestedPosition||!data||busy||needsReload||consumedPosition.current===requestedPosition.requestId)return;
    consumedPosition.current=requestedPosition.requestId;
    act("jump",{ply:requestedPosition.ply},true);
  },[requestedPosition,data,busy,needsReload]);
  const point=data?.checkpoints.find(point=>point.id===data.activeCheckpointId);
  const blocked=busy||needsReload;
  const nextPoint=data?.checkpoints.find((point,index)=>point.ply>data.currentPly||(point.ply===data.currentPly&&index>data.checkpoints.findIndex(p=>p.id===data.activeCheckpointId)));
  return <section className="panel game-replay" aria-label="Saved game replay">
    <div className="game-replay-heading"><div><span className="eyebrow">Replay and recall</span><h3>Review this game on the board</h3>
      <p>Pause at marked decisions, try the move yourself, then continue with the game as played.</p></div>
      {data&&<small>Feedback saved {new Date(data.savedAt).toLocaleDateString()}</small>}
    </div>
    {error&&<div role="alert"><p>{error}</p>{needsReload&&<p>The save could not be confirmed. Reload the saved review before making another move.</p>}<button disabled={busy} onClick={load}>Reload saved review</button></div>}
    {!data&&busy&&<p role="status">Loading saved replay…</p>}
    {data&&<>
      {data.updatesAvailable&&<div className="game-replay-update"><p>Your analysis or repertoire has changed. This replay keeps the feedback you saved.</p>
        <button className="secondary" disabled={blocked} onClick={()=>{if(window.confirm("Save a fresh review using the current analysis and repertoire? Replay restarts; the previous saved feedback and local attempts are retained."))act("refresh");}}>Refresh saved feedback</button></div>}
      {data.analysisPending&&<p className="opening-coverage-note">This saved review contains opening feedback. Engine analysis was not available when it was saved. Request analysis, then refresh saved feedback when it finishes.</p>}
      <div className="game-replay-layout">
        <div ref={board} role="region" aria-label="Game replay board and controls" tabIndex={-1}>
          <ChessBoard fen={data.displayFen} orientation={data.playerColor} lastMove={data.displayMove} ariaLabel="Game replay board"
            interactive={data.phase==="question"&&!blocked} onMove={uci=>act("answer",{moveUci:uci})}/>
          <p role="status">{data.phase==="feedback"?"Showing the recalled or revealed response":"Game as played"} · Position {data.currentPly} of {data.moves.length}</p>
          <div className="answer-actions" role="group" aria-label="Game replay controls">
            <button className="secondary" disabled={blocked||data.currentPly===0} onClick={()=>act("previous")}>Previous move</button>
            <button disabled={blocked||data.currentPly===data.moves.length||data.phase==="question"} onClick={()=>act("next")}>{data.phase==="feedback"?"Continue game as played":"Next move"}</button>
            <button className="secondary" disabled={blocked||!nextPoint} onClick={()=>nextPoint&&act("jump",{ply:nextPoint.ply,checkpointId:nextPoint.id},true)}>Next decision</button>
          </div>
          <label className="game-replay-position">Game position<select disabled={blocked} value={data.currentPly} onChange={event=>act("jump",{ply:Number(event.target.value)})}>
            <option value={0}>Starting position</option>{data.moves.map(move=><option key={move.ply} value={move.ply}>{move.moveNumber}{move.moverColor==="white"?".":"..."}{move.san}</option>)}
          </select></label>
          {data.currentPly===data.moves.length&&<p role="status">End of game. Revisit any marked decision to try it again.</p>}
        </div>
        <div className="game-replay-decision" aria-live="polite">
          {point?<>
            <span className="eyebrow">{point.label}</span><h4>{point.question}</h4>
            {point.kind==="opening"&&<p>A different repertoire move is not automatically a chess mistake.</p>}
            {data.phase==="question"&&<><p>Play your answer on the board. The saved answers stay hidden until you recall one or ask to see them.</p>
              <div className="answer-actions"><button disabled={blocked} onClick={()=>act("reveal")}>Show answer</button>
                <button className="secondary" disabled={blocked} onClick={()=>act("skip")}>Continue without trying</button></div></>}
            {data.feedback&&<div className="game-replay-feedback"><strong>{data.feedback.message}</strong>
              {data.phase==="feedback"&&<><p>Accepted in this saved review: {data.feedback.answers.map(answer=>answer.san).join(", ")}</p><p>{data.feedback.explanation}</p>
                <p>Continue returns to the move actually played in your game.</p>
                <div className="answer-actions"><button className="secondary" disabled={blocked} onClick={()=>act("retry",{},true)}>Try again in this game</button>
                  {point.canSchedule&&<button className="secondary" disabled={blocked} onClick={()=>act("schedule")}>Practise later</button>}</div>
                {point.kind==="engine"&&!point.canSchedule&&<p className="opening-coverage-note">No separate candidate exercise is available for this position. You can retry it here.</p>}
              </>}
            </div>}
          </>:<><h4>Follow the game</h4><p>Use Next move to play through the game. It pauses before a marked decision so you can recall a response.</p></>}
          <details className="game-replay-markers" open><summary>Marked decisions · {data.checkpoints.length}</summary>
            {!data.checkpoints.length&&<p>No opening difference or analysed mistake is marked in this saved review. You can still replay the complete game.</p>}
            {data.checkpoints.map(point=>{
              const move=data.moves[point.ply];
              return <button key={point.id} className={point.id===data.activeCheckpointId?"active":"secondary"} disabled={blocked}
                aria-pressed={point.id===data.activeCheckpointId} onClick={()=>act("jump",{ply:point.ply,checkpointId:point.id},true)}>
                {move?`${move.moveNumber}${move.moverColor==="white"?".":"..."}${move.san}`:"Position"} · {point.label}
                {point.recalled?" · recalled here":point.attempts?` · ${point.attempts} local tries`:""}
              </button>;
            })}
          </details>
          <p className="opening-coverage-note">Replay and retries stay with this game. They do not change scheduled recall, practice totals or preparation coverage. Practise later makes an existing exercise available without adding a recall result.</p>
        </div>
      </div>
    </>}
  </section>;
}

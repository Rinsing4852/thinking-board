import type {GameReviewProgress,GameSource,GameLibraryAnalysis} from "../../../../packages/contracts/src/api";
import {CrossGamePractice,sourceLabels} from './CrossGamePractice';
import { requestGameAnalysis } from "./GameAnalysisRequest";
import { useEffect, useState } from "react";

interface Game {
  reviewProgress?:GameReviewProgress;
  source?:GameSource;
  analysis?:GameLibraryAnalysis|null;
  id: string; white: string; black: string; result: string; playerColor: string; playedAt: string | null; hasSavedReview?:boolean|number; reviewDecisions?:number|null;
}

/** The full filtered library scrolls inside the table's fixed-height region. */
export function GameLibrary({ games, selectedId, onChoose,active=true,refreshToken=0 }: {
  games: Game[]; selectedId: string | null; onChoose: (id: string) => void;active?:boolean;refreshToken?:number;
}) {
  const [selecting,setSelecting]=useState(false),[chosen,setChosen]=useState<string[]>([]),[reanalyse,setReanalyse]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>setChosen(current=>current.filter(id=>games.some(game=>game.id===id))),[games]);
  const [reviewFilter,setReviewFilter]=useState("all");
  const [sourceFilter,setSourceFilter]=useState<GameSource|'all'>('all'),[practising,setPractising]=useState(false);
  const [query, setQuery] = useState("");
  const reviewStatus=(game:Game)=>game.analysis?.reviewUpdatesAvailable?'not_started':game.reviewProgress?.status??'not_started';
  const matches = games.filter(game => `${game.white} ${game.black} ${game.result} ${game.playerColor} ${game.playedAt ?? ""} ${game.playedAt ? new Date(game.playedAt).toLocaleDateString() : ""}`
    .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())&&(reviewFilter==="all"||reviewStatus(game)===reviewFilter)&&(sourceFilter==='all'||(game.source??'pgn')===sourceFilter));
  return <div className="game-library">
    <div className="workflow-actions"><button className="secondary" aria-expanded={selecting} onClick={()=>setSelecting(value=>!value)}>{selecting?"Close game selection":"Select games to analyse"}</button>
    <button className="secondary" aria-expanded={practising} onClick={()=>setPractising(value=>!value)}>{practising?'Close practice':'Practise across games'}</button></div>
    {selecting&&<section className="panel game-batch-analysis" aria-label="Choose games for analysis">
      <p>Select games below. Analysis runs only when you press Analyse selected games.</p>
      <div className="workflow-actions"><button className="secondary" disabled={busy} onClick={()=>setChosen(games.map(g=>g.id))}>Select all {games.length} games</button>
        <button className="text-button" disabled={busy} onClick={()=>setChosen([])}>Clear selection</button></div>
      <label><input type="checkbox" checked={reanalyse} disabled={busy} onChange={e=>setReanalyse(e.target.checked)}/> Include games with an existing report</label>
      <p>{chosen.length} selected across your saved library, including games outside this search.</p>
      <button disabled={busy||!chosen.length} onClick={()=>{
        if(busy)return;setBusy(true);setMessage("");
        void requestGameAnalysis({gameIds:chosen,reanalyse}).then(r=>{setMessage(`${r.queued} games queued · ${r.alreadyQueued} already waiting · ${r.alreadyAnalyzed} saved reports kept.`);setChosen([]);}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));
      }}>{busy?"Requesting…":"Analyse selected games"}</button>
    </section>}
    {message&&<p role="status">{message}</p>}
    {games.length > 1 && <label>Find a game
      <input type="search" value={query} placeholder="Opponent or date…" onChange={event => {
        setQuery(event.target.value);
      }} />
    </label>}
    <div className="game-library-filters"><label>Source<select aria-label="Filter by source" value={sourceFilter} onChange={e=>setSourceFilter(e.target.value as GameSource|'all')}>
      <option value="all">All sources</option>{Object.entries(sourceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select></label><label>Review status<select aria-label="Filter by review status" value={reviewFilter} onChange={event=>setReviewFilter(event.target.value)}>
      <option value="all">All reviews</option><option value="not_started">Not started</option><option value="in_progress">Partially reviewed</option><option value="complete">Complete</option>
    </select></label></div>
    {practising&&active&&<CrossGamePractice key={sourceFilter} refreshToken={refreshToken} source={sourceFilter} onOpenGame={id=>{setPractising(false);onChoose(id);}}/>}
    <div className="game-chips game-table-scroll" role="region" tabIndex={0} aria-label="Imported games">
      <table className="game-table"><caption className="sr-only">Your games. Select an opponent or a row to open game review. Scroll sideways for more columns on small screens.</caption>
       <thead><tr>{selecting&&<th scope="col">Select</th>}<th scope="col">Opponent</th><th scope="col">Colour</th><th scope="col">Result</th><th scope="col">Date</th><th scope="col">Source</th><th scope="col">Review</th></tr></thead>
       <tbody>{matches.map(game=>{
        const opponent=game.playerColor==='white'?game.black:game.white;
        const outcome=game.result==='1/2-1/2'?'Draw':game.result==='*'?'Unfinished':game.result===(game.playerColor==='white'?'1-0':'0-1')?'Win':'Loss';
        return <tr key={game.id} className={`game-chip${selectedId===game.id?' active':''}`} onClick={event=>{if(!(event.target as HTMLElement).closest('button,input,label'))onChoose(game.id);}}>
         {selecting&&<td><label className="game-select"><input type="checkbox" aria-label={`Select game against ${opponent}, ${game.playedAt??'date unknown'}, game ${games.findIndex(item=>item.id===game.id)+1}`} disabled={busy} checked={chosen.includes(game.id)} onChange={e=>setChosen(current=>e.target.checked?[...current,game.id]:current.filter(id=>id!==game.id))}/></label></td>}
         <th scope="row"><button className="game-opponent" aria-pressed={selectedId===game.id} onClick={()=>onChoose(game.id)}>{opponent}</button></th>
         <td><span aria-hidden="true">{game.playerColor==='white'?'○':'●'} </span>{game.playerColor==='white'?'White':'Black'}</td><td>{outcome}</td>
         <td>{game.playedAt?<time dateTime={game.playedAt}>{new Date(game.playedAt).toLocaleDateString()}</time>:'Unknown'}</td>
         <td><span className="game-source">{sourceLabels[game.source??'pgn']}</span></td>
         <td><span>{game.analysis?.reviewUpdatesAvailable?'New analysis to review':reviewStatus(game)==='complete'?'Review complete':reviewStatus(game)==='in_progress'?'Partially reviewed':game.analysis?.complete?'Ready to review':'Not reviewed'}</span>
          {game.analysis&&<><small>{game.analysis.complete?'Analysis complete':'Analysis incomplete'}</small><small className="game-library-error-counts">{game.analysis.counts.blunder} blunders · {game.analysis.counts.mistake} mistakes · {game.analysis.counts.inaccuracy} inaccuracies</small></>}
          {!game.analysis&&<small>Not analysed</small>}
          {Boolean(game.hasSavedReview)&&!game.analysis?.reviewUpdatesAvailable&&<small>{game.reviewProgress?.reviewedCount??0}/{game.reviewProgress?.totalCount??game.reviewDecisions??0} decisions reviewed</small>}</td>
        </tr>;
       })}</tbody>
      </table>
    </div>
    <small>Source uses the game's saved platform information. PGN means no playing platform was identified. On a phone, swipe the table sideways for more columns.</small>
    {matches.length === 0 && <p role="status">No games match this search. <button className="text-button" onClick={() => {setQuery("");setReviewFilter("all");setSourceFilter('all');}}>Clear game search</button></p>}
  </div>;
}

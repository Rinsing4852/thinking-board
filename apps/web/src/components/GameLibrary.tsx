import { requestGameAnalysis } from "./GameAnalysisRequest";
import { useEffect, useState } from "react";

interface Game {
  id: string; white: string; black: string; result: string; playerColor: string; playedAt: string | null; hasSavedReview?:boolean|number; reviewDecisions?:number|null;
}

/** Bound the rendered list, not the saved library; search still covers every game. */
export function GameLibrary({ games, selectedId, onChoose }: {
  games: Game[]; selectedId: string | null; onChoose: (id: string) => void;
}) {
  const [selecting,setSelecting]=useState(false),[chosen,setChosen]=useState<string[]>([]),[reanalyse,setReanalyse]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>setChosen(current=>current.filter(id=>games.some(game=>game.id===id))),[games]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(8);
  const matches = games.filter(game => `${game.white} ${game.black} ${game.result} ${game.playerColor} ${game.playedAt ?? ""} ${game.playedAt ? new Date(game.playedAt).toLocaleDateString() : ""}`
    .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const selected = matches.find(game => game.id === selectedId);
  const visible = matches.slice(0, limit);
  if (selected && !visible.some(game => game.id === selected.id)) visible.unshift(selected);
  return <div className="game-library">
    <div className="workflow-actions"><button className="secondary" aria-expanded={selecting} onClick={()=>setSelecting(value=>!value)}>{selecting?"Close game selection":"Select games to analyse"}</button></div>
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
      <input type="search" value={query} placeholder="Player, opponent or date…" onChange={event => {
        setQuery(event.target.value); setLimit(8);
      }} />
    </label>}
    <div className="game-chips" aria-label="Imported games">
      {visible.map(game => <div className="game-library-entry" key={game.id}>
        {selecting&&<label className="game-select"><input type="checkbox" aria-label={`Select ${game.white} versus ${game.black} ${game.playedAt??"date unknown"}, game ${games.findIndex(item=>item.id===game.id)+1}`} disabled={busy} checked={chosen.includes(game.id)} onChange={e=>setChosen(current=>e.target.checked?[...current,game.id]:current.filter(id=>id!==game.id))}/> Select game</label>}
        <button className={`game-chip${selectedId === game.id ? " active" : ""}`}
        aria-pressed={selectedId === game.id} onClick={() => onChoose(game.id)}>
        <strong>{game.white} – {game.black}</strong>
        <small>{game.result} · you played {game.playerColor}{game.playedAt ? ` · ${new Date(game.playedAt).toLocaleDateString()}` : ""}</small>
        {Boolean(game.hasSavedReview)&&<small>Saved review · {game.reviewDecisions??0} marked decisions</small>}
      </button></div>)}
    </div>
    {matches.length === 0 && <p role="status">No games match this search. <button className="text-button" onClick={() => setQuery("")}>Clear game search</button></p>}
    {visible.length < matches.length && <button className="secondary" onClick={() => setLimit(value => value + 8)}>
      Show more games ({matches.length - visible.length} remaining)
    </button>}
  </div>;
}

import {useState} from 'react';
import type {CrossGameSelection,GameErrorType,GameSource} from '../../../../packages/contracts/src/api';
import {post} from '../api';
import {GameReplay} from './GameReplay';

export const sourceLabels:Record<GameSource,string>={lichess:'Lichess',chesscom:'Chess.com',pgn:'PGN'};
const types:Record<GameErrorType,string>={all:'All move improvements',blunder:'Blunders',mistake:'Mistakes',inaccuracy:'Inaccuracies',attacking:'Missed attacking opportunities',defending:'Missed defences',fork:'Missed forks',capture:'Missed captures',mates:'Missed mates',opening:'Opening recall'};

export function CrossGamePractice({source,onOpenGame,refreshToken=0}:{source:GameSource|'all';onOpenGame:(id:string)=>void;refreshToken?:number}){
 const [type,setType]=useState<GameErrorType>('blunder'),[includeReviewed,setIncludeReviewed]=useState(false),[maxMateIn,setMaxMateIn]=useState(2);
 const [selection,setSelection]=useState<CrossGameSelection|null>(null),[index,setIndex]=useState(0),[completed,setCompleted]=useState(0),[skipped,setSkipped]=useState(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const entry=selection?.positions[index];
 const find=async()=>{
  if(busy)return;setBusy(true);setError('');
  try{const result=await post<CrossGameSelection>('/api/v1/games/practice/selection',{type,source,includeReviewed,maxMateIn});
   setSelection(result);setIndex(0);setCompleted(0);setSkipped(0);window.dispatchEvent(new Event('game-review-updated'));
  }catch(e){setError(e instanceof Error?e.message:'Could not find practice positions.');}finally{setBusy(false);}
 };
 const advance=(skip=false)=>{setIndex(i=>i+1);if(skip)setSkipped(n=>n+1);else setCompleted(n=>n+1);};
 return <section className="cross-game-practice" aria-label="Practice across games">
  <h3>Practise across your games</h3>
  {!entry&&<><p>Choose one type of decision from {source==='all'?'all game sources':sourceLabels[source]}. Uses saved analysis; it does not start Stockfish. Reviewed positions are left out unless you include them.</p>
   <div className="game-library-filters"><label>Practice type<select aria-label="Practice type" value={type} onChange={e=>setType(e.target.value as GameErrorType)}>{Object.entries(types).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <label>Maximum mate length<select aria-label="Maximum mate length" value={maxMateIn} onChange={e=>setMaxMateIn(Number(e.target.value))}>{[1,2,3,4].map(n=><option key={n} value={n}>Mate in {n}</option>)}</select></label></div>
   <label><input type="checkbox" checked={includeReviewed} onChange={e=>setIncludeReviewed(e.target.checked)}/> Include decisions already reviewed</label>
   <p className="opening-coverage-note">Practice covers all games in this source, regardless of the library search or review filter. Find positions loads current feedback and keeps older feedback and attempts. Showing an answer counts as reviewed, not recalled. Other decisions in each game remain to review.</p>
   <button disabled={busy} onClick={()=>void find()}>{busy?'Finding positions…':'Find practice positions'}</button></>}
  {error&&<p role="alert">{error}</p>}
  {selection&&<p role="status">{completed} reviewed · {skipped} skipped · {selection.totalMatches} matching positions{selection.totalMatches>30?includeReviewed?' · this round contains the first 30; exclude reviewed decisions to work through remaining unreviewed positions':' · this round contains the first 30; find positions again for the remaining decisions':''}.{selection.unanalysedGames>0?` ${selection.unanalysedGames} games have no completed analysis; analyse them to find engine errors.`:''}</p>}
  {selection&&!entry&&<p role="status">{selection.positions.length?'Round finished. Progress is saved in each source game.':'No eligible positions match this selection. Try another type, include reviewed decisions, or analyse more games.'}</p>}
  {entry&&<>
   <strong>Position {index+1} of {selection!.positions.length} · vs {entry.opponent} · {sourceLabels[entry.source]} · {entry.label}</strong>
   <GameReplay key={`${entry.snapshotId}:${entry.checkpointId}`} refreshToken={refreshToken} gameId={entry.gameId} focusedPractice maxMateIn={maxMateIn} lastPosition={index+1===selection!.positions.length}
    requestedPosition={{ply:entry.ply,checkpointId:entry.checkpointId,requestId:index}}
    onAdvance={advance} onOpenFullGame={()=>onOpenGame(entry.gameId)} onEndRound={()=>{setSelection(null);window.dispatchEvent(new Event('game-review-updated'));}}/>
  </>}
 </section>;
}

import {FocusTransfer} from './FocusTransfer';
import {useEffect,useRef,useState} from 'react';
import type {LearningFocusPlan,TrainingSessionResponse} from '../../../../packages/contracts/src/api';
import {get,post} from '../api';
export function LearningFocus({refreshToken,gameDays,onStart}:{refreshToken:number;gameDays:number|null;onStart:(session:TrainingSessionResponse)=>void}){
 const generation=useRef(0),pending=useRef<AbortController|null>(null);
 const [plan,setPlan]=useState<LearningFocusPlan|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0),[control,setControl]=useState('');
 useEffect(()=>{const abort=new AbortController();pending.current=abort;generation.current++;setPlan(null);setError('');setBusy(false);
  const url=`/api/v1/practice/focus?${new URLSearchParams({...gameDays?{gameDays:String(gameDays)}:{},...control?{timeControl:control}:{}})}`;
  void get<LearningFocusPlan>(url,abort.signal).then(data=>{if(!abort.signal.aborted)setPlan(data);}).catch(e=>{if(!abort.signal.aborted)setError(e.message);});
  return()=>{abort.abort();generation.current++;};
 },[refreshToken,gameDays,control,retry]);
 return <section className="learning-focus" aria-label="Learning focus from your games"><h2>Game-learning focus</h2>
 {error&&<p role="alert">{error} <button onClick={()=>{setControl('');setRetry(value=>value+1);}}>Retry learning focus</button></p>}
 {!plan&&!error&&<p role="status">Checking recurring patterns…</p>}
 {plan&&<>{plan.focus?<><h3>{plan.focus.title}{plan.focus.provisional?' · provisional':''}</h3><p>{plan.focus.reason}</p><p>{plan.focus.nextStep}</p>
 {plan.focus.lesson&&<p className="focus-checking-habit"><strong>Habit to practise:</strong> {plan.focus.lesson.habit}</p>}
 {plan.focus.lesson&&<p><strong>What to look for:</strong> {plan.focus.lesson.warning}</p>}
 {plan.focus.sources[0]&&<p><a href={`#games?game=${encodeURIComponent(plan.focus.sources[0].gameId)}&ply=${plan.focus.sources[0].ply}`}>Study a supporting decision on the board</a></p>}
  <button className="secondary" disabled={busy||!plan.focus.dueCount} onClick={()=>{const request=generation.current;setBusy(true);void post<TrainingSessionResponse>('/api/v1/practice/focus/start',{profileId:plan.profileId,focusId:plan.focus!.id,gameDays:plan.gameDays,...plan.timeControl?{timeControl:plan.timeControl}:{}},pending.current?.signal).then(result=>{if(request===generation.current)onStart(result);}).catch(e=>{if(request===generation.current)setError(e.message);}).finally(()=>{if(request===generation.current)setBusy(false);});}}>{busy?'Starting…':'Practise this focus'}</button>
 {!plan.focus.dueCount&&plan.focus.nextDueAt&&<p>Next scheduled position: {new Date(plan.focus.nextDueAt).toLocaleString()}. You can still study a supporting decision.</p>}
 <FocusTransfer data={plan.focus.transfer}/>
 <details><summary>Supporting games and evidence</summary> <p><strong>SEE → CANDIDATES → CHECK:</strong> identify the threat or opportunity, consider forcing moves, then calculate the opponent’s strongest reply. The analysis shows the chess event; it does not tell us why you missed it.</p>
<p>{plan.message}</p><p>The daily plan uses the recommended focus for its default game selection when positions are due. Choosing a time control here is optional separate practice. A saved session keeps its original positions and game-date filter.</p><p>{plan.gameDays===null?'All dates':`Last ${plan.gameDays} days`} · {plan.timeControl} · {plan.eligibleGames} comparable games. Different engine settings and time controls stay separate; platform ratings are not compared.</p>
 <label>Focus time control<select value={control||plan.timeControl||''} onChange={e=>setControl(e.target.value)}>{plan.timeControls.map(value=><option key={value}>{value}</option>)}</select></label>
 <ul>{plan.focus.sources.map(source=><li key={source.gameId}><a href={`#games?game=${encodeURIComponent(source.gameId)}&ply=${source.ply}`}>{source.white} – {source.black}</a> · {new Date(source.playedAt).toLocaleDateString()}</li>)}</ul>


 <p>After practice, check whether the same error recurs in later comparable games. Exercise success alone is not improvement in games.</p></details></>:<p>{plan.message}</p>}</>}
 </section>;
}

import {useEffect,useRef,useState} from 'react';
import type {ChessComConnectionResponse,LichessConnectionResponse} from '../../../../packages/contracts/src/api';
import {get,post} from '../api';

type Profiles={activeProfileId:string|null;profiles:Array<{id:string;displayName:string}>};
type Connections={lichess:LichessConnectionResponse;chesscom:ChessComConnectionResponse};

export function ProfilePage({onProfileChanged,onAccountsChanged,onImport}:{onProfileChanged:()=>void;onAccountsChanged:()=>void;onImport:()=>void}){
 const [profiles,setProfiles]=useState<Profiles|null>(null),[connections,setConnections]=useState<Connections|null>(null);
 const [names,setNames]=useState({lichess:'',chesscom:''}),[error,setError]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
 const request=useRef<AbortController|null>(null),generation=useRef(0);
 useEffect(()=>{
  const controller=new AbortController();request.current=controller;const version=++generation.current;
  setError('');setBusy(false);setProfiles(null);setConnections(null);
  void Promise.all([get<LichessConnectionResponse>('/api/v1/lichess/connection',controller.signal),get<ChessComConnectionResponse>('/api/v1/chesscom/connection',controller.signal)])
   .then(async([lichess,chesscom])=>{
    const players=await get<Profiles>('/api/v1/profiles',controller.signal);
    if(controller.signal.aborted||version!==generation.current)return;
    setProfiles(players);setConnections({lichess,chesscom});setNames({lichess:lichess.username??'',chesscom:chesscom.username??''});
   }).catch(problem=>{if(!controller.signal.aborted)setError(problem.message);});
  return()=>{controller.abort();generation.current++;};
 },[retry]);
 const save=async(provider:'lichess'|'chesscom')=>{
  if(busy||!profiles?.activeProfileId)return;
  const version=generation.current;setBusy(true);setError('');setStatus('');
  try{
   const result=await post<LichessConnectionResponse|ChessComConnectionResponse>(`/api/v1/${provider}/connect`,{username:names[provider],profileId:profiles.activeProfileId},request.current?.signal);
   if(version!==generation.current)return;
   setConnections(current=>current?{...current,[provider]:result}:current);setNames(current=>({...current,[provider]:result.username??''}));
   setStatus(`${provider==='lichess'?'Lichess':'Chess.com'} username saved. Your games and training history are kept.`);onAccountsChanged();
   void get<Profiles>('/api/v1/profiles',request.current?.signal).then(players=>{if(version===generation.current)setProfiles(players);}).catch(()=>undefined);
  }catch(problem){if(version===generation.current)setError(problem instanceof Error?problem.message:'Could not save the username.');}
  finally{if(version===generation.current)setBusy(false);}
 };
 return <section className="profile-page" aria-label="Player profile">
  <div className="page-heading"><span className="eyebrow">Your chess identity</span><h1>Profile</h1><p>Link your Lichess and Chess.com usernames to the same learner. Games and training history stay together, even when your usernames differ.</p></div>
  {!profiles&&!error&&<p role="status">Loading your profile…</p>}
  {error&&<p role="alert">{error} <button className="secondary" onClick={()=>{setStatus('');setRetry(value=>value+1);}}>Reload profile</button></p>}
  {profiles&&connections&&<>
   <section className="panel"><label>Profile player<select aria-label="Profile player" value={profiles.activeProfileId??''} disabled={busy||profiles.profiles.length<2} onChange={async event=>{
     const version=generation.current;setBusy(true);setError('');
     try{await post(`/api/v1/profiles/${event.target.value}/activate`,{},request.current?.signal);if(version===generation.current)onProfileChanged();}
     catch(problem){if(version===generation.current)setError(problem instanceof Error?problem.message:'Could not change player.');}
     finally{if(version===generation.current)setBusy(false);}
    }}>{profiles.profiles.map(player=><option key={player.id} value={player.id}>{player.displayName}</option>)}</select></label>
    <p>Changing player switches the library and practice history. It does not merge players or delete their data.</p>
   </section>
   <div className="profile-accounts">{(['lichess','chesscom'] as const).map(provider=>{
    const label=provider==='lichess'?'Lichess':'Chess.com',connection=connections[provider];
    return <section className="panel" key={provider} aria-label={`${label} account`}>
     <h2>{label}</h2><p>{connection.connected?`Linked as ${connection.username}`:'No username linked yet.'}</p>
     <label>{label} username<input autoComplete="off" spellCheck={false} disabled={busy} maxLength={provider==='lichess'?30:25} value={names[provider]} onChange={event=>setNames(current=>({...current,[provider]:event.target.value}))}/></label>
     <button disabled={busy||!names[provider].trim()||names[provider].trim().toLowerCase()===connection.username?.toLowerCase()} onClick={()=>void save(provider)}>{busy?'Please wait…':`Save ${label} username`}</button>
     <p>Public games need your username, not your password. Saving checks that the account exists; it does not request engine analysis.</p>
    </section>;
   })}</div>
   <button className="secondary" onClick={onImport}>Import games from linked accounts</button>
  </>}
  {status&&<p role="status">{status}</p>}
 </section>;
}

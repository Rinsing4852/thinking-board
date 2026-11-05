import type {FocusTransfer as Transfer,FocusTransferWindow} from '../../../../packages/contracts/src/api';
const date=(value:string)=>new Date(value).toLocaleDateString();
function sample(window:FocusTransferWindow){return window.games?`${window.games} games · ${window.ownMoves} own moves · ${date(window.from!)}–${date(window.to!)}`:'No eligible games yet';}
function ratings(window:FocusTransferWindow){
 const range=(r:FocusTransferWindow['learnerRatings'])=>r?`${r.min}–${r.max} (${r.known}/${window.games} known)`:'unknown';
 return `Your rating ${range(window.learnerRatings)}; opponents ${range(window.opponentRatings)}.`;
}
export function FocusTransfer({data}:{data:Transfer|null|undefined}){
 if(!data)return <p>Complete a focus exercise to start checking later games.</p>;
 const small=data.before.games<10||data.after.games<10;
 return <details className="focus-transfer"><summary>Is this focus recurring less in later games?</summary>
  <p>First recorded study of this focus: {date(data.practisedAt)}. Up to 20 games on each side of that date; {data.source==='chesscom'?'Chess.com':data.source==='lichess'?'Lichess':'PGN / platform unknown'} · you played {data.playerColor}. Same time control, engine settings and grading method as this focus.</p>
  <div className="quality-table-wrap"><table><caption>Observed game results around practice</caption><thead><tr><th>Measure</th><th>Before study</th><th>Later games</th></tr></thead><tbody>
   <tr><th>Sample</th><td>{sample(data.before)}</td><td>{sample(data.after)}</td></tr>
   <tr><th>Games with this flagged pattern</th><td>{data.before.flaggedGames}/{data.before.games}</td><td>{data.after.flaggedGames}/{data.after.games}</td></tr>
   <tr><th>All mistakes + blunders per 100 own moves</th><td>{data.before.errorsPer100Moves??'Not enough data'}</td><td>{data.after.errorsPer100Moves??'Not enough data'}</td></tr>
   <tr><th>All blunders</th><td>{data.before.blunders}</td><td>{data.after.blunders}</td></tr>
  </tbody></table></div>
  <p>{small?'Small sample: this is a starting point, not an improvement claim. ':''}These observations do not show that practice caused a change. An unflagged game may still contain an undetected example; only supported patterns within the current evidence window are counted.</p>
  <p>{data.incompleteGames} games excluded for incomplete analysis or grading; {data.timingExcludedGames} study-day games excluded because their time is unknown. Ratings and opponent strength can change: before — {ratings(data.before)} Later — {ratings(data.after)}</p>
  {(data.source==='pgn')&&<p>The original playing platform is unknown in this group; ratings may not be comparable.</p>}
  <details><summary>Games in this follow-up</summary>{(['before','after'] as const).map(group=><div key={group}><strong>{group==='before'?'Before study':'Later games'}</strong><ul>{data[group].gameIds.map((id,index)=><li key={id}><a href={`#games?game=${encodeURIComponent(id)}`}>Review game {index+1}</a></li>)}</ul></div>)}</details>
 </details>;
}

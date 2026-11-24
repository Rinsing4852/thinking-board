import type {PersonalLearningPlan,PlanMeasure} from '../../../../packages/contracts/src/api';
const date=(value:string)=>new Date(value).toLocaleDateString();
function sample(group:PlanMeasure){
 const range=(value:PlanMeasure['learnerRatings'])=>value?`${value.min}–${value.max} (${value.known}/${group.games} known)`:'unknown';
 return `${group.games} games · ${group.ownMoves} own moves · ${date(group.from!)}–${date(group.to!)}. Your rating ${range(group.learnerRatings)}; opponents ${range(group.opponentRatings)}.`;
}
export function PersonalPlanDetails({plan}:{plan:PersonalLearningPlan|null|undefined}){
 if(!plan)return null;
 const groupLabel=(group:PlanMeasure)=>`${group.source==='chesscom'?'Chess.com':group.source==='lichess'?'Lichess':'PGN / unknown'} · ${group.playerColor}`;
 const rows=(label:string,groups:PlanMeasure[])=>groups.map(group=><tr key={`${label}:${group.source}:${group.playerColor}`}><th>{label} · {groupLabel(group)}</th><td>{group.errorsPer100Moves??'—'}</td><td>{group.blunders}</td><td>{group.games} games · {group.ownMoves} own moves</td></tr>);
 return <details><summary>Saved plan and progress</summary>
  <p><strong>At choice:</strong> {plan.reasonAtChoice}</p>
  <p>{plan.studiedAt?`First study of this plan: ${date(plan.studiedAt)}. Answers and reveals count as study, not mastery.`:'Not studied since choosing this plan.'}</p>
  <div className="quality-table-wrap"><table className="quality-trends-table"><caption>All serious errors around this plan</caption><thead><tr><th>Sample</th><th>Errors / 100</th><th>Blunders</th><th>Sample size</th></tr></thead><tbody>{rows('At choice',plan.baseline.groups)}{rows('After study',plan.followUp?.groups??[])}</tbody></table></div>
  <p>Errors / 100 means mistakes + blunders per 100 own moves.</p>
  <details><summary>Dates and rating ranges</summary>{([['At choice',plan.baseline.groups],['After study',plan.followUp?.groups??[]]] as const).flatMap(([period,groups])=>groups.map(group=><p key={`${period}:${group.source}:${group.playerColor}`}><strong>{period} · {groupLabel(group)}:</strong> {sample(group)}</p>))}</details>
  {!plan.followUp?.groups.length&&<p>No comparable later games yet.</p>}
  <p>The baseline is saved. Follow-up uses up to 20 games per platform and colour from the latest 100 analysed games, with the same time control and analysis settings. Small samples and changing opponents limit comparison; this does not establish a learning benefit.</p>
  <p>{plan.baseline.excludedGames} games excluded at choice; {plan.followUp?.excludedGames??0} excluded after study for incomplete or uncertain evidence. PGN platform and ratings may be unknown.</p>
  {plan.history.length>0&&<><h4>Previous focuses</h4><ul>{plan.history.map(item=><li key={item.id}>{item.title} · {date(item.chosenAt)} · {item.studiedAt?'recorded study':'no recorded study'}</li>)}</ul></>}
 </details>;
}

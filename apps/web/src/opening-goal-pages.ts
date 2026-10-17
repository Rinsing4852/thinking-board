import type {OpeningRepertoireGoal} from "../../../packages/contracts/src/api";

/** Only contiguous pages from the same evidence snapshot can establish completion. */
export function mergeOpeningGoalPages(previous:OpeningRepertoireGoal|null, page:OpeningRepertoireGoal):OpeningRepertoireGoal {
  const {offset:start,nextOffset}=page.planScan;
  const end=start+page.plans.length;
  if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(page.plansAvailable)||page.plansAvailable<0
    ||!page.planScan.snapshot||end>page.plansAvailable||new Set(page.plans.map(plan=>plan.id)).size!==page.plans.length
    ||(nextOffset===null?end!==page.plansAvailable:nextOffset!==end||end>=page.plansAvailable||!page.plans.length)) {
    throw new Error("The saved-plan batch is incomplete. Recheck from the start.");
  }
  if(start===0) return {...page,met:page.plans.length>0&&end===page.plansAvailable&&nextOffset===null&&page.plans.every(plan=>plan.met)};
  if(!previous || previous.planScan.snapshot!==page.planScan.snapshot || previous.planScan.nextOffset!==start
    || previous.plans.length!==start || previous.repertoireId!==page.repertoireId
    || previous.plansAvailable!==page.plansAvailable || previous.games!==page.games || previous.ratingGroup!==page.ratingGroup
    || previous.maxPlies!==page.maxPlies || previous.speeds.join(",")!==page.speeds.join(",") || !page.plans.length
    || page.plans.some(plan=>previous.plans.some(old=>old.id===plan.id))) {
    throw new Error("The saved-plan check changed. Recheck from the start to keep the result consistent.");
  }
  const plans=[...previous.plans,...page.plans];
  if(plans.length>page.plansAvailable) throw new Error("The saved-plan count changed. Recheck from the start.");
  const gaps=new Map<string,OpeningRepertoireGoal["gaps"][number]>();
  for(const gap of [...previous.gaps,...page.gaps]) {
    const key=gap.targetPositionKey??`${gap.positionId}:${gap.moveUci}`;
    const old=gaps.get(key);
    if(!old||(old.reachPercent??0)<(gap.reachPercent??0)) gaps.set(key,gap);
  }
  const complete=page.planScan.nextOffset===null&&plans.length===page.plansAvailable;
  return {...page,scan:previous.scan,plans,plansOmitted:page.plansAvailable-plans.length,
    conditionalStarts:plans.filter(plan=>plan.conditional).length,
    met:complete&&plans.length>0&&plans.every(plan=>plan.met),
    gaps:[...gaps.values()].sort((a,b)=>(b.reachPercent??0)-(a.reachPercent??0)),
    planScan:{...page.planScan,offset:0}};
}

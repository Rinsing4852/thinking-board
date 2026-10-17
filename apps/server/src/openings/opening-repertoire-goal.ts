import { Chess } from "chess.js";
import type { OpeningCoverageGap, OpeningExplorerPositionResponse, OpeningRepertoireGoal } from "../../../../packages/contracts/src/api.js";
import type { CoverageEdge } from "./opening-coverage-model.js";
import { openingPositionKey } from "./opening-content.js";

export interface GoalRow extends CoverageEdge {
  fen: string; afterFen: string; lineId: string; lineTitle: string; chapterTitle: string; ply: number; kind: string;
}
type Kind = "terminal" | "stopped" | "rare" | "missing" | "idea" | "omitted" | "unknown" | "depth" | "cycle" | "work";
type Arc = { to: string; probability: number };
type Node = { kind?: Kind; arcs: Arc[]; gap?: OpeningCoverageGap };
export const GOAL_PLAN_LIMIT = 64;
export const GOAL_NODE_LIMIT = 5000;
const blank = (): Record<Kind, number> => ({ terminal:0, stopped:0, rare:0, missing:0, idea:0, omitted:0, unknown:0, depth:0, cycle:0, work:0 });

/** Evaluate one deterministic policy. Topological flow combines disjoint paths
 * BEFORE applying the encounter threshold, including variable-length transpositions.
 * Cycles and exhausted budgets absorb mass as incomplete; they never earn coverage.
 */
export function evaluateGoalGraph(root: string, nodes: Map<string, Node>, games: number, maxPlies: number) {
  const incoming = new Map([...nodes.keys()].map(id => [id,0]));
  for (const node of nodes.values()) for (const arc of node.arcs) incoming.set(arc.to,(incoming.get(arc.to) ?? 0)+1);
  const queue = [...incoming].filter(([,count]) => count === 0).map(([id]) => id);
  const reach = new Map([[root,1]]), depth = new Map([[root,0]]);
  const outcomes = blank(), missing: Array<{ key:string; probability:number; gap:OpeningCoverageGap|undefined }> = [];
  for (let index=0;index<queue.length;index++) {
    const id=queue[index]!, node=nodes.get(id)!, mass=reach.get(id) ?? 0;
    if (mass > 0) {
      const kind=node.kind === "terminal" || node.kind === "stopped" ? node.kind
        : (depth.get(id) ?? 0)>=maxPlies ? "depth" : node.kind;
      if (kind) {
        const result=(kind === "missing" || kind === "idea" || kind === "omitted") && mass+1e-12 < 1/games ? "rare" : kind;
        outcomes[result]+=mass;
        if (result === "missing" || result === "idea") missing.push({key:id,probability:mass,gap:node.gap});
      } else for (const arc of node.arcs) {
        reach.set(arc.to,(reach.get(arc.to) ?? 0)+mass*arc.probability);
        depth.set(arc.to,Math.max(depth.get(arc.to) ?? 0,(depth.get(id) ?? 0)+1));
      }
    }
    for (const arc of node.arcs) {
      incoming.set(arc.to,incoming.get(arc.to)!-1);
      if (incoming.get(arc.to) === 0) queue.push(arc.to);
    }
  }
  // No flow traverses a cycle, so only its first reached entry carries mass.
  for (const [id,count] of incoming) if (count>0) outcomes.cycle+=reach.get(id) ?? 0;
  return {outcomes,missing};
}

export function repertoireGoal(input: {
  repertoireId:string; rows:GoalRow[]; learnerColor:"white"|"black"; games:number; maxPlies:number;
  samples:Map<string,OpeningExplorerPositionResponse|null>; boundaries:Set<string>;
  decisions:Map<string,"idea"|"unprepared"|"line">; ratingGroup:number; speeds:string[];
}): OpeningRepertoireGoal {
  const unique=[...new Map(input.rows.map(row=>[row.id,row])).values()];
  const positions=new Map<string,{fen:string;row:GoalRow}>();
  for(const row of input.rows) {
    if(!positions.has(row.from)) positions.set(row.from,{fen:row.fen,row});
    if(!positions.has(row.to)) positions.set(row.to,{fen:row.afterFen,row});
  }
  const byKey=new Map([...positions].map(([id,value])=>[openingPositionKey(value.fen),id]));
  const primary=new Map<string,GoalRow>();
  for(const row of [...unique].sort((a,b)=>Number(a.kind!=="primary")-Number(b.kind!=="primary"))) {
    if(row.role==="learner"&&!primary.has(row.from)) primary.set(row.from,row);
  }
  const lines=new Map<string,GoalRow[]>();
  for(const row of input.rows) lines.set(row.lineId,[...(lines.get(row.lineId)??[]),row]);
  const signatures=new Set<string>(), plans:OpeningRepertoireGoal["plans"]=[];
  const gaps=new Map<string,OpeningCoverageGap>();
  let conditionalStarts=0, work=0;
  for(const rows of lines.values()) {
    rows.sort((a,b)=>a.ply-b.ply);const first=rows[0]!;
    const policy=new Map(primary), overrides=new Map<string,string>();let conflict=false;
    for(const row of rows) if(row.role==="learner") {
      if(overrides.has(row.from)&&overrides.get(row.from)!==row.uci) conflict=true;
      overrides.set(row.from,row.uci);policy.set(row.from,row);
    }
    const signature=JSON.stringify([first.from,[...policy].map(([id,row])=>[id,row.uci]).sort(),conflict]);
    if(signatures.has(signature)) continue;
    signatures.add(signature);
    if(plans.length>=GOAL_PLAN_LIMIT || work>=20000) continue;
    const conditional=openingPositionKey(first.fen)!==openingPositionKey(new Chess().fen());
    if(conditional) conditionalStarts++;
    const nodes=new Map<string,Node>();const pending=[first.from];
    const missingKinds=new Map<string,Kind>();
    const workKey="__work_limit__";
    const add=(id:string) => {
      if(nodes.has(id)) return id;
      if(nodes.size>=GOAL_NODE_LIMIT || work>=20000) {nodes.set(workKey,{kind:"work",arcs:[]});return workKey;}
      nodes.set(id,{arcs:[]});work++;pending.push(id);return id;
    };
    nodes.set(first.from,{arcs:[]});
    for(let index=0;index<pending.length;index++) {
      const id=pending[index]!, node=nodes.get(id)!;
      if(node.kind) continue;
      const position=positions.get(id);
      if(!position) continue; // Synthetic missing-answer leaf, assigned when created.
      const board=new Chess(position.fen);
      if(board.isCheckmate()||board.isStalemate()||board.isInsufficientMaterial()) {node.kind="terminal";continue;}
      if(input.boundaries.has(id)) {node.kind="stopped";continue;}
      if(board.turn()===(input.learnerColor==="white"?"w":"b")) {
        const own=policy.get(id);
        if(!own) {node.kind=missingKinds.get(id)??"missing";continue;}
        node.arcs.push({to:add(own.to),probability:1});continue;
      }
      const sample=input.samples.get(id);
      if(!sample||sample.stale||!Number.isSafeInteger(sample.totalGames)||sample.totalGames<200
        ||sample.ratingGroup!==input.ratingGroup||sample.speeds.join(",")!==input.speeds.join(",")
        ||openingPositionKey(sample.fen)!==openingPositionKey(position.fen)
        ||new Set(sample.replies.map(reply=>reply.moveUci)).size!==sample.replies.length
        ||sample.replies.some(reply=>!Number.isSafeInteger(reply.games)||reply.games<0||reply.games>sample.totalGames)) {node.kind="unknown";continue;}
      const legal=new Set(board.moves({verbose:true}).map(move=>`${move.from}${move.to}${move.promotion??""}`));
      const replies=sample.replies.filter(reply=>legal.has(reply.moveUci)&&reply.games>0);
      const represented=replies.reduce((sum,reply)=>sum+reply.games/sample.totalGames,0);
      if(represented>1+1e-12) {node.kind="unknown";continue;}
      for(const reply of replies) {
        if(reply.games<5) {
          const unknown=add(`unknown:${id}:${reply.moveUci}`);nodes.get(unknown)!.kind=unknown===workKey?"work":"unknown";
          node.arcs.push({to:unknown,probability:reply.games/sample.totalGames});continue;
        }
        const after=new Chess(position.fen);after.move({from:reply.moveUci.slice(0,2),to:reply.moveUci.slice(2,4),...(reply.moveUci[4]?{promotion:reply.moveUci[4]}:{})});
        const key=openingPositionKey(after.fen());
        const target=byKey.get(key)??`answer:${key}`;
        const destination=add(target);
        if(destination!==workKey&&(after.isCheckmate()||after.isStalemate()||after.isInsufficientMaterial())) {
          nodes.get(destination)!.kind="terminal";
        } else if(destination!==workKey&&input.boundaries.has(target)) {
          nodes.get(destination)!.kind="stopped";
        } else if(destination!==workKey&&!policy.has(target)) {
          const choice=input.decisions.get(`${id}:${reply.moveUci}`);
          const kind=choice==="idea"?"idea":choice==="unprepared"?"omitted":"missing";
          const old=missingKinds.get(target);
          // A shared unanswered position is still a gap if any route needs an answer.
          const selected=old==="missing"||kind==="missing"?"missing":old==="idea"||kind==="idea"?"idea":kind;
          missingKinds.set(target,selected);
          const targetNode=nodes.get(target)!;
          targetNode.kind=selected;
          targetNode.gap??={positionId:id,fen:position.fen,lineId:position.row.lineId,lineTitle:position.row.lineTitle,chapterTitle:position.row.chapterTitle,
            moveUci:reply.moveUci,moveSan:reply.moveSan,games:reply.games,frequencyPercent:reply.frequencyPercent,status:selected==="idea"?"idea_only":selected==="omitted"?"unprepared":"missing_response"};
          targetNode.gap.status=selected==="idea"?"idea_only":selected==="omitted"?"unprepared":"missing_response";
        }
        node.arcs.push({to:destination,probability:reply.games/sample.totalGames});
      }
      if(represented<1-1e-12) {
        const unknown=add(`unknown:${id}:unrepresented`);nodes.get(unknown)!.kind=unknown===workKey?"work":"unknown";
        node.arcs.push({to:unknown,probability:1-represented});
      }
    }
    const evaluated=conflict?{outcomes:{...blank(),unknown:1},missing:[]}:evaluateGoalGraph(first.from,nodes,input.games,input.maxPlies);
    const missing=new Set(evaluated.missing.map(gap=>gap.key));
    for(const entry of evaluated.missing) if(entry.gap) {
      const old=gaps.get(entry.key);
      if(!old||(old.reachPercent??0)<entry.probability*100) gaps.set(entry.key,{...entry.gap,reachPercent:entry.probability*100});
    }
    const outstanding=evaluated.outcomes.missing+evaluated.outcomes.idea+evaluated.outcomes.omitted;
    const incomplete=evaluated.outcomes.unknown+evaluated.outcomes.depth+evaluated.outcomes.cycle+evaluated.outcomes.work;
    plans.push({id:first.lineId,title:`${first.chapterTitle} · ${first.lineTitle}`,conditional,conflict,
      met:!conditional&&!conflict&&outstanding<=1e-12&&incomplete<=1e-12,
      relevantMissing:missing.size,outcomes:Object.fromEntries(Object.entries(evaluated.outcomes).map(([key,value])=>[key,value*100])) as Record<Kind,number>});
  }
  return {repertoireId:input.repertoireId,games:input.games,ratingGroup:input.ratingGroup,speeds:input.speeds,maxPlies:input.maxPlies,
    plansAvailable:signatures.size,plans,plansOmitted:Math.max(0,signatures.size-plans.length),conditionalStarts,
    met:plans.length>0&&plans.every(plan=>plan.met)&&signatures.size===plans.length,
    gaps:[...gaps.values()].sort((a,b)=>(b.reachPercent??0)-(a.reachPercent??0)),
    policy:"Each saved line supplies its own choices; elsewhere the first saved primary response is used. Identical policies are checked once. Alternatives are separate plans, never added as extra probability.",
    scan:{checked:0,remaining:0,nextOffset:null,available:0,failed:0,mode:"missing"}};
}

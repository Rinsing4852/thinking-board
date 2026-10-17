import {describe,expect,it} from "vitest";
import type {OpeningRepertoireGoal} from "../../../packages/contracts/src/api";
import {mergeOpeningGoalPages} from "./opening-goal-pages";

function page(offset:number,count:number,total=130):OpeningRepertoireGoal {
  return {repertoireId:"white",games:200,ratingGroup:1600,speeds:["rapid"],maxPlies:60,
    plansAvailable:total,plansOmitted:total-count,conditionalStarts:0,met:false,gaps:[],policy:"Saved plans",
    plans:Array.from({length:count},(_,index)=>({id:`plan-${offset+index}`,title:"Plan",conditional:false,conflict:false,met:true,relevantMissing:0,
      outcomes:{terminal:0,stopped:100,rare:0,missing:0,idea:0,omitted:0,unknown:0,depth:0,cycle:0,work:0}})),
    planScan:{offset,nextOffset:offset+count<total?offset+count:null,snapshot:"unchanged"},
    scan:{checked:0,remaining:0,nextOffset:null,available:0,failed:0,mode:"missing"}};
}
describe("saved-plan continuation",()=>{
  it("confirms the repertoire only after every contiguous saved-plan batch",()=>{
    const initial=page(0,64);initial.scan={...initial.scan,remaining:9,nextOffset:2,mode:"refresh"};
    const first=mergeOpeningGoalPages(null,{...initial,met:true});
    expect(first.met).toBe(false);
    const second=mergeOpeningGoalPages(first,page(64,64));
    expect(second).toMatchObject({met:false,plansOmitted:2,planScan:{nextOffset:128}});
    const complete=mergeOpeningGoalPages(second,page(128,2));
    expect(complete.scan).toEqual(initial.scan);
    expect(complete.plans).toHaveLength(130);expect(complete).toMatchObject({met:true,plansOmitted:0,planScan:{offset:0,nextOffset:null}});
  });
  it("rejects changed evidence, settings, out-of-order, duplicate and truncated batches",()=>{
    const first=page(0,64);
    expect(()=>mergeOpeningGoalPages(first,{...page(64,64),planScan:{...page(64,64).planScan,snapshot:"changed"}})).toThrow(/changed/);
    expect(()=>mergeOpeningGoalPages(first,{...page(64,64),games:500})).toThrow(/changed/);
    expect(()=>mergeOpeningGoalPages(first,page(128,2))).toThrow(/changed/);
    expect(()=>mergeOpeningGoalPages(first,{...page(64,64),plans:[first.plans[0]!,...page(64,64).plans.slice(1)]})).toThrow(/changed/);
    expect(()=>mergeOpeningGoalPages(first,{...page(64,64),planScan:{offset:64,nextOffset:null,snapshot:"unchanged"}})).toThrow(/incomplete/);
    expect(()=>mergeOpeningGoalPages(null,page(64,64))).toThrow(/changed/);
  });
  it("keeps uncertain plans incomplete and merges transposed gaps by destination",()=>{
    const a=page(0,1,2),b=page(1,1,2);
    const gap={positionId:"before-a",fen:"fen",lineId:"line",lineTitle:"A",chapterTitle:"A",moveUci:"a2a3",moveSan:"a3",games:20,frequencyPercent:2,status:"missing_response" as const,targetPositionKey:"same-board",reachPercent:2};
    a.gaps=[gap];b.gaps=[{...gap,positionId:"before-b",reachPercent:5}];
    b.plans[0]!.met=false;b.plans[0]!.outcomes.unknown=100;
    const result=mergeOpeningGoalPages(a,b);
    expect(result.met).toBe(false);expect(result.gaps).toHaveLength(1);expect(result.gaps[0]?.reachPercent).toBe(5);
    expect(mergeOpeningGoalPages(result,page(0,1,2)).plans).toHaveLength(1);
  });
});

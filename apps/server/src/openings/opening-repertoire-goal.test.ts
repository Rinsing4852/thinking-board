import {describe,expect,it} from "vitest";
import {Chess} from "chess.js";
import {evaluateGoalGraph,repertoireGoal} from "./opening-repertoire-goal.js";

describe("whole-repertoire goal flow",()=>{
  it("does not call a common continuation complete at the checking limit",()=>{
    const result=evaluateGoalGraph("root",new Map([
      ["root",{arcs:[{to:"reply",probability:1}]}],["reply",{arcs:[{to:"answer",probability:1}]}],
      ["answer",{arcs:[{to:"end",probability:1}]}],["end",{kind:"missing" as const,arcs:[]}],
    ]),200,2);
    expect(result.outcomes.depth).toBe(1);expect(result.missing).toHaveLength(0);
    expect(evaluateGoalGraph("root",new Map([
      ["root",{arcs:[{to:"gap",probability:1}]}],["gap",{kind:"missing" as const,arcs:[]}],
    ]),200,10).outcomes.missing).toBe(1);
  });
  it("combines variable-length transpositions before deciding a reply is rare",()=>{
    const result=evaluateGoalGraph("r",new Map([
      ["r",{arcs:[{to:"gap",probability:.003},{to:"a",probability:.003},{to:"end",probability:.994}]}],
      ["a",{arcs:[{to:"b",probability:1}]}],["b",{arcs:[{to:"gap",probability:1}]}],
      ["gap",{kind:"missing" as const,arcs:[]}],["end",{kind:"terminal" as const,arcs:[]}],
    ]),200,10);
    expect(result.missing).toEqual([{key:"gap",probability:.006,gap:undefined}]);
    expect(result.outcomes.missing).toBe(.006);expect(result.outcomes.rare).toBe(0);
  });
  it("keeps repeated positions and unsupported evidence incomplete",()=>{
    const cycle=evaluateGoalGraph("r",new Map([["r",{arcs:[{to:"a",probability:1}]}],["a",{arcs:[{to:"r",probability:1}]}]]),200,60);
    expect(cycle.outcomes.cycle).toBe(1);
    const unknown=evaluateGoalGraph("r",new Map([["r",{arcs:[{to:"u",probability:.001},{to:"s",probability:.999}]}],
      ["u",{kind:"unknown" as const,arcs:[]}],["s",{kind:"stopped" as const,arcs:[]}]]),200,60);
    expect(unknown.outcomes.unknown).toBe(.001);expect(unknown.outcomes.rare).toBe(0);
  });
  it("stops only at an explicit stopping point or a supported rare unanswered position",()=>{
    const result=evaluateGoalGraph("r",new Map([["r",{arcs:[{to:"g",probability:.004},{to:"s",probability:.996}]}],
      ["g",{kind:"missing" as const,arcs:[]}],["s",{kind:"stopped" as const,arcs:[]}]]),200,60);
    expect(result.outcomes).toMatchObject({rare:.004,stopped:.996,missing:0,depth:0});
    expect(Object.values(result.outcomes).reduce((a,b)=>a+b,0)).toBeCloseTo(1);
  });
  it("preserves explicit stopping points at an unanswered shared destination",()=>{
    const board=new Chess(), fen=board.fen();board.move("e4");const after=board.fen();board.move("e5");
    const common={lineId:"line",lineTitle:"Main",chapterTitle:"White",kind:"primary"};
    const result=repertoireGoal({repertoireId:"white",learnerColor:"white",games:200,maxPlies:60,ratingGroup:1600,speeds:["rapid"],
      rows:[{...common,id:"e4",from:"root",to:"reply",uci:"e2e4",san:"e4",role:"learner",fen,afterFen:after,ply:1},
        {...common,id:"e5",from:"reply",to:"stop",uci:"e7e5",san:"e5",role:"opponent",fen:after,afterFen:board.fen(),ply:2}],
      samples:new Map([["reply",{fen:after,ratingGroup:1600,speeds:["rapid"],totalGames:10000,stale:false,cached:true,opening:null,
        replies:[{moveUci:"e7e5",moveSan:"e5",games:10000,frequencyPercent:100,whiteWins:10000,draws:0,blackWins:0}]}]]),
      boundaries:new Set(["stop"]),decisions:new Map()});
    expect(result.met).toBe(true);expect(result.plans[0]!.outcomes.stopped).toBe(100);expect(result.gaps).toHaveLength(0);
  });
  it("does not claim whole-game reach for a custom starting position",()=>{
    const board=new Chess();board.move("e4");const fen=board.fen();board.move("e5");
    const result=repertoireGoal({repertoireId:"custom",learnerColor:"black",games:200,maxPlies:60,ratingGroup:1600,speeds:["rapid"],
      rows:[{id:"move",from:"custom",to:"stop",uci:"e7e5",san:"e5",role:"learner",fen,afterFen:board.fen(),lineId:"line",lineTitle:"Custom",chapterTitle:"Custom",ply:1,kind:"primary"}],
      samples:new Map(),boundaries:new Set(["stop"]),decisions:new Map()});
    expect(result.conditionalStarts).toBe(1);expect(result.plans[0]!.outcomes.stopped).toBe(100);expect(result.met).toBe(false);
  });

});

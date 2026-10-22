import { Chess } from "chess.js";
import type { OpeningAnalysisService } from "./opening-analysis-service.js";
import type { FastifyInstance } from "fastify";
import type { OpeningStudyDiscoveryService } from "./opening-study-discovery.js";
import type { OpeningStudyService } from "./opening-study-service.js";

export function registerOpeningStudyRoutes(app:FastifyInstance,study:OpeningStudyService,discovery:OpeningStudyDiscoveryService,analysis:OpeningAnalysisService) {
  const handle=async(action:()=>unknown,reply:{code:(code:number)=>{send:(body:unknown)=>unknown}})=>{
    try {return await action();} catch(error) {return reply.code(400).send({error:error instanceof Error?error.message:"Could not load study games."});}
  };
  const base="/api/v1/openings/repertoires/:repertoireId/lines/:lineId/study";
  app.get(base,async(request,reply)=>handle(()=>{
    const {repertoireId,lineId}=request.params as {repertoireId:string;lineId:string};
    return study.list(repertoireId,lineId,Number((request.query as {ply?:string}).ply));
  },reply));
  app.post(base,{schema:{body:{type:"object",additionalProperties:false,required:["savedPly","gameId","expectedFen"],properties:{
    savedPly:{type:"integer",minimum:0,maximum:10000},gameId:{type:"string",minLength:1,maxLength:200},currentPly:{type:"integer",minimum:0,maximum:1000},
    expectedFen:{type:"string",minLength:1,maxLength:200},
  }}}},async(request,reply)=>handle(()=>{
    const {repertoireId,lineId}=request.params as {repertoireId:string;lineId:string};
    const body=request.body as {savedPly:number;gameId:string;expectedFen:string;currentPly?:number};
    return study.save(repertoireId,lineId,body.savedPly,body.gameId,body.expectedFen,body.currentPly);
  },reply));
  app.post(`${base}/guess`,{schema:{body:{type:"object",additionalProperties:false,
    required:["savedPly","gameId","expectedFen","version","action"],properties:{
      savedPly:{type:"integer",minimum:0,maximum:10000},gameId:{type:"string",minLength:1,maxLength:200},
      expectedFen:{type:"string",minLength:1,maxLength:200},version:{type:"integer",minimum:0},
      action:{type:"string",enum:["start","hint","answer","reveal","continue","retry","restart","exit"]},
      moveUci:{type:"string",pattern:"^[a-h][1-8][a-h][1-8][qrbn]?$"},
    }}}},async(request,reply)=>handle(()=>{
      const {repertoireId,lineId}=request.params as {repertoireId:string;lineId:string};
      return study.quiz(repertoireId,lineId,request.body as import("../../../../packages/contracts/src/api.js").OpeningStudyQuizAction);
    },reply));
  app.post(`${base}/quality`,{schema:{body:{type:"object",additionalProperties:false,required:["savedPly","version"],properties:{savedPly:{type:"integer",minimum:0,maximum:10000},version:{type:"integer",minimum:0}}}}},async(request,reply)=>handle(async()=>{
    const {repertoireId,lineId}=request.params as {repertoireId:string;lineId:string};
    const {savedPly,version}=request.body as {savedPly:number;version:number};
    const target=()=>{
      const state=study.list(repertoireId,lineId,savedPly),quiz=state.quiz;
      if(!quiz||quiz.version!==version||!quiz.feedback?.playedSan||quiz.feedback.revealed)throw new Error("Answer this position before checking its chess quality. Reload if study has changed.");
      const move=new Chess(quiz.fen).move(quiz.feedback.playedSan);
      return {fen:quiz.fen,uci:`${move.from}${move.to}${move.promotion??""}`,gameId:quiz.game.id};
    };
    const before=target(),result=await analysis.assessMove(before.fen,before.uci);
    if(JSON.stringify(target())!==JSON.stringify(before))throw new Error("Study changed while analysing. Check the current position again.");
    return {...result,message:result.verdict==="playable"?"The engine regards your move as playable within its assessment tolerance. Matching the historical move and chess quality are different results.":result.verdict==="weaker"?"The engine finds a stronger continuation here. This does not change your historical-move match result or repertoire recall.":"There is not enough reliable engine evidence to judge your move. No mistake is inferred from a different historical choice."};
  },reply));
  const targetSchema={savedPly:{type:"integer",minimum:0,maximum:10000},expectedFen:{type:"string",minLength:1,maxLength:200}};
  for(const start of [false,true]) {
    const properties=start?{...targetSchema,exampleId:{type:"string",minLength:1,maxLength:100}}
      :{...targetSchema,rating:{type:"integer",minimum:100,maximum:4000},source:{type:"string",enum:["online","masters","both"]}};
    app.post(`${base}/${start?"discover/start":"discover"}`,{schema:{body:{type:"object",additionalProperties:false,
      required:["savedPly","expectedFen",start?"exampleId":"rating"],properties}}},async(request,reply)=>handle(()=>{
      const {repertoireId,lineId}=request.params as {repertoireId:string;lineId:string};
      const body=request.body as {savedPly:number;expectedFen:string;rating:number;source?:import("../../../../packages/contracts/src/api.js").OpeningStudySource;exampleId:string};
      const target={repertoireId,lineId,savedPly:body.savedPly,expectedFen:body.expectedFen};
      return start?discovery.start(target,body.exampleId):discovery.discover(target,body.rating,body.source);
    },reply));
  }
  app.get("/api/v1/openings/study-games",async()=>study.library());
  app.post("/api/v1/openings/study-games/import",{bodyLimit:2_100_000,schema:{body:{type:"object",additionalProperties:false,required:["pgn","source"],properties:{
    pgn:{type:"string",minLength:1,maxLength:2_000_000},source:{type:"string",minLength:1,maxLength:200},
  }}}},async(request,reply)=>handle(()=>{
    const body=request.body as {pgn:string;source:string};return study.import(body.pgn,body.source);
  },reply));
  app.delete("/api/v1/openings/study-games/:gameId",async(request,reply)=>handle(()=>study.remove((request.params as {gameId:string}).gameId),reply));
}

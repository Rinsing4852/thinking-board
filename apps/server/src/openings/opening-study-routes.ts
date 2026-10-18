import type { FastifyInstance } from "fastify";
import type { OpeningStudyDiscoveryService } from "./opening-study-discovery.js";
import type { OpeningStudyService } from "./opening-study-service.js";

export function registerOpeningStudyRoutes(app:FastifyInstance,study:OpeningStudyService,discovery:OpeningStudyDiscoveryService) {
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
  const targetSchema={savedPly:{type:"integer",minimum:0,maximum:10000},expectedFen:{type:"string",minLength:1,maxLength:200}};
  for(const start of [false,true]) {
    const properties=start?{...targetSchema,exampleId:{type:"string",minLength:1,maxLength:100}}
      :{...targetSchema,rating:{type:"integer",minimum:100,maximum:4000}};
    app.post(`${base}/${start?"discover/start":"discover"}`,{schema:{body:{type:"object",additionalProperties:false,
      required:["savedPly","expectedFen",start?"exampleId":"rating"],properties}}},async(request,reply)=>handle(()=>{
      const {repertoireId,lineId}=request.params as {repertoireId:string;lineId:string};
      const body=request.body as {savedPly:number;expectedFen:string;rating:number;exampleId:string};
      const target={repertoireId,lineId,savedPly:body.savedPly,expectedFen:body.expectedFen};
      return start?discovery.start(target,body.exampleId):discovery.discover(target,body.rating);
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

import type { FastifyInstance } from "fastify";
import type { OpeningGapDraftService } from "./opening-gap-draft-service.js";
export function registerOpeningGapDraftRoutes(app:FastifyInstance,service:OpeningGapDraftService) {
  const handle=async(action:()=>unknown,reply:{code:(n:number)=>{send:(value:unknown)=>unknown}})=>{try{return await action();}catch(error){return reply.code(400).send({error:error instanceof Error?error.message:"Could not prepare this gap."});}};
  app.get("/api/v1/openings/repertoires/:repertoireId/drafts",async(request,reply)=>handle(()=>service.list((request.params as {repertoireId:string}).repertoireId),reply));
  app.post("/api/v1/openings/gap-drafts",{schema:{body:{type:"object",additionalProperties:false,required:["repertoireId","lineId","afterPly","expectedFen"],properties:{repertoireId:{type:"string",minLength:1,maxLength:200},lineId:{type:"string",minLength:1,maxLength:200},afterPly:{type:"integer",minimum:0,maximum:10000},expectedFen:{type:"string",minLength:1,maxLength:200},opponentMoveUci:{type:"string",pattern:"^[a-h][1-8][a-h][1-8][qrbn]?$"}}}}},async(request,reply)=>handle(()=>service.preview(request.body as Parameters<OpeningGapDraftService["preview"]>[0]),reply));
  for(const action of ["apply","undo"] as const)app.post(`/api/v1/openings/gap-drafts/:draftId/${action}`,async(request,reply)=>handle(()=>service[action]((request.params as {draftId:string}).draftId),reply));
}

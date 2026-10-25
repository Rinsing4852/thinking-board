import path from "node:path";
import { describe,expect,it } from "vitest";
import { Database } from "../db/database.js";
import { JobWorker } from "./job-worker.js";
import type { AnalysisService } from "../analysis/analysis-service.js";

describe("requested analysis batches",()=>{
 it("resumes unfinished games and preserves completed progress when stopped",async()=>{
   const database=new Database(":memory:",path.resolve("migrations")),db=database.connection;
   db.prepare(`INSERT INTO jobs(id,kind,status,progress_current,progress_total,payload_json,created_at) VALUES ('batch','analyze_games','running',1,3,?,'2026-01-01')`).run(JSON.stringify({gameIds:["done","second","third"],profileId:"local",requestedByUser:true}));
   let seen:string[]=[];
   const fake={close:async()=>{},analyzeGames:async(ids:string[],progress:(n:number)=>void,shouldContinue:()=>boolean)=>{
     seen=ids;expect(shouldContinue()).toBe(true);progress(1);
     db.prepare("UPDATE jobs SET payload_json=json_set(payload_json,'$.stopRequested',json('true')) WHERE id='batch'").run();
     expect(shouldContinue()).toBe(false);return {analyzed:1,items:0};
   }} as unknown as AnalysisService;
   const worker=new JobWorker(db,fake);worker.start();await worker.close();
   expect(seen).toEqual(["second","third"]);
   const result=db.prepare("SELECT status,progress_current,result_json FROM jobs WHERE id='batch'").get() as {status:string;progress_current:number;result_json:string};
   expect(result).toMatchObject({status:"completed",progress_current:2});expect(JSON.parse(result.result_json)).toMatchObject({stopped:true});database.close();
 });
});

import fs from "node:fs";
import { Chess } from "chess.js";
const base = process.argv[2];
if (!base) throw new Error("Usage: npm run benchmark:openings -- http://your-trainer:8000 [output.json]");
const get = async path => { const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error(`${response.status} ${path}`);return response.json(); };
const analyse = async fen => {
  const start=performance.now();
  const response=await fetch(new URL("/api/v1/openings/analysis",base),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({fen}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`Analysis failed: ${response.status}`);
  const result=await response.json();
  if(result.fen!==fen||!result.lines?.length)throw new Error("Unexpected analysis response");
  return {ms:performance.now()-start,engine:result.engineName,nodes:result.nodes};
};
const board=new Chess();const positions=[board.fen()];
for(const san of ["e4","e5","Nf3","Nc6","Bc4","Nf6","d3","Bc5"]){board.move(san);positions.push(board.fen());}
// First requests may already hit a persistent cache; never label them cold.
const first=[];for(const fen of positions)first.push(await analyse(fen));
const warm=[];for(let i=0;i<40;i++)warm.push((await analyse(positions[i%positions.length])).ms);
const sorted=warm.toSorted((a,b)=>a-b);
const percentile=p=>sorted[Math.ceil(sorted.length*p)-1];
const result={measuredAt:new Date().toISOString(),target:base,
  initialRequests:{cacheState:"unknown; may already be persisted",milliseconds:first.map(row=>row.ms)},
  warm:{samples:warm.length,medianMs:percentile(.5),p95Ms:percentile(.95),targetMs:500,targetMet:percentile(.95)<500},
  analysis:{engine:first[0].engine,nodes:first[0].nodes},learning:await get("/api/v1/openings/quality/metrics"),
  scope:"Measures this server including network time. No competitor or usability result is inferred."};
const output=process.argv[3];if(output)fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));

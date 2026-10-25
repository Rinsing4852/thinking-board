import { AnalysisService } from "../dist/apps/server/src/analysis/analysis-service.js";
import { ImportService } from "../dist/apps/server/src/imports/import-service.js";
import { GameQualityService } from "../dist/apps/server/src/analysis/game-quality-service.js";
import { OpeningGameService } from "../dist/apps/server/src/openings/opening-game-service.js";
// Uses a fresh temporary database and the configured real engine; never live data.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadConfig } from "../dist/apps/server/src/config.js";
import { OpeningAnalysisService } from "../dist/apps/server/src/openings/opening-analysis-service.js";
import { Database } from "../dist/apps/server/src/db/database.js";
import { buildApp } from "../dist/apps/server/src/app.js";
const root=fs.mkdtempSync(path.join(os.tmpdir(),"opening-stockfish-smoke-"));
const config={...loadConfig(),dataDir:root,databasePath:path.join(root,"smoke.sqlite3"),runWorker:false};
const database=new Database(":memory:",config.migrationsDir);
const service=new OpeningAnalysisService(config,database.connection);
const results=[];let app;let restarted;let recovery;
const start="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
async function check(name,fen,move,verdict){
  const began=performance.now(),result=await service.assessMove(fen,move);
  results.push({name,fen,move,...result,elapsedMs:Math.round(performance.now()-began)});
  assert.equal(result.verdict,verdict,`${name}: ${JSON.stringify(result)}`);
}
try {
  const identity=await service.analyze(start);
  assert(identity.engineName?.startsWith("Stockfish ")&&!identity.engineName.includes("Fake"),"Use a real Stockfish binary");
  const gameDatabase=new Database(path.join(root,"games.sqlite3"),config.migrationsDir);
  const gameAnalysis=new AnalysisService(gameDatabase.connection,{...config,stockfishDepth:12});
  try {
    const imported=new ImportService(gameDatabase.connection).import('[White "Real learner"]\n[Black "Opponent"]\n[Date "2026.10.25"]\n[TimeControl "600+0"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',"Real learner");
    assert.equal(imported.jobId,null,"Import must not start engine work");
    assert.equal(gameDatabase.connection.prepare("SELECT COUNT(*) FROM jobs").pluck().get(),0);
    const game=gameDatabase.connection.prepare("SELECT id,profile_id FROM games").get();
    await gameAnalysis.analyzeGames([game.id],()=>{});
    const quality=new GameQualityService(gameDatabase.connection,config,new OpeningGameService(gameDatabase.connection));
    const report=quality.report(game.id,game.profile_id);
    assert.equal(report.moves.length,4);assert.equal(report.white.firstBlunder,2);
    assert.equal(report.moves.find(move=>move.san==="g4").grade,"blunder");
    assert.equal(report.moves.find(move=>move.san==="Qh4#").grade,"best");
    assert.equal(quality.trends(game.profile_id).recent.games,1);
    results.push({name:"Whole-game move quality and progress with real Stockfish",engine:report.engine,firstBlunder:report.white.firstBlunder,passed:true});
  } finally {await gameAnalysis.close();gameDatabase.close();}
  await check("White sound opening alternative",start,"d2d4","playable");
  await check("White developing move after e4 e5","rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2","g1f3","playable");
  await check("Black sound opening alternative","rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1","e7e5","playable");
  await check("White misses a free queen","6k1/8/8/8/8/8/1q6/1R4K1 w - - 0 1","b1a1","weaker");
  await check("Black misses a free queen","1r4k1/1Q6/8/8/8/8/8/6K1 b - - 0 1","b8a8","weaker");
  await check("White forced mate","6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1","e1e8","playable");
  await check("Black forced mate","4r1k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1","e8e1","playable");
  await check("Finished position stays unverified","7k/6Q1/6K1/8/8/8/8/8 b - - 0 1","h8h7","uncertain");
  const before=await service.assessMove(start,"d2d4");
  restarted=new OpeningAnalysisService({...config,stockfishBinary:config.stockfishBinary},database.connection);
  const cached=await restarted.assessMove(start,"d2d4");assert.deepEqual(cached,before);
  results.push({name:"Compatible persisted cache after service restart",passed:true});
  // A disposable executable fails once, then invokes the very same real engine.
  const wrapper=path.join(root,"engine-recovery.sh"),flag=path.join(root,"failed-once");
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  fs.writeFileSync(wrapper,`#!/bin/sh\nif [ ! -f ${quote(flag)} ]; then touch ${quote(flag)}; exit 1; fi\nexec ${quote(config.stockfishBinary)}\n`,{mode:0o700});
  recovery=new OpeningAnalysisService({...config,stockfishBinary:wrapper});
  assert.equal((await recovery.assessMove(start,"d2d4")).verdict,"uncertain");
  assert.equal((await recovery.assessMove(start,"d2d4")).verdict,"playable");
  results.push({name:"Engine failure followed by real-engine recovery",passed:true});
  process.env.NODE_ENV="test";app=await buildApp(config);
  const request=async(url,payload)=>{const response=await app.inject({method:payload===undefined?"GET":"POST",url,...(payload===undefined?{}:{payload})});assert.equal(response.statusCode,200,`${url}: ${response.body}`);return response.json();};
  const imported=await request("/api/v1/openings/imports/pgn",{pgn:'[Event "Real engine smoke"]\n\n1. e4 e5 2. Nf3 *',name:"Real engine smoke",learnerColor:"white",ownershipConfirmed:true});
  const exercise=await request(`/api/v1/openings/repertoires/${imported.repertoireIds[0]}/reviews/start`,{mode:"new"});
  const base=`/api/v1/openings/reviews/${exercise.sessionId}`;
  await request(`${base}/mistakes`,{queueEntryId:exercise.queueEntryId,moveUci:"d2d4"});
  const activity=await request("/api/v1/openings/activity");
  const quality=await request(`${base}/quality`,{queueEntryId:exercise.queueEntryId,moveUci:"d2d4"});assert.equal(quality.verdict,"playable");
  assert.deepEqual(await request("/api/v1/openings/activity"),activity);
  const active=await request("/api/v1/openings/reviews/active");assert.equal(active.queueEntryId,exercise.queueEntryId);
  const answer=await request(`${base}/move`,{queueEntryId:exercise.queueEntryId,moveUci:"e2e4"});
  assert.equal(answer.assisted,true);assert.equal(answer.outcome,"learning");
  results.push({name:"Real HTTP quality route preserves original recall and practice credit",passed:true});
  const gapImport=await request("/api/v1/openings/imports/pgn",{pgn:'[Event "Real gap smoke"]\n\n1. e4 e5 *',name:"Real gap smoke",learnerColor:"white",ownershipConfirmed:true});
  const repertoireId=gapImport.repertoireIds[0],original=await request(`/api/v1/openings/repertoires/${repertoireId}`),line=original.chapters[0].lines[0];
  const draft=await request("/api/v1/openings/gap-drafts",{repertoireId,lineId:line.id,afterPly:2,expectedFen:line.moves[1].fenAfter});
  assert.equal(draft.state,"preview");assert.deepEqual(await request(`/api/v1/openings/repertoires/${repertoireId}`),original);
  assert.equal((await request(`/api/v1/openings/gap-drafts/${draft.id}/apply`,{})).state,"applied");
  assert.equal((await request(`/api/v1/openings/gap-drafts/${draft.id}/undo`,{})).state,"undone");
  assert.deepEqual(await request(`/api/v1/openings/repertoires/${repertoireId}`),original);
  results.push({name:"Real-engine missing-response preview, atomic apply and undo",passed:true,source:draft.source,moves:draft.moves});
  console.log(JSON.stringify({measuredAt:new Date().toISOString(),engine:identity.engineName,platform:process.platform,architecture:process.arch,
    nodes:config.openingAnalysisNodes,toleranceCp:config.acceptableToleranceCp,results},null,2));
} finally {
  if(app)await app.close();
  await service.close();if(restarted)await restarted.close();if(recovery)await recovery.close();
  database.close();fs.rmSync(root,{recursive:true,force:true});
}

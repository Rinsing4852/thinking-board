import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = process.env.E2E_PORT ?? "8191";
if (!/^819[12]$/.test(port)) throw new Error("Use a reserved e2e test port");
const dataDir = path.join(os.tmpdir(), `thinking-board-e2e-${port}`);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = port;
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, "trainer.sqlite3");
process.env.RUN_ANALYSIS_WORKER = "true";
process.env.STOCKFISH_BINARY = path.resolve("tests/fake-stockfish.mjs");

// Deterministic provider responses for real discovery routes in browser tests.
// This file is test-only: production fetch and configuration have no test hooks.
const originalFetch=globalThis.fetch;
globalThis.fetch=async(input,options)=>{
  const url=new URL(String(input));
  if(url.hostname==="api.chess.com") {
    const username=url.pathname.split("/")[3];
    if(!username?.startsWith("chesscom_fixture"))return new Response("",{status:404});
    if(!url.pathname.includes("/games/"))return Response.json({username});
    return Response.json({games:[false,true].map((black,index)=>({rules:"chess",url:`https://www.chess.com/game/live/${index+771001}`,
      pgn:`[Event "Chess.com test game"]\n[Site "Chess.com"]\n[White "${black?'Fixture opponent':username}"]\n[Black "${black?username:'Fixture opponent'}"]\n[UTCDate "2026.10.20"]\n[UTCTime "12:00:00"]\n[TimeControl "600+0"]\n[WhiteElo "1200"]\n[BlackElo "1300"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0`}))});
  }
  if(url.hostname==="explorer.lichess.org"&&url.pathname==="/masters") {
    if(url.searchParams.get("topGames")==="4")return Response.json({topGames:[{id:"master01"}]});
    return Response.json({white:50,draws:30,black:20,moves:[{uci:"e2e4",san:"e4",white:20,draws:10,black:10}]});
  }
  if(url.hostname==="explorer.lichess.org"&&url.pathname==="/masters/pgn/master01")return new Response('[Event "Master fixture"]\n[White "Master White"]\n[Black "Master Black"]\n[WhiteElo "2400"]\n[BlackElo "2380"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 O-O 1/2-1/2');
  if(url.hostname==="explorer.lichess.org"&&url.pathname==="/lichess"&&url.searchParams.get("topGames")==="4") {
    return new Response(JSON.stringify({topGames:[{id:"study001"},{id:"study002"},{id:"weak0001"}],recentGames:[]}),{headers:{"Content-Type":"application/json"}});
  }
  if(url.hostname==="lichess.org"&&url.pathname.startsWith("/game/export/")) {
    const id=url.pathname.split("/").at(-1);
    const moves=id==="study002"?"1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6":"1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 O-O 6. e3 h6";
    const rating=id==="weak0001"?1400:id==="study002"?1800:1900;
    return new Response(`[Event "Online model example ${id}"]\n[White "Online White ${id}"]\n[Black "Online Black ${id}"]\n[WhiteElo "${rating}"]\n[BlackElo "${rating}"]\n[Result "1/2-1/2"]\n\n${moves} 1/2-1/2`,{headers:{"Content-Type":"application/x-chess-pgn"}});
  }
  return originalFetch(input,options);
};

// Legacy built-ins are test fixtures, not production bootstrap data.
const { Database } = await import("../dist/apps/server/src/db/database.js");
const { OpeningContentService } = await import("../dist/apps/server/src/openings/opening-content-service.js");
const { STARTER_OPENING_CURRICULA } = await import("../dist/apps/server/src/openings/starter-curricula.js");
const database = new Database(process.env.DB_PATH, path.resolve("migrations"));
new OpeningContentService(database.connection).sync(STARTER_OPENING_CURRICULA);
database.close();

await import("../dist/apps/server/src/index.js");

import path from "node:path";
import { Chess } from "chess.js";
import { describe,expect,it,vi } from "vitest";
import { Database } from "../db/database.js";
import { OpeningMasterService } from "./opening-master-service.js";
import { OpeningExplorerService } from "./opening-explorer-service.js";
describe("master evidence",()=>{
 it("keeps master counts and caches separate from practical data and returns honest empty samples",async()=>{
  const database=new Database(":memory:",path.resolve("migrations"));try{
   const fetcher=vi.fn<typeof fetch>(async input=>{const master=new URL(String(input)).pathname==="/masters";return Response.json({white:master?20:100,draws:0,black:0,moves:[{uci:"e2e4",san:"e4",white:master?5:60,draws:0,black:0}]});});
   const master=new OpeningMasterService(database.connection,undefined,fetcher),practical=new OpeningExplorerService(database.connection,undefined,fetcher),fen=new Chess().fen();
   expect((await master.position(fen)).replies[0]?.frequencyPercent).toBe(25);expect((await practical.position(fen,1600)).replies[0]?.frequencyPercent).toBe(60);
   expect((await master.position(fen)).cached).toBe(true);expect(fetcher).toHaveBeenCalledTimes(2);
   const board=new Chess();board.move("e4");fetcher.mockResolvedValueOnce(Response.json({white:0,draws:0,black:0,moves:[]}));expect((await master.position(board.fen())).totalGames).toBe(0);
  }finally{database.close();}
 });
 it("rejects inconsistent and illegal master evidence and does not overwrite its cache",async()=>{
  const database=new Database(":memory:",path.resolve("migrations"));try{
   for(const move of [{uci:"e2e5",san:"bad",white:1,draws:0,black:0},{uci:"e2e4",san:"e4",white:99,draws:0,black:0}]){
    const service=new OpeningMasterService(database.connection,undefined,vi.fn(async()=>Response.json({white:1,draws:0,black:0,moves:[move]})));
    await expect(service.position(new Chess().fen())).rejects.toThrow();expect(database.connection.prepare("SELECT * FROM opening_master_cache").all()).toHaveLength(0);
   }
  }finally{database.close();}
 });
});

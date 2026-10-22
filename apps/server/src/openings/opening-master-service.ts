import { Chess } from "chess.js";
import type { OpeningMasterPosition } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { openingPositionKey } from "./opening-content.js";

/** Master evidence has its own schema/cache; it must never supply practical frequencies. */
export class OpeningMasterService {
  constructor(private readonly db:SqliteDatabase,private readonly token?:string,private readonly fetcher:typeof fetch=fetch) {}
  async position(value:string):Promise<OpeningMasterPosition> {
    const chess=new Chess(value),fen=chess.fen(),key=openingPositionKey(fen);
    const cached=this.db.prepare("SELECT payload_json,fetched_at FROM opening_master_cache WHERE position_key=?").get(key) as {payload_json:string;fetched_at:string}|undefined;
    if(cached&&Date.now()-Date.parse(cached.fetched_at)<7*86400_000) {
      try {const saved=JSON.parse(cached.payload_json) as OpeningMasterPosition;
        if(saved.source==="masters"&&Array.isArray(saved.replies)&&Number.isSafeInteger(saved.totalGames)&&saved.totalGames>=0)
          return {...saved,fen,cached:true};
      } catch { /* Refresh malformed cached evidence. */ }
    }
    const url=new URL("https://explorer.lichess.org/masters");url.searchParams.set("fen",fen);url.searchParams.set("moves",String(chess.moves().length));url.searchParams.set("topGames","0");
    const response=await this.fetcher(url,{redirect:"error",headers:{Accept:"application/json",...(this.token?{Authorization:`Bearer ${this.token}`}:{})},signal:AbortSignal.timeout(8000)});
    if(!response.ok) throw new Error(`Master-game data is unavailable (HTTP ${response.status}). Your saved moves still work.`);
    const data=await response.json() as {white:number;draws:number;black:number;moves:Array<{uci:string;san:string;white:number;draws:number;black:number}>};
    const counts=(values:number[])=>values.every(n=>Number.isSafeInteger(n)&&n>=0)&&Number.isSafeInteger(values.reduce((a,b)=>a+b,0));
    if(!counts([data.white,data.draws,data.black])||!Array.isArray(data.moves))throw new Error("Master database returned invalid counts.");
    const totalGames=data.white+data.draws+data.black,seen=new Set<string>();
    const replies=data.moves.map(move=>{
      if(!counts([move.white,move.draws,move.black])||typeof move.uci!=="string"||seen.has(move.uci))throw new Error("Master database returned invalid moves.");
      seen.add(move.uci);const played=new Chess(fen).move(move.uci),games=move.white+move.draws+move.black;
      if(!played||games>totalGames)throw new Error("Master database returned inconsistent moves.");
      return {moveUci:move.uci,moveSan:played.san,games,frequencyPercent:totalGames?100*games/totalGames:null,whiteWins:move.white,draws:move.draws,blackWins:move.black};
    });
    const result:OpeningMasterPosition={source:"masters",fen,totalGames,replies,fetchedAt:new Date().toISOString(),cached:false};
    this.db.prepare("INSERT INTO opening_master_cache VALUES(?,?,?) ON CONFLICT(position_key) DO UPDATE SET payload_json=excluded.payload_json,fetched_at=excluded.fetched_at").run(key,JSON.stringify(result),result.fetchedAt);
    return result;
  }
}

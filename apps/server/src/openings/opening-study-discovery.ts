import { Chess } from "chess.js";
import type { OpeningStudyDiscoveryGame, OpeningStudyDiscoveryResponse, OpeningStudySource } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { parsePgnText } from "../chess/pgn.js";
import { ensureActiveProfile } from "../training/profile.js";
import { id } from "../lib/ids.js";
import { openingPositionKey } from "./opening-content.js";
import { OpeningStudyService } from "./opening-study-service.js";

const position=(fen:string)=>openingPositionKey(new Chess(fen).fen());
const rating=(value:unknown):number|null=>typeof value==="string"&&/^\d{3,4}$/.test(value)&&Number(value)<=4000?Number(value):null;
type Target={repertoireId:string;lineId:string;savedPly:number;expectedFen:string};
type Example={profile:string;target:Target;expires:number;pgn:string;game:OpeningStudyDiscoveryGame};

/** Only fixed Lichess hosts are contacted. Provider references never become arbitrary URLs. */
export class OpeningStudyDiscoveryService {
  private readonly examples=new Map<string,Example>();
  private readonly busy=new Set<string>();
  private queue:Promise<unknown>=Promise.resolve();
  private cooldown=0;
  constructor(private readonly db:SqliteDatabase,private readonly study:OpeningStudyService,
    private readonly token?:string,private readonly fetcher:typeof fetch=fetch) {}

  private async download(url:URL,accept:string,signal:AbortSignal) {
    const task=this.queue.catch(()=>undefined).then(async()=>{
      signal.throwIfAborted();
      if(Date.now()<this.cooldown) throw new Error("Lichess is busy. Wait a minute, then try Find games again.");
      const response=await this.fetcher(url,{redirect:"error",headers:{Accept:accept,
        "User-Agent":"ThinkingBoard/1.0 (self-hosted chess trainer)",...(this.token?{Authorization:`Bearer ${this.token}`}:{})},
        signal:AbortSignal.any([signal,AbortSignal.timeout(6_000)])});
      if(!response.ok) {
        await response.body?.cancel();
        if(response.status===429) {this.cooldown=Date.now()+60_000;throw new Error("Lichess is busy. Wait a minute, then try Find games again.");}
        if(response.status===401||response.status===403) throw new Error("Lichess game search needs an authorised connection. Set LICHESS_API_TOKEN on your server and restart the app. Your saved games are still available.");
        throw new Error(`Lichess game search returned HTTP ${response.status}. Try again later.`);
      }
      const reader=response.body?.getReader();if(!reader) throw new Error("Lichess returned an empty response.");
      const chunks:Uint8Array[]=[];let bytes=0;
      try {for(;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;
        if(bytes>2_000_000) throw new Error("Lichess returned too much game data.");chunks.push(value);}}
      finally {await reader.cancel();}
      return Buffer.concat(chunks).toString("utf8");
    });
    this.queue=task;return task;
  }

  async discover(target:Target,learnerRating:number, source:OpeningStudySource="online"):Promise<OpeningStudyDiscoveryResponse> {
    if(!["online","masters","both"].includes(source)) throw new Error("Choose a supported game source.");
    if(!Number.isInteger(learnerRating)||learnerRating<100||learnerRating>4000) throw new Error("Enter your Lichess rating between 100 and 4000.");
    const profile=ensureActiveProfile(this.db),context=this.study.target(target.repertoireId,target.lineId,target.savedPly);
    if(position(context.fen)!==position(target.expectedFen)) throw new Error("This saved repertoire position changed. Reload study before searching.");
    if(this.busy.has(profile)) throw new Error("A game search is already running. Wait for it to finish.");
    this.busy.add(profile);
    const assertTarget=()=>{
      if(ensureActiveProfile(this.db)!==profile) throw new Error("The active player changed. Reopen study and search again.");
      if(position(this.study.target(target.repertoireId,target.lineId,target.savedPly).fen)!==position(target.expectedFen)) throw new Error("This saved repertoire position changed. Reload study before searching.");
    };
    try {
      const signal=AbortSignal.timeout(22_000);
      const ids:Array<{gameId:string;pool:"online"|"masters"}>=[];
      let sourceFailures=0;
      for(const pool of (source==="both"?["online","masters"]:[source]) as Array<"online"|"masters">) {
        const url=new URL(`https://explorer.lichess.org/${pool==="masters"?"masters":"lichess"}`);
        url.searchParams.set("fen",context.fen);url.searchParams.set("moves","0");url.searchParams.set("topGames","4");
        if(pool==="online") {url.searchParams.set("variant","standard");url.searchParams.set("speeds","rapid,classical");url.searchParams.set("recentGames","4");}
        try {
          const payload=JSON.parse(await this.download(url,"application/json",signal));
          if(!payload||!Array.isArray(payload.topGames)||(pool==="online"&&!Array.isArray(payload.recentGames)))throw new Error("Lichess returned incomplete search results. Try again.");
          const refs=[...payload.topGames,...(pool==="online"?payload.recentGames:[])];
          const valid=[...new Set<string>(refs.flatMap((ref:unknown)=>ref&&typeof ref==="object"&&"id" in ref&&typeof ref.id==="string"&&/^[A-Za-z0-9]{8}$/.test(ref.id)?[ref.id]:[]))].slice(0,8);
          if(refs.length&&!valid.length)throw new Error("Lichess returned invalid game references.");
          ids.push(...valid.map(gameId=>({gameId,pool})));
        } catch(error) {if(source!=="both")throw error;sourceFailures++;}
      }
      const candidates:Array<{pgn:string;game:OpeningStudyDiscoveryGame}>=[];
      let failures=sourceFailures;
      for(const {gameId,pool} of ids) {
        if(signal.aborted) {failures++;break;}
        try {
          const gameUrl=new URL(pool==="masters"?`https://explorer.lichess.org/masters/pgn/${gameId}`:`https://lichess.org/game/export/${gameId}`);
          gameUrl.searchParams.set("clocks","false");gameUrl.searchParams.set("evals","false");
          gameUrl.searchParams.set("literate","false");gameUrl.searchParams.set("opening","true");
          const pgn=await this.download(gameUrl,"application/x-chess-pgn",signal);
          const parsed=parsePgnText(pgn),game=parsed.games[0];
          if(parsed.errors.length||parsed.games.length!==1||!game||game.moves.length>1000||!["1-0","0-1","1/2-1/2"].includes(game.result)) {failures++;continue;}
          const whiteRating=rating(game.headers.WhiteElo),blackRating=rating(game.headers.BlackElo);
          const stronger=context.learnerColor==="white"?whiteRating:blackRating;
          if(stronger===null||(pool==="online"&&stronger<=learnerRating)) continue;
          const path=context.line.moves.slice(0,target.savedPly).map(move=>move.moveUci).join(" ");
          const matches=[{fen:game.initialFen,ply:0},...game.moves.map(move=>({fen:move.fenAfter,ply:move.ply}))]
            .filter(match=>position(match.fen)===position(context.fen)&&match.ply<game.moves.length)
            .map(match=>({...match,direct:position(game.initialFen)===position(context.line.moves[0]!.fenBefore)&&game.moves.slice(0,match.ply).map(move=>move.uci).join(" ")===path}));
          matches.sort((a,b)=>Number(b.direct)-Number(a.direct)||a.ply-b.ply);
          const match=matches[0];if(!match)continue;
          candidates.push({pgn,game:{id:id(),source:pool,sourceUrl:pool==="masters"?`https://explorer.lichess.org/masters/pgn/${gameId}`:`https://lichess.org/${gameId}`,white:game.white,black:game.black,
            whiteRating,blackRating,learnerRating:stronger,date:game.playedAt,result:game.result,transposition:!match.direct,
            reason:target.savedPly===0?"Matches the starting board. Choose a later saved position for a more specific example.":match.direct?"Follows your saved moves and continues from this position.":"Reaches the same position through a different move order or starting position."}});
        } catch(error) {
          failures++;
          if(Date.now()<this.cooldown) break;
        }
      }
      assertTarget();
      if(failures&&!candidates.length) throw new Error("Some Lichess games could not be downloaded or verified. Try Find games again. Your saved study games are still available.");
      // Compare ratings only within the online pool; over-the-board and
      // Lichess numbers are different scales. Each pool prefers direct routes.
      candidates.sort((a,b)=>Number(a.game.transposition)-Number(b.game.transposition)
        ||(a.game.source===b.game.source?(a.game.source==="online"?a.game.learnerRating-b.game.learnerRating:0):a.game.source==="online"?-1:1)
        ||a.game.sourceUrl.localeCompare(b.game.sourceUrl));
      for(const [key,entry] of this.examples) if(entry.expires<Date.now())this.examples.delete(key);
      while(this.examples.size>90)this.examples.delete(this.examples.keys().next().value!);
      const offered:typeof candidates=[];
      if(source==="both") {
        const online=candidates.filter(candidate=>candidate.game.source==="online"),masters=candidates.filter(candidate=>candidate.game.source==="masters");
        for(let index=0;offered.length<3&&(online[index]||masters[index]);index++) {
          if(online[index])offered.push(online[index]!);
          if(masters[index]&&offered.length<3)offered.push(masters[index]!);
        }
      } else offered.push(...candidates.slice(0,3));
      for(const candidate of offered)this.examples.set(candidate.game.id,{profile,target:{...target},expires:Date.now()+10*60_000,...candidate});
      this.db.prepare(`INSERT INTO opening_study_preferences(profile_id,lichess_rating) VALUES(?,?)
        ON CONFLICT(profile_id) DO UPDATE SET lichess_rating=excluded.lichess_rating`).run(profile,learnerRating);
      return {source,rating:learnerRating,learnerColor:context.learnerColor,games:offered.map(candidate=>candidate.game),partial:failures>0,
        message:offered.length?`${offered.length} ${source==="online"?"stronger-player examples found in Lichess's rapid and classical sample":"examples found in the selected "+source+" sample"}.${failures?" Some games were unavailable; you can retry.":""}`
        :"No verified continuation was found in the selected source sample. Try an earlier position. This is not an exhaustive search of every game."};
    } catch(error) {
      if(error instanceof Error&&["TimeoutError","AbortError","TypeError"].includes(error.name)) throw new Error("Lichess game search could not finish. Check your connection and try Find games again. Saved study still works.");
      throw error;
    } finally {this.busy.delete(profile);}
  }

  start(target:Target,exampleId:string) {
    const entry=this.examples.get(exampleId);
    if(!entry||entry.expires<Date.now()||entry.profile!==ensureActiveProfile(this.db)
      ||entry.target.repertoireId!==target.repertoireId||entry.target.lineId!==target.lineId||entry.target.savedPly!==target.savedPly
      ||position(entry.target.expectedFen)!==position(target.expectedFen)) throw new Error("This search result expired or belongs to another position. Find games again.");
    return this.study.startDiscovered(target.repertoireId,target.lineId,target.savedPly,target.expectedFen,entry.pgn,entry.game.sourceUrl);
  }
}

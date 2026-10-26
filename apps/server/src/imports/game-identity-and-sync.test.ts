import path from "node:path";
import {afterEach,describe,expect,it} from "vitest";
import {Database} from "../db/database.js";
import {ImportService} from "./import-service.js";
import {LichessSyncService} from "./lichess-sync-service.js";
import {parsePgnText} from "../chess/pgn.js";
const databases:Database[]=[];
afterEach(()=>{for(const db of databases.splice(0))db.close();});
function setup(){const database=new Database(":memory:",path.resolve("migrations"));databases.push(database);return {db:database.connection,imports:new ImportService(database.connection)};}
const pgn=(date="2026.10.20",opponent="Bob",clock="600+0",site="",moves="e4 e5",time="12:00:00")=>`[White "Alice"]\n[Black "${opponent}"]\n[UTCDate "${date}"]\n[UTCTime "${time}"]\n[TimeControl "${clock}"]\n[Site "${site}"]\n[Result "1-0"]\n\n1. ${moves} 1-0`;
describe("own-game identity",()=>{
 it("retains genuinely different games with identical moves while deduplicating annotated reexports",()=>{
  const {db,imports}=setup();const first=imports.import(pgn(),"Alice");
  expect(imports.import(pgn("2026.10.21"),"Alice").imported).toBe(1);
  expect(imports.import(pgn("2026.10.20","Carol"),"Alice").imported).toBe(1);
  expect(imports.import(pgn("2026.10.20","Bob","180+2"),"Alice").imported).toBe(1);
  expect(imports.import(pgn().replace("e4","e4 {a comment}"),"Alice").duplicates).toBe(1);
  expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(4);
  expect(db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBe(0);expect(first.jobId).toBeNull();
 });
 it("uses source game IDs and allows both learner profiles to retain the encounter",()=>{
  const {db,imports}=setup();const original=pgn("2026.10.20","Bob","600+0","https://lichess.org/abcd1234");
  const a=imports.import(original,"Alice");expect(imports.import(original,"Bob").imported).toBe(1);
  expect(imports.import(original.replace("2026.10.20","2026.10.21"),"Alice").duplicates).toBe(1);
  expect(imports.import(original.replace("abcd1234","abcd5678"),"Alice").imported).toBe(1);
  expect(db.prepare("SELECT COUNT(*) FROM games WHERE profile_id=?").pluck().get(a.profileId!)).toBe(2);
 });
 it("upgrades legacy identities without replacing game IDs and tolerates historical source collisions",()=>{
  const {db,imports}=setup();imports.import(pgn(),"Alice");imports.import(pgn("2026.10.21", "Bob", "600+0", "", "d4 d5"),"Alice");
  const before=db.prepare("SELECT id,headers_json FROM games ORDER BY created_at,id").all() as Array<{id:string;headers_json:string}>;
  for(const row of before){const headers={...JSON.parse(row.headers_json),Site:"https://lichess.org/abcd1234"};
   db.prepare("UPDATE games SET identity_key=NULL,fingerprint=content_fingerprint,headers_json=? WHERE id=?").run(JSON.stringify(headers),row.id);}
  const upgraded=new ImportService(db);
  expect(db.prepare("SELECT id FROM games ORDER BY created_at,id").all()).toEqual(before.map(({id})=>({id})));
  expect(db.prepare("SELECT COUNT(*) FROM games WHERE identity_key IS NOT NULL").pluck().get()).toBe(2);
  expect(upgraded.import(pgn("2026.10.20","Bob","600+0","https://lichess.org/abcd1234"),"Alice").duplicates).toBe(1);
  expect(db.pragma("foreign_key_check")).toEqual([]);
 });
});
function provider(){let available:string[]=[];let broken=false;const urls:URL[]=[];
 const fetcher:typeof fetch=async input=>{const url=new URL(String(input));if(url.pathname.startsWith("/api/user/"))return Response.json({username:"Alice"});urls.push(url);
  if(broken)return new Response("[White \"Alice\"]\n\n1. invalid");
  const since=Number(url.searchParams.get("since")??0),max=Number(url.searchParams.get("max"));
  const filtered=available.filter(text=>Date.parse(parsePgnText(text).games[0]!.playedAt!)>=since)
   .sort((a,b)=>(Date.parse(parsePgnText(a).games[0]!.playedAt!)-Date.parse(parsePgnText(b).games[0]!.playedAt!))*(url.searchParams.get("sort")==="dateAsc"?1:-1));
  return new Response(filtered.slice(0,max).join("\n\n"));};
 return {fetcher,urls,set:(games:string[])=>{available=games;},break:()=>{broken=true;}};
}
describe("complete incremental sync",()=>{
 it("drains a backlog over bounded batches and restarts without skipping equal-timestamp games",async()=>{
  const {db,imports}=setup(),remote=provider();let service=new LichessSyncService(db,imports,undefined,remote.fetcher);
  await service.connect("Alice");remote.set([pgn()]);expect((await service.sync(2)).imported).toBe(1);
  remote.set([pgn(),pgn("2026.10.20","B2","600+0","https://lichess.org/game0002","d4 d5","12:01:00"),
   pgn("2026.10.20","B3","600+0","https://lichess.org/game0003","c4 e5","12:01:00"),pgn("2026.10.20","B4","600+0","https://lichess.org/game0004","Nf3 d5","12:01:00")]);
  expect(await service.sync(2)).toMatchObject({imported:2,connection:{moreAvailable:true}});
  service=new LichessSyncService(db,imports,undefined,remote.fetcher);
  expect(await service.sync(2)).toMatchObject({imported:1,connection:{moreAvailable:false}});
  expect((await service.sync(100)).imported).toBe(0);
  expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(4);
  expect(remote.urls[1]!.searchParams.get("sort")).toBe("dateAsc");
  expect(db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBe(0);
 });
 it("advances safely through games already pasted into the library before reaching unseen games",async()=>{
  const {db,imports}=setup(),remote=provider(),service=new LichessSyncService(db,imports,undefined,remote.fetcher);
  await service.connect("Alice");remote.set([pgn()]);await service.sync(1);
  const known=[1,2,3].map(n=>pgn("2026.10.20",`Known ${n}`,"600+0",`https://lichess.org/known00${n}`,n===1?"d4 d5":n===2?"c4 e5":"Nf3 d5",`12:0${n}:00`));
  for(const game of known)imports.import(game,"Alice");
  const fresh=pgn("2026.10.20","New","600+0","https://lichess.org/fresh001","g3 e5","12:04:00");remote.set([pgn(),...known,fresh]);
  let imported=0;for(let attempt=0;attempt<6;attempt++){const batch=await service.sync(1);imported+=batch.imported;if(!batch.connection.moreAvailable)break;}
  expect(imported).toBe(1);expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(5);
 });
 it("keeps the sync boundary and saved games unchanged after a partially invalid response",async()=>{
  const {db,imports}=setup(),remote=provider(),service=new LichessSyncService(db,imports,undefined,remote.fetcher);
  await service.connect("Alice");remote.set([pgn()]);await service.sync(2);
  const before=service.connection();remote.break();await expect(service.sync(2)).rejects.toThrow("Nothing was skipped");
  expect(service.connection()).toEqual(before);expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(1);
 });
});

describe("connection profile ownership",()=>{
 it("keeps a slow account connection on the player who requested it",async()=>{
  const {db,imports}=setup();const original=imports.import(pgn(),"Alice").profileId!;
  let finish!:(response:Response)=>void;
  const fetcher:typeof fetch=()=>new Promise<Response>(resolve=>{finish=resolve;});
  const service=new LichessSyncService(db,imports,undefined,fetcher);
  const pending=service.connect("Alice");
  db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES ('other','Other','2026-10-26')").run();
  db.prepare("UPDATE app_state SET value='other' WHERE key='active_profile_id'").run();
  finish(Response.json({username:"Alice"}));await pending;
  expect(db.prepare("SELECT profile_id FROM lichess_connections").pluck().get()).toBe(original);
  expect(service.connection().connected).toBe(false);
 });
});

import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { setActiveProfile } from "../training/profile.js";
import { ImportService } from "./import-service.js";
import { ChessComImportService } from "./chesscom-import-service.js";

const databases: Database[] = [];
afterEach(() => { vi.useRealTimers(); for (const db of databases.splice(0)) db.close(); });
function game(id = "12345", black = false) {
  return { rules: "chess", url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Site "Chess.com"]\n[White "${black ? "Bob" : "Alice"}"]\n[Black "${black ? "Alice" : "Bob"}"]\n[UTCDate "2026.10.20"]\n[UTCTime "12:00:00"]\n[WhiteElo "1200"]\n[BlackElo "1250"]\n[TimeControl "600+0"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0` };
}
function setup() {
  const database = new Database(":memory:", path.resolve("migrations")); databases.push(database);
  const db = database.connection, imports = new ImportService(db);
  let games: unknown[] = [game(), game("12346", true)];
  let status = 200;
  let archives: unknown = ['2026-10', '2026-11'].map(month => `https://api.chess.com/pub/player/alice/games/${month.replace('-', '/')}`);
  const monthGames = new Map<string, unknown[]>(), monthStatuses = new Map<string, number>();
  const urls: string[] = [];
  const fetcher: typeof fetch = async input => {
    urls.push(String(input));
    if (status !== 200) return new Response("", { status });
    if (String(input).endsWith('/archives')) return Response.json({archives});
    const month = String(input).match(/\/games\/(\d{4})\/(\d{2})$/)?.slice(1).join('-');
    if (month && monthStatuses.has(month)) return new Response('', {status: monthStatuses.get(month)!});
    if (month && monthGames.has(month)) return Response.json({games: monthGames.get(month)});
    return Response.json(String(input).includes("/games/") ? { games } : { username: "Alice" });
  };
  const service = new ChessComImportService(db, imports, fetcher);
  return { db, imports, service, urls, fetcher, setGames: (value: unknown[]) => { games = value; }, setStatus: (value: number) => { status = value; },
    setArchives: (value: unknown) => { archives = value; }, setMonth: (month: string, value: unknown[]) => monthGames.set(month, value),
    setMonthStatus: (month: string, value: number) => monthStatuses.set(month, value) };
}

describe("Chess.com own-game imports", () => {
  it("imports both colours, retains metadata and deduplicates pasted and repeated exports without starting analysis", async () => {
    const { db, imports, service } = setup();
    await service.connect("alice");
    expect(await service.importMonth("2026-10")).toMatchObject({ imported: 2, duplicates: 0, jobId: null, skipped: 0 });
    const rows = db.prepare("SELECT id,player_color,headers_json FROM games ORDER BY player_color").all() as Array<{id: string; player_color: string; headers_json: string}>;
    expect(rows.map(row => row.player_color)).toEqual(["black", "white"]);
    expect(JSON.parse(rows[0]!.headers_json)).toMatchObject({ TimeControl: "600+0", WhiteElo: "1200" });
    expect(await service.importMonth("2026-10")).toMatchObject({ imported: 0, duplicates: 2 });
    expect(imports.import(game().pgn.replace('[Site "Chess.com"]', '[Site "https://www.chess.com/game/live/12345"]'), "Alice").duplicates).toBe(1);
    expect(db.prepare("SELECT id,player_color,headers_json FROM games ORDER BY player_color").all()).toEqual(rows);
    expect(db.prepare("SELECT COUNT(*) FROM jobs").pluck().get()).toBe(0);
    expect(db.pragma("foreign_key_check")).toEqual([]);
    expect(new ChessComImportService(db, imports).connection()).toMatchObject({ connected: true, username: "Alice", lastMonth: "2026-10" });
  });

  it("skips explicit variants and unfinished games while retaining finished standard games", async () => {
    const { service, setGames } = setup(); await service.connect("Alice");
    setGames([game(), { rules: "chess960" }, { ...game("56789"), pgn: game("56789").pgn.replaceAll('1-0', '*') }]);
    expect(await service.importMonth("2026-10")).toMatchObject({ imported: 1, skipped: 2, rejected: 0 });
  });

  it("makes an empty month explicit without deleting existing games", async () => {
    const { db, service, setGames } = setup(); await service.connect("Alice"); await service.importMonth("2026-10"); setGames([]);
    expect(await service.importMonth("2026-09")).toMatchObject({ imported: 0, duplicates: 0, connection: { lastMonth: "2026-09" } });
    expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(2);
  });

  it.each([
    { rules: "chess", url: game().url, pgn: "not a PGN" },
    { ...game(), pgn: game().pgn.replace("Alice", "Other") },
    { ...game(), pgn: game().pgn.replace("Bob", "Alice") },
    { ...game(), url: "https://example.com/game/live/12345" },
    { ...game(), pgn: game().pgn.replace('[Site "Chess.com"]', '[Site "https://www.chess.com/game/live/99999"]') },
    null,
  ])("rejects a partially invalid archive atomically: %j", async invalid => {
    const { db, service, setGames } = setup(); await service.connect("Alice"); const before = service.connection();
    setGames([game(), invalid]); await expect(service.importMonth("2026-10")).rejects.toThrow();
    expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(0);
    expect(service.connection()).toEqual(before);
  });

  it("retains account and import state on provider failures and permits retry", async () => {
    const { db, service, setStatus } = setup(); await service.connect("Alice"); const before = service.connection();
    setStatus(429); await expect(service.importMonth("2026-10")).rejects.toThrow("limiting requests");
    setStatus(404); await expect(service.connect("Alice")).rejects.toThrow("not found");
    expect(service.connection()).toEqual(before); expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(0);
    setStatus(200); expect((await service.importMonth("2026-10")).imported).toBe(2);
  });

  it("validates month, username and account before requesting an archive", async () => {
    const { service, urls } = setup();
    await expect(service.connect("../oops")).rejects.toThrow("valid Chess.com username");
    await expect(service.importMonth("2026-10")).rejects.toThrow("Connect");
    for (const month of ["2026-13", "2026-00", "2026-1", "2006-12", "9999-01", "../../etc"]) await expect(service.importMonth(month)).rejects.toThrow("Choose a month");
    expect(urls).toEqual([]);
  });

  it("keeps slow connections and imports on the requesting profile", async () => {
    const { db, imports } = setup();
    const pendingResponses: Array<(value: Response) => void> = [];
    const service = new ChessComImportService(db, imports, async () => new Promise(resolve => pendingResponses.push(resolve)));
    const connecting = service.connect("Alice"); await Promise.resolve();
    const original = db.prepare("SELECT value FROM app_state WHERE key='active_profile_id'").pluck().get();
    db.prepare("INSERT INTO player_profiles(id,display_name,created_at) VALUES ('other','Other','2026-10-31')").run();
    setActiveProfile(db, "other"); pendingResponses.shift()!(Response.json({ username: "Alice" })); await connecting;
    expect(service.connection().connected).toBe(false);
    setActiveProfile(db, String(original)); const importing = service.importMonth("2026-10"); await Promise.resolve();
    setActiveProfile(db, "other"); pendingResponses.shift()!(Response.json({ games: [game()] })); await importing;
    expect(db.prepare("SELECT profile_id FROM games").pluck().get()).toBe(original);
    expect(service.connection().connected).toBe(false);
  });

  it("rejects a response if the account changed while importing", async () => {
    const { db, imports, service: connected } = setup(); await connected.connect("Alice");
    let finish!: (value: Response) => void;
    const service = new ChessComImportService(db, imports, async () => new Promise(resolve => { finish = resolve; }));
    const pending = service.importMonth("2026-10"); await Promise.resolve();
    db.prepare("UPDATE chesscom_connections SET username='Bob'").run(); finish(Response.json({ games: [game()] }));
    await expect(pending).rejects.toThrow("account changed"); expect(db.prepare("SELECT COUNT(*) FROM games").pluck().get()).toBe(0);
  });

  it("serializes public API requests and recovers its queue after failures", async () => {
    const { db, imports } = setup(); let active = 0, maxActive = 0, requests = 0;
    const service = new ChessComImportService(db, imports, async () => {
      active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; requests++;
      return requests === 1 ? new Response("", { status: 429 }) : Response.json({ username: "Alice" });
    });
    const results = await Promise.allSettled([service.connect("Alice"), service.connect("Alice")]);
    expect(results.map(result => result.status)).toEqual(["rejected", "fulfilled"]); expect(maxActive).toBe(1);
  });

  it("enforces the response size limit even without a content-length header", async () => {
    const { db, imports } = setup();
    const service = new ChessComImportService(db, imports, async () => new Response(" ".repeat(10 * 1024 * 1024 + 1)));
    await expect(service.connect("Alice")).rejects.toThrow("exceeds 10 MB"); expect(service.connection().connected).toBe(false);
  });
});

describe('Chess.com recent sync', () => {
  beforeEach(() => { vi.useFakeTimers({toFake: ['Date']}); vi.setSystemTime(new Date('2026-11-22T12:00:00Z')); });

  it('catches October to November rollover, preserves analysis/attempts/schedules and persists freshness independently of manual imports', async () => {
    const {db, imports, service, fetcher, urls, setMonth} = setup();
    await service.connect('Alice'); await service.importMonth('2026-10');
    const move = db.prepare('SELECT id,game_id FROM moves LIMIT 1').get() as {id: string; game_id: string};
    const profile = service.connection().profileId;
    db.prepare("UPDATE games SET analyzed_at='2026-11-01' WHERE id=?").run(move.game_id);
    db.prepare("INSERT INTO analysis_runs(id,game_id,engine_name,engine_version,depth,multipv,threads,hash_mb,analysis_version,status,started_at,completed_at) VALUES ('saved',?,'Stockfish','18',14,3,1,128,1,'completed','2026-11-01','2026-11-01')").run(move.game_id);
    db.prepare("INSERT INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at) VALUES ('learned',?,?,?,'diagnosis_only',2,'2026-11-01')").run(profile,move.game_id,move.id);
    db.prepare("INSERT INTO review_states(item_id,mastery_level,due_at,attempts,successes) VALUES ('learned',3,'2026-12-01',2,2)").run();
    db.prepare("INSERT INTO training_attempts(id,item_id,answered_at,score,outcome,created_at) VALUES ('completed','learned','2026-11-01',1,'excellent','2026-11-01')").run();
    const snapshot = () => ['analysis_runs','training_attempts','review_states'].map(table => db.prepare(`SELECT * FROM ${table}`).all());
    const history = snapshot();
    setMonth('2026-11', [game('23456')]);
    const result = await service.sync({profileId:profile,username:'Alice'});
    expect(result).toMatchObject({imported:1,duplicates:2,jobId:null,checkedMonths:['2026-10','2026-11'],connection:{lastSyncMonth:'2026-11',lastSyncedAt:'2026-11-22T12:00:00.000Z'}});
    expect(snapshot()).toEqual(history);
    expect(db.prepare('SELECT analyzed_at FROM games WHERE id=?').pluck().get(move.game_id)).toBe('2026-11-01');
    expect(db.prepare('SELECT COUNT(*) FROM jobs').pluck().get()).toBe(0);
    const restarted = new ChessComImportService(db, imports, fetcher), requests = urls.length;
    expect(await restarted.sync(undefined,true)).toMatchObject({imported:0,checkedMonths:[]});
    expect(urls).toHaveLength(requests);
    expect(await restarted.sync()).toMatchObject({imported:0,duplicates:3});
    await restarted.importMonth('2026-09');
    expect(restarted.connection()).toMatchObject({lastMonth:'2026-09',lastSyncMonth:'2026-11',lastSyncedAt:result.connection.lastSyncedAt});
    vi.setSystemTime(new Date('2026-11-23T01:00:00Z'));
    expect(await restarted.sync(undefined,true)).toMatchObject({checkedMonths:['2026-10','2026-11']});
    expect(snapshot()).toEqual(history); expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('probes current month despite a lagging archive index and rechecks both months for delayed games', async () => {
    const {service,setArchives,setMonth} = setup(); await service.connect('Alice');
    setArchives(['https://api.chess.com/pub/player/alice/games/2026/10']);
    setMonth('2026-11',[game('23456')]);
    expect(await service.sync()).toMatchObject({imported:3,checkedMonths:['2026-10','2026-11']});
    setMonth('2026-10',[game(),game('12346',true),game('34567')]);
    expect(await service.sync()).toMatchObject({imported:1,duplicates:3});
  });

  it('handles unpublished recent archives without calling it a provider failure', async () => {
    const {service,setArchives,setMonthStatus,db} = setup(); await service.connect('Alice');
    setArchives([]); setMonthStatus('2026-10',404); setMonthStatus('2026-11',404);
    expect(await service.sync()).toMatchObject({imported:0,checkedMonths:['2026-10','2026-11'],connection:{lastSyncMonth:'2026-11'}});
    expect(db.prepare('SELECT COUNT(*) FROM games').pluck().get()).toBe(0);
  });

  it('saves neither a partial multi-month batch nor a freshness marker on failure, and permits safe retry', async () => {
    const {service,setMonthStatus,setMonth,db} = setup(); await service.connect('Alice');
    setMonthStatus('2026-11',429); const before=service.connection();
    await expect(service.sync()).rejects.toThrow('limiting requests');
    expect(service.connection()).toEqual(before); expect(db.prepare('SELECT COUNT(*) FROM games').pluck().get()).toBe(0);
    setMonthStatus('2026-11',404); await expect(service.sync()).rejects.toThrow('not found');
    setMonthStatus('2026-11',200); // An empty HTTP body is also a failure, never a successful empty month.
    await expect(service.sync()).rejects.toThrow(); expect(service.connection()).toEqual(before);
    setMonthStatus('2026-11',429);
    const retried = new ChessComImportService(db,new ImportService(db),async input => String(input).endsWith('/2026/11')?Response.json({games:[game('23456')]}):
      String(input).endsWith('/archives')?Response.json({archives:['https://api.chess.com/pub/player/alice/games/2026/10']}):Response.json({games:[game()]}));
    expect(await retried.sync()).toMatchObject({imported:2});
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it.each(['https://example.com/pub/player/alice/games/2026/11','https://api.chess.com/pub/player/bob/games/2026/11','https://api.chess.com/pub/player/alice/games/2026/13'])('rejects an untrusted archive URL: %s', async url => {
    const {service,setArchives,db,urls}=setup(); await service.connect('Alice'); setArchives([url]);
    await expect(service.sync()).rejects.toThrow('unexpected archive link');
    expect(urls).toHaveLength(2); expect(db.prepare('SELECT COUNT(*) FROM games').pluck().get()).toBe(0);
    expect(service.connection().lastSyncedAt).toBeNull();
  });

  it('catches missed months, bounds old history, and handles January rollover', async () => {
    const {service,setArchives,setMonth,db,urls}=setup(); await service.connect('Alice');
    db.prepare("UPDATE chesscom_connections SET last_month='2024-01'").run();
    const months=['2024-01','2025-11','2025-12','2026-01','2026-08','2026-09','2026-10','2026-11'];
    setArchives(months.map(month=>`https://api.chess.com/pub/player/alice/games/${month.replace('-','/')}`));
    for(const [index,month] of months.entries())setMonth(month,[game(String(index+100))]);
    expect(await service.sync()).toMatchObject({checkedMonths:['2025-12','2026-01','2026-08','2026-09','2026-10','2026-11'],message:expect.stringContaining('12 months')});
    expect(urls.some(url=>url.endsWith('/2024/01'))).toBe(false);
    vi.setSystemTime(new Date('2027-01-02T00:00:00Z'));setArchives([]);setMonth('2026-12',[]);setMonth('2027-01',[]);
    expect(await service.sync()).toMatchObject({checkedMonths:['2026-12','2027-01']});
  });

  it('rejects stale UI account/profile requests before any network traffic', async () => {
    const {service,urls}=setup();await service.connect('Alice'); const requests=urls.length;
    await expect(service.sync({profileId:'other'})).rejects.toThrow('player changed');
    await expect(service.sync({username:'Bob'})).rejects.toThrow('account changed');
    expect(urls).toHaveLength(requests);
  });

  it('retries a transient provider failure serially, without retrying rate limits', async () => {
    const {db,imports,service:connected}=setup();await connected.connect('Alice');let count=0;
    const service=new ChessComImportService(db,imports,async input=>{
      count++;if(count===1)return new Response('',{status:503});
      return Response.json(String(input).endsWith('/archives')?{archives:[]}:{games:[game()]});
    });
    expect(await service.sync()).toMatchObject({imported:1,duplicates:1});expect(count).toBe(4);
    const failing=new ChessComImportService(db,imports,async()=>{count++;return new Response('',{status:429});});const before=count;
    await expect(failing.sync()).rejects.toThrow('limiting requests');expect(count-before).toBe(1);
  });
});

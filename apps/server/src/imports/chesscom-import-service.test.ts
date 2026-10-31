import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Database } from "../db/database.js";
import { setActiveProfile } from "../training/profile.js";
import { ImportService } from "./import-service.js";
import { ChessComImportService } from "./chesscom-import-service.js";

const databases: Database[] = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
function game(id = "12345", black = false) {
  return { rules: "chess", url: `https://www.chess.com/game/live/${id}`,
    pgn: `[Site "Chess.com"]\n[White "${black ? "Bob" : "Alice"}"]\n[Black "${black ? "Alice" : "Bob"}"]\n[UTCDate "2026.10.20"]\n[UTCTime "12:00:00"]\n[WhiteElo "1200"]\n[BlackElo "1250"]\n[TimeControl "600+0"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0` };
}
function setup() {
  const database = new Database(":memory:", path.resolve("migrations")); databases.push(database);
  const db = database.connection, imports = new ImportService(db);
  let games: unknown[] = [game(), game("12346", true)];
  let status = 200;
  const urls: string[] = [];
  const fetcher: typeof fetch = async input => {
    urls.push(String(input));
    if (status !== 200) return new Response("", { status });
    return Response.json(String(input).includes("/games/") ? { games } : { username: "Alice" });
  };
  const service = new ChessComImportService(db, imports, fetcher);
  return { db, imports, service, urls, setGames: (value: unknown[]) => { games = value; }, setStatus: (value: number) => { status = value; } };
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

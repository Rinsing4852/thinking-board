import type {
  LichessConnectionResponse,
  LichessSyncResponse,
} from "../../../../packages/contracts/src/api.js";
import { normalizePlayerName, parsePgnText } from "../chess/pgn.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";
import { ImportService } from "./import-service.js";

type FetchLike = typeof fetch;

interface ConnectionRow {
  profile_id: string;
  username: string;
  last_synced_at: string | null;
  last_game_at: string | null;
  more_available:number;
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class LichessSyncService {
  private readonly syncing=new Set<string>();
  constructor(
    private readonly db: SqliteDatabase,
    private readonly imports: ImportService,
    private readonly apiToken?: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  connection(): LichessConnectionResponse {
    const profileId = ensureActiveProfile(this.db);
    return this.connectionFor(profileId);
  }

  async connect(rawUsername: string): Promise<LichessConnectionResponse> {
    const username = rawUsername.trim();
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(username)) {
      throw new Error("Enter a valid Lichess username");
    }
    const profileId=ensureActiveProfile(this.db);
    const response = await this.fetcher(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
      headers: this.headers("application/json"),
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 404) throw new Error("That Lichess account was not found");
    if (!response.ok) throw new Error(this.remoteError(response.status));
    const account = await response.json() as { username?: unknown; id?: unknown };
    const canonical = typeof account.username === "string"
      ? account.username
      : typeof account.id === "string" ? account.id : username;
    const timestamp = now();
    this.db.prepare(`
      INSERT INTO lichess_connections(
        profile_id, username, normalized_username, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(profile_id) DO UPDATE SET
        username = excluded.username,
        normalized_username = excluded.normalized_username,
        last_synced_at = CASE
          WHEN lichess_connections.normalized_username = excluded.normalized_username
          THEN lichess_connections.last_synced_at ELSE NULL END,
        last_game_at = CASE
          WHEN lichess_connections.normalized_username = excluded.normalized_username
          THEN lichess_connections.last_game_at ELSE NULL END,
        more_available=CASE WHEN lichess_connections.normalized_username=excluded.normalized_username THEN lichess_connections.more_available ELSE 0 END,
        updated_at = excluded.updated_at
    `).run(profileId, canonical, normalizePlayerName(canonical), timestamp, timestamp);
    this.imports.linkAlias(profileId,canonical);
    return this.connectionFor(profileId);
  }

  async sync(maxGames = 50): Promise<LichessSyncResponse> {
    const profileId = ensureActiveProfile(this.db);
    if(this.syncing.has(profileId))throw new Error("A sync is already running for this player.");
    this.syncing.add(profileId);
    try { return await this.syncProfile(profileId,maxGames); }
    finally { this.syncing.delete(profileId); }
  }

  private async syncProfile(profileId:string,maxGames:number):Promise<LichessSyncResponse> {
    const row = this.row(profileId);
    if (!row) throw new Error("Connect a Lichess username before syncing games");
    if (!Number.isInteger(maxGames) || maxGames < 1 || maxGames > 100) {
      throw new Error("Choose between 1 and 100 games per sync");
    }

    const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(row.username)}`);
    // Incremental batches move oldest-first. Include the saved boundary second
    // and enough overlap/lookahead to avoid skipping equal-timestamp games.
    const since=row.last_game_at?Math.max(1356998400070,Date.parse(row.last_game_at)-1000):null;
    const overlap=since===null?0:Number(this.db.prepare("SELECT COUNT(*) FROM games WHERE profile_id=? AND julianday(played_at)>=julianday(?) AND julianday(played_at)<=julianday(?)").pluck().get(profileId,new Date(since).toISOString(),row.last_game_at));
    const requestLimit=row.last_game_at?Math.min(1000,maxGames+overlap+1):maxGames;
    if(overlap>=999)throw new Error("Too many games share this sync boundary. Import a PGN export to continue safely.");
    url.searchParams.set("max", String(requestLimit));
    url.searchParams.set("moves", "true");
    url.searchParams.set("tags", "true");
    url.searchParams.set("opening", "true");
    url.searchParams.set("finished", "true");
    url.searchParams.set("sort",row.last_game_at?"dateAsc":"dateDesc");
    if (row.last_game_at) {
      const last = Date.parse(row.last_game_at);
      if (Number.isFinite(last)) url.searchParams.set("since", String(since));
    }

    const response = await this.fetcher(url, {
      headers: this.headers("application/x-chess-pgn"),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(this.remoteError(response.status));
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("Lichess returned more than 5 MB; sync fewer games at once");
    const pgn = await response.text();
    if (pgn.length > MAX_RESPONSE_BYTES) throw new Error("Lichess returned more than 5 MB; sync fewer games at once");

    if(this.row(profileId)?.username!==row.username)throw new Error("The connected account changed. Sync the current account again.");
    if(!pgn.trim()) {
      this.updateSync(profileId,now(),row.last_game_at,false);
      return {batchId:"",jobId:null,imported:0,duplicates:0,rejected:0,errors:[],connection:this.connectionFor(profileId),message:"No new finished games were found."};
    }
    const parsed=parsePgnText(pgn);
    if(parsed.errors.length||parsed.games.some(game=>!game.playedAt||!Number.isFinite(Date.parse(game.playedAt))
      ||![game.white,game.black].some(name=>normalizePlayerName(name)===normalizePlayerName(row.username))))
      throw new Error("Some downloaded games could not be verified. Nothing was skipped; sync again to retry.");
    const unseen=[...new Map(parsed.games.map(game=>[game.identityKey,game])).values()].filter(game=>!this.imports.hasGame(profileId,game))
      .sort((a,b)=>Date.parse(a.playedAt!)-Date.parse(b.playedAt!)||a.identityKey.localeCompare(b.identityKey));
    const selected=unseen.slice(0,maxGames);
    const pendingAt=unseen[maxGames]?.playedAt;
    const selectedKeys=new Set(selected.map(game=>game.identityKey));
    // Already saved exports also advance a verified prefix, but never jump
    // beyond an unseen game left for the next batch.
    const newest=parsed.games.filter(game=>(selectedKeys.has(game.identityKey)||this.imports.hasGame(profileId,game))
      &&(!pendingAt||Date.parse(game.playedAt!)<=Date.parse(pendingAt)))
      .map(game=>game.playedAt!).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??row.last_game_at;
    const latestGameAt=row.last_game_at&&newest&&Date.parse(row.last_game_at)>Date.parse(newest)?row.last_game_at:newest;
    const more=Boolean(row.last_game_at&&(unseen.length>selected.length||parsed.games.length>=requestLimit));
    if(more&&!selected.length&&(!latestGameAt||Date.parse(latestGameAt)<=Date.parse(row.last_game_at!)))throw new Error("The sync boundary could not advance safely. Retry or import a PGN export; no games were skipped.");
    return this.db.transaction(()=>{
      const imported=selected.length?this.imports.importIntoProfile(selected.map(game=>game.originalPgn).join("\n\n"),row.username,profileId)
        :{batchId:"",profileId,jobId:null,imported:0,duplicates:0,rejected:0,errors:[]};
      this.updateSync(profileId,now(),latestGameAt,more);
      return {...imported,duplicates:parsed.games.length-unseen.length,connection:this.connectionFor(profileId),
        message:(imported.imported?`${imported.imported} new Lichess games saved. Choose which games to analyse.`:"Your latest Lichess games were already imported.")
          +(more?" More games are waiting. Continue syncing to save the next batch.":"")};
    })();
  }

  private headers(accept: string): HeadersInit {
    return {
      Accept: accept,
      "User-Agent": "ThinkingBoard/1.0 (self-hosted chess trainer)",
      ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
    };
  }

  private remoteError(status: number): string {
    if (status === 401 || status === 403) return "Lichess refused the configured token. Check LICHESS_API_TOKEN.";
    if (status === 429) return "Lichess is rate-limiting requests. Wait a minute, then try again.";
    return `Lichess could not be reached (HTTP ${status})`;
  }

  private row(profileId: string): ConnectionRow | undefined {
    return this.db.prepare(`
      SELECT profile_id, username, last_synced_at, last_game_at,more_available
      FROM lichess_connections WHERE profile_id = ?
    `).get(profileId) as ConnectionRow | undefined;
  }

  private connectionFor(profileId: string): LichessConnectionResponse {
    const row = this.row(profileId);
    return {
      connected: Boolean(row),
      username: row?.username ?? null,
      lastSyncedAt: row?.last_synced_at ?? null,
      lastGameAt: row?.last_game_at ?? null,
      tokenConfigured: Boolean(this.apiToken),
      moreAvailable:Boolean(row?.more_available),
    };
  }

  private updateSync(profileId: string, syncedAt: string, gameAt: string | null,more:boolean): void {
    this.db.prepare(`
      UPDATE lichess_connections
      SET last_synced_at = ?, last_game_at = ?, updated_at = ?,more_available=?
      WHERE profile_id = ?
    `).run(syncedAt, gameAt, syncedAt,Number(more), profileId);
  }
}

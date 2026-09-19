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
}

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export class LichessSyncService {
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
    const profileId = ensureActiveProfile(this.db);
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
        updated_at = excluded.updated_at
    `).run(profileId, canonical, normalizePlayerName(canonical), timestamp, timestamp);
    return this.connectionFor(profileId);
  }

  async sync(maxGames = 50): Promise<LichessSyncResponse> {
    const profileId = ensureActiveProfile(this.db);
    const row = this.row(profileId);
    if (!row) throw new Error("Connect a Lichess username before syncing games");
    if (!Number.isInteger(maxGames) || maxGames < 1 || maxGames > 100) {
      throw new Error("Choose between 1 and 100 games per sync");
    }

    const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(row.username)}`);
    url.searchParams.set("max", String(maxGames));
    url.searchParams.set("moves", "true");
    url.searchParams.set("tags", "true");
    url.searchParams.set("opening", "true");
    url.searchParams.set("finished", "true");
    url.searchParams.set("sort", "dateDesc");
    if (row.last_game_at) {
      const last = Date.parse(row.last_game_at);
      if (Number.isFinite(last)) url.searchParams.set("since", String(Math.max(1356998400070, last - 1_000)));
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

    const parsed = parsePgnText(pgn);
    const latestGameAt = parsed.games
      .map((game) => game.playedAt)
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? row.last_game_at;
    const timestamp = now();

    if (parsed.games.length === 0) {
      this.updateSync(row.profile_id, timestamp, latestGameAt);
      return {
        batchId: "",
        jobId: null,
        imported: 0,
        duplicates: 0,
        rejected: 0,
        errors: [],
        connection: this.connectionFor(profileId),
        message: "No new finished games were found.",
      };
    }

    const imported = this.imports.importIntoProfile(pgn, row.username, profileId);
    this.updateSync(row.profile_id, timestamp, latestGameAt);
    return {
      ...imported,
      connection: this.connectionFor(profileId),
      message: imported.imported > 0
        ? `${imported.imported} new Lichess game${imported.imported === 1 ? "" : "s"} imported for local analysis.`
        : "Your latest Lichess games were already imported.",
    };
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
      SELECT profile_id, username, last_synced_at, last_game_at
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
    };
  }

  private updateSync(profileId: string, syncedAt: string, gameAt: string | null): void {
    this.db.prepare(`
      UPDATE lichess_connections
      SET last_synced_at = ?, last_game_at = ?, updated_at = ?
      WHERE profile_id = ?
    `).run(syncedAt, gameAt, syncedAt, profileId);
  }
}

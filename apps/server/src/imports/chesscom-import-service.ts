import type { ChessComConnectionResponse, ChessComImportResponse } from "../../../../packages/contracts/src/api.js";
import { gameIdentity, normalizePlayerName, parsePgnText } from "../chess/pgn.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";
import { ImportService } from "./import-service.js";

interface ConnectionRow {
  username: string;
  last_imported_at: string | null;
  last_month: string | null;
}
const MAX_BYTES = 10 * 1024 * 1024;

/** Explicit monthly imports reuse the own-game pipeline; they never request analysis. */
export class ChessComImportService {
  // Serialize provider requests across profiles to respect PubAPI guidance.
  private requestTail: Promise<unknown> = Promise.resolve();
  private readonly importing = new Set<string>();

  constructor(private readonly db: SqliteDatabase, private readonly imports: ImportService,
    private readonly fetcher: typeof fetch = fetch) {}

  connection(): ChessComConnectionResponse {
    return this.connectionFor(ensureActiveProfile(this.db));
  }

  async connect(rawUsername: string): Promise<ChessComConnectionResponse> {
    const username = rawUsername.trim();
    if (!/^[a-zA-Z0-9_-]{2,25}$/.test(username)) throw new Error("Enter a valid Chess.com username");
    const profileId = ensureActiveProfile(this.db);
    const account = await this.request(`/pub/player/${encodeURIComponent(username.toLowerCase())}`);
    if (typeof account.username !== "string" || normalizePlayerName(account.username) !== normalizePlayerName(username)) {
      throw new Error("Chess.com returned an unexpected account. Nothing was changed.");
    }
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO chesscom_connections(profile_id, username, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET username=excluded.username, updated_at=excluded.updated_at,
        last_imported_at=CASE WHEN lower(chesscom_connections.username)=lower(excluded.username) THEN chesscom_connections.last_imported_at ELSE NULL END,
        last_month=CASE WHEN lower(chesscom_connections.username)=lower(excluded.username) THEN chesscom_connections.last_month ELSE NULL END`)
        .run(profileId, account.username, now());
      this.imports.linkAlias(profileId, account.username as string);
    })();
    return this.connectionFor(profileId);
  }

  async importMonth(month: string): Promise<ChessComImportResponse> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2007-01" || month > now().slice(0, 7)) {
      throw new Error("Choose a month from January 2007 through the current month");
    }
    const profileId = ensureActiveProfile(this.db);
    const row = this.row(profileId);
    if (!row) throw new Error("Connect your Chess.com username first");
    if (this.importing.has(profileId)) throw new Error("A Chess.com import is already running for this player");
    this.importing.add(profileId);
    try {
      const data = await this.request(`/pub/player/${encodeURIComponent(row.username.toLowerCase())}/games/${month.replace("-", "/")}`);
      if (!Array.isArray(data.games) || data.games.length > 5000) {
        throw new Error("Chess.com returned an invalid or oversized archive. Use a PGN export instead.");
      }
      let skipped = 0;
      const pgns: string[] = [];
      for (const entry of data.games as Array<Record<string, unknown>>) {
        if (!entry || typeof entry !== "object" || typeof entry.rules !== "string") throw new Error("Invalid archive. No games were saved.");
        // Variants are deliberately excluded; do not train standard chess with different rules.
        if (entry.rules !== "chess") { skipped++; continue; }
        if (typeof entry.pgn !== "string" || typeof entry.url !== "string") throw new Error("Incomplete game data. No games were saved.");
        const source = gameIdentity({ Link: entry.url }, "");
        if (!source.startsWith("chesscom:")) throw new Error("Invalid game link. No games were saved.");
        const parsed = parsePgnText(entry.pgn);
        const game = parsed.games[0];
        if (parsed.errors.length || parsed.games.length !== 1 || !game || !game.playedAt || !Number.isFinite(Date.parse(game.playedAt))
          || [game.white, game.black].filter(name => normalizePlayerName(name) === normalizePlayerName(row.username)).length !== 1) {
          throw new Error("Some games could not be verified. No games were saved; retry or use a PGN export.");
        }
        if (!["1-0", "0-1", "1/2-1/2"].includes(game.result)) { skipped++; continue; }
        if ((game.identityKey.startsWith("chesscom:") || game.identityKey.startsWith("lichess:")) && game.identityKey !== source) throw new Error("Conflicting game links. No games were saved.");
        // Neutral Site headers are common in exports. Preserve the provider ID for
        // deduplication against pasted PGNs without inventing a new game identity.
        const [, kind, gameId] = source.split(":");
        pgns.push(game.identityKey === source ? entry.pgn
          : `[Link "https://www.chess.com/game/${kind}/${gameId}"]\n${entry.pgn.replace(/^\[Link\s+"[^"\n]*"\]\s*\n?/m, "")}`);
      }
      if (this.row(profileId)?.username !== row.username) throw new Error("The connected account changed. Import again for the current account.");
      return this.db.transaction(() => {
        const result = pgns.length ? this.imports.importIntoProfile(pgns.join("\n\n"), row.username, profileId)
          : { batchId: "", profileId, jobId: null, imported: 0, duplicates: 0, rejected: 0, errors: [] };
        if (result.rejected) throw new Error("Some games could not be saved. No games were saved; retry or use a PGN export.");
        this.db.prepare("UPDATE chesscom_connections SET last_imported_at=?,last_month=?,updated_at=? WHERE profile_id=?")
          .run(now(), month, now(), profileId);
        return { ...result, skipped, connection: this.connectionFor(profileId),
          message: `${result.imported} new Chess.com games saved · ${result.duplicates} already saved · ${skipped} variants or unfinished games skipped. Choose games to analyse. Chess.com may publish recently finished games later; retry this month or paste a PGN.` };
      })();
    } finally { this.importing.delete(profileId); }
  }

  private row(profileId: string): ConnectionRow | undefined {
    return this.db.prepare("SELECT username,last_imported_at,last_month FROM chesscom_connections WHERE profile_id=?").get(profileId) as ConnectionRow | undefined;
  }

  private connectionFor(profileId: string): ChessComConnectionResponse {
    const row = this.row(profileId);
    return { connected: Boolean(row), username: row?.username ?? null, lastImportedAt: row?.last_imported_at ?? null, lastMonth: row?.last_month ?? null };
  }

  private request(endpoint: string): Promise<Record<string, unknown>> {
    const pending = this.requestTail.then(async () => {
      const response = await this.fetcher(`https://api.chess.com${endpoint}`, {
        headers: { Accept: "application/json", "User-Agent": "ThinkingBoard (https://github.com/Rinsing4852/thinking-board)" },
        signal: AbortSignal.timeout(15_000), redirect: "error",
      });
      if (response.status === 404) throw new Error("Chess.com account or monthly archive not found. Check the username and month, or paste a PGN.");
      if (response.status === 429) throw new Error("Chess.com is limiting requests. Wait before trying again; your saved games are kept.");
      if (!response.ok) throw new Error(`Chess.com could not be reached (HTTP ${response.status}). Retry or paste a PGN.`);
      if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new Error("Chess.com archive exceeds 10 MB. Use a PGN export instead.");
      // Enforce the cap while streaming, including chunked and compressed responses.
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Chess.com returned no data. Try again later.");
      let size = 0;
      const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) { await reader.cancel(); throw new Error("Chess.com archive exceeds 10 MB. Use a PGN export instead."); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Chess.com returned invalid data. Try again later.");
      return data as Record<string, unknown>;
    });
    this.requestTail = pending.catch(() => undefined);
    return pending;
  }
}

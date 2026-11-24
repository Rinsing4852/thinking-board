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
  last_synced_at: string | null;
  last_sync_month: string | null;
}
const MAX_BYTES = 10 * 1024 * 1024;
const SYNC_INTERVAL = 12 * 60 * 60 * 1000;
type ExpectedAccount = {profileId?: string; username?: string};
const monthBefore = (month: string, count = 1) => {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, number! - 1 - count, 1)).toISOString().slice(0, 7);
};

/** Recent sync and historical imports share the duplicate-safe own-game pipeline. */
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
    const previousUsername = this.row(profileId)?.username;
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO chesscom_connections(profile_id, username, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET username=excluded.username, updated_at=excluded.updated_at,
        last_imported_at=CASE WHEN lower(chesscom_connections.username)=lower(excluded.username) THEN chesscom_connections.last_imported_at ELSE NULL END,
        last_month=CASE WHEN lower(chesscom_connections.username)=lower(excluded.username) THEN chesscom_connections.last_month ELSE NULL END`)
        .run(profileId, account.username, now());
      this.imports.linkAlias(profileId, account.username as string);
      // Changing accounts invalidates sync freshness, but never deletes games.
      if (this.row(profileId)?.last_synced_at && previousUsername?.toLowerCase() !== (account.username as string).toLowerCase()) {
        this.db.prepare('UPDATE chesscom_connections SET last_synced_at=NULL,last_sync_month=NULL WHERE profile_id=?').run(profileId);
      }
    })();
    return this.connectionFor(profileId);
  }

  async importMonth(month: string, expected?: ExpectedAccount): Promise<ChessComImportResponse> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < "2007-01" || month > now().slice(0, 7)) {
      throw new Error("Choose a month from January 2007 through the current month");
    }
    const {profileId, row} = this.account(expected);
    if (this.importing.has(profileId)) throw new Error("A Chess.com import is already running for this player");
    this.importing.add(profileId);
    try {
      return await this.importArchives(profileId, row, [month]);
    } finally { this.importing.delete(profileId); }
  }

  async sync(expected?: ExpectedAccount, automatic = false): Promise<ChessComImportResponse> {
    const {profileId, row} = this.account(expected);
    if (automatic && row.last_synced_at && Date.now() - Date.parse(row.last_synced_at) < SYNC_INTERVAL) {
      return {...this.empty(profileId), skipped: 0, checkedMonths: [], connection: this.connectionFor(profileId), message: 'Chess.com was checked recently.'};
    }
    if (this.importing.has(profileId)) throw new Error('A Chess.com import is already running for this player');
    this.importing.add(profileId);
    try {
      // Fit within the browser request timeout. Never advance freshness on failure.
      const signal = AbortSignal.timeout(25_000);
      const current = now().slice(0, 7), previous = monthBefore(current), oldest = monthBefore(current, 11);
      const boundary = row.last_sync_month ?? row.last_month ?? previous;
      const start = boundary < previous ? boundary : previous;
      const floor = start < oldest ? oldest : start;
      const endpoint = `/pub/player/${encodeURIComponent(row.username.toLowerCase())}/games`;
      const data = await this.request(`${endpoint}/archives`, false, signal);
      if (!Array.isArray(data.archives) || data.archives.length > 500) throw new Error('Chess.com returned an invalid archive list. Retry or import a month.');
      const available = new Set<string>();
      for (const entry of data.archives) {
        if (typeof entry !== 'string') throw new Error('Chess.com returned an invalid archive list.');
        let url: URL; try { url = new URL(entry); } catch { throw new Error('Chess.com returned an invalid archive link.'); }
        const match = url.pathname.match(/^\/pub\/player\/([^/]+)\/games\/(\d{4})\/(0[1-9]|1[0-2])$/);
        if (url.origin !== 'https://api.chess.com' || url.search || url.hash || url.username || url.password || !match
          || match[1]!.toLowerCase() !== row.username.toLowerCase()) throw new Error('Chess.com returned an unexpected archive link.');
        const month = `${match[2]}-${match[3]}`;
        if (month >= floor && month <= current) available.add(month);
      }
      // The index can lag at month rollover. Probe the two recent months directly;
      // only an unlisted month's 404 is treated as not yet published.
      const months = [...new Set([...available, previous, current])].sort();
      const result = await this.importArchives(profileId, row, months, available, signal);
      return {...result, message: `Checked ${months.join(', ')}. ${result.message}${start < oldest ? ' Recent sync is limited to 12 months; import older months separately.' : ''}`};
    } finally { this.importing.delete(profileId); }
  }

  private account(expected?: ExpectedAccount) {
    const profileId = ensureActiveProfile(this.db), row = this.row(profileId);
    if (expected?.profileId !== undefined && expected.profileId !== profileId) throw new Error('Your player changed. Reload the Chess.com connection.');
    if (!row) throw new Error('Connect your Chess.com username first');
    if (expected?.username !== undefined && normalizePlayerName(expected.username) !== normalizePlayerName(row.username)) throw new Error('The connected account changed. Reload the Chess.com connection.');
    return {profileId, row};
  }

  private empty(profileId: string) {
    return {batchId: '', profileId, jobId: null, imported: 0, duplicates: 0, rejected: 0, errors: []};
  }

  private async importArchives(profileId: string, row: ConnectionRow, months: string[], available?: Set<string>, signal?: AbortSignal): Promise<ChessComImportResponse> {
      let skipped = 0, bytes = 0;
      const pgns: string[] = [];
      for (const month of months) {
      const data = await this.request(`/pub/player/${encodeURIComponent(row.username.toLowerCase())}/games/${month.replace("-", "/")}`, available !== undefined && !available.has(month), signal);
      if (!Array.isArray(data.games) || data.games.length > 5000) {
        throw new Error("Chess.com returned an invalid or oversized archive. Use a PGN export instead.");
      }
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
        bytes += Buffer.byteLength(pgns[pgns.length - 1]!);
        if (bytes > MAX_BYTES || pgns.length > 5000) throw new Error('Recent games exceed one sync batch. Import individual months instead; no games were saved.');
      }
      }
      signal?.throwIfAborted();
      if (this.row(profileId)?.username !== row.username) throw new Error("The connected account changed. Import again for the current account.");
      return this.db.transaction(() => {
        const result = pgns.length ? this.imports.importIntoProfile(pgns.join("\n\n"), row.username, profileId)
          : this.empty(profileId);
        if (result.rejected) throw new Error("Some games could not be saved. No games were saved; retry or use a PGN export.");
        this.db.prepare("UPDATE chesscom_connections SET last_imported_at=?,last_month=?,updated_at=? WHERE profile_id=?")
          .run(now(), months[months.length - 1], now(), profileId);
        if (available) this.db.prepare('UPDATE chesscom_connections SET last_synced_at=?,last_sync_month=? WHERE profile_id=?')
          .run(now(), months[months.length - 1], profileId);
        return { ...result, skipped, connection: this.connectionFor(profileId),
          checkedMonths: months,
          message: `${result.imported} new Chess.com games saved · ${result.duplicates} already saved · ${skipped} variants or unfinished games skipped. Choose games to analyse. Recent games may appear later in Chess.com’s public API.` };
      })();
  }

  private row(profileId: string): ConnectionRow | undefined {
    return this.db.prepare("SELECT username,last_imported_at,last_month,last_synced_at,last_sync_month FROM chesscom_connections WHERE profile_id=?").get(profileId) as ConnectionRow | undefined;
  }

  private connectionFor(profileId: string): ChessComConnectionResponse {
    const row = this.row(profileId);
    return { profileId, connected: Boolean(row), username: row?.username ?? null, lastImportedAt: row?.last_imported_at ?? null, lastMonth: row?.last_month ?? null,
      lastSyncedAt: row?.last_synced_at ?? null, lastSyncMonth: row?.last_sync_month ?? null };
  }

  private request(endpoint: string, allowMissing = false, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const pending = this.requestTail.then(async () => {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
      try { response = await this.fetcher(`https://api.chess.com${endpoint}`, {
        headers: { Accept: "application/json", "User-Agent": "ThinkingBoard (https://github.com/Rinsing4852/thinking-board)" },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000), redirect: "error",
      });
      } catch (error) { if (attempt || signal?.aborted || !(error instanceof TypeError)) throw error; }
      if ((response && response.status < 500) || attempt) break;
      await response?.body?.cancel();
      await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (!response) throw new Error('Chess.com could not be reached. Retry; your saved games are kept.');
      if (!response.ok) await response.body?.cancel();
      if (response.status === 404 && allowMissing) return {games: []};
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

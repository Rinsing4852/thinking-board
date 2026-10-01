import { Chess } from "chess.js";

import type { OpeningExplorerPositionResponse } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { openingPositionKey } from "./opening-content.js";
import { EXPLORER_CACHE_MS, EXPLORER_SPEEDS } from "./opening-preparation-policy.js";

type FetchLike = typeof fetch;

interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
}

interface ExplorerPayload {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  opening?: { eco?: unknown; name?: unknown } | null;
}

interface CacheRow {
  fen: string;
  total_games: number;
  moves_json: string;
  opening_json: string | null;
  fetched_at: string;
}

const RATINGS = new Set([0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
const SPEEDS = EXPLORER_SPEEDS;
const CACHE_MS = EXPLORER_CACHE_MS;

export class OpeningExplorerService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly apiToken?: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  cachedPosition(fen: string, ratingGroup: number): OpeningExplorerPositionResponse | null {
    const row = this.db.prepare(`SELECT fen, total_games, moves_json, opening_json, fetched_at
      FROM opening_explorer_cache WHERE position_key = ? AND rating_group = ? AND speeds = ?`)
      .get(openingPositionKey(fen), ratingGroup, SPEEDS) as CacheRow | undefined;
    try { return row ? this.fromCache(row, ratingGroup, true) : null; } catch { return null; }
  }

  async position(fenValue: string, ratingGroup = 1600, refresh = false): Promise<OpeningExplorerPositionResponse> {
    if (!RATINGS.has(ratingGroup)) throw new Error("Choose a supported Lichess rating group");
    let chess: Chess;
    try {
      chess = new Chess(fenValue);
    } catch {
      throw new Error("Position FEN is not valid");
    }
    const fen = chess.fen();
    const key = openingPositionKey(fen);
    const cached = this.db.prepare(`
      SELECT fen, total_games, moves_json, opening_json, fetched_at
      FROM opening_explorer_cache
      WHERE position_key = ? AND rating_group = ? AND speeds = ?
    `).get(key, ratingGroup, SPEEDS) as CacheRow | undefined;
    if (!refresh && cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_MS) {
      try { return this.fromCache(cached, ratingGroup, true); } catch { /* Refresh a damaged cache entry. */ }
    }

    try {
      const url = new URL("https://explorer.lichess.org/lichess");
      url.searchParams.set("variant", "standard");
      url.searchParams.set("fen", fen);
      url.searchParams.set("speeds", SPEEDS);
      url.searchParams.set("ratings", String(ratingGroup));
      // Include rare legal replies too; absence still means unknown, never 0%.
      url.searchParams.set("moves", String(chess.moves().length));
      url.searchParams.set("topGames", "0");
      url.searchParams.set("recentGames", "0");
      const response = await this.fetcher(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ThinkingBoard/1.0 (self-hosted chess trainer)",
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("Lichess Explorer requires an authorised token. Set LICHESS_API_TOKEN in Docker, then restart the app.");
        }
        if (response.status === 429) throw new Error("Lichess Explorer is busy. Wait a minute and try again.");
        throw new Error(`Lichess Explorer returned HTTP ${response.status}`);
      }
      const payload = await response.json() as ExplorerPayload;
      if (!Array.isArray(payload.moves)) throw new Error("Lichess Explorer returned an invalid response");
      const counts = [payload.white, payload.draws, payload.black];
      if (!counts.every(value => Number.isSafeInteger(value) && value >= 0)
        || !payload.moves.every(move => typeof move.uci === "string" && typeof move.san === "string"
          && [move.white, move.draws, move.black].every(value => Number.isSafeInteger(value) && value >= 0))) {
        throw new Error("Lichess Explorer returned invalid game counts");
      }
      const total = counts.reduce((sum, count) => sum + count, 0);
      if (!Number.isSafeInteger(total) || payload.moves.some(move => move.white + move.draws + move.black > total)) {
        throw new Error("Lichess Explorer returned inconsistent game counts");
      }
      const opening = payload.opening
        && typeof payload.opening.eco === "string"
        && typeof payload.opening.name === "string"
        ? { eco: payload.opening.eco, name: payload.opening.name }
        : null;
      this.db.prepare(`
        INSERT INTO opening_explorer_cache(
          position_key, fen, rating_group, speeds, total_games, moves_json, opening_json, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(position_key, rating_group, speeds) DO UPDATE SET
          fen = excluded.fen, total_games = excluded.total_games,
          moves_json = excluded.moves_json, opening_json = excluded.opening_json,
          fetched_at = excluded.fetched_at
      `).run(key, fen, ratingGroup, SPEEDS, total, JSON.stringify(payload.moves), opening ? JSON.stringify(opening) : null, now());
      return { ...this.toResponse(fen, ratingGroup, total, payload.moves, opening, false), fetchedAt: now(), stale: false };
    } catch (error) {
      if (cached) {
        try { return this.fromCache(cached, ratingGroup, true); } catch { /* Do not present a damaged sample. */ }
      }
      throw error;
    }
  }

  private fromCache(row: CacheRow, ratingGroup: number, cached: boolean): OpeningExplorerPositionResponse {
    return { ...this.toResponse(
      row.fen,
      ratingGroup,
      row.total_games,
      JSON.parse(row.moves_json) as ExplorerMove[],
      row.opening_json ? JSON.parse(row.opening_json) as { eco: string; name: string } : null,
      cached,
    ), fetchedAt: row.fetched_at, stale: !Number.isFinite(Date.parse(row.fetched_at)) || Date.now() - Date.parse(row.fetched_at) >= CACHE_MS };
  }

  private toResponse(
    fen: string,
    ratingGroup: number,
    totalGames: number,
    moves: ExplorerMove[],
    opening: { eco: string; name: string } | null,
    cached: boolean,
  ): OpeningExplorerPositionResponse {
    return {
      fen,
      ratingGroup,
      speeds: SPEEDS.split(","),
      totalGames,
      opening,
      replies: moves.map((move) => {
        const games = Number(move.white) + Number(move.draws) + Number(move.black);
        return {
          moveUci: move.uci,
          moveSan: move.san,
          games,
          frequencyPercent: totalGames > 0 ? Number(((games / totalGames) * 100).toPrecision(3)) : 0,
          whiteWins: Number(move.white),
          draws: Number(move.draws),
          blackWins: Number(move.black),
        };
      }),
      cached,
    };
  }
}

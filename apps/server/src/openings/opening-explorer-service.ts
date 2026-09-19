import { Chess } from "chess.js";

import type { OpeningExplorerPositionResponse } from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { openingPositionKey } from "./opening-content.js";

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
const SPEEDS = "blitz,rapid,classical";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;

export class OpeningExplorerService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly apiToken?: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async position(fenValue: string, ratingGroup = 1600): Promise<OpeningExplorerPositionResponse> {
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
    if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_MS) {
      return this.fromCache(cached, ratingGroup, true);
    }

    try {
      const url = new URL("https://explorer.lichess.org/lichess");
      url.searchParams.set("variant", "standard");
      url.searchParams.set("fen", fen);
      url.searchParams.set("speeds", SPEEDS);
      url.searchParams.set("ratings", String(ratingGroup));
      url.searchParams.set("moves", "12");
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
      const total = Number(payload.white) + Number(payload.draws) + Number(payload.black);
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
      return this.toResponse(fen, ratingGroup, total, payload.moves, opening, false);
    } catch (error) {
      if (cached) return this.fromCache(cached, ratingGroup, true);
      throw error;
    }
  }

  private fromCache(row: CacheRow, ratingGroup: number, cached: boolean): OpeningExplorerPositionResponse {
    return this.toResponse(
      row.fen,
      ratingGroup,
      row.total_games,
      JSON.parse(row.moves_json) as ExplorerMove[],
      row.opening_json ? JSON.parse(row.opening_json) as { eco: string; name: string } : null,
      cached,
    );
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
          frequencyPercent: totalGames > 0 ? Math.round((games / totalGames) * 1000) / 10 : 0,
        };
      }),
      cached,
    };
  }
}

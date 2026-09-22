import type {
  OpeningCoverageGap,
  OpeningCoverageResponse,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { ensureActiveProfile } from "../training/profile.js";

type FetchLike = typeof fetch;

interface PositionRow {
  id: string;
  fen: string;
  chapter_title: string;
  line_title: string;
}

interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
}

interface ExplorerResponse {
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
}

interface CacheRow {
  total_games: number;
  moves_json: string;
  fetched_at: string;
}

const RATINGS = new Set([0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
const SPEEDS = "blitz,rapid,classical";
const CACHE_MS = 7 * 24 * 60 * 60 * 1000;
const POSITION_LIMIT = 16;

export class OpeningCoverageService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly apiToken?: string,
    private readonly fetcher: FetchLike = fetch,
  ) {}

  async coverage(repertoireId: string, ratingGroup = 1600): Promise<OpeningCoverageResponse> {
    const profileId = ensureActiveProfile(this.db);
    if (!RATINGS.has(ratingGroup)) throw new Error("Choose a supported Lichess rating group");
    if (!this.db.prepare("SELECT 1 FROM opening_repertoires WHERE id = ?").get(repertoireId)) {
      throw new Error("Opening repertoire is not available");
    }
    if (this.db.prepare(`
      SELECT 1 FROM opening_repertoire_preferences
      WHERE profile_id = ? AND repertoire_id = ? AND archived_at IS NOT NULL
    `).get(profileId, repertoireId)) throw new Error("Restore this repertoire before checking coverage");
    if (!this.apiToken) {
      return {
        repertoireId,
        ratingGroup,
        speeds: SPEEDS.split(","),
        positionsChecked: 0,
        positionsAvailable: 0,
        coveragePercent: null,
        coveredGames: 0,
        totalGames: 0,
        gaps: [],
        incomplete: true,
        message: "Lichess Explorer requires an authorised token. Set LICHESS_API_TOKEN in Docker, then restart the app.",
      };
    }
    const allPositions = this.positions(repertoireId, profileId);
    const positions = allPositions.slice(0, POSITION_LIMIT);
    const gaps: OpeningCoverageGap[] = [];
    let coveredGames = 0;
    let totalGames = 0;
    let positionsAvailable = 0;
    let remoteFailures = 0;

    const samples: Array<{ position: PositionRow; result: ExplorerResponse | null }> = [];
    for (let offset = 0; offset < positions.length; offset += 4) {
      const batch = positions.slice(offset, offset + 4);
      samples.push(...await Promise.all(batch.map(async (position) => ({
        position,
        result: await this.statistics(position, ratingGroup),
      }))));
    }

    for (const { position, result } of samples) {
      if (!result) {
        remoteFailures += 1;
        continue;
      }
      const total = result.white + result.draws + result.black;
      if (total <= 0) continue;
      positionsAvailable += 1;
      totalGames += total;
      const covered = new Set(
        (this.db.prepare(`
          SELECT move_uci FROM opening_moves
          WHERE repertoire_id = ? AND from_position_id = ? AND role = 'opponent' AND active = 1
            AND EXISTS (
              SELECT 1 FROM opening_line_moves membership
              JOIN opening_lines line ON line.id = membership.line_id AND line.active = 1
              JOIN opening_chapters chapter ON chapter.id = line.chapter_id AND chapter.active = 1
              LEFT JOIN opening_line_preferences preference
                ON preference.line_id = line.id AND preference.profile_id = ?
              WHERE membership.move_id = opening_moves.id AND preference.archived_at IS NULL
            )
        `).pluck().all(repertoireId, position.id, profileId) as string[]),
      );
      for (const move of result.moves) {
        const games = move.white + move.draws + move.black;
        if (covered.has(move.uci)) coveredGames += games;
        else if (games > 0) {
          gaps.push({
            positionId: position.id,
            fen: position.fen,
            chapterTitle: position.chapter_title,
            lineTitle: position.line_title,
            moveUci: move.uci,
            moveSan: move.san,
            games,
            frequencyPercent: Math.round((games / total) * 1000) / 10,
          });
        }
      }
    }

    gaps.sort((left, right) => right.games - left.games || right.frequencyPercent - left.frequencyPercent);
    const incomplete = allPositions.length > positions.length || remoteFailures > 0;
    return {
      repertoireId,
      ratingGroup,
      speeds: SPEEDS.split(","),
      positionsChecked: positions.length,
      positionsAvailable,
      coveragePercent: totalGames > 0 ? Math.round((coveredGames / totalGames) * 1000) / 10 : null,
      coveredGames,
      totalGames,
      gaps: gaps.slice(0, 8),
      incomplete,
      message: totalGames > 0
        ? incomplete
          ? "Coverage uses available cached and live Lichess data; some deeper positions were not included."
          : "Coverage compares your saved opponent replies with rated Lichess blitz, rapid and classical games."
        : "No Lichess Explorer sample was available for these positions yet.",
    };
  }

  private positions(repertoireId: string, profileId: string): PositionRow[] {
    return this.db.prepare(`
      SELECT p.id, p.fen, MIN(c.title) AS chapter_title, MIN(l.title) AS line_title,
             MIN(olm.ply) AS first_ply
      FROM opening_positions p
      JOIN opening_moves m ON m.from_position_id = p.id
        AND m.repertoire_id = ? AND m.role = 'opponent' AND m.active = 1
      JOIN opening_line_moves olm ON olm.move_id = m.id
      JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      LEFT JOIN opening_line_preferences preference
        ON preference.line_id = l.id AND preference.profile_id = ?
      WHERE preference.archived_at IS NULL
      GROUP BY p.id, p.fen
      ORDER BY first_ply, chapter_title, line_title
    `).all(repertoireId, profileId) as PositionRow[];
  }

  private async statistics(position: PositionRow, ratingGroup: number): Promise<ExplorerResponse | null> {
    const cached = this.db.prepare(`
      SELECT total_games, moves_json, fetched_at
      FROM opening_position_statistics
      WHERE position_id = ? AND rating_group = ? AND speeds = ?
    `).get(position.id, ratingGroup, SPEEDS) as CacheRow | undefined;
    if (cached && Date.now() - Date.parse(cached.fetched_at) < CACHE_MS) {
      return this.fromCache(cached);
    }

    try {
      const url = new URL("https://explorer.lichess.org/lichess");
      url.searchParams.set("variant", "standard");
      url.searchParams.set("fen", position.fen);
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json() as ExplorerResponse;
      if (!Array.isArray(result.moves)) throw new Error("Invalid explorer response");
      const total = Number(result.white) + Number(result.draws) + Number(result.black);
      const timestamp = now();
      this.db.prepare(`
        INSERT INTO opening_position_statistics(
          position_id, rating_group, speeds, total_games, moves_json, fetched_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(position_id, rating_group, speeds) DO UPDATE SET
          total_games = excluded.total_games,
          moves_json = excluded.moves_json,
          fetched_at = excluded.fetched_at
      `).run(position.id, ratingGroup, SPEEDS, total, JSON.stringify(result.moves), timestamp);
      return result;
    } catch {
      return cached ? this.fromCache(cached) : null;
    }
  }

  private fromCache(row: CacheRow): ExplorerResponse {
    return {
      white: row.total_games,
      draws: 0,
      black: 0,
      moves: JSON.parse(row.moves_json) as ExplorerMove[],
    };
  }
}

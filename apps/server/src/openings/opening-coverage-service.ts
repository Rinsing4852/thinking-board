import type {
  OpeningCoverageGap,
  OpeningCoverageResponse,
} from "../../../../packages/contracts/src/api.js";
import { Chess } from "chess.js";
import type { SqliteDatabase } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";
import { OpeningExplorerService } from "./opening-explorer-service.js";
import type { OpeningPreparationService } from "./opening-preparation-service.js";

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
  stale: boolean;
}

const RATINGS = new Set([0, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500]);
const SPEEDS = "blitz,rapid,classical";
const POSITION_LIMIT = 32;

export class OpeningCoverageService {
  constructor(
    private readonly db: SqliteDatabase,
    private readonly apiToken?: string,
    private readonly explorer = new OpeningExplorerService(db, apiToken),
    private readonly preparation?: OpeningPreparationService,
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
    let staleSamples = 0;

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
      if (result.stale) staleSamples += 1;
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
      const legalMoves = new Set(new Chess(position.fen).moves({ verbose: true })
        .map(move => `${move.from}${move.to}${move.promotion ?? ""}`));
      for (const move of result.moves) {
        if (!legalMoves.has(move.uci)) continue;
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
            frequencyPercent: Number(((games / total) * 100).toPrecision(3)),
            ...(this.preparation ? { preparation: this.preparation.cached({ fen: position.fen,
              opponentMoveUci: move.uci, learnerColor: position.fen.split(" ")[1] === "w" ? "black" : "white", repertoireId },
              { ratingGroup, useExplorer: true }) } : {}),
          });
        }
      }
    }

    const priority = (gap: OpeningCoverageGap): number => gap.preparation?.decision?.choice === "unprepared" ? -1
      : { high: 3, medium: 2, unknown: 1, low: 0 }[gap.preparation?.priority ?? "unknown"];
    gaps.sort((left, right) => priority(right) - priority(left) || right.frequencyPercent - left.frequencyPercent || right.games - left.games);
    const incomplete = allPositions.length > positions.length || remoteFailures > 0 || staleSamples > 0;
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
          ? "Coverage is partial or uses older cached samples. Refresh before relying on it; not every position has current data."
          : "Coverage compares your saved opponent replies with rated Lichess blitz, rapid and classical games."
        : "No Lichess Explorer sample was available for these positions yet.",
    };
  }

  private positions(repertoireId: string, profileId: string): PositionRow[] {
    return this.db.prepare(`
      WITH candidate_positions AS (
        SELECT p.id, p.fen, c.title AS chapter_title, l.title AS line_title,
               olm.ply + 1 AS first_ply
        FROM opening_line_moves olm
        JOIN opening_moves m ON m.id = olm.move_id
          AND m.repertoire_id = ? AND m.role = 'learner' AND m.active = 1
        JOIN opening_positions p ON p.id = m.to_position_id
        JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
        JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
        LEFT JOIN opening_line_preferences preference
          ON preference.line_id = l.id AND preference.profile_id = ?
        WHERE preference.archived_at IS NULL

        UNION ALL

        SELECT p.id, p.fen, c.title AS chapter_title, l.title AS line_title,
               olm.ply AS first_ply
        FROM opening_line_moves olm
        JOIN opening_moves m ON m.id = olm.move_id
          AND m.repertoire_id = ? AND m.role = 'opponent' AND m.active = 1
        JOIN opening_positions p ON p.id = m.from_position_id
        JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
        JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
        LEFT JOIN opening_line_preferences preference
          ON preference.line_id = l.id AND preference.profile_id = ?
        WHERE preference.archived_at IS NULL
      )
      SELECT id, fen, MIN(chapter_title) AS chapter_title, MIN(line_title) AS line_title,
             MIN(first_ply) AS first_ply
      FROM candidate_positions
      GROUP BY id, fen
      ORDER BY first_ply, chapter_title, line_title
    `).all(repertoireId, profileId, repertoireId, profileId) as PositionRow[];
  }

  private async statistics(position: PositionRow, ratingGroup: number): Promise<ExplorerResponse | null> {
    try {
      const sample = await this.explorer.position(position.fen, ratingGroup);
      return { white: sample.totalGames, draws: 0, black: 0, stale: sample.stale ?? false, moves: sample.replies.map(move => ({
        uci: move.moveUci, san: move.moveSan, white: move.whiteWins, draws: move.draws, black: move.blackWins,
      })) };
    } catch {
      return null;
    }
  }
}

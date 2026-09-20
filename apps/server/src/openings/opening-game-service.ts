import type {
  Color,
  GameOpeningConnection,
  GameOpeningStatus,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { openingPositionKey } from "./opening-content.js";
import { activeProfileId } from "../training/profile.js";

interface GameRow {
  id: string;
  profile_id: string;
  player_color: Color;
}

interface GameMoveRow {
  id: string;
  ply: number;
  move_number: number;
  mover_color: Color;
  uci: string;
  san: string;
  from_fen: string;
  to_fen: string;
}

interface RepertoireRow {
  id: string;
  name: string;
  learner_color: Color;
  origin: "built_in" | "imported";
}

interface ExpectedMoveRow {
  id: string;
  position_id: string;
  move_uci: string;
  move_san: string;
}

interface MatchRow {
  id: string;
  game_id: string;
  repertoire_id: string;
  status: GameOpeningStatus;
  matched_plies: number;
  matched_player_moves: number;
  last_book_ply: number;
  departure_move_id: string | null;
  expected_move_id: string | null;
  repertoire_name: string;
  learner_color: Color;
  origin: "built_in" | "imported";
}

const STATUS_PRIORITY: Record<GameOpeningStatus, number> = {
  in_repertoire: 5,
  player_deviation: 4,
  opponent_deviation: 3,
  repertoire_ended: 2,
  not_covered: 1,
};

export class OpeningGameService {
  constructor(private readonly db: SqliteDatabase) {}

  matchGame(gameId: string, profileId: string): GameOpeningConnection | null {
    const game = this.game(gameId, profileId);
    const moves = this.moves(gameId);
    const repertoires = this.db.prepare(`
      SELECT r.id, r.name, r.learner_color,
             CASE WHEN oi.repertoire_id IS NULL THEN 'built_in' ELSE 'imported' END AS origin
      FROM opening_repertoires r
      LEFT JOIN opening_imports oi ON oi.repertoire_id = r.id
      WHERE r.learner_color = ?
      ORDER BY origin DESC, r.name
    `).all(game.player_color) as RepertoireRow[];

    this.db.transaction(() => {
      this.db.prepare("DELETE FROM game_opening_matches WHERE game_id = ?").run(gameId);
      for (const repertoire of repertoires) this.persistMatch(game, moves, repertoire);
    })();

    const best = this.bestMatch(gameId);
    return best ? this.toConnection(best) : null;
  }

  practiceTarget(gameId: string, profileId: string): {
    repertoireId: string;
    positionId: string;
  } {
    this.matchGame(gameId, profileId);
    const best = this.bestMatch(gameId);
    if (!best || best.status !== "player_deviation" || !best.expected_move_id) {
      throw new Error("This game does not have a player opening deviation to practise");
    }
    const target = this.db.prepare(`
      SELECT repertoire_id, from_position_id
      FROM opening_moves WHERE id = ? AND active = 1
    `).get(best.expected_move_id) as { repertoire_id: string; from_position_id: string } | undefined;
    if (!target) throw new Error("The repertoire position is no longer available");
    return { repertoireId: target.repertoire_id, positionId: target.from_position_id };
  }

  private game(gameId: string, profileId: string): GameRow {
    const game = this.db.prepare(`
      SELECT id, profile_id, player_color FROM games WHERE id = ? AND profile_id = ?
    `).get(gameId, profileId) as GameRow | undefined;
    if (!game) throw new Error("Game not found");
    return game;
  }

  private moves(gameId: string): GameMoveRow[] {
    return this.db.prepare(`
      SELECT m.id, m.ply, m.move_number, m.mover_color, m.uci, m.san,
             before.fen AS from_fen, after.fen AS to_fen
      FROM moves m
      JOIN positions before ON before.id = m.from_position_id
      JOIN positions after ON after.id = m.to_position_id
      WHERE m.game_id = ?
      ORDER BY m.ply
    `).all(gameId) as GameMoveRow[];
  }

  private expectedMoves(repertoireId: string, positionKey: string, role: "learner" | "opponent"): ExpectedMoveRow[] {
    const rows = this.db.prepare(`
      SELECT m.id, m.from_position_id AS position_id, m.move_uci, m.move_san
      FROM opening_positions p
      JOIN opening_moves m ON m.from_position_id = p.id AND m.active = 1
      LEFT JOIN opening_line_moves olm ON olm.move_id = m.id
      LEFT JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
      LEFT JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      WHERE p.position_key = ? AND m.repertoire_id = ? AND m.role = ?
      ORDER BY CASE m.move_kind WHEN 'primary' THEN 0 WHEN 'alternative' THEN 1 ELSE 2 END,
               COALESCE(c.sort_order, 9999), COALESCE(l.priority, 9999), m.sort_order, m.id
    `).all(positionKey, repertoireId, role) as ExpectedMoveRow[];
    const unique = new Map<string, ExpectedMoveRow>();
    for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
    return [...unique.values()];
  }

  private knownTarget(repertoireId: string, fen: string): boolean {
    return Boolean(this.db.prepare(`
      SELECT 1
      FROM opening_positions p
      WHERE p.position_key = ?
        AND EXISTS (
          SELECT 1 FROM opening_moves m
          WHERE m.repertoire_id = ? AND m.active = 1
            AND (m.from_position_id = p.id OR m.to_position_id = p.id)
        )
      LIMIT 1
    `).get(openingPositionKey(fen), repertoireId));
  }

  private persistMatch(game: GameRow, moves: GameMoveRow[], repertoire: RepertoireRow): void {
    let status: GameOpeningStatus = "in_repertoire";
    let matchedPlies = 0;
    let matchedPlayerMoves = 0;
    let lastBookPly = 0;
    let departureMoveId: string | null = null;
    let expectedMoveId: string | null = null;

    for (const move of moves) {
      const isPlayerMove = move.mover_color === game.player_color;
      const expected = this.expectedMoves(
        repertoire.id,
        openingPositionKey(move.from_fen),
        isPlayerMove ? "learner" : "opponent",
      );
      if (expected.length === 0) {
        status = matchedPlies === 0 ? "not_covered" : "repertoire_ended";
        departureMoveId = move.id;
        break;
      }

      if (expected.some((candidate) => candidate.move_uci === move.uci) || this.knownTarget(repertoire.id, move.to_fen)) {
        matchedPlies += 1;
        if (isPlayerMove) matchedPlayerMoves += 1;
        lastBookPly = move.ply;
        continue;
      }

      departureMoveId = move.id;
      if (isPlayerMove) {
        status = "player_deviation";
        expectedMoveId = expected[0]!.id;
      } else {
        status = matchedPlies === 0 ? "not_covered" : "opponent_deviation";
      }
      break;
    }

    this.db.prepare(`
      INSERT INTO game_opening_matches(
        id, game_id, profile_id, repertoire_id, status, matched_plies,
        matched_player_moves, last_book_ply, departure_move_id, expected_move_id, matched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(), game.id, game.profile_id, repertoire.id, status, matchedPlies,
      matchedPlayerMoves, lastBookPly, departureMoveId, expectedMoveId, now(),
    );
  }

  private bestMatch(gameId: string): MatchRow | null {
    const rows = this.db.prepare(`
      SELECT gom.*, r.name AS repertoire_name, r.learner_color,
             CASE WHEN oi.repertoire_id IS NULL THEN 'built_in' ELSE 'imported' END AS origin
      FROM game_opening_matches gom
      JOIN opening_repertoires r ON r.id = gom.repertoire_id
      LEFT JOIN opening_imports oi ON oi.repertoire_id = r.id
      WHERE gom.game_id = ?
    `).all(gameId) as MatchRow[];
    rows.sort((left, right) =>
      right.matched_plies - left.matched_plies
      || right.matched_player_moves - left.matched_player_moves
      || STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status]
      || Number(right.origin === "imported") - Number(left.origin === "imported")
      || left.repertoire_name.localeCompare(right.repertoire_name));
    return rows[0] ?? null;
  }

  private toConnection(match: MatchRow): GameOpeningConnection {
    const profileId = activeProfileId(this.db);
    const departure = match.departure_move_id
      ? this.db.prepare(`
        SELECT ply, move_number, mover_color, uci, san FROM moves WHERE id = ?
      `).get(match.departure_move_id) as {
        ply: number; move_number: number; mover_color: Color; uci: string; san: string;
      }
      : null;
    const expected = match.expected_move_id
      ? this.db.prepare(`
        SELECT m.move_uci, m.move_san, a.summary, a.changes_json,
               a.resulting_plan, a.tactical_warning, a.common_mistake,
               lc.comment AS personal_comment,
               c.title AS chapter_title, l.title AS line_title
        FROM opening_moves m
        JOIN opening_move_annotations a ON a.move_id = m.id
        LEFT JOIN opening_learning_comments lc ON lc.move_id = m.id AND lc.profile_id = ?
        JOIN opening_line_moves olm ON olm.move_id = m.id
        JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
        JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
        WHERE m.id = ?
        ORDER BY c.sort_order, l.priority, olm.ply
        LIMIT 1
      `).get(profileId, match.expected_move_id) as Record<string, unknown> | undefined
      : undefined;

    return {
      matchId: match.id,
      status: match.status,
      repertoire: {
        id: match.repertoire_id,
        name: match.repertoire_name,
        learnerColor: match.learner_color,
        origin: match.origin,
      },
      matchedPlies: match.matched_plies,
      matchedPlayerMoves: match.matched_player_moves,
      lastBookPly: match.last_book_ply,
      departure: departure ? {
        ply: departure.ply,
        moveNumber: departure.move_number,
        moverColor: departure.mover_color,
        moveUci: departure.uci,
        moveSan: departure.san,
      } : null,
      expectedMove: expected ? {
        moveUci: String(expected.move_uci),
        moveSan: String(expected.move_san),
        chapterTitle: String(expected.chapter_title),
        lineTitle: String(expected.line_title),
        explanation: {
          summary: String(expected.summary),
          changes: JSON.parse(String(expected.changes_json)) as string[],
          resultingPlan: expected.resulting_plan === null ? null : String(expected.resulting_plan),
          tacticalWarning: expected.tactical_warning === null ? null : String(expected.tactical_warning),
          commonMistake: expected.common_mistake === null ? null : String(expected.common_mistake),
          personalComment: expected.personal_comment === null ? null : String(expected.personal_comment),
        },
      } : null,
      practiceAvailable: match.status === "player_deviation" && Boolean(expected),
    };
  }
}

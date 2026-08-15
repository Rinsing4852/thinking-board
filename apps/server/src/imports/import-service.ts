import type { ImportPgnResponse, PgnPreviewResponse } from "../../../../packages/contracts/src/api.js";
import { Chess } from "chess.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { normalizePlayerName, parsePgnText, type ParsedGame } from "../chess/pgn.js";

export class ImportService {
  constructor(private readonly db: SqliteDatabase) {}

  preview(pgn: string): PgnPreviewResponse {
    const parsed = parsePgnText(pgn);
    const duplicate = this.db.prepare("SELECT 1 FROM games WHERE fingerprint = ?");
    const players = new Set<string>();
    const games = parsed.games.map((game) => {
      players.add(game.white);
      players.add(game.black);
      return {
        index: game.index,
        white: game.white,
        black: game.black,
        result: game.result,
        date: game.playedAt,
        moveCount: game.moves.length,
        fingerprint: game.fingerprint,
        duplicate: Boolean(duplicate.get(game.fingerprint)),
      };
    });
    return { games, players: [...players].sort(), errors: parsed.errors };
  }

  import(pgn: string, playerName: string): ImportPgnResponse {
    const selected = normalizePlayerName(playerName);
    if (!selected) throw new Error("Select the player whose games these are");
    const parsed = parsePgnText(pgn);
    const batchId = id();
    const errors = [...parsed.errors];
    const importedGameIds: string[] = [];
    let duplicates = 0;

    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO import_batches(id, original_pgn, status, created_at)
        VALUES (?, ?, 'processing', ?)
      `).run(batchId, pgn, now());

      const profileId = this.resolveProfile(playerName, selected);
      for (const game of parsed.games) {
        const whiteMatches = normalizePlayerName(game.white) === selected;
        const blackMatches = normalizePlayerName(game.black) === selected;
        if (whiteMatches === blackMatches) {
          errors.push({
            index: game.index,
            message: whiteMatches
              ? "Selected player appears as both colours"
              : `Selected player '${playerName}' is not in this game`,
          });
          continue;
        }
        if (this.db.prepare("SELECT 1 FROM games WHERE fingerprint = ?").get(game.fingerprint)) {
          duplicates += 1;
          continue;
        }
        importedGameIds.push(this.insertGame(batchId, profileId, game, whiteMatches ? "white" : "black"));
      }

      const rejected = errors.length;
      const status = importedGameIds.length > 0
        ? rejected > 0 || duplicates > 0 ? "partial" : "completed"
        : rejected > 0 ? "failed" : "completed";
      this.db.prepare(`
        UPDATE import_batches
        SET status = ?, imported_count = ?, duplicate_count = ?, rejected_count = ?,
            errors_json = ?, completed_at = ?
        WHERE id = ?
      `).run(status, importedGameIds.length, duplicates, rejected, JSON.stringify(errors), now(), batchId);
    })();

    let jobId: string | null = null;
    if (importedGameIds.length > 0) {
      jobId = id();
      this.db.prepare(`
        INSERT INTO jobs(id, kind, status, progress_total, payload_json, created_at)
        VALUES (?, 'analyze_games', 'queued', ?, ?, ?)
      `).run(jobId, importedGameIds.length, JSON.stringify({ gameIds: importedGameIds }), now());
    }

    return {
      batchId,
      jobId,
      imported: importedGameIds.length,
      duplicates,
      rejected: errors.length,
      errors,
    };
  }

  private resolveProfile(displayName: string, normalizedName: string): string {
    const existing = this.db.prepare(`
      SELECT profile_id FROM player_aliases WHERE normalized_name = ? LIMIT 1
    `).get(normalizedName) as { profile_id: string } | undefined;
    if (existing) return existing.profile_id;
    const profileId = id();
    this.db.prepare("INSERT INTO player_profiles(id, display_name, created_at) VALUES (?, ?, ?)")
      .run(profileId, displayName.trim(), now());
    this.db.prepare(`
      INSERT INTO player_aliases(profile_id, display_name, normalized_name) VALUES (?, ?, ?)
    `).run(profileId, displayName.trim(), normalizedName);
    this.db.prepare(`
      INSERT OR IGNORE INTO app_state(key, value) VALUES ('active_profile_id', ?)
    `).run(profileId);
    return profileId;
  }

  private insertGame(
    batchId: string,
    profileId: string,
    game: ParsedGame,
    playerColor: "white" | "black",
  ): string {
    const gameId = id();
    this.db.prepare(`
      INSERT INTO games(
        id, import_batch_id, profile_id, fingerprint, raw_pgn_sha256, original_pgn,
        headers_json, initial_fen, white_name, black_name, player_color, result,
        played_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      gameId, batchId, profileId, game.fingerprint, game.rawHash, game.originalPgn,
      JSON.stringify(game.headers), game.initialFen, game.white, game.black, playerColor,
      game.result, game.playedAt, now(),
    );

    const positionIds: string[] = [];
    const initialPositionId = id();
    positionIds.push(initialPositionId);
    const initialSide = new Chess(game.initialFen).turn() === "w" ? "white" : "black";
    this.db.prepare(`
      INSERT INTO positions(id, game_id, ply_index, fen, side_to_move) VALUES (?, ?, 0, ?, ?)
    `).run(initialPositionId, gameId, game.initialFen, initialSide);

    for (const move of game.moves) {
      const positionId = id();
      positionIds.push(positionId);
      const sideToMove = move.moverColor === "white" ? "black" : "white";
      this.db.prepare(`
        INSERT INTO positions(id, game_id, ply_index, fen, side_to_move) VALUES (?, ?, ?, ?, ?)
      `).run(positionId, gameId, move.ply, move.fenAfter, sideToMove);
      this.db.prepare(`
        INSERT INTO moves(
          id, game_id, ply, move_number, mover_color, from_position_id,
          to_position_id, uci, san
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id(), gameId, move.ply, move.moveNumber, move.moverColor,
        positionIds[move.ply - 1], positionId, move.uci, move.san,
      );
    }
    return gameId;
  }
}

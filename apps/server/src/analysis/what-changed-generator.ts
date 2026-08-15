import { Chess } from "chess.js";

import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";

const TRAINABLE_PIECES = new Set(["n", "b", "r", "q"]);
const PIECE_NAMES: Record<string, string> = {
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
};

export interface AttackedPieceChange {
  square: string;
  piece: string;
}

interface CandidateRow {
  source_move_id: string;
  profile_id: string;
  opponent_move_id: string;
  opponent_move_uci: string;
  opponent_move_san: string;
  before_position_id: string;
  after_position_id: string;
  fen_before: string;
  fen_after: string;
  player_color: "white" | "black";
}

export function detectNewlyAttackedPieces(
  fenBefore: string,
  fenAfter: string,
  playerColor: "white" | "black",
): AttackedPieceChange[] {
  const before = new Chess(fenBefore);
  const after = new Chess(fenAfter);
  const player = playerColor === "white" ? "w" : "b";
  const opponent = player === "w" ? "b" : "w";
  const changes: AttackedPieceChange[] = [];

  for (const rank of after.board()) {
    for (const piece of rank) {
      if (!piece || piece.color !== player || !TRAINABLE_PIECES.has(piece.type)) continue;
      if (!before.isAttacked(piece.square, opponent) && after.isAttacked(piece.square, opponent)) {
        changes.push({ square: piece.square, piece: piece.type });
      }
    }
  }
  return changes.sort((left, right) => left.square.localeCompare(right.square));
}

function joinPieceNames(changes: AttackedPieceChange[]): string {
  const descriptions = changes.map((change) => `your ${PIECE_NAMES[change.piece] ?? "piece"} on ${change.square}`);
  if (descriptions.length <= 1) return descriptions[0] ?? "your piece";
  return `${descriptions.slice(0, -1).join(", ")} and ${descriptions.at(-1)}`;
}

export class WhatChangedGenerator {
  constructor(private readonly db: SqliteDatabase) {}

  backfill(): number {
    const games = this.db.prepare(`
      SELECT DISTINCT ar.game_id
      FROM analysis_runs ar
      WHERE ar.status = 'completed'
        AND ar.completed_at = (
          SELECT MAX(latest.completed_at) FROM analysis_runs latest
          WHERE latest.game_id = ar.game_id AND latest.status = 'completed'
        )
    `).all() as Array<{ game_id: string }>;
    return games.reduce((total, game) => total + this.generateForGame(game.game_id), 0);
  }

  generateForGame(gameId: string, runId?: string): number {
    const selectedRun = runId ?? (this.db.prepare(`
      SELECT id FROM analysis_runs
      WHERE game_id = ? AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `).get(gameId) as { id: string } | undefined)?.id;
    if (!selectedRun) return 0;

    const candidates = this.db.prepare(`
      SELECT m.id AS source_move_id, g.profile_id, g.player_color,
             previous.id AS opponent_move_id,
             previous.uci AS opponent_move_uci,
             previous.san AS opponent_move_san,
             previous.from_position_id AS before_position_id,
             previous.to_position_id AS after_position_id,
             before_position.fen AS fen_before,
             after_position.fen AS fen_after
      FROM moves m
      JOIN games g ON g.id = m.game_id
      JOIN move_assessments assessment
        ON assessment.move_id = m.id AND assessment.run_id = ? AND assessment.meaningful = 1
      JOIN moves previous ON previous.game_id = m.game_id AND previous.ply = m.ply - 1
      JOIN positions before_position ON before_position.id = previous.from_position_id
      JOIN positions after_position ON after_position.id = previous.to_position_id
      WHERE m.game_id = ? AND m.mover_color = g.player_color
        AND previous.mover_color != g.player_color
      ORDER BY m.ply
    `).all(selectedRun, gameId) as CandidateRow[];

    let generated = 0;
    for (const candidate of candidates) {
      if (new Chess(candidate.fen_after).inCheck()) continue;
      const changes = detectNewlyAttackedPieces(
        candidate.fen_before,
        candidate.fen_after,
        candidate.player_color,
      );
      if (changes.length === 0) continue;
      if (this.insertItem(gameId, candidate, changes)) generated += 1;
    }
    return generated;
  }

  private insertItem(gameId: string, candidate: CandidateRow, changes: AttackedPieceChange[]): boolean {
    const itemId = id();
    const verb = changes.length === 1 ? "was" : "were";
    const explanation = `After ${candidate.opponent_move_san}, ${joinPieceNames(changes)} ${verb} newly attacked.`;
    let inserted = false;
    this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO training_items(
          id, profile_id, game_id, source_move_id, mode, prompt_version, created_at
        ) VALUES (?, ?, ?, ?, 'what_changed', 1, ?)
      `).run(itemId, candidate.profile_id, gameId, candidate.source_move_id, now());
      const stored = this.db.prepare(`
        SELECT id FROM training_items WHERE mode = 'what_changed' AND source_move_id = ?
      `).get(candidate.source_move_id) as { id: string };
      this.db.prepare("UPDATE training_items SET active = 1, prompt_version = 2 WHERE id = ?").run(stored.id);
      inserted = result.changes > 0;
      this.db.prepare(`
        INSERT INTO what_changed_items(
          item_id, opponent_move_id, before_opponent_position_id,
          after_opponent_position_id, opponent_move_uci, opponent_move_san,
          answer_category, answer_squares_json, explanation, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, 'attacked_piece', ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          opponent_move_id = excluded.opponent_move_id,
          before_opponent_position_id = excluded.before_opponent_position_id,
          after_opponent_position_id = excluded.after_opponent_position_id,
          opponent_move_uci = excluded.opponent_move_uci,
          opponent_move_san = excluded.opponent_move_san,
          answer_category = excluded.answer_category,
          answer_squares_json = excluded.answer_squares_json,
          explanation = excluded.explanation,
          evidence_json = excluded.evidence_json
      `).run(
        stored.id,
        candidate.opponent_move_id,
        candidate.before_position_id,
        candidate.after_position_id,
        candidate.opponent_move_uci,
        candidate.opponent_move_san,
        JSON.stringify(changes.map((change) => change.square)),
        explanation,
        JSON.stringify({ detector: "newly-attacked-piece-v2", changes }),
      );
      this.db.prepare(`
        INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
        VALUES (?, 'process.last_move_awareness', 'automatic', 0.9, 1)
        ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
      `).run(stored.id);
      this.db.prepare(`
        INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
        VALUES (?, 'change.attacked_piece', 'automatic', 0.95, 0)
        ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
      `).run(stored.id);
      this.db.prepare(`
        INSERT OR IGNORE INTO review_states(item_id, mastery_level, due_at) VALUES (?, 0, ?)
      `).run(stored.id, now());
    })();
    return inserted;
  }
}

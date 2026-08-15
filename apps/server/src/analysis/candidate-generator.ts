import { Chess } from "chess.js";

import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";

interface CandidateRow {
  source_move_id: string;
  profile_id: string;
  position_id: string;
  fen: string;
  played_move_san: string;
  position_analysis_id: string;
  centipawn_loss: number;
}

interface LineRow {
  rank: number;
  move_uci: string;
  move_san: string;
  centipawns_white: number | null;
  mate_in_white: number | null;
}

export class CandidateGenerator {
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
      SELECT m.id AS source_move_id, g.profile_id,
             m.from_position_id AS position_id, position.fen,
             m.san AS played_move_san, analysis.id AS position_analysis_id,
             assessment.comparison_loss AS centipawn_loss
      FROM moves m
      JOIN games g ON g.id = m.game_id
      JOIN positions position ON position.id = m.from_position_id
      JOIN move_assessments assessment
        ON assessment.move_id = m.id AND assessment.run_id = ? AND assessment.meaningful = 1
      JOIN position_analyses analysis
        ON analysis.position_id = m.from_position_id AND analysis.run_id = ?
      WHERE m.game_id = ? AND m.mover_color = g.player_color
      ORDER BY m.ply
    `).all(selectedRun, selectedRun, gameId) as CandidateRow[];

    let generated = 0;
    for (const candidate of candidates) {
      const board = new Chess(candidate.fen);
      if (board.isGameOver() || board.inCheck()) continue;
      const lines = this.db.prepare(`
        SELECT rank, move_uci, move_san, centipawns_white, mate_in_white
        FROM engine_lines
        WHERE position_analysis_id = ? AND move_uci != '(none)'
        ORDER BY rank LIMIT 3
      `).all(candidate.position_analysis_id) as LineRow[];
      if (lines.length < 2) continue;
      if (this.insertItem(gameId, candidate, lines)) generated += 1;
    }
    return generated;
  }

  private insertItem(gameId: string, candidate: CandidateRow, lines: LineRow[]): boolean {
    const itemId = id();
    let inserted = false;
    this.db.transaction(() => {
      const result = this.db.prepare(`
        INSERT OR IGNORE INTO training_items(
          id, profile_id, game_id, source_move_id, mode, prompt_version, created_at
        ) VALUES (?, ?, ?, ?, 'candidate_generation', 1, ?)
      `).run(itemId, candidate.profile_id, gameId, candidate.source_move_id, now());
      const stored = this.db.prepare(`
        SELECT id FROM training_items WHERE mode = 'candidate_generation' AND source_move_id = ?
      `).get(candidate.source_move_id) as { id: string };
      this.db.prepare("UPDATE training_items SET active = 1, prompt_version = 2 WHERE id = ?").run(stored.id);
      inserted = result.changes > 0;
      this.db.prepare(`
        INSERT INTO candidate_generation_items(
          item_id, position_id, played_move_id, reference_lines_json,
          explanation, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(item_id) DO UPDATE SET
          position_id = excluded.position_id,
          played_move_id = excluded.played_move_id,
          reference_lines_json = excluded.reference_lines_json,
          explanation = excluded.explanation,
          evidence_json = excluded.evidence_json
      `).run(
        stored.id,
        candidate.position_id,
        candidate.source_move_id,
        JSON.stringify(lines),
        `In your game you played ${candidate.played_move_san}. Compare it with the candidates you generated before seeing the engine choices.`,
        JSON.stringify({ detector: "meaningful-mistake-v2", centipawnLoss: candidate.centipawn_loss }),
      );
      this.db.prepare(`
        INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
        VALUES (?, 'process.candidate_generation', 'automatic', 0.9, 1)
        ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
      `).run(stored.id);
      this.db.prepare("INSERT OR IGNORE INTO review_states(item_id, mastery_level, due_at) VALUES (?, 0, ?)")
        .run(stored.id, now());
    })();
    return inserted;
  }
}

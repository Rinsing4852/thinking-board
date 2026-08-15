import { Chess } from "chess.js";

import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";

interface QuietRow {
  source_move_id: string;
  profile_id: string;
  player_color: "white" | "black";
  position_id: string;
  fen: string;
  played_move_san: string;
  move_number: number;
  position_analysis_id: string;
}

interface LineRow {
  rank: number;
  move_uci: string;
  move_san: string;
  centipawns_white: number | null;
  mate_in_white: number | null;
}

function utility(line: LineRow): number {
  if (line.centipawns_white !== null) return line.centipawns_white;
  const mate = line.mate_in_white ?? 0;
  return mate > 0
    ? 100_000 - Math.min(100, mate) * 100
    : -100_000 + Math.min(100, Math.abs(mate)) * 100;
}

function lineLoss(best: LineRow, line: LineRow, color: "white" | "black"): number {
  return Math.max(0, Math.round(color === "white" ? utility(best) - utility(line) : utility(line) - utility(best)));
}

function uciMove(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
  };
}

/** Generates the two remaining V1 modes from already persisted analysis. */
export class V1Generator {
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
      SELECT id FROM analysis_runs WHERE game_id = ? AND status = 'completed'
      ORDER BY completed_at DESC LIMIT 1
    `).get(gameId) as { id: string } | undefined)?.id;
    if (!selectedRun) return 0;
    const generated = this.generatePunishments(gameId) + this.generateQuietPositions(gameId, selectedRun);
    this.ensureEditableDiagnoses(gameId, selectedRun);
    return generated;
  }

  private ensureEditableDiagnoses(gameId: string, runId: string): void {
    const rows = this.db.prepare(`
      SELECT m.id AS move_id, g.profile_id
      FROM moves m
      JOIN games g ON g.id = m.game_id
      JOIN move_assessments ma ON ma.move_id = m.id AND ma.run_id = ? AND ma.meaningful = 1
      WHERE m.game_id = ? AND m.mover_color = g.player_color
        AND NOT EXISTS (
          SELECT 1 FROM training_items ti
          WHERE ti.source_move_id = m.id AND ti.active = 1 AND ti.mode != 'diagnosis_only'
        )
    `).all(runId, gameId) as Array<{ move_id: string; profile_id: string }>;
    this.db.transaction(() => {
      for (const row of rows) {
        const itemId = id();
        this.db.prepare(`
          INSERT OR IGNORE INTO training_items(
            id, profile_id, game_id, source_move_id, mode, prompt_version, active, created_at
          ) VALUES (?, ?, ?, ?, 'diagnosis_only', 2, 1, ?)
        `).run(itemId, row.profile_id, gameId, row.move_id, now());
        const stored = this.db.prepare(`
          SELECT id FROM training_items WHERE mode = 'diagnosis_only' AND source_move_id = ?
        `).get(row.move_id) as { id: string };
        this.db.prepare("UPDATE training_items SET active = 1, prompt_version = 2 WHERE id = ?").run(stored.id);
        this.db.prepare(`
          INSERT OR IGNORE INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
          VALUES (?, 'process.calculation_failure', 'automatic', 0.4, 1)
        `).run(stored.id);
      }
    })();
  }

  private generatePunishments(gameId: string): number {
    const sources = this.db.prepare(`
      SELECT ti.source_move_id, ti.profile_id, bci.after_candidate_position_id,
             bci.candidate_move_uci, bci.candidate_move_san, bci.explanation,
             bci.evidence_json
      FROM training_items ti
      JOIN blunder_check_items bci ON bci.item_id = ti.id
      WHERE ti.game_id = ? AND ti.mode = 'blunder_check' AND ti.active = 1
    `).all(gameId) as Array<{
      source_move_id: string; profile_id: string; after_candidate_position_id: string;
      candidate_move_uci: string; candidate_move_san: string; explanation: string;
      evidence_json: string;
    }>;
    let generated = 0;
    for (const source of sources) {
      const existing = this.db.prepare(
        "SELECT id FROM training_items WHERE mode = 'punish_blunder' AND source_move_id = ?",
      ).get(source.source_move_id) as { id: string } | undefined;
      const original = this.db.prepare(`
        SELECT ti.id FROM training_items ti
        WHERE ti.mode = 'blunder_check' AND ti.source_move_id = ?
      `).get(source.source_move_id) as { id: string };
      const responses = this.db.prepare(`
        SELECT move_uci, move_san, categories_json, engine_rank, loss_from_best_cp
        FROM acceptable_responses WHERE item_id = ? ORDER BY engine_rank
      `).all(original.id) as Array<{
        move_uci: string; move_san: string; categories_json: string;
        engine_rank: number; loss_from_best_cp: number;
      }>;
      if (responses.length === 0) continue;
      const itemId = existing?.id ?? id();
      this.db.transaction(() => {
        this.db.prepare(`
          INSERT OR IGNORE INTO training_items(
            id, profile_id, game_id, source_move_id, mode, prompt_version, created_at
          ) VALUES (?, ?, ?, ?, 'punish_blunder', 2, ?)
        `).run(itemId, source.profile_id, gameId, source.source_move_id, now());
        this.db.prepare("UPDATE training_items SET active = 1, prompt_version = 2 WHERE id = ?").run(itemId);
        this.db.prepare(`
          INSERT INTO punish_blunder_items(
            item_id, position_id, bad_move_uci, bad_move_san, explanation, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(item_id) DO UPDATE SET
            position_id = excluded.position_id,
            bad_move_uci = excluded.bad_move_uci,
            bad_move_san = excluded.bad_move_san,
            explanation = excluded.explanation,
            evidence_json = excluded.evidence_json
        `).run(
          itemId, source.after_candidate_position_id, source.candidate_move_uci,
          source.candidate_move_san, source.explanation, source.evidence_json,
        );
        const insert = this.db.prepare(`
          INSERT INTO acceptable_responses(
            id, item_id, move_uci, move_san, categories_json, engine_rank, loss_from_best_cp
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        this.db.prepare("DELETE FROM acceptable_responses WHERE item_id = ?").run(itemId);
        for (const response of responses) {
          insert.run(
            id(), itemId, response.move_uci, response.move_san, response.categories_json,
            response.engine_rank, response.loss_from_best_cp,
          );
        }
        this.db.prepare(`
          INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
          VALUES (?, 'process.pattern_failure', 'automatic', 0.8, 1)
          ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
        `).run(itemId);
        this.db.prepare("INSERT OR IGNORE INTO review_states(item_id, mastery_level, due_at) VALUES (?, 0, ?)")
          .run(itemId, now());
      })();
      this.enrichBlunderConcepts(source.source_move_id);
      if (!existing) generated += 1;
    }
    return generated;
  }

  private enrichBlunderConcepts(sourceMoveId: string): void {
    const items = this.db.prepare(`
      SELECT ti.id, ti.mode, p.fen
      FROM training_items ti
      LEFT JOIN blunder_check_items bci ON bci.item_id = ti.id
      LEFT JOIN punish_blunder_items pbi ON pbi.item_id = ti.id
      JOIN positions p ON p.id = COALESCE(bci.after_candidate_position_id, pbi.position_id)
      WHERE ti.source_move_id = ? AND ti.mode IN ('blunder_check', 'punish_blunder')
    `).all(sourceMoveId) as Array<{ id: string; mode: string; fen: string }>;
    for (const item of items) {
      const response = this.db.prepare(`
        SELECT move_uci, move_san, categories_json FROM acceptable_responses
        WHERE item_id = ? ORDER BY engine_rank LIMIT 1
      `).get(item.id) as { move_uci: string; move_san: string; categories_json: string } | undefined;
      if (!response) continue;
      const categories = JSON.parse(response.categories_json) as string[];
      let tactic = categories.includes("capture") ? "tactic.missed_capture" : "tactic.hanging_piece";
      try {
        const board = new Chess(item.fen);
        const applied = board.move(uciMove(response.move_uci));
        if (applied?.captured === "q") tactic = "tactic.queen_loss";
        else if (applied?.captured === "r") tactic = "tactic.rook_loss";
        else if (applied?.captured === "b" || applied?.captured === "n") tactic = "tactic.minor_piece_loss";
        if (applied) {
          const attacker = applied.color;
          const victim = attacker === "w" ? "b" : "w";
          let valuableTargets = 0;
          for (const rank of board.board()) {
            for (const piece of rank) {
              if (piece && piece.color === victim && ["n", "b", "r", "q", "k"].includes(piece.type)
                && board.attackers(piece.square, attacker).includes(applied.to)) valuableTargets += 1;
            }
          }
          if (valuableTargets >= 2) tactic = "tactic.fork";
        }
        if (board.isCheckmate() || response.move_san.includes("#")) tactic = "tactic.allowed_mate";
      } catch {
        // Stored engine moves were legal when generated; retain the conservative label if old data is malformed.
      }
      this.db.prepare(`
        DELETE FROM training_item_concepts
        WHERE item_id = ? AND source = 'automatic'
          AND concept_id IN (SELECT id FROM concepts WHERE family = 'tactical')
      `).run(item.id);
      this.db.prepare(`
        INSERT OR IGNORE INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
        VALUES (?, ?, 'automatic', 0.85, 0)
      `).run(item.id, tactic);
      if (item.mode === "blunder_check") {
        this.db.prepare(`
          INSERT OR IGNORE INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
          VALUES (?, 'process.missed_forcing_move', 'automatic', 0.75, 0)
        `).run(item.id);
      }
    }
  }

  private generateQuietPositions(gameId: string, runId: string): number {
    const rows = this.db.prepare(`
      SELECT m.id AS source_move_id, g.profile_id, g.player_color,
             m.from_position_id AS position_id, position.fen,
             m.san AS played_move_san, m.move_number,
             analysis.id AS position_analysis_id
      FROM moves m
      JOIN games g ON g.id = m.game_id
      JOIN positions position ON position.id = m.from_position_id
      JOIN move_assessments assessment ON assessment.move_id = m.id AND assessment.run_id = ?
      JOIN position_analyses analysis ON analysis.position_id = position.id AND analysis.run_id = ?
      WHERE m.game_id = ? AND m.mover_color = g.player_color
        AND assessment.meaningful = 0 AND m.move_number >= 8
      ORDER BY m.ply
    `).all(runId, runId, gameId) as QuietRow[];
    let generated = 0;
    for (const row of rows) {
      const existing = this.db.prepare(
        "SELECT id FROM training_items WHERE mode = 'quiet_position' AND source_move_id = ?",
      ).get(row.source_move_id) as { id: string } | undefined;
      const board = new Chess(row.fen);
      if (board.inCheck() || board.isGameOver()) continue;
      const lines = this.db.prepare(`
        SELECT rank, move_uci, move_san, centipawns_white, mate_in_white
        FROM engine_lines WHERE position_analysis_id = ? AND move_uci != '(none)'
        ORDER BY rank LIMIT 3
      `).all(row.position_analysis_id) as LineRow[];
      const best = lines[0];
      if (!best) continue;
      let applied;
      try { applied = new Chess(row.fen).move(uciMove(best.move_uci)); } catch { continue; }
      if (!applied || applied.captured || applied.san.includes("+") || ["p", "k"].includes(applied.piece)) continue;
      const weakestSquare = best.move_uci.slice(0, 2);
      const acceptable = lines.filter((line) => {
        if (line.move_uci.slice(0, 2) !== weakestSquare || lineLoss(best, line, row.player_color) > 100) return false;
        try {
          const move = new Chess(row.fen).move(uciMove(line.move_uci));
          return Boolean(move && !move.captured && !move.san.includes("+"));
        } catch { return false; }
      }).map((line) => ({
        moveUci: line.move_uci,
        moveSan: line.move_san,
        centipawnLoss: lineLoss(best, line, row.player_color),
      }));
      if (acceptable.length === 0) continue;
      const itemId = existing?.id ?? id();
      const pieceName = ({ n: "knight", b: "bishop", r: "rook", q: "queen" } as Record<string, string>)[applied.piece] ?? "piece";
      this.db.transaction(() => {
        this.db.prepare(`
          INSERT OR IGNORE INTO training_items(
            id, profile_id, game_id, source_move_id, mode, prompt_version, created_at
          ) VALUES (?, ?, ?, ?, 'quiet_position', 2, ?)
        `).run(itemId, row.profile_id, gameId, row.source_move_id, now());
        this.db.prepare("UPDATE training_items SET active = 1, prompt_version = 2 WHERE id = ?").run(itemId);
        this.db.prepare(`
          INSERT INTO quiet_position_items(
            item_id, position_id, weakest_squares_json, acceptable_moves_json,
            explanation, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(item_id) DO UPDATE SET
            position_id = excluded.position_id,
            weakest_squares_json = excluded.weakest_squares_json,
            acceptable_moves_json = excluded.acceptable_moves_json,
            explanation = excluded.explanation,
            evidence_json = excluded.evidence_json
        `).run(
          itemId, row.position_id, JSON.stringify([weakestSquare]), JSON.stringify(acceptable),
          `Stockfish supports a useful quiet improvement for the ${pieceName} on ${weakestSquare}. In your game you played ${row.played_move_san}.`,
          JSON.stringify({ detector: "quiet-engine-improvement-v2", engineRank: best.rank }),
        );
        this.db.prepare(`
          INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
          VALUES (?, 'process.weakest_piece', 'automatic', 0.75, 1)
          ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
        `).run(itemId);
        this.db.prepare("INSERT OR IGNORE INTO review_states(item_id, mastery_level, due_at) VALUES (?, 0, ?)")
          .run(itemId, now());
      })();
      if (!existing) generated += 1;
    }
    return generated;
  }
}

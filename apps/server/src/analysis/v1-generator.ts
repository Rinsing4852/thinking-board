import { Chess } from "chess.js";

import type { SqliteDatabase } from "../db/database.js";
import { tacticalPunishment } from "./tactical-punishment.js";
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
  pv_uci_json: string;
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
    const generated = this.generateQuietPositions(gameId, selectedRun);
    this.ensureEditableDiagnoses(gameId, selectedRun);
    for (const row of this.db.prepare("SELECT DISTINCT source_move_id FROM training_items WHERE game_id=? AND active=1 AND mode IN ('blunder_check','punish_blunder')").all(gameId) as Array<{source_move_id:string}>)this.enrichBlunderConcepts(row.source_move_id);
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

  private enrichBlunderConcepts(sourceMoveId: string): void {
    const items = this.db.prepare(`
      SELECT ti.id, ti.mode, p.fen
      FROM training_items ti
      LEFT JOIN blunder_check_items bci ON bci.item_id = ti.id
      LEFT JOIN punish_blunder_items pbi ON pbi.item_id = ti.id
      JOIN positions p ON p.id = CASE WHEN json_extract(bci.evidence_json,'$.exerciseKind')='missed_opportunity' THEN bci.before_position_id ELSE COALESCE(bci.after_candidate_position_id,pbi.position_id) END
      WHERE ti.source_move_id = ? AND ti.mode IN ('blunder_check', 'punish_blunder')
    `).all(sourceMoveId) as Array<{ id: string; mode: string; fen: string }>;
    for (const item of items) {
      const response = this.db.prepare(`
        SELECT move_uci, move_san, categories_json FROM acceptable_responses
        WHERE item_id = ? ORDER BY engine_rank LIMIT 1
      `).get(item.id) as { move_uci: string; move_san: string; categories_json: string } | undefined;
      if (!response) continue;
      const categories = JSON.parse(response.categories_json) as string[];
      const evidence = this.db.prepare("SELECT evidence_json FROM blunder_check_items WHERE item_id=? UNION ALL SELECT evidence_json FROM punish_blunder_items WHERE item_id=?").pluck().get(item.id,item.id) as string | undefined;
      const savedEvidence = evidence ? JSON.parse(evidence) as { exerciseKind?:string; proof?: { kind?: string } } : undefined;
      const proof = savedEvidence?.proof;
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
          if (valuableTargets >= 2 && proof?.kind === "material") tactic = "tactic.fork";
        }
        if (proof?.kind === "forced_mate" || board.isCheckmate() || response.move_san.includes("#")) tactic = "tactic.allowed_mate";
      } catch {
        // Stored engine moves were legal when generated; retain the conservative label if old data is malformed.
      }
      if(savedEvidence?.exerciseKind==='missed_opportunity')tactic=proof?.kind==='forced_mate'?'tactic.missed_mate':'tactic.missed_capture';
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
        SELECT rank, move_uci, move_san, centipawns_white, mate_in_white, pv_uci_json
        FROM engine_lines WHERE position_analysis_id = ? AND move_uci != '(none)'
        ORDER BY rank LIMIT 3
      `).all(row.position_analysis_id) as LineRow[];
      const best = lines[0];
      if (!best) continue;
      let applied;
      try { applied = new Chess(row.fen).move(uciMove(best.move_uci)); } catch { continue; }
      if (!applied || applied.captured || applied.san.includes("+")) continue;
      const forcingAlternative = lines.some(line => {
        if(lineLoss(best,line,row.player_color)>75)return false;
        try {const reply=new Chess(row.fen).move(uciMove(line.move_uci));return Boolean(reply.captured || reply.san.includes('+'));}catch{return true;}
      });
      if(forcingAlternative || lines.some(line=>lineLoss(best,line,row.player_color)<=75 && tacticalPunishment(row.fen,row.fen,line.move_uci,line.pv_uci_json,line.mate_in_white)))continue;
      const weakestSquare = best.move_uci.slice(0, 2);
      const acceptable = lines.filter((line) => {
        if (lineLoss(best, line, row.player_color) > 75) return false;
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
      const pieceName = ({ p: "pawn", k: "king", n: "knight", b: "bishop", r: "rook", q: "queen" } as Record<string, string>)[applied.piece] ?? "piece";
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
          itemId, row.position_id, JSON.stringify([...new Set(acceptable.map(move=>move.moveUci.slice(0,2)))]), JSON.stringify(acceptable),
          `Stockfish supports quiet improvement choices here, including the ${pieceName} on ${weakestSquare}. This does not prove that it is the weakest piece. In your game you played ${row.played_move_san}.`,
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

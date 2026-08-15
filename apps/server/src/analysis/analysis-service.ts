import { Chess } from "chess.js";

import type { AppConfig } from "../config.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { UciEngine, type EngineLine, type EngineScore } from "./uci-engine.js";
import { CandidateGenerator } from "./candidate-generator.js";
import { WhatChangedGenerator } from "./what-changed-generator.js";
import { V1Generator } from "./v1-generator.js";

interface PositionRow {
  id: string;
  ply_index: number;
  fen: string;
}

interface MoveRow {
  id: string;
  ply: number;
  move_number: number;
  mover_color: "white" | "black";
  from_position_id: string;
  to_position_id: string;
  uci: string;
  san: string;
  from_fen: string;
}

interface StoredScore extends EngineScore {
  positionAnalysisId: string;
}

interface StoredLine {
  move_uci: string;
  move_san: string;
  centipawns_white: number | null;
  mate_in_white: number | null;
  rank: number;
}

const PIECE_VALUES: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function utilityWhite(score: EngineScore): number {
  if (score.centipawnsWhite !== null) return score.centipawnsWhite;
  const mate = score.mateInWhite ?? 0;
  if (mate > 0) return 100_000 - Math.min(100, mate) * 100;
  return -100_000 + Math.min(100, Math.abs(mate)) * 100;
}

function moveFromUci(uci: string): { from: string; to: string; promotion?: string } {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
  };
}

export class AnalysisService {
  private readonly engine: UciEngine;
  private readonly candidates: CandidateGenerator;
  private readonly whatChanged: WhatChangedGenerator;
  private readonly v1: V1Generator;

  constructor(private readonly db: SqliteDatabase, private readonly config: AppConfig) {
    this.engine = new UciEngine(
      config.stockfishBinary,
      config.stockfishThreads,
      config.stockfishHashMb,
    );
    this.candidates = new CandidateGenerator(db);
    this.whatChanged = new WhatChangedGenerator(db);
    this.v1 = new V1Generator(db);
  }

  backfillCandidates(): number {
    return this.candidates.backfill();
  }

  backfillWhatChanged(): number {
    return this.whatChanged.backfill();
  }

  backfillV1(): number {
    return this.v1.backfill();
  }

  async analyzeGames(gameIds: string[], onProgress: (completed: number) => void): Promise<{ analyzed: number; items: number }> {
    await this.engine.initialize();
    let analyzed = 0;
    let items = 0;
    for (const gameId of gameIds) {
      items += await this.analyzeGame(gameId);
      analyzed += 1;
      onProgress(analyzed);
    }
    return { analyzed, items };
  }

  async close(): Promise<void> {
    await this.engine.close();
  }

  private async analyzeGame(gameId: string): Promise<number> {
    const runId = id();
    this.db.prepare(`
      INSERT INTO analysis_runs(
        id, game_id, engine_name, engine_version, depth, multipv, threads,
        hash_mb, analysis_version, status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 2, 'running', ?)
    `).run(
      runId, gameId, this.engine.name, this.engine.name, this.config.stockfishDepth,
      this.config.stockfishMultiPv, this.config.stockfishThreads,
      this.config.stockfishHashMb, now(),
    );

    try {
      const positions = this.db.prepare(`
        SELECT id, ply_index, fen FROM positions WHERE game_id = ? ORDER BY ply_index
      `).all(gameId) as PositionRow[];
      const scores = new Map<string, StoredScore>();
      for (const position of positions) {
        const analysis = await this.engine.analyze(
          position.fen,
          this.config.stockfishDepth,
          this.config.stockfishMultiPv,
        );
        const best = analysis.lines[0];
        if (!best) throw new Error(`No engine line for position ${position.ply_index}`);
        const positionAnalysisId = id();
        this.db.transaction(() => {
          this.db.prepare(`
            INSERT INTO position_analyses(
              id, run_id, position_id, centipawns_white, mate_in_white, depth
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            positionAnalysisId, runId, position.id,
            best.centipawnsWhite, best.mateInWhite, analysis.depth,
          );
          const insertLine = this.db.prepare(`
            INSERT INTO engine_lines(
              id, position_analysis_id, rank, move_uci, move_san,
              centipawns_white, mate_in_white, pv_uci_json, pv_san_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);
          for (const line of analysis.lines) {
            insertLine.run(
              id(), positionAnalysisId, line.rank, line.moveUci, line.moveSan,
              line.centipawnsWhite, line.mateInWhite,
              JSON.stringify(line.pvUci), JSON.stringify(line.pvSan),
            );
          }
        })();
        scores.set(position.id, {
          positionAnalysisId,
          centipawnsWhite: best.centipawnsWhite,
          mateInWhite: best.mateInWhite,
        });
      }

      const moves = this.db.prepare(`
        SELECT m.id, m.ply, m.move_number, m.mover_color, m.from_position_id,
               m.to_position_id, m.uci, m.san, position.fen AS from_fen
        FROM moves m JOIN positions position ON position.id = m.from_position_id
        WHERE m.game_id = ? ORDER BY m.ply
      `).all(gameId) as MoveRow[];
      await this.storeAssessments(runId, moves, scores);
      this.deactivateStaleGeneratedItems(gameId, runId);
      const blunderChecks = this.generateBlunderChecks(gameId, runId, moves, scores);
      this.db.prepare("UPDATE analysis_runs SET status = 'completed', completed_at = ? WHERE id = ?")
        .run(now(), runId);
      const whatChanged = this.whatChanged.generateForGame(gameId, runId);
      const candidates = this.candidates.generateForGame(gameId, runId);
      const v1 = this.v1.generateForGame(gameId, runId);
      this.db.prepare("UPDATE games SET analyzed_at = ? WHERE id = ?").run(now(), gameId);
      return blunderChecks + whatChanged + candidates + v1;
    } catch (error) {
      this.db.prepare("UPDATE analysis_runs SET status = 'failed', completed_at = ? WHERE id = ?")
        .run(now(), runId);
      throw error;
    }
  }

  private async storeAssessments(runId: string, moves: MoveRow[], scores: Map<string, StoredScore>): Promise<void> {
    const insert = this.db.prepare(`
      INSERT INTO move_assessments(
        id, run_id, move_id, eval_before_cp_white, eval_before_mate_white,
        eval_after_cp_white, eval_after_mate_white, centipawn_loss,
        comparison_loss, classification, meaningful
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const assessments: Array<{
      move: MoveRow; before: StoredScore; played: EngineScore; loss: number;
      classification: "good" | "inaccuracy" | "mistake" | "blunder";
    }> = [];
    for (const move of moves) {
        const before = scores.get(move.from_position_id);
        if (!before) throw new Error(`Missing score for ply ${move.ply}`);
        const storedLine = this.db.prepare(`
          SELECT centipawns_white, mate_in_white FROM engine_lines
          WHERE position_analysis_id = ? AND move_uci = ? LIMIT 1
        `).get(before.positionAnalysisId, move.uci) as {
          centipawns_white: number | null; mate_in_white: number | null;
        } | undefined;
        const searchedLine = storedLine ? null : (await this.engine.analyze(
          move.from_fen,
          this.config.stockfishDepth,
          1,
          [move.uci],
        )).lines[0];
        const played: EngineScore = storedLine
          ? { centipawnsWhite: storedLine.centipawns_white, mateInWhite: storedLine.mate_in_white }
          : searchedLine ?? (() => { throw new Error(`No played-move score for ply ${move.ply}`); })();
        const rawLoss = move.mover_color === "white"
          ? utilityWhite(before) - utilityWhite(played)
          : utilityWhite(played) - utilityWhite(before);
        const loss = Math.min(3_000, Math.max(0, Math.round(rawLoss)));
        const classification = loss >= 300
          ? "blunder"
          : loss >= this.config.meaningfulLossCp
            ? "mistake"
            : loss >= 75 ? "inaccuracy" : "good";
        assessments.push({ move, before, played, loss, classification });
    }
    this.db.transaction(() => {
      for (const { move, before, played, loss, classification } of assessments) {
        insert.run(
          id(), runId, move.id,
          before.centipawnsWhite, before.mateInWhite,
          played.centipawnsWhite, played.mateInWhite,
          before.mateInWhite !== null || played.mateInWhite !== null ? null : loss,
          loss, classification, loss >= this.config.meaningfulLossCp ? 1 : 0,
        );
      }
    })();
  }

  private deactivateStaleGeneratedItems(gameId: string, _runId: string): void {
    this.db.prepare(`
      UPDATE training_items SET active = 0
      WHERE game_id = ? AND mode IN (
        'blunder_check', 'what_changed', 'candidate_generation', 'punish_blunder',
        'quiet_position', 'diagnosis_only'
      )
    `).run(gameId);
  }

  private generateBlunderChecks(
    gameId: string,
    runId: string,
    moves: MoveRow[],
    scores: Map<string, StoredScore>,
  ): number {
    const game = this.db.prepare("SELECT profile_id, player_color FROM games WHERE id = ?")
      .get(gameId) as { profile_id: string; player_color: "white" | "black" };
    const meaningful = this.db.prepare(`
      SELECT meaningful, comparison_loss AS centipawn_loss
      FROM move_assessments WHERE run_id = ? AND move_id = ?
    `);
    let generated = 0;

    for (const move of moves) {
      if (move.mover_color !== game.player_color) continue;
      const assessment = meaningful.get(runId, move.id) as { meaningful: number; centipawn_loss: number };
      if (!assessment?.meaningful) continue;
      const afterScore = scores.get(move.to_position_id);
      if (!afterScore) continue;
      const rows = this.db.prepare(`
        SELECT el.move_uci, el.move_san, el.centipawns_white, el.mate_in_white, el.rank
        FROM engine_lines el
        WHERE el.position_analysis_id = ? AND el.move_uci != '(none)'
        ORDER BY el.rank
      `).all(afterScore.positionAnalysisId) as StoredLine[];
      const accepted = this.acceptablePunishments(move, rows, assessment.centipawn_loss);
      if (accepted.length === 0) continue;
      this.insertTrainingItem(gameId, game.profile_id, move, accepted, assessment.centipawn_loss);
      generated += 1;
    }
    return generated;
  }

  private acceptablePunishments(move: MoveRow, lines: StoredLine[], moveLoss: number): Array<StoredLine & { categories: string[]; loss: number; captured: string | null; threatened: string[] }> {
    const position = this.db.prepare("SELECT fen FROM positions WHERE id = ?")
      .get(move.to_position_id) as { fen: string };
    const opponent = move.mover_color === "white" ? "black" : "white";
    const best = lines[0];
    if (!best) return [];
    const bestUtility = utilityWhite({
      centipawnsWhite: best.centipawns_white,
      mateInWhite: best.mate_in_white,
    });
    const result: Array<StoredLine & { categories: string[]; loss: number; captured: string | null; threatened: string[] }> = [];

    for (const line of lines) {
      const beforeBoard = new Chess(position.fen);
      const board = new Chess(position.fen);
      let applied;
      try {
        applied = board.move(moveFromUci(line.move_uci));
      } catch {
        continue;
      }
      if (!applied) continue;
      const categories: string[] = [];
      if (board.inCheck()) categories.push("check");
      if (applied.captured) categories.push("capture");
      const player = move.mover_color === "white" ? "w" : "b";
      const attackingColor = opponent === "white" ? "w" : "b";
      const threatened: string[] = [];
      for (const rank of board.board()) {
        for (const piece of rank) {
          if (!piece || piece.color !== player || (PIECE_VALUES[piece.type] ?? 0) < 3) continue;
          if (board.isAttacked(piece.square, attackingColor) && !beforeBoard.isAttacked(piece.square, attackingColor)) {
            threatened.push(piece.square);
          }
        }
      }
      if (threatened.length > 0 && !categories.includes("capture")) categories.push("threat");
      const capturedValue = applied.captured ? PIECE_VALUES[applied.captured] ?? 0 : 0;
      const forcesMate = line.mate_in_white !== null && (
        opponent === "white" ? line.mate_in_white > 0 : line.mate_in_white < 0
      );
      const highConfidence = capturedValue >= 3 || threatened.length > 0 || board.isCheckmate()
        || (categories.includes("check") && (forcesMate || moveLoss >= 300));
      if (!highConfidence) continue;

      const lineUtility = utilityWhite({
        centipawnsWhite: line.centipawns_white,
        mateInWhite: line.mate_in_white,
      });
      const loss = opponent === "white"
        ? bestUtility - lineUtility
        : lineUtility - bestUtility;
      if (loss > this.config.acceptableToleranceCp) continue;
      result.push({
        ...line, categories, loss: Math.max(0, Math.round(loss)),
        captured: applied.captured ?? null, threatened,
      });
    }
    return result;
  }

  private insertTrainingItem(
    gameId: string,
    profileId: string,
    move: MoveRow,
    responses: Array<StoredLine & { categories: string[]; loss: number; captured: string | null; threatened: string[] }>,
    moveLoss: number,
  ): void {
    const itemId = id();
    const top = responses[0];
    if (!top) return;
    const action = top.categories.includes("capture")
      ? `capture immediately with ${top.move_san}`
      : top.categories.includes("check")
        ? `play the forcing check ${top.move_san}`
        : `create the immediate threat ${top.move_san}`;
    const explanation = `After ${move.san}, the opponent can ${action}.`;
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT OR IGNORE INTO training_items(
          id, profile_id, game_id, source_move_id, mode, prompt_version, created_at
        ) VALUES (?, ?, ?, ?, 'blunder_check', 1, ?)
      `).run(itemId, profileId, gameId, move.id, now());
      const stored = this.db.prepare("SELECT id FROM training_items WHERE mode = 'blunder_check' AND source_move_id = ?")
        .get(move.id) as { id: string };
      this.db.prepare("UPDATE training_items SET active = 1, prompt_version = 2 WHERE id = ?")
        .run(stored.id);
      if (stored.id !== itemId) {
        this.db.prepare("DELETE FROM acceptable_responses WHERE item_id = ?").run(stored.id);
        this.db.prepare(`
          UPDATE blunder_check_items SET before_position_id = ?, after_candidate_position_id = ?,
            candidate_move_uci = ?, candidate_move_san = ?, explanation = ?, evidence_json = ?
          WHERE item_id = ?
        `).run(
          move.from_position_id, move.to_position_id, move.uci, move.san,
          explanation, JSON.stringify({ centipawnLoss: moveLoss, detector: "immediate-punishment-v2" }),
          stored.id,
        );
      }
      if (stored.id === itemId) {
        this.db.prepare(`
          INSERT INTO blunder_check_items(
            item_id, before_position_id, after_candidate_position_id,
            candidate_move_uci, candidate_move_san, explanation, evidence_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
          itemId, move.from_position_id, move.to_position_id, move.uci, move.san,
          explanation, JSON.stringify({ centipawnLoss: moveLoss, detector: "immediate-punishment-v2" }),
        );
      }
      const insertResponse = this.db.prepare(`
        INSERT INTO acceptable_responses(
          id, item_id, move_uci, move_san, categories_json, engine_rank, loss_from_best_cp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const response of responses) {
        insertResponse.run(
          id(), stored.id, response.move_uci, response.move_san,
          JSON.stringify(response.categories), response.rank, response.loss,
        );
      }
      this.db.prepare(`
        INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
        VALUES (?, 'process.blunder_check', 'automatic', 0.95, 1)
        ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
      `).run(stored.id);
      const categoryConcept = top.categories.includes("capture")
        ? "response.capture"
        : top.categories.includes("check") ? "response.check" : "response.threat";
      this.db.prepare(`
        INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary)
        VALUES (?, ?, 'automatic', 0.9, 0)
        ON CONFLICT(item_id, concept_id, source) DO UPDATE SET active = 1, confidence = excluded.confidence
      `).run(stored.id, categoryConcept);
      this.db.prepare(`
        INSERT OR IGNORE INTO review_states(item_id, mastery_level, due_at) VALUES (?, 0, ?)
      `).run(stored.id, now());
    })();
  }
}

import { verificationReason, verifyMove, type VerificationEvidence } from "./verify-move.js";
import { assessMove, QUALITY_VERSION } from "./move-quality.js";
import { Chess } from "chess.js";

import type { AppConfig } from "../config.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { UciEngine, type EngineLine, type EngineScore, type EngineHistory } from "./uci-engine.js";
import { CandidateGenerator } from "./candidate-generator.js";
import { WhatChangedGenerator } from "./what-changed-generator.js";
import { V1Generator } from "./v1-generator.js";
import { significantMistake, tacticalPunishment, type PunishmentProof, type SavedMoveAssessment } from "./tactical-punishment.js";

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
  pv_uci_json: string;
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

  backfillBlunderChecks(): number {
    const runs = this.db.prepare(`SELECT ar.id, ar.game_id FROM analysis_runs ar
      WHERE ar.status='completed' AND ar.id=(SELECT latest.id FROM analysis_runs latest
        WHERE latest.game_id=ar.game_id AND latest.status='completed'
        ORDER BY latest.completed_at DESC, latest.rowid DESC LIMIT 1)`)
      .all() as Array<{ id: string; game_id: string }>;
    return runs.reduce((total, run) => total + this.db.transaction(() => {
      const moves = this.db.prepare(`SELECT m.id,m.ply,m.move_number,m.mover_color,m.from_position_id,
        m.to_position_id,m.uci,m.san,p.fen AS from_fen FROM moves m
        JOIN positions p ON p.id=m.from_position_id
        JOIN move_assessments ma ON ma.move_id=m.id AND ma.run_id=? AND ma.meaningful=1
        WHERE m.game_id=? ORDER BY m.ply`)
        .all(run.id,run.game_id) as MoveRow[];
      const scores = new Map((this.db.prepare(`SELECT pa.id AS positionAnalysisId,pa.position_id,
        pa.centipawns_white AS centipawnsWhite,pa.mate_in_white AS mateInWhite
        FROM position_analyses pa WHERE pa.run_id=?`).all(run.id) as Array<StoredScore & { position_id: string }>)
        .map(score => [score.position_id, score]));
      this.db.prepare("UPDATE training_items SET active=0 WHERE game_id=? AND mode IN ('blunder_check','punish_blunder')").run(run.game_id);
      return this.generateBlunderChecks(run.game_id, run.id, moves, scores);
    })(), 0);
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

  async analyzeGames(gameIds: string[], onProgress: (completed: number) => void, shouldContinue: () => boolean = () => true): Promise<{ analyzed: number; items: number }> {
    await this.engine.initialize();
    let analyzed = 0;
    let items = 0;
    for (const gameId of gameIds) {
      if (!shouldContinue()) break;
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 5, 'running', ?)
    `).run(
      runId, gameId, this.engine.name, this.engine.name, this.config.stockfishDepth,
      this.config.stockfishMultiPv, this.config.stockfishThreads,
      this.config.stockfishHashMb, now(),
    );

    try {
      const positions = this.db.prepare(`
        SELECT id, ply_index, fen FROM positions WHERE game_id = ? ORDER BY ply_index
      `).all(gameId) as PositionRow[];
      const moves = this.db.prepare(`
        SELECT m.id, m.ply, m.move_number, m.mover_color, m.from_position_id,
               m.to_position_id, m.uci, m.san, position.fen AS from_fen
        FROM moves m JOIN positions position ON position.id = m.from_position_id
        WHERE m.game_id = ? ORDER BY m.ply
      `).all(gameId) as MoveRow[];
      const initialFen=positions[0]?.fen;
      if(!initialFen)throw new Error("Game has no positions");
      const result=this.db.prepare("SELECT result FROM games WHERE id=?").pluck().get(gameId);
      const histories=new Map(positions.map(position=>[position.id,{initialFen,moves:moves.slice(0,position.ply_index).map(move=>move.uci),
        drawClaimed:result==="1/2-1/2"&&position.ply_index===moves.length}]));
      const scores = new Map<string, StoredScore>();
      for (const position of positions) {
        const analysis = await this.engine.analyze(
          position.fen,
          this.config.stockfishDepth,
          this.config.stockfishMultiPv,[],undefined,undefined,histories.get(position.id),
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

      await this.storeAssessments(runId, moves, scores,histories);
      return this.db.transaction(() => {
        this.deactivateStaleGeneratedItems(gameId, runId);
        const blunderChecks = this.generateBlunderChecks(gameId, runId, moves, scores);
        const whatChanged = this.whatChanged.generateForGame(gameId, runId);
        const candidates = this.candidates.generateForGame(gameId, runId);
        const v1 = this.v1.generateForGame(gameId, runId);
        const completedAt=now();
        this.db.prepare("UPDATE analysis_runs SET status = 'completed', completed_at = ? WHERE id = ?").run(completedAt,runId);
        this.db.prepare("UPDATE games SET analyzed_at = ? WHERE id = ?").run(completedAt,gameId);
        return blunderChecks + whatChanged + candidates + v1;
      })();
    } catch (error) {
      this.db.prepare("UPDATE analysis_runs SET status = 'failed', completed_at = ? WHERE id = ?")
        .run(now(), runId);
      throw error;
    }
  }

  private async storeAssessments(runId: string, moves: MoveRow[], scores: Map<string, StoredScore>,histories:Map<string,EngineHistory>): Promise<void> {
    const insert = this.db.prepare(`
      INSERT INTO move_assessments(
        id, run_id, move_id, eval_before_cp_white, eval_before_mate_white,
        eval_after_cp_white, eval_after_mate_white, centipawn_loss,
        comparison_loss, classification, meaningful
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const qualities: Array<{moveId:string;quality:ReturnType<typeof assessMove>;bestUci:string;bestSan:string;verification:VerificationEvidence|null}> = [];
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
          [move.uci],undefined,undefined,histories.get(move.from_position_id),
        )).lines[0];
        let played: EngineScore = storedLine
          ? { centipawnsWhite: storedLine.centipawns_white, mateInWhite: storedLine.mate_in_white }
          : searchedLine ?? (() => { throw new Error(`No played-move score for ply ${move.ply}`); })();
        let leading = this.db.prepare("SELECT move_uci, move_san FROM engine_lines WHERE position_analysis_id=? AND rank=1").get(before.positionAnalysisId) as {move_uci:string;move_san:string};
        const initial=assessMove(before,played,move.mover_color,leading.move_uci===move.uci);
        const reason=verificationReason(before,played,scores.get(move.to_position_id),move.mover_color);
        let verification:VerificationEvidence|null=null;
        if(reason) {
          const checked=await verifyMove(this.engine,move.from_fen,move.uci,this.config.stockfishDepth,this.config.stockfishMultiPv,histories.get(move.from_position_id));
          played=checked.played;
          before.centipawnsWhite=checked.best.centipawnsWhite;
          before.mateInWhite=checked.best.mateInWhite;
          leading={move_uci:checked.best.moveUci,move_san:checked.best.moveSan};
          verification={reason,initialGrade:initial.grade,depth:checked.analysis.depth};
          this.db.transaction(()=>{
            this.db.prepare("UPDATE position_analyses SET centipawns_white=?,mate_in_white=?,depth=? WHERE id=?")
              .run(before.centipawnsWhite,before.mateInWhite,checked.analysis.depth,before.positionAnalysisId);
            this.db.prepare("DELETE FROM engine_lines WHERE position_analysis_id=?").run(before.positionAnalysisId);
            const save=this.db.prepare(`INSERT INTO engine_lines(id,position_analysis_id,rank,move_uci,move_san,centipawns_white,mate_in_white,pv_uci_json,pv_san_json) VALUES (?,?,?,?,?,?,?,?,?)`);
            for(const line of checked.analysis.lines)save.run(id(),before.positionAnalysisId,line.rank,line.moveUci,line.moveSan,line.centipawnsWhite,line.mateInWhite,JSON.stringify(line.pvUci),JSON.stringify(line.pvSan));
          })();
        }
        const rawLoss = move.mover_color === "white"
          ? utilityWhite(before) - utilityWhite(played)
          : utilityWhite(played) - utilityWhite(before);
        const loss = Math.min(3_000, Math.max(0, Math.round(rawLoss)));
        const quality=assessMove(before,played,move.mover_color,leading.move_uci===move.uci);
        const classification=quality.grade==="best"?"good":quality.grade;
        qualities.push({moveId:move.id, quality,bestUci:leading.move_uci,bestSan:leading.move_san,verification});
        assessments.push({ move, before, played, loss, classification });
    }
    this.db.transaction(() => {
      const saveQuality=this.db.prepare(`INSERT INTO game_move_quality(run_id,move_id,rule_version,chances_before,chances_after,chance_loss,accuracy,grade,best_uci,best_san) VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for(const row of qualities) {
        saveQuality.run(runId,row.moveId,QUALITY_VERSION,row.quality.before,row.quality.after,row.quality.loss,row.quality.accuracy,row.quality.grade,row.bestUci,row.bestSan);
        if(row.verification)this.db.prepare(`INSERT INTO game_move_verification(run_id,move_id,reason,initial_grade,depth) VALUES (?,?,?,?,?)`)
          .run(runId,row.moveId,row.verification.reason,row.verification.initialGrade,row.verification.depth);
      }
      for (const { move, before, played, loss, classification } of assessments) {
        insert.run(
          id(), runId, move.id,
          before.centipawnsWhite, before.mateInWhite,
          played.centipawnsWhite, played.mateInWhite,
          before.mateInWhite !== null || played.mateInWhite !== null ? null : loss,
          loss, classification, classification === "mistake" || classification === "blunder" ? 1 : 0,
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
      SELECT meaningful, classification, eval_before_cp_white, eval_before_mate_white, eval_after_cp_white, eval_after_mate_white, comparison_loss AS centipawn_loss
      FROM move_assessments WHERE run_id = ? AND move_id = ?
    `);
    let generated = 0;

    for (const move of moves) {
      if (move.mover_color !== game.player_color) continue;
      const assessment = meaningful.get(runId, move.id) as SavedMoveAssessment & { centipawn_loss: number };
      if (!assessment || !significantMistake(assessment, move.mover_color)) continue;
      const afterScore = scores.get(move.to_position_id);
      if (!afterScore) continue;
      const rows = this.db.prepare(`
        SELECT el.move_uci, el.move_san, el.centipawns_white, el.mate_in_white, el.rank, el.pv_uci_json
        FROM engine_lines el
        WHERE el.position_analysis_id = ? AND el.move_uci != '(none)'
        ORDER BY el.rank
      `).all(afterScore.positionAnalysisId) as StoredLine[];
      const accepted = this.acceptablePunishments(move, rows);
      const beforeScore = scores.get(move.from_position_id);
      const choices = beforeScore ? this.db.prepare(`SELECT move_uci,move_san,centipawns_white,mate_in_white,rank,pv_uci_json
        FROM engine_lines WHERE position_analysis_id=? AND move_uci!='(none)' ORDER BY rank`).all(beforeScore.positionAnalysisId) as StoredLine[] : [];
      const missed = this.acceptablePunishments(move, choices, true);
      if (missed.length || accepted.length) {
        this.insertTrainingItem(gameId, game.profile_id, move, missed.length ? missed : accepted, assessment.centipawn_loss,
          'blunder_check', missed.length ? 'missed_opportunity' : 'safety');
        generated += 1;
      }
      if (accepted.length) {
        this.insertTrainingItem(gameId, game.profile_id, move, accepted, assessment.centipawn_loss, 'punish_blunder', 'safety');
        generated += 1;
      }
    }
    return generated;
  }

  private acceptablePunishments(move: MoveRow, lines: StoredLine[], opportunity = false): Array<StoredLine & { categories: string[]; loss: number; captured: string | null; threatened: string[]; proof: PunishmentProof }> {
    const position = this.db.prepare("SELECT fen FROM positions WHERE id = ?")
      .get(opportunity ? move.from_position_id : move.to_position_id) as { fen: string };
    const opponent = opportunity ? move.mover_color : move.mover_color === "white" ? "black" : "white";
    const best = lines[0];
    if (!best) return [];
    const bestUtility = utilityWhite({
      centipawnsWhite: best.centipawns_white,
      mateInWhite: best.mate_in_white,
    });
    const result: Array<StoredLine & { categories: string[]; loss: number; captured: string | null; threatened: string[]; proof: PunishmentProof }> = [];

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
      const player = opponent === "white" ? "b" : "w";
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
      const proof = tacticalPunishment(move.from_fen, position.fen, line.move_uci, line.pv_uci_json, line.mate_in_white);
      if (!proof || (opportunity && (line.move_uci === move.uci || (!applied.captured && proof.kind !== "forced_mate")))) continue;
      if (!categories.length) {
        if (proof.kind === "forced_mate") categories.push("threat");
        else continue;
      }

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
        captured: applied.captured ?? null, threatened, proof,
      });
    }
    return result;
  }

  private insertTrainingItem(
    gameId: string, profileId: string, move: MoveRow,
    responses: Array<StoredLine & { categories: string[]; loss: number; captured: string | null; threatened: string[]; proof: PunishmentProof }>,
    moveLoss: number, mode: 'blunder_check' | 'punish_blunder', exerciseKind: 'safety' | 'missed_opportunity',
  ): void {
    const top = responses[0]; if (!top) return;
    const opportunity = exerciseKind === 'missed_opportunity';
    const positionId = opportunity ? move.from_position_id : move.to_position_id;
    const lineBoard = new Chess((this.db.prepare('SELECT fen FROM positions WHERE id=?').get(positionId) as {fen:string}).fen);
    const continuation = top.proof.pvUci.slice(0,8).map(uci=>lineBoard.move(moveFromUci(uci)).san).join(' ');
    const reason = top.proof.kind === 'forced_mate' ? `The engine finds forced mate in ${top.proof.mateIn}.`
      : `The engine continuation keeps a material gain worth about ${top.proof.gainPawns} pawns after defensive replies.`;
    const action = top.categories.includes('capture') ? `capture immediately with ${top.move_san}`
      : top.categories.includes('check') ? `play the forcing check ${top.move_san}` : `create the immediate threat ${top.move_san}`;
    const explanation = (opportunity ? `Before ${move.san}, you could ${action}. This was a missed winning opportunity.`
      : `After ${move.san}, the opponent can ${action}. Check every piece left available to capture, including pieces that were already attacked.`)
      + ` ${reason} Engine example: ${continuation}.`;
    const evidence = JSON.stringify({detector:'tactical-punishment-v4',exerciseKind,centipawnLoss:moveLoss,proof:top.proof});
    this.db.transaction(()=>{
      this.db.prepare(`INSERT OR IGNORE INTO training_items(id,profile_id,game_id,source_move_id,mode,prompt_version,created_at)
        VALUES (?,?,?,?,?,4,?)`).run(id(),profileId,gameId,move.id,mode,now());
      const itemId = this.db.prepare('SELECT id FROM training_items WHERE mode=? AND source_move_id=?').pluck().get(mode,move.id) as string;
      const previous = this.db.prepare(mode==='blunder_check' ? 'SELECT evidence_json FROM blunder_check_items WHERE item_id=?' : 'SELECT evidence_json FROM punish_blunder_items WHERE item_id=?').pluck().get(itemId);
      if(previous && previous!==evidence)this.db.prepare('UPDATE training_attempts SET abandoned_at=? WHERE item_id=? AND answered_at IS NULL AND abandoned_at IS NULL').run(now(),itemId);
      this.db.prepare('UPDATE training_items SET active=1,prompt_version=4 WHERE id=?').run(itemId);
      if (mode==='blunder_check') this.db.prepare(`INSERT INTO blunder_check_items(item_id,before_position_id,after_candidate_position_id,
        candidate_move_uci,candidate_move_san,explanation,evidence_json) VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(item_id) DO UPDATE SET before_position_id=excluded.before_position_id,after_candidate_position_id=excluded.after_candidate_position_id,
        candidate_move_uci=excluded.candidate_move_uci,candidate_move_san=excluded.candidate_move_san,explanation=excluded.explanation,evidence_json=excluded.evidence_json`)
        .run(itemId,move.from_position_id,move.to_position_id,move.uci,move.san,explanation,evidence);
      else this.db.prepare(`INSERT INTO punish_blunder_items(item_id,position_id,bad_move_uci,bad_move_san,explanation,evidence_json) VALUES (?,?,?,?,?,?)
        ON CONFLICT(item_id) DO UPDATE SET position_id=excluded.position_id,bad_move_uci=excluded.bad_move_uci,bad_move_san=excluded.bad_move_san,
        explanation=excluded.explanation,evidence_json=excluded.evidence_json`).run(itemId,move.to_position_id,move.uci,move.san,explanation,evidence);
      this.db.prepare('DELETE FROM acceptable_responses WHERE item_id=?').run(itemId);
      const insert=this.db.prepare(`INSERT INTO acceptable_responses(id,item_id,move_uci,move_san,categories_json,engine_rank,loss_from_best_cp) VALUES (?,?,?,?,?,?,?)`);
      for(const response of responses)insert.run(id(),itemId,response.move_uci,response.move_san,JSON.stringify(response.categories),response.rank,response.loss);
      this.db.prepare(`INSERT INTO training_item_concepts(item_id,concept_id,source,confidence,is_primary)
        VALUES (?,?,'automatic',.9,1) ON CONFLICT(item_id,concept_id,source) DO UPDATE SET active=1`)
        .run(itemId,mode==='punish_blunder'?'process.pattern_failure':opportunity?'process.missed_forcing_move':'process.blunder_check');
      const categoryConcept=top.categories.includes('capture')?'response.capture':top.categories.includes('check')?'response.check':'response.threat';
      this.db.prepare(`INSERT INTO training_item_concepts(item_id,concept_id,source,confidence,is_primary)
        VALUES (?,?,'automatic',.9,0) ON CONFLICT(item_id,concept_id,source) DO UPDATE SET active=1`).run(itemId,categoryConcept);
      this.db.prepare('INSERT OR IGNORE INTO review_states(item_id,mastery_level,due_at) VALUES (?,0,?)').run(itemId,now());
    })();
  }
}

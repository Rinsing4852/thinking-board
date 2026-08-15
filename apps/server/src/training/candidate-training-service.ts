import { Chess } from "chess.js";

import type {
  CandidateGenerationAnswerResponse,
  CandidateGenerationExercise,
  CandidateGrade,
  CandidateGradeResult,
  CandidateSubmission,
  CandidateType,
  EmptyTrainingResponse,
  NextCandidateGenerationResponse,
} from "../../../../packages/contracts/src/api.js";
import type { AppConfig } from "../config.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { UciEngine, type EngineLine, type EngineScore } from "../analysis/uci-engine.js";
import { activeProfileId } from "./profile.js";

interface ExerciseRow {
  item_id: string;
  fen: string;
  player_color: "white" | "black";
  move_number: number;
}

interface AttemptRow {
  id: string;
  item_id: string;
  started_at: string | null;
  answered_at: string | null;
  fen: string;
  player_color: "white" | "black";
  explanation: string;
  reference_lines_json: string;
}

interface ReferenceLine {
  rank: number;
  move_uci: string;
  move_san: string;
  centipawns_white: number | null;
  mate_in_white: number | null;
}

const GRADE_POINTS: Record<CandidateGrade, number> = {
  excellent: 1,
  good: 0.8,
  playable: 0.6,
  dubious: 0.3,
  blunder: 0,
};

function utilityWhite(score: EngineScore): number {
  if (score.centipawnsWhite !== null) return score.centipawnsWhite;
  const mate = score.mateInWhite ?? 0;
  if (mate > 0) return 100_000 - Math.min(100, mate) * 100;
  return -100_000 + Math.min(100, Math.abs(mate)) * 100;
}

function lineScore(line: EngineLine | ReferenceLine): EngineScore {
  return {
    centipawnsWhite: "centipawnsWhite" in line ? line.centipawnsWhite : line.centipawns_white,
    mateInWhite: "mateInWhite" in line ? line.mateInWhite : line.mate_in_white,
  };
}

function moveFromUci(uci: string): { from: string; to: string; promotion?: string } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Invalid candidate move: ${uci}`);
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
  };
}

function grade(loss: number, tolerance: number): CandidateGrade {
  if (loss <= tolerance) return "excellent";
  if (loss <= 100) return "good";
  if (loss <= 200) return "playable";
  if (loss <= 400) return "dubious";
  return "blunder";
}

function lossFromBest(
  best: EngineScore,
  candidate: EngineScore,
  playerColor: "white" | "black",
): number {
  const raw = playerColor === "white"
    ? utilityWhite(best) - utilityWhite(candidate)
    : utilityWhite(candidate) - utilityWhite(best);
  return Math.min(3_000, Math.max(0, Math.round(raw)));
}

function nextDue(level: number, passed: boolean): string {
  if (!passed) return now();
  const days = [1, 3, 7, 16, 35][Math.min(level, 4)] ?? 35;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export class CandidateTrainingService {
  private readonly engine: UciEngine;
  private evaluationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly db: SqliteDatabase, private readonly config: AppConfig) {
    this.engine = new UciEngine(config.stockfishBinary, config.stockfishThreads, config.stockfishHashMb);
  }

  next(pool: string, itemId?: string): NextCandidateGenerationResponse {
    const profileId = activeProfileId(this.db);
    if (!profileId) return this.emptyResponse();
    const where = pool === "due"
      ? "AND rs.due_at <= ?"
      : pool === "mastered"
        ? "AND rs.mastery_level >= 4"
        : "";
    const order = pool === "random" ? "ORDER BY RANDOM()" : "ORDER BY rs.due_at, ti.created_at";
    const params = [profileId, ...(itemId ? [itemId] : []), ...(pool === "due" ? [now()] : [])];
    const itemWhere = itemId ? "AND ti.id = ?" : "";
    const row = this.db.prepare(`
      SELECT ti.id AS item_id, position.fen, game.player_color, move.move_number
      FROM training_items ti
      JOIN candidate_generation_items cgi ON cgi.item_id = ti.id
      JOIN positions position ON position.id = cgi.position_id
      JOIN games game ON game.id = ti.game_id
      JOIN moves move ON move.id = ti.source_move_id
      JOIN review_states rs ON rs.item_id = ti.id
      WHERE ti.mode = 'candidate_generation' AND ti.active = 1 AND ti.profile_id = ? ${itemWhere} ${where}
      ${order}
      LIMIT 1
    `).get(...params) as ExerciseRow | undefined;
    if (!row) return this.emptyResponse();
    return this.createExercise(row);
  }

  answer(attemptId: string, candidates: CandidateSubmission[]): Promise<CandidateGenerationAnswerResponse> {
    const operation = this.evaluationQueue.then(() => this.evaluate(attemptId, candidates));
    this.evaluationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  reveal(attemptId: string): CandidateGenerationAnswerResponse {
    const attempt = this.attempt(attemptId);
    const references = JSON.parse(attempt.reference_lines_json) as ReferenceLine[];
    const engineCandidates = this.referenceFeedback(references, attempt.player_color);
    const answeredAt = now();
    const duration = attempt.started_at
      ? Math.max(0, Date.parse(answeredAt) - Date.parse(attempt.started_at))
      : 0;
    const feedback = {
      outcome: "incorrect" as const,
      score: 0,
      candidates: [],
      engineCandidates,
      explanation: attempt.explanation,
      checklistPoint: "Generate candidates in order: checks, captures, threats, then improve the weakest piece.",
    };
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts SET answered_at = ?, duration_ms = ?, score = 0,
          outcome = 'revealed', response_json = '{}', feedback_json = ? WHERE id = ?
      `).run(answeredAt, duration, JSON.stringify(feedback), attemptId);
      this.updateReview(attempt.item_id, false, duration, "revealed", answeredAt);
    })();
    return feedback;
  }

  async close(): Promise<void> {
    await this.evaluationQueue;
    await this.engine.close();
  }

  private createExercise(row: ExerciseRow): CandidateGenerationExercise {
    return {
      kind: "exercise",
      attemptId: null,
      itemId: row.item_id,
      mode: "candidate_generation",
      fen: row.fen,
      playerColor: row.player_color,
      moveNumber: row.move_number,
      prompt: "Generate up to three reasonable candidate moves.",
    };
  }

  private async evaluate(
    attemptId: string,
    submissions: CandidateSubmission[],
  ): Promise<CandidateGenerationAnswerResponse> {
    if (submissions.length < 1 || submissions.length > 3) throw new Error("Enter between one and three candidates");
    if (new Set(submissions.map((candidate) => candidate.moveUci)).size !== submissions.length) {
      throw new Error("Candidate moves must be different");
    }
    const validTypes: CandidateType[] = ["check", "capture", "threat", "improve"];
    if (submissions.some((candidate) => !validTypes.includes(candidate.declaredType))) {
      throw new Error("Choose a candidate type for every move");
    }
    const attempt = this.attempt(attemptId);
    const depth = Math.max(10, this.config.stockfishDepth - 2);
    const initial = await this.engine.analyze(attempt.fen, depth, 3);
    const bestLine = initial.lines[0];
    if (!bestLine) throw new Error("Stockfish returned no reference line");
    const results: CandidateGradeResult[] = [];

    for (const submission of submissions) {
      const board = new Chess(attempt.fen);
      const applied = board.move(moveFromUci(submission.moveUci));
      if (!applied) throw new Error(`Illegal candidate: ${submission.moveUci}`);
      const detectedTypes: CandidateType[] = [];
      if (board.inCheck()) detectedTypes.push("check");
      if (applied.captured) detectedTypes.push("capture");
      const typeCorrect = submission.declaredType === "threat" || submission.declaredType === "improve"
        ? null
        : detectedTypes.includes(submission.declaredType);
      const searched = await this.engine.analyze(attempt.fen, depth, 1, [submission.moveUci]);
      const candidateLine = searched.lines[0];
      if (!candidateLine) throw new Error(`Stockfish could not assess ${applied.san}`);
      const loss = lossFromBest(lineScore(bestLine), lineScore(candidateLine), attempt.player_color);
      results.push({
        moveUci: submission.moveUci,
        moveSan: applied.san,
        declaredType: submission.declaredType,
        detectedTypes,
        typeCorrect,
        centipawnLoss: loss,
        grade: grade(loss, this.config.acceptableToleranceCp),
      });
    }

    const quality = results.reduce((sum, result) => sum + GRADE_POINTS[result.grade], 0) / results.length;
    const breadth = results.length === 1 ? 0.7 : results.length === 2 ? 0.9 : 1;
    const typeOrder: Record<CandidateType, number> = { check: 1, capture: 2, threat: 3, improve: 4 };
    const ordered = submissions.every((candidate, index) => index === 0
      || typeOrder[submissions[index - 1]!.declaredType] <= typeOrder[candidate.declaredType]);
    const score = Math.max(0, quality * breadth - (ordered ? 0 : 0.15));
    const outcome = score >= 0.8 ? "excellent" : score >= 0.4 ? "partial" : "incorrect";
    const engineCandidates = initial.lines.slice(0, 3).map((line) => {
      const loss = lossFromBest(lineScore(bestLine), lineScore(line), attempt.player_color);
      return {
        moveUci: line.moveUci,
        moveSan: line.moveSan,
        centipawnLoss: loss,
        grade: grade(loss, this.config.acceptableToleranceCp),
      };
    });
    const answeredAt = now();
    const startedAt = attempt.started_at ?? answeredAt;
    const duration = Math.max(0, Date.parse(answeredAt) - Date.parse(startedAt));
    const feedback: CandidateGenerationAnswerResponse = {
      outcome,
      score,
      candidates: results,
      engineCandidates,
      explanation: attempt.explanation,
      checklistPoint: "Generate candidates in order: checks, captures, threats, then improve the weakest piece.",
    };
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts
        SET started_at = ?, answered_at = ?, duration_ms = ?, score = ?, outcome = ?,
            response_json = ?, feedback_json = ? WHERE id = ?
      `).run(
        startedAt, answeredAt, duration, score, outcome,
        JSON.stringify({ candidates: submissions }), JSON.stringify(feedback), attemptId,
      );
      this.updateReview(attempt.item_id, outcome === "excellent", duration, outcome, answeredAt);
    })();
    return feedback;
  }

  private attempt(attemptId: string): AttemptRow {
    const attempt = this.db.prepare(`
      SELECT ta.id, ta.item_id, ta.started_at, ta.answered_at,
             position.fen, game.player_color, cgi.explanation, cgi.reference_lines_json
      FROM training_attempts ta
      JOIN training_items ti ON ti.id = ta.item_id AND ti.mode = 'candidate_generation'
      JOIN candidate_generation_items cgi ON cgi.item_id = ti.id
      JOIN positions position ON position.id = cgi.position_id
      JOIN games game ON game.id = ti.game_id
      WHERE ta.id = ?
    `).get(attemptId) as AttemptRow | undefined;
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.answered_at) throw new Error("Attempt has already been answered");
    return attempt;
  }

  private referenceFeedback(lines: ReferenceLine[], playerColor: "white" | "black") {
    const best = lines[0];
    if (!best) return [];
    return lines.map((line) => {
      const loss = lossFromBest(lineScore(best), lineScore(line), playerColor);
      return {
        moveUci: line.move_uci,
        moveSan: line.move_san,
        centipawnLoss: loss,
        grade: grade(loss, this.config.acceptableToleranceCp),
      };
    });
  }

  private emptyResponse(): EmptyTrainingResponse {
    const counts = this.db.prepare(`
      SELECT SUM(CASE WHEN rs.due_at <= ? THEN 1 ELSE 0 END) AS due,
             COUNT(*) AS active,
             SUM(CASE WHEN rs.mastery_level >= 4 THEN 1 ELSE 0 END) AS mastered
      FROM review_states rs
      JOIN training_items ti ON ti.id = rs.item_id
      WHERE ti.mode = 'candidate_generation' AND ti.active = 1 AND ti.profile_id = ?
    `).get(now(), activeProfileId(this.db)) as { due: number | null; active: number; mastered: number | null };
    const options = [];
    if (counts.active > 0) options.push({ pool: "early", label: "Review early", count: counts.active });
    if ((counts.mastered ?? 0) > 0) options.push({ pool: "mastered", label: "Practise mastered positions", count: counts.mastered ?? 0 });
    if (counts.active > 0) options.push({ pool: "random", label: "Random practice", count: counts.active });
    return {
      kind: "empty",
      message: counts.active > 0 ? "Nothing is due right now." : "No Candidate Generation exercises have been generated yet.",
      options,
    };
  }

  private updateReview(itemId: string, passed: boolean, duration: number, result: string, attemptedAt: string): void {
    const current = this.db.prepare(`
      SELECT mastery_level, attempts, successes, lapses, average_response_ms
      FROM review_states WHERE item_id = ?
    `).get(itemId) as {
      mastery_level: number;
      attempts: number;
      successes: number;
      lapses: number;
      average_response_ms: number | null;
    };
    const level = passed ? Math.min(5, current.mastery_level + 1) : 0;
    const attempts = current.attempts + 1;
    const average = Math.round(((current.average_response_ms ?? duration) * current.attempts + duration) / attempts);
    this.db.prepare(`
      UPDATE review_states SET mastery_level = ?, due_at = ?, last_attempted_at = ?,
        last_result = ?, attempts = ?, successes = ?, lapses = ?, average_response_ms = ?
      WHERE item_id = ?
    `).run(
      level, nextDue(level, passed), attemptedAt, result, attempts,
      current.successes + (passed ? 1 : 0), current.lapses + (passed ? 0 : 1), average, itemId,
    );
  }
}

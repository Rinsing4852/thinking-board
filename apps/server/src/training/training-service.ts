import { Chess } from "chess.js";

import type {
  BlunderCheckExercise,
  EmptyTrainingResponse,
  NextTrainingResponse,
  NextWhatChangedResponse,
  ResponseCategory,
  TrainingAnswerResponse,
  WhatChangedAnswerResponse,
  WhatChangedCategory,
  WhatChangedExercise,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { now } from "../lib/ids.js";
import { activeProfileId } from "./profile.js";
import { recordReview } from "./review-scheduler.js";

interface ExerciseRow {
  item_id: string;
  fen_before: string;
  fen_after: string;
  candidate_move_uci: string;
  candidate_move_san: string;
  player_color: "white" | "black";
  move_number: number;
}

interface AttemptRow {
  id: string;
  item_id: string;
  started_at: string | null;
  answered_at: string | null;
  fen_after: string;
  explanation: string;
}

interface ResponseRow {
  move_uci: string;
  move_san: string;
  categories_json: string;
}

interface WhatChangedRow {
  item_id: string;
  fen_before: string;
  fen_after: string;
  opponent_move_uci: string;
  opponent_move_san: string;
  player_color: "white" | "black";
  move_number: number;
}

interface WhatChangedAttemptRow {
  id: string;
  item_id: string;
  started_at: string | null;
  answered_at: string | null;
  answer_category: WhatChangedCategory;
  answer_squares_json: string;
  explanation: string;
}

function moveFromUci(uci: string): { from: string; to: string; promotion?: string } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error("Move must be in UCI form");
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
  };
}

export class TrainingService {
  constructor(private readonly db: SqliteDatabase) {}

  next(pool: string, itemId?: string): NextTrainingResponse {
    const profileId = activeProfileId(this.db);
    if (!profileId) return this.emptyResponse("blunder_check");
    const where = pool === "due"
      ? "AND rs.due_at <= ?"
      : pool === "mastered"
        ? "AND rs.mastery_level >= 4"
        : "";
    const order = pool === "random" ? "ORDER BY RANDOM()" : "ORDER BY rs.due_at, ti.created_at";
    const params = [profileId, ...(itemId ? [itemId] : []), ...(pool === "due" ? [now()] : [])];
    const itemWhere = itemId ? "AND ti.id = ?" : "";
    const row = this.db.prepare(`
      SELECT ti.id AS item_id, before_pos.fen AS fen_before,
             after_pos.fen AS fen_after, bci.candidate_move_uci,
             bci.candidate_move_san, g.player_color, m.move_number
      FROM training_items ti
      JOIN blunder_check_items bci ON bci.item_id = ti.id
      JOIN positions before_pos ON before_pos.id = bci.before_position_id
      JOIN positions after_pos ON after_pos.id = bci.after_candidate_position_id
      JOIN games g ON g.id = ti.game_id
      JOIN moves m ON m.id = ti.source_move_id
      JOIN review_states rs ON rs.item_id = ti.id
      WHERE ti.active = 1 AND ti.profile_id = ? ${itemWhere} ${where}
      ${order}
      LIMIT 1
    `).get(...params) as ExerciseRow | undefined;

    if (!row) return this.emptyResponse("blunder_check");
    return this.createExercise(row);
  }

  nextWhatChanged(pool: string, itemId?: string): NextWhatChangedResponse {
    const profileId = activeProfileId(this.db);
    if (!profileId) return this.emptyResponse("what_changed");
    const where = pool === "due"
      ? "AND rs.due_at <= ?"
      : pool === "mastered"
        ? "AND rs.mastery_level >= 4"
        : "";
    const order = pool === "random" ? "ORDER BY RANDOM()" : "ORDER BY rs.due_at, ti.created_at";
    const params = [profileId, ...(itemId ? [itemId] : []), ...(pool === "due" ? [now()] : [])];
    const itemWhere = itemId ? "AND ti.id = ?" : "";
    const row = this.db.prepare(`
      SELECT ti.id AS item_id, before_position.fen AS fen_before,
             after_position.fen AS fen_after, wci.opponent_move_uci,
             wci.opponent_move_san, g.player_color, opponent_move.move_number
      FROM training_items ti
      JOIN what_changed_items wci ON wci.item_id = ti.id
      JOIN positions before_position ON before_position.id = wci.before_opponent_position_id
      JOIN positions after_position ON after_position.id = wci.after_opponent_position_id
      JOIN games g ON g.id = ti.game_id
      JOIN moves m ON m.id = ti.source_move_id
      JOIN moves opponent_move ON opponent_move.id = wci.opponent_move_id
      JOIN review_states rs ON rs.item_id = ti.id
      WHERE ti.active = 1 AND ti.mode = 'what_changed' AND ti.profile_id = ? ${itemWhere} ${where}
      ${order}
      LIMIT 1
    `).get(...params) as WhatChangedRow | undefined;
    if (!row) return this.emptyResponse("what_changed");
    return this.createWhatChangedExercise(row);
  }

  private createExercise(row: ExerciseRow): BlunderCheckExercise {
    const response: BlunderCheckExercise = {
      kind: "exercise",
      attemptId: null,
      itemId: row.item_id,
      mode: "blunder_check",
      fenBefore: row.fen_before,
      fenAfterCandidate: row.fen_after,
      candidateMoveUci: row.candidate_move_uci,
      candidateMoveSan: row.candidate_move_san,
      playerColor: row.player_color,
      moveNumber: row.move_number,
      prompt: "Before making this move, what can the opponent do immediately?",
    };
    return response;
  }

  private createWhatChangedExercise(row: WhatChangedRow): WhatChangedExercise {
    return {
      kind: "exercise",
      attemptId: null,
      itemId: row.item_id,
      mode: "what_changed",
      fenBeforeOpponent: row.fen_before,
      fenAfterOpponent: row.fen_after,
      opponentMoveUci: row.opponent_move_uci,
      opponentMoveSan: row.opponent_move_san,
      playerColor: row.player_color,
      moveNumber: row.move_number,
      prompt: "What did their last move change?",
    };
  }

  answer(attemptId: string, category: ResponseCategory, moveUci: string): TrainingAnswerResponse {
    if (!(["check", "capture", "threat"] as string[]).includes(category)) {
      throw new Error("Choose check, capture, or threat");
    }
    const attempt = this.db.prepare(`
      SELECT ta.id, ta.item_id, ta.started_at, ta.answered_at,
             p.fen AS fen_after, bci.explanation
      FROM training_attempts ta
      JOIN blunder_check_items bci ON bci.item_id = ta.item_id
      JOIN positions p ON p.id = bci.after_candidate_position_id
      WHERE ta.id = ?
    `).get(attemptId) as AttemptRow | undefined;
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.answered_at) throw new Error("Attempt has already been answered");

    const responses = this.db.prepare(`
      SELECT move_uci, move_san, categories_json
      FROM acceptable_responses WHERE item_id = ? ORDER BY engine_rank
    `).all(attempt.item_id) as ResponseRow[];
    const acceptable = responses.map((response) => ({
      moveUci: response.move_uci,
      moveSan: response.move_san,
      categories: JSON.parse(response.categories_json) as ResponseCategory[],
    }));
    const matching = acceptable.find((response) => response.moveUci === moveUci);
    const moveCorrect = Boolean(matching);
    const categoryCorrect = matching
      ? matching.categories.includes(category)
      : acceptable.some((response) => response.categories.includes(category));
    const score = (moveCorrect ? 0.6 : 0) + (categoryCorrect ? 0.4 : 0);
    const outcome = score === 1 ? "excellent" : score > 0 ? "partial" : "incorrect";

    let playedMoveSan: string | null = null;
    try {
      const board = new Chess(attempt.fen_after);
      playedMoveSan = board.move(moveFromUci(moveUci))?.san ?? null;
    } catch {
      playedMoveSan = null;
    }
    const answeredAt = now();
    const startedAt = attempt.started_at ?? answeredAt;
    const duration = Math.max(0, Date.parse(answeredAt) - Date.parse(startedAt));
    const feedback = {
      acceptableMoves: acceptable,
      explanation: attempt.explanation,
      checklistPoint: "After my move, can they immediately check, capture, or threaten something important?",
    };

    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts
        SET started_at = ?, answered_at = ?, duration_ms = ?, category_answer = ?,
            move_answer_uci = ?, category_correct = ?, move_correct = ?, score = ?,
            outcome = ?, feedback_json = ?
        WHERE id = ?
      `).run(
        startedAt, answeredAt, duration, category, moveUci,
        categoryCorrect ? 1 : 0, moveCorrect ? 1 : 0, score, outcome,
        JSON.stringify(feedback), attemptId,
      );
      recordReview(this.db, attempt.item_id, outcome === "excellent", duration, outcome, answeredAt);
    })();

    return {
      outcome,
      score,
      categoryCorrect,
      moveCorrect,
      playedMoveSan,
      ...feedback,
    };
  }

  reveal(attemptId: string): TrainingAnswerResponse {
    const attempt = this.db.prepare(`
      SELECT ta.id, ta.item_id, ta.started_at, ta.answered_at,
             p.fen AS fen_after, bci.explanation
      FROM training_attempts ta
      JOIN blunder_check_items bci ON bci.item_id = ta.item_id
      JOIN positions p ON p.id = bci.after_candidate_position_id
      WHERE ta.id = ?
    `).get(attemptId) as AttemptRow | undefined;
    if (!attempt || attempt.answered_at) throw new Error("Attempt not found or already completed");
    const responses = this.db.prepare(`
      SELECT move_uci, move_san, categories_json
      FROM acceptable_responses WHERE item_id = ? ORDER BY engine_rank
    `).all(attempt.item_id) as ResponseRow[];
    const acceptableMoves = responses.map((response) => ({
      moveUci: response.move_uci,
      moveSan: response.move_san,
      categories: JSON.parse(response.categories_json) as ResponseCategory[],
    }));
    const answeredAt = now();
    const duration = attempt.started_at
      ? Math.max(0, Date.parse(answeredAt) - Date.parse(attempt.started_at))
      : 0;
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts SET answered_at = ?, duration_ms = ?, score = 0,
          outcome = 'revealed', feedback_json = ? WHERE id = ?
      `).run(answeredAt, duration, JSON.stringify({ acceptableMoves }), attemptId);
      recordReview(this.db, attempt.item_id, false, duration, "revealed", answeredAt);
    })();
    return {
      outcome: "incorrect",
      score: 0,
      categoryCorrect: false,
      moveCorrect: false,
      playedMoveSan: null,
      acceptableMoves,
      explanation: attempt.explanation,
      checklistPoint: "After my move, can they immediately check, capture, or threaten something important?",
    };
  }

  answerWhatChanged(
    attemptId: string,
    category: WhatChangedCategory,
    square: string,
  ): WhatChangedAnswerResponse {
    const validCategories: WhatChangedCategory[] = [
      "attacked_piece", "undefended_piece", "opened_line", "closed_line",
      "removed_defender", "created_threat", "king_safety", "nothing_urgent",
    ];
    if (!validCategories.includes(category)) throw new Error("Choose what changed");
    if (square && !/^[a-h][1-8]$/.test(square)) throw new Error("Choose a board square");
    const attempt = this.whatChangedAttempt(attemptId);
    const correctSquares = JSON.parse(attempt.answer_squares_json) as string[];
    const categoryCorrect = category === attempt.answer_category;
    const squareCorrect = correctSquares.includes(square);
    const score = (categoryCorrect ? 0.5 : 0) + (squareCorrect ? 0.5 : 0);
    const outcome = score === 1 ? "excellent" : score > 0 ? "partial" : "incorrect";
    const answeredAt = now();
    const startedAt = attempt.started_at ?? answeredAt;
    const duration = Math.max(0, Date.parse(answeredAt) - Date.parse(startedAt));
    const feedback = this.whatChangedFeedback(attempt, correctSquares);

    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts
        SET started_at = ?, answered_at = ?, duration_ms = ?, category_answer = ?,
            category_correct = ?, move_correct = ?, score = ?, outcome = ?,
            response_json = ?, feedback_json = ?
        WHERE id = ?
      `).run(
        startedAt, answeredAt, duration, category,
        categoryCorrect ? 1 : 0, squareCorrect ? 1 : 0, score, outcome,
        JSON.stringify({ square }), JSON.stringify(feedback), attemptId,
      );
      recordReview(this.db, attempt.item_id, outcome === "excellent", duration, outcome, answeredAt);
    })();
    return { outcome, score, categoryCorrect, squareCorrect, ...feedback };
  }

  revealWhatChanged(attemptId: string): WhatChangedAnswerResponse {
    const attempt = this.whatChangedAttempt(attemptId);
    const correctSquares = JSON.parse(attempt.answer_squares_json) as string[];
    const answeredAt = now();
    const duration = attempt.started_at
      ? Math.max(0, Date.parse(answeredAt) - Date.parse(attempt.started_at))
      : 0;
    const feedback = this.whatChangedFeedback(attempt, correctSquares);
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts
        SET answered_at = ?, duration_ms = ?, score = 0, outcome = 'revealed',
            response_json = '{}', feedback_json = ?
        WHERE id = ?
      `).run(answeredAt, duration, JSON.stringify(feedback), attemptId);
      recordReview(this.db, attempt.item_id, false, duration, "revealed", answeredAt);
    })();
    return {
      outcome: "incorrect",
      score: 0,
      categoryCorrect: false,
      squareCorrect: false,
      ...feedback,
    };
  }

  private whatChangedAttempt(attemptId: string): WhatChangedAttemptRow {
    const attempt = this.db.prepare(`
      SELECT ta.id, ta.item_id, ta.started_at, ta.answered_at,
             wci.answer_category, wci.answer_squares_json, wci.explanation
      FROM training_attempts ta
      JOIN training_items ti ON ti.id = ta.item_id AND ti.mode = 'what_changed'
      JOIN what_changed_items wci ON wci.item_id = ta.item_id
      WHERE ta.id = ?
    `).get(attemptId) as WhatChangedAttemptRow | undefined;
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.answered_at) throw new Error("Attempt has already been answered");
    return attempt;
  }

  private whatChangedFeedback(
    attempt: WhatChangedAttemptRow,
    correctSquares: string[],
  ): Omit<WhatChangedAnswerResponse, "outcome" | "score" | "categoryCorrect" | "squareCorrect"> {
    return {
      correctCategory: attempt.answer_category,
      correctSquares,
      explanation: attempt.explanation,
      checklistPoint: "Before calculating, identify every concrete change caused by their last move.",
    };
  }

  private emptyResponse(mode: "blunder_check" | "what_changed"): EmptyTrainingResponse {
    const counts = this.db.prepare(`
      SELECT
        SUM(CASE WHEN due_at <= ? THEN 1 ELSE 0 END) AS due,
        COUNT(*) AS active,
        SUM(CASE WHEN mastery_level >= 4 THEN 1 ELSE 0 END) AS mastered
      FROM review_states rs
      JOIN training_items ti ON ti.id = rs.item_id
      WHERE ti.mode = ? AND ti.active = 1 AND ti.profile_id = ?
    `).get(now(), mode, activeProfileId(this.db)) as { due: number | null; active: number; mastered: number | null };
    const options = [];
    if (counts.active > 0) options.push({ pool: "early", label: "Review early", count: counts.active });
    if ((counts.mastered ?? 0) > 0) options.push({ pool: "mastered", label: "Practise mastered positions", count: counts.mastered ?? 0 });
    if (counts.active > 0) options.push({ pool: "random", label: "Random practice", count: counts.active });
    return {
      kind: "empty",
      message: counts.active > 0
        ? "Nothing is due right now."
        : mode === "what_changed"
          ? "No reliable last-move awareness exercises have been generated yet."
          : "No Blunder Check exercises have been generated yet.",
      options,
    };
  }

}

import { Chess } from "chess.js";

import type {
  OpeningLessonActiveState,
  OpeningLessonComplete,
  OpeningLessonState,
  OpeningLessonStep,
  OpeningMoveAnswerResponse,
  OpeningReasonOption,
  OpeningWhyAnswerResponse,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { activeProfileId, ensureActiveProfile } from "../training/profile.js";

interface AttemptRow {
  id: string;
  profile_id: string;
  repertoire_id: string;
  chapter_id: string;
  line_id: string;
  content_version: number;
  current_content_version: number;
  current_decision: number;
  status: "active" | "completed" | "abandoned";
  step_started_at: string;
  repertoire_name: string;
  learner_color: "white" | "black";
  chapter_title: string;
  chapter_introduction: string;
  line_title: string;
}

interface LineMoveRow {
  ply: number;
  move_id: string;
  move_uci: string;
  move_san: string;
  role: "learner" | "opponent";
  from_position_id: string;
  from_fen: string;
  to_fen: string;
  summary: string;
  changes_json: string;
  concepts_json: string;
  resulting_plan: string | null;
  tactical_warning: string | null;
  common_mistake: string | null;
}

interface AnswerRow {
  id: string;
  move_answer_uci: string;
  move_answer_san: string;
  move_answered_at: string;
  move_outcome: "repertoire" | "alternative" | "outside_repertoire";
  reason_answer: string | null;
  reason_correct: number | null;
  reason_revealed: number;
  reason_answered_at: string | null;
  feedback_acknowledged_at: string | null;
}

const REASON_LABELS: Record<string, string> = {
  central_control: "Control or challenge the centre",
  development: "Develop a piece toward useful work",
  king_safety: "Make the king safer",
  piece_activity: "Put a piece on a more active square",
  pawn_structure: "Build or protect the pawn structure",
  pawn_break: "Prepare a pawn break",
  prophylaxis: "Prevent an opponent's idea",
  space: "Gain useful space",
  tempo: "Gain time by making a threat",
  tactical_safety: "Avoid an immediate tactical problem",
  imported_note: "Review the note attached to this imported move",
  missing_explanation: "No reason has been added to this move yet",
};

const DISTRACTORS: Record<string, string[]> = {
  central_control: ["development", "king_safety", "pawn_break"],
  development: ["central_control", "pawn_structure", "tactical_safety"],
  king_safety: ["development", "piece_activity", "pawn_break"],
  piece_activity: ["development", "prophylaxis", "pawn_structure"],
  pawn_structure: ["central_control", "development", "tempo"],
  pawn_break: ["pawn_structure", "king_safety", "tempo"],
  prophylaxis: ["piece_activity", "space", "development"],
  space: ["king_safety", "tempo", "pawn_structure"],
  tempo: ["pawn_break", "king_safety", "pawn_structure"],
  tactical_safety: ["development", "space", "pawn_break"],
  imported_note: [],
  missing_explanation: [],
};

function elapsedMs(startedAt: string, endedAt: string): number {
  return Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));
}

function applyLegalMove(fen: string, moveUci: string): { san: string; fen: string } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(moveUci)) throw new Error("Choose a legal move on the board");
  try {
    const chess = new Chess(fen);
    const move = chess.move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci.length === 5 ? { promotion: moveUci[4] } : {}),
    });
    if (!move) throw new Error("Move rejected");
    return { san: move.san, fen: chess.fen() };
  } catch {
    throw new Error("Choose a legal move on the board");
  }
}

function seededOrder(value: string, seed: string): number {
  let hash = 2166136261;
  for (const character of `${seed}:${value}`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function reasonOptions(concepts: string[], seed: string): OpeningReasonOption[] {
  const primaryConcept = concepts[0];
  if (!primaryConcept) return [];
  if (primaryConcept === "imported_note" || primaryConcept === "missing_explanation") {
    return [{ value: primaryConcept, label: REASON_LABELS[primaryConcept]! }];
  }
  const values = [
    ...concepts,
    ...(DISTRACTORS[primaryConcept] ?? ["development", "king_safety", "central_control"]),
  ]
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, 4)
    .sort((left, right) => seededOrder(left, seed) - seededOrder(right, seed));
  return values.map((value) => ({ value, label: REASON_LABELS[value] ?? value }));
}

export class OpeningTrainingService {
  constructor(private readonly db: SqliteDatabase) {}

  start(repertoireId: string, requestedLineId?: string): OpeningLessonStep {
    const profileId = ensureActiveProfile(this.db);
    const selection = requestedLineId
      ? this.db.prepare(`
        SELECT r.id AS repertoire_id, r.content_version, c.id AS chapter_id, l.id AS line_id
        FROM opening_repertoires r
        JOIN opening_chapters c ON c.repertoire_id = r.id AND c.active = 1
        JOIN opening_lines l ON l.chapter_id = c.id AND l.active = 1
        WHERE r.id = ? AND l.id = ?
      `).get(repertoireId, requestedLineId)
      : this.db.prepare(`
      SELECT r.id AS repertoire_id, r.content_version, c.id AS chapter_id, l.id AS line_id
      FROM opening_repertoires r
      JOIN opening_chapters c ON c.repertoire_id = r.id AND c.active = 1
      JOIN opening_lines l ON l.chapter_id = c.id AND l.active = 1
      LEFT JOIN (
        SELECT line_id,
               COUNT(*) AS completed_count,
               MAX(started_at) AS last_started_at
        FROM opening_lesson_attempts
        WHERE profile_id = ? AND status = 'completed'
        GROUP BY line_id
      ) practice ON practice.line_id = l.id
      WHERE r.id = ?
      ORDER BY COALESCE(practice.completed_count, 0),
               CASE WHEN practice.last_started_at IS NULL THEN 0 ELSE 1 END,
               practice.last_started_at,
               c.sort_order, l.priority
      LIMIT 1
    `).get(profileId, repertoireId);
    const typedSelection = selection as {
      repertoire_id: string;
      content_version: number;
      chapter_id: string;
      line_id: string;
    } | undefined;
    if (!typedSelection) throw new Error("Opening line is not available");

    const attemptId = id();
    const startedAt = now();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE opening_review_sessions
        SET status = 'abandoned', abandoned_at = ?
        WHERE profile_id = ? AND status = 'active'
      `).run(startedAt, profileId);
      this.db.prepare(`
        UPDATE opening_lesson_attempts
        SET status = 'abandoned', abandoned_at = ?
        WHERE profile_id = ? AND status = 'active'
      `).run(startedAt, profileId);
      this.db.prepare(`
        INSERT INTO opening_lesson_attempts(
          id, profile_id, repertoire_id, chapter_id, line_id, content_version, current_decision,
          status, step_started_at, started_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, 'active', ?, ?, ?)
      `).run(
        attemptId,
        profileId,
        typedSelection.repertoire_id,
        typedSelection.chapter_id,
        typedSelection.line_id,
        typedSelection.content_version,
        startedAt,
        startedAt,
        startedAt,
      );
    })();
    return this.step(attemptId);
  }

  active(): OpeningLessonActiveState | null {
    const profileId = activeProfileId(this.db);
    if (!profileId) return null;
    const attempt = this.db.prepare(`
      SELECT a.id, a.content_version, r.content_version AS current_content_version
      FROM opening_lesson_attempts a
      JOIN opening_repertoires r ON r.id = a.repertoire_id
      WHERE a.profile_id = ? AND a.status = 'active'
    `).get(profileId) as {
      id: string;
      content_version: number;
      current_content_version: number;
    } | undefined;
    if (attempt && attempt.content_version !== attempt.current_content_version) {
      this.db.prepare(`
        UPDATE opening_lesson_attempts
        SET status = 'abandoned', abandoned_at = ?
        WHERE id = ? AND status = 'active'
      `).run(now(), attempt.id);
      return null;
    }
    if (!attempt) return null;
    return this.pendingFeedback(attempt.id) ?? this.step(attempt.id);
  }

  answerMove(attemptId: string, moveUci: string): OpeningMoveAnswerResponse {
    const attempt = this.attempt(attemptId);
    const { expected } = this.currentDecision(attempt);
    const existing = this.answer(attempt.id, attempt.current_decision);
    if (existing) throw new Error("This move has already been answered");

    const played = applyLegalMove(expected.from_fen, moveUci);
    let outcome: "repertoire" | "alternative" | "outside_repertoire" = "outside_repertoire";
    if (moveUci === expected.move_uci) outcome = "repertoire";
    else {
      const alternative = this.db.prepare(`
        SELECT 1 FROM opening_moves
        WHERE repertoire_id = ? AND from_position_id = ? AND move_uci = ?
          AND role = 'learner' AND move_kind = 'alternative' AND active = 1
      `).get(attempt.repertoire_id, expected.from_position_id, moveUci);
      if (alternative) outcome = "alternative";
    }

    const answeredAt = now();
    this.db.prepare(`
      INSERT INTO opening_lesson_answers(
        id, lesson_attempt_id, decision_index, move_id, move_answer_uci,
        move_answer_san, move_outcome, move_duration_ms, move_answered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      attempt.id,
      attempt.current_decision,
      expected.move_id,
      moveUci,
      played.san,
      outcome,
      elapsedMs(attempt.step_started_at, answeredAt),
      answeredAt,
    );

    const concepts = JSON.parse(expected.concepts_json) as string[];
    const correctConcept = concepts[0];
    if (!correctConcept) throw new Error("Opening explanation is incomplete");
    return this.moveAnswerResponse(expected, outcome, played.san, concepts, attempt.id);
  }

  answerWhy(attemptId: string, concept: string | null): OpeningWhyAnswerResponse {
    const attempt = this.attempt(attemptId);
    const { expected, learnerMoves } = this.currentDecision(attempt);
    const answer = this.answer(attempt.id, attempt.current_decision);
    if (!answer) throw new Error("Play a move before answering why");
    if (this.db.prepare(`
      SELECT reason_answered_at FROM opening_lesson_answers WHERE id = ?
    `).pluck().get(answer.id)) throw new Error("This explanation has already been answered");

    const concepts = JSON.parse(expected.concepts_json) as string[];
    const correctConcept = concepts[0];
    if (!correctConcept) throw new Error("Opening explanation is incomplete");
    const offeredConcepts = new Set(reasonOptions(concepts, attempt.id).map((option) => option.value));
    if (concept !== null && !offeredConcepts.has(concept)) {
      throw new Error("Choose one of the explanation options shown");
    }
    const correct = concept !== null && concepts.includes(concept);
    const answeredAt = now();
    this.db.prepare(`
      UPDATE opening_lesson_answers
      SET reason_answer = ?, reason_correct = ?, reason_revealed = ?,
          reason_duration_ms = ?, reason_answered_at = ?
      WHERE id = ?
    `).run(
      concept,
      correct ? 1 : 0,
      concept === null ? 1 : 0,
      elapsedMs(answer.move_answered_at, answeredAt),
      answeredAt,
      answer.id,
    );

    return this.whyAnswerResponse(attempt, expected, learnerMoves, {
      ...answer,
      reason_answer: concept,
      reason_correct: correct ? 1 : 0,
      reason_revealed: concept === null ? 1 : 0,
      reason_answered_at: answeredAt,
    });
  }

  continue(attemptId: string): OpeningLessonState {
    const attempt = this.attempt(attemptId);
    const { learnerMoves } = this.currentDecision(attempt);
    const answer = this.answer(attempt.id, attempt.current_decision);
    if (!answer?.reason_answered_at) throw new Error("Answer why before continuing");
    if (answer.feedback_acknowledged_at) throw new Error("This explanation has already been continued");

    const continuedAt = now();
    const nextDecision = attempt.current_decision + 1;
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE opening_lesson_answers SET feedback_acknowledged_at = ? WHERE id = ?
      `).run(continuedAt, answer.id);
      if (nextDecision >= learnerMoves.length) {
        this.db.prepare(`
          UPDATE opening_lesson_attempts
          SET current_decision = ?, status = 'completed', completed_at = ?
          WHERE id = ?
        `).run(nextDecision, continuedAt, attempt.id);
      } else {
        this.db.prepare(`
          UPDATE opening_lesson_attempts SET current_decision = ?, step_started_at = ? WHERE id = ?
        `).run(nextDecision, continuedAt, attempt.id);
      }
    })();

    return nextDecision >= learnerMoves.length ? this.complete(attempt.id) : this.step(attempt.id);
  }

  private attempt(attemptId: string): AttemptRow {
    const profileId = activeProfileId(this.db);
    const attempt = this.db.prepare(`
      SELECT a.*, r.name AS repertoire_name, r.learner_color,
             r.content_version AS current_content_version,
             c.title AS chapter_title, c.introduction AS chapter_introduction,
             l.title AS line_title
      FROM opening_lesson_attempts a
      JOIN opening_repertoires r ON r.id = a.repertoire_id
      JOIN opening_chapters c ON c.id = a.chapter_id
      JOIN opening_lines l ON l.id = a.line_id
      WHERE a.id = ? AND a.profile_id = ? AND a.status = 'active'
    `).get(attemptId, profileId) as AttemptRow | undefined;
    if (!attempt) throw new Error("Active opening lesson not found");
    if (attempt.content_version !== attempt.current_content_version) {
      this.db.prepare(`
        UPDATE opening_lesson_attempts
        SET status = 'abandoned', abandoned_at = ?
        WHERE id = ? AND status = 'active'
      `).run(now(), attempt.id);
      throw new Error("Opening lesson content has changed. Start the updated lesson.");
    }
    return attempt;
  }

  private lineMoves(lineId: string): LineMoveRow[] {
    return this.db.prepare(`
      SELECT olm.ply, m.id AS move_id, m.move_uci, m.move_san, m.role,
             m.from_position_id, before.fen AS from_fen, after.fen AS to_fen,
             a.summary, a.changes_json, a.concepts_json, a.resulting_plan,
             a.tactical_warning, a.common_mistake
      FROM opening_line_moves olm
      JOIN opening_moves m ON m.id = olm.move_id
      JOIN opening_positions before ON before.id = m.from_position_id
      JOIN opening_positions after ON after.id = m.to_position_id
      JOIN opening_move_annotations a ON a.move_id = m.id
      WHERE olm.line_id = ?
      ORDER BY olm.ply
    `).all(lineId) as LineMoveRow[];
  }

  private currentDecision(attempt: AttemptRow, decisionIndex = attempt.current_decision): {
    expected: LineMoveRow;
    learnerMoves: LineMoveRow[];
    allMoves: LineMoveRow[];
  } {
    const allMoves = this.lineMoves(attempt.line_id);
    const learnerMoves = allMoves.filter((move) => move.role === "learner");
    const expected = learnerMoves[decisionIndex];
    if (!expected) throw new Error("Opening lesson has no remaining decision");
    return { expected, learnerMoves, allMoves };
  }

  private step(attemptId: string): OpeningLessonStep {
    const attempt = this.attempt(attemptId);
    return this.stepForDecision(attempt, attempt.current_decision);
  }

  private stepForDecision(attempt: AttemptRow, decisionIndex: number): OpeningLessonStep {
    const { expected, learnerMoves, allMoves } = this.currentDecision(attempt, decisionIndex);
    const expectedIndex = allMoves.findIndex((move) => move.ply === expected.ply);
    const previous = expectedIndex > 0 ? allMoves[expectedIndex - 1] : undefined;
    const opponentMove = previous?.role === "opponent"
      ? { moveUci: previous.move_uci, moveSan: previous.move_san }
      : null;
    const movesBefore = allMoves
      .filter((move) => move.ply < expected.ply)
      .map((move) => move.move_san);
    const moveNumber = Number.parseInt(expected.from_fen.split(" ")[5] ?? "1", 10);
    const existingAnswer = this.answer(attempt.id, decisionIndex);
    return {
      kind: "step",
      attemptId: attempt.id,
      repertoire: { id: attempt.repertoire_id, name: attempt.repertoire_name },
      chapter: {
        id: attempt.chapter_id,
        title: attempt.chapter_title,
        introduction: attempt.chapter_introduction,
      },
      lineTitle: attempt.line_title,
      learnerColor: attempt.learner_color,
      decisionNumber: decisionIndex + 1,
      totalDecisions: learnerMoves.length,
      moveNumber,
      fenBeforeOpponent: opponentMove && previous ? previous.from_fen : expected.from_fen,
      fenToMove: expected.from_fen,
      opponentMove,
      movesBefore,
      prompt: `What should ${attempt.learner_color === "white" ? "White" : "Black"} play next?`,
      moveAnswer: existingAnswer
        ? this.moveAnswerResponse(
          expected,
          existingAnswer.move_outcome,
          existingAnswer.move_answer_san,
          JSON.parse(expected.concepts_json) as string[],
          attempt.id,
        )
        : null,
    };
  }

  private answer(attemptId: string, decisionIndex: number): AnswerRow | undefined {
    return this.db.prepare(`
      SELECT id, move_answer_uci, move_answer_san, move_answered_at, move_outcome,
             reason_answer, reason_correct, reason_revealed, reason_answered_at,
             feedback_acknowledged_at
      FROM opening_lesson_answers
      WHERE lesson_attempt_id = ? AND decision_index = ?
    `).get(attemptId, decisionIndex) as AnswerRow | undefined;
  }

  private pendingFeedback(attemptId: string): OpeningWhyAnswerResponse | null {
    const attempt = this.attempt(attemptId);
    const { expected, learnerMoves } = this.currentDecision(attempt);
    const answer = this.answer(attempt.id, attempt.current_decision);
    if (!answer?.reason_answered_at || answer.feedback_acknowledged_at) return null;
    return this.whyAnswerResponse(attempt, expected, learnerMoves, answer);
  }

  private whyAnswerResponse(
    attempt: AttemptRow,
    expected: LineMoveRow,
    learnerMoves: LineMoveRow[],
    answer: AnswerRow,
  ): OpeningWhyAnswerResponse {
    const concepts = JSON.parse(expected.concepts_json) as string[];
    const correctConcept = concepts[0];
    if (!correctConcept) throw new Error("Opening explanation is incomplete");
    const selectedIsAccepted = answer.reason_answer !== null && concepts.includes(answer.reason_answer);
    const selectedIsPrimary = answer.reason_answer === correctConcept;
    const nextDecision = attempt.current_decision + 1;
    const next = nextDecision >= learnerMoves.length
      ? this.complete(attempt.id)
      : this.stepForDecision(attempt, nextDecision);
    return {
      kind: "feedback",
      attemptId: attempt.id,
      step: this.stepForDecision(attempt, attempt.current_decision),
      outcome: answer.reason_revealed === 1
        ? "revealed"
        : selectedIsPrimary ? "correct" : selectedIsAccepted ? "partial" : "incorrect",
      selectedConcept: answer.reason_answer,
      selectedLabel: answer.reason_answer ? REASON_LABELS[answer.reason_answer] ?? answer.reason_answer : null,
      selectedIsPrimary,
      correctConcept,
      correctLabel: REASON_LABELS[correctConcept] ?? correctConcept,
      explanation: {
        summary: expected.summary,
        changes: JSON.parse(expected.changes_json) as string[],
        resultingPlan: expected.resulting_plan,
        tacticalWarning: expected.tactical_warning,
        commonMistake: expected.common_mistake,
      },
      next,
    };
  }

  private moveAnswerResponse(
    expected: LineMoveRow,
    outcome: "repertoire" | "alternative" | "outside_repertoire",
    playedMoveSan: string,
    concepts: string[],
    seed: string,
  ): OpeningMoveAnswerResponse {
    const correctConcept = concepts[0];
    if (!correctConcept) throw new Error("Opening explanation is incomplete");
    return {
      moveOutcome: outcome,
      playedMoveSan,
      repertoireMove: { moveUci: expected.move_uci, moveSan: expected.move_san },
      fenAfterMove: expected.to_fen,
      message: outcome === "repertoire"
        ? correctConcept === "missing_explanation"
          ? "Yes — this is the imported repertoire move. Its reason has not been written yet, so the lesson will flag that gap clearly."
          : correctConcept === "imported_note"
            ? "Yes — this is the imported repertoire move. Review the personal note attached to it before continuing."
            : "Yes — this is the move the repertoire is teaching. Now connect it to its purpose."
        : outcome === "alternative"
          ? "That is an approved alternative. This line uses a different move, so compare the ideas before continuing."
          : "That legal move is not being called a blunder. This lesson uses another move to reach its chosen plan.",
      whyQuestion: correctConcept === "imported_note"
        ? `A personal note was imported for ${expected.move_san}. Review it before continuing.`
        : correctConcept === "missing_explanation"
          ? `${expected.move_san} has no written reason yet. Acknowledge that gap before continuing.`
          : `What is the main reason for ${expected.move_san} here?`,
      whyOptions: reasonOptions(concepts, seed),
    };
  }

  private complete(attemptId: string): OpeningLessonComplete {
    const row = this.db.prepare(`
      SELECT a.id, r.name AS repertoire_name, c.title AS chapter_title,
             COUNT(ans.id) AS decisions,
             SUM(CASE WHEN ans.move_outcome = 'repertoire' THEN 1 ELSE 0 END) AS repertoire_moves,
             SUM(CASE WHEN ans.reason_correct = 1 THEN 1 ELSE 0 END) AS reasons_understood
      FROM opening_lesson_attempts a
      JOIN opening_repertoires r ON r.id = a.repertoire_id
      JOIN opening_chapters c ON c.id = a.chapter_id
      LEFT JOIN opening_lesson_answers ans ON ans.lesson_attempt_id = a.id
      WHERE a.id = ?
      GROUP BY a.id
    `).get(attemptId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Completed opening lesson not found");
    return {
      kind: "complete",
      attemptId: String(row.id),
      repertoireName: String(row.repertoire_name),
      chapterTitle: String(row.chapter_title),
      decisions: Number(row.decisions),
      repertoireMoves: Number(row.repertoire_moves),
      reasonsUnderstood: Number(row.reasons_understood),
      message: "Guided line complete. This walkthrough does not change your memory schedule; use Learn & remember to practise these positions with spaced repetition.",
    };
  }
}

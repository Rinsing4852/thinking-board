import { Chess } from "chess.js";

import type {
  OpeningReviewActiveState,
  OpeningReviewComplete,
  OpeningReviewExercise,
  OpeningReviewFeedback,
  OpeningReviewMistakeResponse,
  OpeningReviewState,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { activeProfileId, ensureActiveProfile } from "../training/profile.js";
import {
  OPENING_SCHEDULER_VERSION,
  scheduleOpeningReview,
  type StoredOpeningReviewCard,
} from "./opening-review-scheduler.js";

interface ReviewItemRow extends StoredOpeningReviewCard {
  id: string;
  profile_id: string;
  repertoire_id: string;
  position_id: string;
  move_id: string;
  average_response_ms: number | null;
  move_uci: string;
  move_san: string;
  from_fen: string;
  to_fen: string;
  learner_color: "white" | "black";
  repertoire_name: string;
  summary: string;
  changes_json: string;
  resulting_plan: string | null;
  tactical_warning: string | null;
  common_mistake: string | null;
  personal_comment: string | null;
}

interface ActiveQueueRow {
  session_id: string;
  repertoire_id: string;
  repertoire_name: string;
  learner_color: "white" | "black";
  queue_id: string;
  review_item_id: string;
  sequence: number;
  presentation_kind: "scheduled" | "lapse_repeat";
  started_at: string;
}

interface EventRow {
  played_move_uci: string;
  played_move_san: string;
  correct: number;
  assisted: number;
  revealed: number;
  rating: number;
  next_due_at: string;
}

export type OpeningReviewStartMode = "auto" | "due" | "new" | "early";

interface CandidateReviewMove {
  id: string;
  repertoire_id: string;
  from_position_id: string;
  move_kind: "primary" | "alternative";
  sort_order: number;
  frequency: number | null;
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

function averageResponse(previous: number | null, repetitions: number, responseMs: number): number {
  if (repetitions <= 0 || previous === null) return responseMs;
  return Math.round((previous * repetitions + responseMs) / (repetitions + 1));
}

export class OpeningReviewService {
  constructor(private readonly db: SqliteDatabase) {}

  start(
    repertoireId: string,
    mode: OpeningReviewStartMode = "auto",
    sessionSize = 10,
    newLimit = 5,
  ): OpeningReviewExercise {
    const profileId = ensureActiveProfile(this.db);
    this.ensureItems(profileId, repertoireId);
    const timestamp = now();
    const repertoire = this.db.prepare(`
      SELECT id FROM opening_repertoires WHERE id = ?
    `).get(repertoireId);
    if (!repertoire) throw new Error("Opening repertoire is not available");

    const due = this.db.prepare(`
      SELECT ori.id FROM opening_review_items ori
      JOIN opening_moves m ON m.id = ori.move_id AND m.active = 1
      WHERE ori.profile_id = ? AND ori.repertoire_id = ? AND ori.knowledge_dimension = 'move'
        AND ori.state <> 0 AND ori.due_at <= ?
      ORDER BY ori.due_at, ori.lapses DESC, COALESCE(ori.average_response_ms, 0) DESC, ori.repetitions
      LIMIT ?
    `).all(profileId, repertoireId, timestamp, sessionSize) as Array<{ id: string }>;
    const fresh = this.db.prepare(`
      SELECT ori.id,
             MIN(c.sort_order) AS chapter_order,
             MIN(l.priority) AS line_priority,
             MIN(olm.ply) AS line_ply
      FROM opening_review_items ori
      JOIN opening_moves m ON m.id = ori.move_id
      JOIN opening_line_moves olm ON olm.move_id = m.id
      JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      WHERE ori.profile_id = ? AND ori.repertoire_id = ?
        AND ori.knowledge_dimension = 'move' AND ori.state = 0
      GROUP BY ori.id
      ORDER BY chapter_order, line_priority, line_ply, COALESCE(m.frequency, 0) DESC, m.id
      LIMIT ?
    `).all(profileId, repertoireId, Math.min(sessionSize, newLimit)) as Array<{ id: string }>;
    const early = (): Array<{ id: string }> => this.db.prepare(`
        SELECT ori.id FROM opening_review_items ori
        JOIN opening_moves m ON m.id = ori.move_id AND m.active = 1
        WHERE ori.profile_id = ? AND ori.repertoire_id = ? AND ori.knowledge_dimension = 'move'
          AND ori.state <> 0
        ORDER BY ori.due_at, ori.lapses DESC, COALESCE(ori.average_response_ms, 0) DESC
        LIMIT ?
      `).all(profileId, repertoireId, Math.min(sessionSize, 5)) as Array<{ id: string }>;

    let selected: Array<{ id: string }>;
    let pool: "due" | "new" | "early";
    if (mode === "due") {
      selected = due;
      pool = "due";
      if (selected.length === 0) throw new Error("No opening reviews are due right now");
    } else if (mode === "new") {
      selected = fresh;
      pool = "new";
      if (selected.length === 0) throw new Error("There are no new opening positions to learn");
    } else if (mode === "early") {
      selected = early();
      pool = "early";
    } else if (due.length > 0) {
      selected = due;
      pool = "due";
    } else if (fresh.length > 0) {
      selected = fresh;
      pool = "new";
    } else {
      selected = early();
      pool = "early";
    }
    if (selected.length === 0) throw new Error("This repertoire has no learner moves to review");

    return this.createSession(profileId, repertoireId, selected, pool, null);
  }

  startPosition(repertoireId: string, positionId: string, gameId: string): OpeningReviewExercise {
    const profileId = ensureActiveProfile(this.db);
    this.ensureItems(profileId, repertoireId);
    if (!this.db.prepare("SELECT 1 FROM games WHERE id = ? AND profile_id = ?").get(gameId, profileId)) {
      throw new Error("Game not found");
    }
    const item = this.db.prepare(`
      SELECT ori.id, ori.state, ori.due_at
      FROM opening_review_items ori
      JOIN opening_moves m ON m.id = ori.move_id AND m.active = 1
      WHERE ori.profile_id = ? AND ori.repertoire_id = ? AND ori.position_id = ?
        AND ori.knowledge_dimension = 'move'
      LIMIT 1
    `).get(profileId, repertoireId, positionId) as {
      id: string; state: number; due_at: string;
    } | undefined;
    if (!item) throw new Error("The repertoire position is no longer available");
    const pool = item.state === 0 ? "new" : item.due_at <= now() ? "due" : "early";
    return this.createSession(profileId, repertoireId, [{ id: item.id }], pool, gameId);
  }

  private createSession(
    profileId: string,
    repertoireId: string,
    selected: Array<{ id: string }>,
    pool: "due" | "new" | "mixed" | "early",
    focusGameId: string | null,
  ): OpeningReviewExercise {
    const timestamp = now();

    const sessionId = id();
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE opening_lesson_attempts SET status = 'abandoned', abandoned_at = ?
        WHERE profile_id = ? AND status = 'active'
      `).run(timestamp, profileId);
      this.db.prepare(`
        UPDATE opening_review_sessions SET status = 'abandoned', abandoned_at = ?
        WHERE profile_id = ? AND status = 'active'
      `).run(timestamp, profileId);
      this.db.prepare(`
        INSERT INTO opening_review_sessions(
          id, profile_id, repertoire_id, status, selection_pool,
          initial_item_count, started_at, created_at, focus_game_id
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).run(sessionId, profileId, repertoireId, pool, selected.length, timestamp, timestamp, focusGameId);
      selected.forEach((item, sequence) => {
        this.db.prepare(`
          INSERT INTO opening_review_queue(
            id, session_id, review_item_id, sequence, presentation_kind, status, started_at
          ) VALUES (?, ?, ?, ?, 'scheduled', ?, ?)
        `).run(id(), sessionId, item.id, sequence, sequence === 0 ? "active" : "pending", sequence === 0 ? timestamp : null);
      });
    })();
    return this.exercise(this.activeQueue(sessionId));
  }

  active(): OpeningReviewActiveState | null {
    const profileId = activeProfileId(this.db);
    if (!profileId) return null;
    const queue = this.db.prepare(`
      SELECT s.id AS session_id, s.repertoire_id, r.name AS repertoire_name, r.learner_color,
             q.id AS queue_id, q.review_item_id, q.sequence, q.presentation_kind, q.started_at
      FROM opening_review_sessions s
      JOIN opening_repertoires r ON r.id = s.repertoire_id
      JOIN opening_review_queue q ON q.session_id = s.id AND q.status = 'active'
      WHERE s.profile_id = ? AND s.status = 'active'
    `).get(profileId) as ActiveQueueRow | undefined;
    if (!queue) return null;
    const event = this.event(queue.queue_id);
    return event ? this.feedback(queue, event) : this.exercise(queue);
  }

  resume(sessionId: string): OpeningReviewActiveState {
    const queue = this.activeQueue(sessionId);
    const event = this.event(queue.queue_id);
    if (!event) {
      this.db.prepare(`
        UPDATE opening_review_queue SET started_at = ? WHERE id = ?
      `).run(now(), queue.queue_id);
    }
    const resumedQueue = this.activeQueue(sessionId);
    return event ? this.feedback(resumedQueue, event) : this.exercise(resumedQueue);
  }

  answer(sessionId: string, moveUci: string, assisted = false, revealed = false): OpeningReviewFeedback {
    const queue = this.activeQueue(sessionId);
    if (this.event(queue.queue_id)) throw new Error("This opening position has already been answered");
    const item = this.item(queue.review_item_id);
    const played = applyLegalMove(item.from_fen, moveUci);
    const accepted = this.db.prepare(`
      SELECT 1 FROM opening_moves
      WHERE repertoire_id = ? AND from_position_id = ? AND move_uci = ?
        AND role = 'learner' AND active = 1
    `).get(item.repertoire_id, item.position_id, moveUci);
    const correct = Boolean(accepted);
    const previousMistake = Boolean(this.db.prepare(`
      SELECT 1 FROM opening_review_mistakes WHERE queue_entry_id = ? LIMIT 1
    `).get(queue.queue_id));
    const effectiveAssisted = assisted || previousMistake;
    const independentRecall = correct && !effectiveAssisted;
    const answeredAt = now();
    const responseMs = Math.max(0, Date.parse(answeredAt) - Date.parse(queue.started_at));
    const scheduled = scheduleOpeningReview(item, independentRecall, answeredAt, responseMs);
    let repeatQueued = false;

    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE opening_review_items SET
          scheduler_version = ?, state = ?, due_at = ?, stability = ?, difficulty = ?,
          scheduled_days = ?, learning_steps = ?, repetitions = ?, lapses = ?,
          last_reviewed_at = ?, last_result = ?, average_response_ms = ?, updated_at = ?
        WHERE id = ?
      `).run(
        OPENING_SCHEDULER_VERSION,
        scheduled.card.state,
        scheduled.card.dueAt,
        scheduled.card.stability,
        scheduled.card.difficulty,
        scheduled.card.scheduledDays,
        scheduled.card.learningSteps,
        scheduled.card.repetitions,
        scheduled.card.lapses,
        scheduled.card.lastReviewedAt,
        scheduled.result,
        averageResponse(item.average_response_ms, item.repetitions, responseMs),
        answeredAt,
        item.id,
      );
      this.db.prepare(`
        UPDATE opening_review_queue SET answered_at = ? WHERE id = ?
      `).run(answeredAt, queue.queue_id);
      this.db.prepare(`
        INSERT INTO opening_review_events(
          id, review_item_id, session_id, queue_entry_id, played_move_uci, played_move_san,
          correct, assisted, revealed, rating, response_ms, previous_state, next_state, next_due_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id(), item.id, sessionId, queue.queue_id, moveUci, played.san,
        correct ? 1 : 0, effectiveAssisted ? 1 : 0, revealed ? 1 : 0, scheduled.rating, responseMs, item.state,
        scheduled.card.state, scheduled.card.dueAt, answeredAt,
      );
      if (!independentRecall && !this.db.prepare(`
        SELECT 1 FROM opening_review_queue
        WHERE session_id = ? AND review_item_id = ? AND status = 'pending'
      `).get(sessionId, item.id)) {
        const sequence = Number(this.db.prepare(`
          SELECT COALESCE(MAX(sequence), -1) + 1 FROM opening_review_queue WHERE session_id = ?
        `).pluck().get(sessionId));
        this.db.prepare(`
          INSERT INTO opening_review_queue(
            id, session_id, review_item_id, sequence, presentation_kind, status
          ) VALUES (?, ?, ?, ?, 'lapse_repeat', 'pending')
        `).run(id(), sessionId, item.id, sequence);
        repeatQueued = true;
      }
    })();

    return this.feedback(queue, this.event(queue.queue_id)!, repeatQueued);
  }

  recordMistake(sessionId: string, moveUci: string): OpeningReviewMistakeResponse {
    const queue = this.activeQueue(sessionId);
    if (this.event(queue.queue_id)) throw new Error("This opening position has already been answered");
    const item = this.item(queue.review_item_id);
    const played = applyLegalMove(item.from_fen, moveUci);
    const accepted = this.db.prepare(`
      SELECT 1 FROM opening_moves
      WHERE repertoire_id = ? AND from_position_id = ? AND move_uci = ?
        AND role = 'learner' AND active = 1
    `).get(item.repertoire_id, item.position_id, moveUci);
    if (accepted) throw new Error("That is an accepted repertoire move");

    const createdAt = now();
    const responseMs = Math.max(0, Date.parse(createdAt) - Date.parse(queue.started_at));
    this.db.prepare(`
      INSERT INTO opening_review_mistakes(
        id, review_item_id, session_id, queue_entry_id,
        played_move_uci, played_move_san, response_ms, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(), item.id, sessionId, queue.queue_id,
      moveUci, played.san, responseMs, createdAt,
    );
    const attemptNumber = Number(this.db.prepare(`
      SELECT COUNT(*) FROM opening_review_mistakes WHERE queue_entry_id = ?
    `).pluck().get(queue.queue_id));
    return { moveUci, moveSan: played.san, attemptNumber };
  }

  reveal(sessionId: string): OpeningReviewFeedback {
    const queue = this.activeQueue(sessionId);
    const item = this.item(queue.review_item_id);
    return this.answer(sessionId, item.move_uci, true, true);
  }

  continue(sessionId: string): OpeningReviewState {
    const queue = this.activeQueue(sessionId);
    if (!this.event(queue.queue_id)) throw new Error("Answer the opening position before continuing");
    const timestamp = now();
    let nextQueue: ActiveQueueRow | undefined;
    this.db.transaction(() => {
      this.db.prepare(`UPDATE opening_review_queue SET status = 'completed' WHERE id = ?`).run(queue.queue_id);
      const pending = this.db.prepare(`
        SELECT id FROM opening_review_queue
        WHERE session_id = ? AND status = 'pending'
        ORDER BY sequence LIMIT 1
      `).get(sessionId) as { id: string } | undefined;
      if (pending) {
        this.db.prepare(`
          UPDATE opening_review_queue SET status = 'active', started_at = ? WHERE id = ?
        `).run(timestamp, pending.id);
        nextQueue = this.activeQueue(sessionId);
      } else {
        this.db.prepare(`
          UPDATE opening_review_sessions SET status = 'completed', completed_at = ? WHERE id = ?
        `).run(timestamp, sessionId);
      }
    })();
    return nextQueue ? this.exercise(nextQueue) : this.complete(sessionId);
  }

  private ensureItems(profileId: string, repertoireId: string): void {
    const candidates = this.db.prepare(`
      SELECT DISTINCT m.id, m.repertoire_id, m.from_position_id, m.move_kind,
             m.sort_order, m.frequency
      FROM opening_moves m
      JOIN opening_line_moves olm ON olm.move_id = m.id
      JOIN opening_lines l ON l.id = olm.line_id AND l.active = 1
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      WHERE m.repertoire_id = ? AND m.role = 'learner' AND m.active = 1
    `).all(repertoireId) as CandidateReviewMove[];
    const canonical = new Map<string, CandidateReviewMove>();
    for (const candidate of candidates) {
      const current = canonical.get(candidate.from_position_id);
      const candidateIsPreferred = !current
        || (candidate.move_kind === "primary" && current.move_kind !== "primary")
        || (candidate.move_kind === current.move_kind && candidate.sort_order < current.sort_order)
        || (candidate.move_kind === current.move_kind && candidate.sort_order === current.sort_order
          && (candidate.frequency ?? 0) > (current.frequency ?? 0))
        || (candidate.move_kind === current.move_kind && candidate.sort_order === current.sort_order
          && (candidate.frequency ?? 0) === (current.frequency ?? 0) && candidate.id < current.id);
      if (candidateIsPreferred) canonical.set(candidate.from_position_id, candidate);
    }
    const timestamp = now();
    const upsert = this.db.prepare(`
      INSERT INTO opening_review_items(
        id, profile_id, repertoire_id, position_id, move_id, knowledge_dimension,
        scheduler_version, state, due_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'move', ?, 0, ?, ?, ?)
      ON CONFLICT(profile_id, repertoire_id, position_id, knowledge_dimension)
      DO UPDATE SET move_id = excluded.move_id, scheduler_version = excluded.scheduler_version,
                    updated_at = excluded.updated_at
    `);
    this.db.transaction(() => {
      for (const move of canonical.values()) {
        upsert.run(
          id(), profileId, repertoireId, move.from_position_id, move.id,
          OPENING_SCHEDULER_VERSION, timestamp, timestamp, timestamp,
        );
      }
    })();
  }

  private activeQueue(sessionId: string): ActiveQueueRow {
    const profileId = activeProfileId(this.db);
    const row = this.db.prepare(`
      SELECT s.id AS session_id, s.repertoire_id, r.name AS repertoire_name, r.learner_color,
             q.id AS queue_id, q.review_item_id, q.sequence, q.presentation_kind, q.started_at
      FROM opening_review_sessions s
      JOIN opening_repertoires r ON r.id = s.repertoire_id
      JOIN opening_review_queue q ON q.session_id = s.id AND q.status = 'active'
      WHERE s.id = ? AND s.profile_id = ? AND s.status = 'active'
    `).get(sessionId, profileId) as ActiveQueueRow | undefined;
    if (!row) throw new Error("Active opening review not found");
    return row;
  }

  private item(itemId: string): ReviewItemRow {
    const row = this.db.prepare(`
      SELECT ori.*, m.move_uci, m.move_san, before.fen AS from_fen, after.fen AS to_fen,
             r.learner_color, r.name AS repertoire_name, a.summary, a.changes_json,
             a.resulting_plan, a.tactical_warning, a.common_mistake,
             lc.comment AS personal_comment
      FROM opening_review_items ori
      JOIN opening_moves m ON m.id = ori.move_id
      JOIN opening_positions before ON before.id = m.from_position_id
      JOIN opening_positions after ON after.id = m.to_position_id
      JOIN opening_repertoires r ON r.id = ori.repertoire_id
      JOIN opening_move_annotations a ON a.move_id = m.id
      LEFT JOIN opening_learning_comments lc ON lc.move_id = m.id AND lc.profile_id = ori.profile_id
      WHERE ori.id = ?
    `).get(itemId) as ReviewItemRow | undefined;
    if (!row) throw new Error("Opening review item not found");
    return row;
  }

  private event(queueId: string): EventRow | undefined {
    return this.db.prepare(`
      SELECT played_move_uci, played_move_san, correct, assisted, revealed, rating, next_due_at
      FROM opening_review_events WHERE queue_entry_id = ?
    `).get(queueId) as EventRow | undefined;
  }

  private exercise(queue: ActiveQueueRow): OpeningReviewExercise {
    const item = this.item(queue.review_item_id);
    const context = this.db.prepare(`
      SELECT target.line_id, target.ply AS target_ply,
             previous.role AS previous_role, previous.move_uci AS previous_uci,
             previous.move_san AS previous_san, previous_before.fen AS previous_fen
      FROM opening_line_moves target
      JOIN opening_lines l ON l.id = target.line_id AND l.active = 1
      JOIN opening_chapters c ON c.id = l.chapter_id AND c.active = 1
      LEFT JOIN opening_line_moves previous_link
        ON previous_link.line_id = target.line_id AND previous_link.ply = target.ply - 1
      LEFT JOIN opening_moves previous ON previous.id = previous_link.move_id
      LEFT JOIN opening_positions previous_before ON previous_before.id = previous.from_position_id
      WHERE target.move_id = ?
      ORDER BY c.sort_order, l.priority, target.ply
      LIMIT 1
    `).get(item.move_id) as {
      line_id: string;
      target_ply: number;
      previous_role: "learner" | "opponent" | null;
      previous_uci: string | null;
      previous_san: string | null;
      previous_fen: string | null;
    } | undefined;
    const hasOpponentContext = context?.previous_role === "opponent";
    const movesBefore = context ? this.db.prepare(`
      SELECT m.move_san
      FROM opening_line_moves olm
      JOIN opening_moves m ON m.id = olm.move_id
      WHERE olm.line_id = ? AND olm.ply < ?
      ORDER BY olm.ply
    `).pluck().all(context.line_id, context.target_ply) as string[] : [];
    const completed = Number(this.db.prepare(`
      SELECT COUNT(*) FROM opening_review_queue WHERE session_id = ? AND status = 'completed'
    `).pluck().get(queue.session_id));
    const total = Number(this.db.prepare(`
      SELECT COUNT(*) FROM opening_review_queue WHERE session_id = ?
    `).pluck().get(queue.session_id));
    const learningStage = item.state === 0 && item.repetitions === 0
      ? "new"
      : item.state === 1 || item.state === 3 ? "learning" : "review";
    const explanation = {
      summary: item.summary,
      changes: JSON.parse(item.changes_json) as string[],
      resultingPlan: item.resulting_plan,
      tacticalWarning: item.tactical_warning,
      commonMistake: item.common_mistake,
      personalComment: item.personal_comment,
    };
    const acceptedMoves = this.db.prepare(`
      SELECT move_uci AS moveUci, move_san AS moveSan
      FROM opening_moves
      WHERE repertoire_id = ? AND from_position_id = ?
        AND role = 'learner' AND active = 1
      ORDER BY CASE move_kind WHEN 'primary' THEN 0 ELSE 1 END, sort_order, move_san
    `).all(item.repertoire_id, item.position_id) as Array<{ moveUci: string; moveSan: string }>;
    return {
      kind: "exercise",
      sessionId: queue.session_id,
      repertoire: { id: queue.repertoire_id, name: queue.repertoire_name },
      learnerColor: queue.learner_color,
      positionNumber: completed + 1,
      totalPositions: total,
      presentationKind: queue.presentation_kind,
      learningStage,
      fenBeforeOpponent: hasOpponentContext ? context!.previous_fen! : item.from_fen,
      fenToMove: item.from_fen,
      opponentMove: hasOpponentContext
        ? { moveUci: context!.previous_uci!, moveSan: context!.previous_san! }
        : null,
      movesBefore,
      moveNumber: Number.parseInt(item.from_fen.split(" ")[5] ?? "1", 10),
      prompt: "Recall your repertoire move for this position.",
      acceptedMoves,
      introduction: {
        repertoireMove: { moveId: item.move_id, moveUci: item.move_uci, moveSan: item.move_san },
        fenAfterMove: item.to_fen,
        explanation,
      },
    };
  }

  private feedback(queue: ActiveQueueRow, event: EventRow, lapseQueued = false): OpeningReviewFeedback {
    const item = this.item(queue.review_item_id);
    const exercise = this.exercise(queue);
    const exactMove = event.played_move_uci === item.move_uci;
    const outcome = event.correct === 0 ? "again" : event.assisted === 1 ? "learning" : "remembered";
    const slowRecall = outcome === "remembered" && event.rating === 2;
    return {
      kind: "feedback",
      sessionId: queue.session_id,
      exercise,
      outcome,
      recallSpeed: outcome === "remembered" ? slowRecall ? "slow" : "normal" : null,
      assisted: event.assisted === 1,
      revealed: event.revealed === 1,
      playedMove: { moveUci: event.played_move_uci, moveSan: event.played_move_san },
      repertoireMove: { moveUci: item.move_uci, moveSan: item.move_san },
      fenAfterMove: item.to_fen,
      message: outcome === "learning"
        ? event.revealed === 1
          ? "You chose to reveal the repertoire move. Study why it works; this position will return later for an unassisted recall."
          : "You played the move after studying it. It will return later so you can recall it without help."
        : outcome === "remembered"
        ? slowRecall
          ? "You found the repertoire move without help, but it took some thought. It will return sooner to make the recall more automatic."
          : exactMove
          ? "You recalled the repertoire move without help."
          : `That is an accepted repertoire move. This review uses ${item.move_san} as its reference move.`
        : `That legal move is outside this repertoire. Compare it with ${item.move_san}, then recall the position again later in this session.`,
      explanation: {
        summary: item.summary,
        changes: JSON.parse(item.changes_json) as string[],
        resultingPlan: item.resulting_plan,
        tacticalWarning: item.tactical_warning,
        commonMistake: item.common_mistake,
        personalComment: item.personal_comment,
      },
      nextDueAt: event.next_due_at,
      lapseQueued: lapseQueued || queue.presentation_kind === "lapse_repeat" || outcome !== "remembered",
    };
  }

  private complete(sessionId: string): OpeningReviewComplete {
    const row = this.db.prepare(`
      SELECT s.id, r.name AS repertoire_name, COUNT(e.id) AS attempts,
             COUNT(DISTINCT e.review_item_id) AS positions,
             SUM(CASE WHEN e.correct = 1 AND e.assisted = 0 THEN 1 ELSE 0 END) AS remembered,
             SUM(CASE WHEN e.correct = 1 AND e.assisted = 1 THEN 1 ELSE 0 END) AS introduced,
             COUNT(DISTINCT CASE
               WHEN e.correct = 0 OR EXISTS(
                 SELECT 1 FROM opening_review_mistakes rm WHERE rm.queue_entry_id = e.queue_entry_id
               ) THEN e.queue_entry_id
               ELSE NULL
             END) AS lapses
      FROM opening_review_sessions s
      JOIN opening_repertoires r ON r.id = s.repertoire_id
      LEFT JOIN opening_review_events e ON e.session_id = s.id
      WHERE s.id = ?
      GROUP BY s.id
    `).get(sessionId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Completed opening review not found");
    return {
      kind: "complete",
      sessionId,
      repertoireName: String(row.repertoire_name),
      attempts: Number(row.attempts),
      positions: Number(row.positions),
      remembered: Number(row.remembered),
      introduced: Number(row.introduced),
      lapses: Number(row.lapses),
      message: "Practice complete. Unassisted recalls will wait longer; new or missed moves return sooner.",
    };
  }
}

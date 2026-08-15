import { Chess } from "chess.js";

import type {
  DashboardResponse,
  EmptyTrainingResponse,
  NextPunishBlunderResponse,
  NextQuietPositionResponse,
  PunishBlunderAnswerResponse,
  PunishBlunderExercise,
  QuietPositionAnswerResponse,
  QuietPositionExercise,
  ResponseCategory,
  SkillMetric,
  TrainingSessionResponse,
} from "../../../../packages/contracts/src/api.js";
import type { SqliteDatabase } from "../db/database.js";
import { id, now } from "../lib/ids.js";
import { activeProfileId } from "./profile.js";
import { recordReview } from "./review-scheduler.js";

const MODE_LABELS: Record<string, string> = {
  blunder_check: "Blunder checks",
  what_changed: "What changed",
  candidate_generation: "Candidate generation",
  punish_blunder: "Punish the blunder",
  quiet_position: "Quiet positions",
};

const BASE_SESSION: Record<string, number> = {
  blunder_check: 6,
  what_changed: 3,
  candidate_generation: 2,
  punish_blunder: 2,
  quiet_position: 2,
};

interface ExerciseRow {
  item_id: string;
  fen: string;
  bad_move_san?: string;
  player_color: "white" | "black";
  move_number: number;
}

interface AttemptRow {
  id: string;
  item_id: string;
  started_at: string | null;
  answered_at: string | null;
  fen: string;
  explanation: string;
  weakest_squares_json?: string;
  acceptable_moves_json?: string;
}

interface AcceptableMove {
  moveUci: string;
  moveSan: string;
  centipawnLoss: number;
}

function moveFromUci(uci: string): { from: string; to: string; promotion?: string } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error("Choose a legal board move");
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci.length === 5 ? { promotion: uci.slice(4, 5) } : {}),
  };
}

export class V1TrainingService {
  constructor(private readonly db: SqliteDatabase) {}

  nextPunish(pool: string, itemId?: string): NextPunishBlunderResponse {
    const row = this.nextRow("punish_blunder", pool, `
      SELECT ti.id AS item_id, position.fen, pbi.bad_move_san,
             CASE WHEN game.player_color = 'white' THEN 'black' ELSE 'white' END AS player_color,
             move.move_number
      FROM training_items ti
      JOIN punish_blunder_items pbi ON pbi.item_id = ti.id
      JOIN positions position ON position.id = pbi.position_id
      JOIN games game ON game.id = ti.game_id
      JOIN moves move ON move.id = ti.source_move_id
      JOIN review_states rs ON rs.item_id = ti.id
    `, itemId);
    if (!row) return this.empty("punish_blunder");
    const exercise: PunishBlunderExercise = {
      kind: "exercise",
      attemptId: null,
      itemId: row.item_id,
      mode: "punish_blunder",
      fen: row.fen,
      badMoveSan: row.bad_move_san ?? "the move",
      opponentColor: row.player_color,
      moveNumber: row.move_number,
      prompt: "How can the opponent punish this immediately?",
    };
    return exercise;
  }

  nextQuiet(pool: string, itemId?: string): NextQuietPositionResponse {
    const row = this.nextRow("quiet_position", pool, `
      SELECT ti.id AS item_id, position.fen, game.player_color, move.move_number
      FROM training_items ti
      JOIN quiet_position_items qpi ON qpi.item_id = ti.id
      JOIN positions position ON position.id = qpi.position_id
      JOIN games game ON game.id = ti.game_id
      JOIN moves move ON move.id = ti.source_move_id
      JOIN review_states rs ON rs.item_id = ti.id
    `, itemId);
    if (!row) return this.empty("quiet_position");
    const exercise: QuietPositionExercise = {
      kind: "exercise",
      attemptId: null,
      itemId: row.item_id,
      mode: "quiet_position",
      fen: row.fen,
      playerColor: row.player_color,
      moveNumber: row.move_number,
      prompt: "Which piece can improve its role most, and which quiet move does that?",
    };
    return exercise;
  }

  answerPunish(attemptId: string, moveUci: string): PunishBlunderAnswerResponse {
    const attempt = this.punishAttempt(attemptId);
    const responses = this.responses(attempt.item_id);
    const matching = responses.find((response) => response.moveUci === moveUci);
    let playedMoveSan: string | null = null;
    try { playedMoveSan = new Chess(attempt.fen).move(moveFromUci(moveUci))?.san ?? null; } catch { /* feedback remains useful */ }
    if (!playedMoveSan) throw new Error("Choose a legal punishment on the board");
    const passed = Boolean(matching);
    const answeredAt = now();
    const duration = this.duration(attempt.started_at, answeredAt);
    const feedback: PunishBlunderAnswerResponse = {
      outcome: passed ? "excellent" : "incorrect",
      score: passed ? 1 : 0,
      moveCorrect: passed,
      playedMoveSan,
      acceptableMoves: responses,
      explanation: attempt.explanation,
      checklistPoint: "Checks, captures, threats: punish the move before the position can recover.",
    };
    this.finish(attempt, answeredAt, duration, feedback.outcome, feedback.score, { moveUci }, feedback, passed);
    return feedback;
  }

  revealPunish(attemptId: string): PunishBlunderAnswerResponse {
    const attempt = this.punishAttempt(attemptId);
    const feedback: PunishBlunderAnswerResponse = {
      outcome: "incorrect", score: 0, moveCorrect: false, playedMoveSan: null,
      acceptableMoves: this.responses(attempt.item_id), explanation: attempt.explanation,
      checklistPoint: "Checks, captures, threats: punish the move before the position can recover.",
    };
    const answeredAt = now();
    this.finish(attempt, answeredAt, this.duration(attempt.started_at, answeredAt), "revealed", 0, {}, feedback, false);
    return feedback;
  }

  answerQuiet(attemptId: string, square: string, moveUci: string): QuietPositionAnswerResponse {
    if (!/^[a-h][1-8]$/.test(square)) throw new Error("Choose the piece that is doing the least");
    const attempt = this.quietAttempt(attemptId);
    const weakestSquares = JSON.parse(attempt.weakest_squares_json ?? "[]") as string[];
    const acceptableMoves = JSON.parse(attempt.acceptable_moves_json ?? "[]") as AcceptableMove[];
    const pieceCorrect = weakestSquares.includes(square);
    const moveCorrect = acceptableMoves.some((move) => move.moveUci === moveUci);
    let selectedMoveSan: string | null = null;
    try { selectedMoveSan = new Chess(attempt.fen).move(moveFromUci(moveUci))?.san ?? null; } catch { /* handled below */ }
    if (!selectedMoveSan) throw new Error("Choose a legal improving move on the board");
    const score = (pieceCorrect ? 0.45 : 0) + (moveCorrect ? 0.55 : 0);
    const outcome = score === 1 ? "excellent" : score > 0 ? "partial" : "incorrect";
    const feedback: QuietPositionAnswerResponse = {
      outcome, score, pieceCorrect, moveCorrect, selectedMoveSan, weakestSquares,
      acceptableMoves, explanation: attempt.explanation,
      checklistPoint: "When there is no forcing move, find a piece whose role can be improved.",
    };
    const answeredAt = now();
    this.finish(attempt, answeredAt, this.duration(attempt.started_at, answeredAt), outcome, score, { square, moveUci }, feedback, outcome === "excellent");
    return feedback;
  }

  revealQuiet(attemptId: string): QuietPositionAnswerResponse {
    const attempt = this.quietAttempt(attemptId);
    const feedback: QuietPositionAnswerResponse = {
      outcome: "incorrect", score: 0, pieceCorrect: false, moveCorrect: false,
      selectedMoveSan: null,
      weakestSquares: JSON.parse(attempt.weakest_squares_json ?? "[]") as string[],
      acceptableMoves: JSON.parse(attempt.acceptable_moves_json ?? "[]") as AcceptableMove[],
      explanation: attempt.explanation,
      checklistPoint: "When there is no forcing move, find a piece whose role can be improved.",
    };
    const answeredAt = now();
    this.finish(attempt, answeredAt, this.duration(attempt.started_at, answeredAt), "revealed", 0, {}, feedback, false);
    return feedback;
  }

  dashboard(): DashboardResponse {
    const selectedProfileId = activeProfileId(this.db);
    const profile = selectedProfileId ? this.db.prepare("SELECT id, display_name FROM player_profiles WHERE id = ?")
      .get(selectedProfileId) as { id: string; display_name: string } | undefined : undefined;
    if (!profile) {
      return {
        profile: null, totals: { games: 0, trainingItems: 0, due: 0, attempts: 0 },
        recurringProblems: [], skills: [], recommendedSession: [],
      };
    }
    const totals = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM games WHERE profile_id = ?) AS games,
        (SELECT COUNT(*) FROM training_items WHERE profile_id = ? AND active = 1 AND mode != 'diagnosis_only') AS trainingItems,
        (SELECT COUNT(*) FROM review_states rs JOIN training_items ti ON ti.id = rs.item_id
          WHERE ti.profile_id = ? AND ti.active = 1 AND rs.due_at <= ?) AS due,
        (SELECT COUNT(*) FROM training_attempts ta JOIN training_items ti ON ti.id = ta.item_id
          WHERE ti.profile_id = ? AND ta.answered_at IS NOT NULL) AS attempts
    `).get(profile.id, profile.id, profile.id, now(), profile.id) as DashboardResponse["totals"];
    const concepts = this.db.prepare(`
      SELECT c.id, c.family, c.label,
             COUNT(DISTINCT CASE WHEN tic.active = 1 THEN ti.source_move_id END) AS occurrences
      FROM concepts c
      LEFT JOIN training_item_concepts tic ON tic.concept_id = c.id AND tic.active = 1
      LEFT JOIN training_items ti ON ti.id = tic.item_id AND ti.profile_id = ? AND ti.active = 1
      WHERE c.family IN ('thinking_process', 'candidate_type', 'tactical', 'position_change')
      GROUP BY c.id ORDER BY c.family, c.label
    `).all(profile.id) as Array<{ id: string; family: string; label: string; occurrences: number }>;
    const metrics = concepts.map((concept) => this.metric(profile.id, concept));
    const tracked = metrics.filter((metric) => metric.realGameOccurrences > 0 || metric.attempts > 0);
    const recurringProblems = [...tracked].sort((left, right) => {
      const leftRate = left.successRate ?? 0;
      const rightRate = right.successRate ?? 0;
      return (right.realGameOccurrences * (1 - rightRate)) - (left.realGameOccurrences * (1 - leftRate));
    }).slice(0, 6);
    return {
      profile: { id: profile.id, displayName: profile.display_name }, totals,
      recurringProblems, skills: tracked, recommendedSession: this.recommendedMix(15, profile.id),
    };
  }

  createSession(requestedSize = 15): TrainingSessionResponse {
    const size = Math.max(1, Math.min(50, Math.round(requestedSize)));
    const selectedProfileId = activeProfileId(this.db);
    const profile = selectedProfileId ? { id: selectedProfileId } : undefined;
    if (!profile) return { id: null, requestedSize: size, items: [], mix: [], message: "Import a game to create a session." };
    const existing = this.db.prepare(`
      SELECT id FROM training_sessions
      WHERE profile_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1
    `).get(profile.id) as { id: string } | undefined;
    if (existing) return this.session(existing.id);
    const mix = this.recommendedMix(size, profile.id);
    const selected: Array<{ itemId: string; mode: string; ordinal: number }> = [];
    for (const allocation of mix) {
      const rows = this.db.prepare(`
        SELECT ti.id,
               COALESCE(SUM(concept_frequency.occurrences), 0) AS repeated_concepts
        FROM training_items ti
        JOIN review_states rs ON rs.item_id = ti.id
        LEFT JOIN training_item_concepts tic ON tic.item_id = ti.id AND tic.active = 1
        LEFT JOIN (
          SELECT tic2.concept_id, COUNT(DISTINCT ti2.source_move_id) AS occurrences
          FROM training_item_concepts tic2
          JOIN training_items ti2 ON ti2.id = tic2.item_id AND ti2.active = 1
          WHERE tic2.active = 1 AND ti2.profile_id = ?
          GROUP BY tic2.concept_id
        ) concept_frequency ON concept_frequency.concept_id = tic.concept_id
        WHERE ti.profile_id = ? AND ti.mode = ? AND ti.active = 1
        GROUP BY ti.id
        ORDER BY CASE WHEN rs.due_at <= ? THEN 0 ELSE 1 END,
                 CASE WHEN rs.last_result IS NOT NULL AND rs.last_result != 'excellent' THEN 0 ELSE 1 END,
                 repeated_concepts DESC, (rs.attempts - rs.successes) DESC,
                 rs.average_response_ms DESC, ti.created_at DESC, RANDOM()
        LIMIT ?
      `).all(profile.id, profile.id, allocation.mode, now(), allocation.count) as Array<{ id: string }>;
      for (const row of rows) selected.push({ itemId: row.id, mode: allocation.mode, ordinal: selected.length + 1 });
    }
    if (selected.length === 0) {
      return { id: null, requestedSize: size, items: [], mix: [], message: "No exercises exist yet. Import and analyse a game first." };
    }
    const sessionId = id();
    this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO training_sessions(id, profile_id, requested_size, status, created_at)
        VALUES (?, ?, ?, 'active', ?)
      `).run(sessionId, profile.id, size, now());
      const insert = this.db.prepare(`
        INSERT INTO training_session_items(session_id, item_id, ordinal) VALUES (?, ?, ?)
      `);
      for (const item of selected) insert.run(sessionId, item.itemId, item.ordinal);
    })();
    const actualMix = Object.entries(selected.reduce<Record<string, number>>((counts, item) => {
      counts[item.mode] = (counts[item.mode] ?? 0) + 1;
      return counts;
    }, {})).map(([mode, count]) => ({ mode, label: MODE_LABELS[mode] ?? mode, count }));
    return {
      id: sessionId, requestedSize: size, items: selected, mix: actualMix,
      message: selected.length === size ? "Your weakness-weighted session is ready." : `Built ${selected.length} exercises from the positions available.`,
      status: "active", completedCount: 0, currentItem: selected[0] ?? null,
    };
  }

  activeSession(): TrainingSessionResponse | null {
    const profileId = activeProfileId(this.db);
    if (!profileId) return null;
    const row = this.db.prepare(`
      SELECT id FROM training_sessions
      WHERE profile_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1
    `).get(profileId) as { id: string } | undefined;
    return row ? this.session(row.id) : null;
  }

  session(sessionId: string): TrainingSessionResponse {
    const profileId = activeProfileId(this.db);
    const session = this.db.prepare(`
      SELECT id, requested_size, status FROM training_sessions
      WHERE id = ? AND profile_id = ?
    `).get(sessionId, profileId) as {
      id: string; requested_size: number; status: "active" | "completed";
    } | undefined;
    if (!session) throw new Error("Training session not found");
    this.db.prepare(`
      UPDATE training_session_items SET completed = 1, completed_at = COALESCE(completed_at, ?)
      WHERE session_id = ? AND completed = 0 AND item_id IN (
        SELECT id FROM training_items WHERE active = 0
      )
    `).run(now(), sessionId);
    const rows = this.db.prepare(`
      SELECT tsi.item_id AS itemId, ti.mode, tsi.ordinal, tsi.completed
      FROM training_session_items tsi
      JOIN training_items ti ON ti.id = tsi.item_id
      WHERE tsi.session_id = ? AND ti.active = 1
      ORDER BY tsi.ordinal
    `).all(sessionId) as Array<{ itemId: string; mode: string; ordinal: number; completed: number }>;
    const items = rows.map(({ itemId, mode, ordinal }) => ({ itemId, mode, ordinal }));
    const completedCount = rows.filter((row) => row.completed === 1).length;
    const current = rows.find((row) => row.completed === 0);
    if (!current && session.status === "active") {
      this.db.prepare(`
        UPDATE training_sessions SET status = 'completed', completed_at = ? WHERE id = ?
      `).run(now(), sessionId);
      session.status = "completed";
    }
    const mix = Object.entries(items.reduce<Record<string, number>>((counts, item) => {
      counts[item.mode] = (counts[item.mode] ?? 0) + 1;
      return counts;
    }, {})).map(([mode, count]) => ({ mode, label: MODE_LABELS[mode] ?? mode, count }));
    return {
      id: session.id,
      requestedSize: session.requested_size,
      items,
      mix,
      message: session.status === "completed"
        ? "Session complete. The prevention habit gets stronger through repetition."
        : completedCount > 0 ? "Continue today’s session." : "Your weakness-weighted session is ready.",
      status: session.status,
      completedCount,
      currentItem: current ? { itemId: current.itemId, mode: current.mode, ordinal: current.ordinal } : null,
    };
  }

  concepts(): Array<{ id: string; family: string; label: string }> {
    return this.db.prepare(`
      SELECT id, family, label FROM concepts
      WHERE family IN ('thinking_process', 'tactical')
        AND id != 'process.candidate_generation'
      ORDER BY family, label
    `).all() as Array<{ id: string; family: string; label: string }>;
  }

  classify(itemId: string, conceptIds: string[]): Array<{ id: string; family: string; label: string }> {
    const item = this.db.prepare("SELECT id FROM training_items WHERE id = ? AND profile_id = ?")
      .get(itemId, activeProfileId(this.db));
    if (!item) throw new Error("Training item not found");
    const unique = [...new Set(conceptIds)];
    const chosen = unique.map((conceptId) => {
      const concept = this.db.prepare(`
        SELECT id, family, label FROM concepts
        WHERE id = ? AND family IN ('thinking_process', 'tactical')
      `).get(conceptId) as { id: string; family: string; label: string } | undefined;
      if (!concept) throw new Error(`Unknown diagnosis: ${conceptId}`);
      return concept;
    });
    this.db.transaction(() => {
      for (const family of ["thinking_process", "tactical"]) {
        if (!chosen.some((concept) => concept.family === family)) continue;
        this.db.prepare(`
          UPDATE training_item_concepts SET active = 0
          WHERE item_id = ? AND concept_id IN (SELECT id FROM concepts WHERE family = ?)
        `).run(itemId, family);
        this.db.prepare(`
          DELETE FROM training_item_concepts
          WHERE item_id = ? AND source = 'manual'
            AND concept_id IN (SELECT id FROM concepts WHERE family = ?)
        `).run(itemId, family);
      }
      for (const concept of chosen) {
        this.db.prepare(`
          INSERT INTO training_item_concepts(item_id, concept_id, source, confidence, is_primary, active)
          VALUES (?, ?, 'manual', 1, 1, 1)
        `).run(itemId, concept.id);
      }
    })();
    return chosen;
  }

  private nextRow(mode: string, pool: string, select: string, itemId?: string): ExerciseRow | undefined {
    const profileId = activeProfileId(this.db);
    if (!profileId) return undefined;
    const where = pool === "due" ? "AND rs.due_at <= ?" : pool === "mastered" ? "AND rs.mastery_level >= 4" : "";
    const params = [mode, profileId, ...(itemId ? [itemId] : []), ...(pool === "due" ? [now()] : [])];
    const itemWhere = itemId ? "AND ti.id = ?" : "";
    const order = pool === "random" ? "ORDER BY RANDOM()" : "ORDER BY rs.due_at, ti.created_at";
    return this.db.prepare(`${select} WHERE ti.mode = ? AND ti.active = 1 AND ti.profile_id = ? ${itemWhere} ${where} ${order} LIMIT 1`)
      .get(...params) as ExerciseRow | undefined;
  }

  private punishAttempt(attemptId: string): AttemptRow {
    return this.attempt(attemptId, "punish_blunder", `
      SELECT ta.id, ta.item_id, ta.started_at, ta.answered_at,
             position.fen, pbi.explanation
      FROM training_attempts ta
      JOIN training_items ti ON ti.id = ta.item_id
      JOIN punish_blunder_items pbi ON pbi.item_id = ti.id
      JOIN positions position ON position.id = pbi.position_id
    `);
  }

  private quietAttempt(attemptId: string): AttemptRow {
    return this.attempt(attemptId, "quiet_position", `
      SELECT ta.id, ta.item_id, ta.started_at, ta.answered_at,
             position.fen, qpi.explanation, qpi.weakest_squares_json,
             qpi.acceptable_moves_json
      FROM training_attempts ta
      JOIN training_items ti ON ti.id = ta.item_id
      JOIN quiet_position_items qpi ON qpi.item_id = ti.id
      JOIN positions position ON position.id = qpi.position_id
    `);
  }

  private attempt(attemptId: string, mode: string, select: string): AttemptRow {
    const attempt = this.db.prepare(`${select} WHERE ta.id = ? AND ti.mode = ?`).get(attemptId, mode) as AttemptRow | undefined;
    if (!attempt) throw new Error("Attempt not found");
    if (attempt.answered_at) throw new Error("Attempt has already been answered");
    return attempt;
  }

  private responses(itemId: string): PunishBlunderAnswerResponse["acceptableMoves"] {
    const rows = this.db.prepare(`
      SELECT move_uci, move_san, categories_json FROM acceptable_responses
      WHERE item_id = ? ORDER BY engine_rank
    `).all(itemId) as Array<{ move_uci: string; move_san: string; categories_json: string }>;
    return rows.map((row) => ({
      moveUci: row.move_uci, moveSan: row.move_san,
      categories: JSON.parse(row.categories_json) as ResponseCategory[],
    }));
  }

  private duration(startedAt: string | null, answeredAt: string): number {
    return startedAt ? Math.max(0, Date.parse(answeredAt) - Date.parse(startedAt)) : 0;
  }

  private finish(
    attempt: AttemptRow, answeredAt: string, duration: number, storedOutcome: string,
    score: number, response: unknown, feedback: unknown, passed: boolean,
  ): void {
    this.db.transaction(() => {
      this.db.prepare(`
        UPDATE training_attempts SET started_at = COALESCE(started_at, ?), answered_at = ?,
          duration_ms = ?, score = ?, outcome = ?, response_json = ?, feedback_json = ?
        WHERE id = ?
      `).run(answeredAt, answeredAt, duration, score, storedOutcome, JSON.stringify(response), JSON.stringify(feedback), attempt.id);
      recordReview(this.db, attempt.item_id, passed, duration, storedOutcome, answeredAt);
    })();
  }

  private empty(mode: "punish_blunder" | "quiet_position"): EmptyTrainingResponse {
    const counts = this.db.prepare(`
      SELECT COUNT(*) AS active,
             SUM(CASE WHEN rs.mastery_level >= 4 THEN 1 ELSE 0 END) AS mastered
      FROM training_items ti JOIN review_states rs ON rs.item_id = ti.id
      WHERE ti.mode = ? AND ti.active = 1 AND ti.profile_id = ?
    `).get(mode, activeProfileId(this.db)) as { active: number; mastered: number | null };
    const options = [];
    if (counts.active > 0) options.push({ pool: "early", label: "Review early", count: counts.active });
    if ((counts.mastered ?? 0) > 0) options.push({ pool: "mastered", label: "Practise mastered positions", count: counts.mastered ?? 0 });
    if (counts.active > 0) options.push({ pool: "random", label: "Random practice", count: counts.active });
    return {
      kind: "empty",
      message: counts.active ? "Nothing is due right now." : `No ${MODE_LABELS[mode]} exercises have been generated yet.`,
      options,
    };
  }

  private metric(
    profileId: string,
    concept: { id: string; family: string; label: string; occurrences: number },
  ): SkillMetric {
    const summary = this.db.prepare(`
      SELECT COUNT(*) AS attempts,
             SUM(CASE WHEN ta.outcome = 'excellent' THEN 1 ELSE 0 END) AS successes,
             AVG(ta.duration_ms) AS average_response_ms
      FROM training_attempts ta
      JOIN training_items ti ON ti.id = ta.item_id
      JOIN training_item_concepts tic ON tic.item_id = ti.id AND tic.active = 1
      WHERE ti.profile_id = ? AND tic.concept_id = ? AND ta.answered_at IS NOT NULL
    `).get(profileId, concept.id) as {
      attempts: number; successes: number | null; average_response_ms: number | null;
    };
    const recentAttempts = this.db.prepare(`
      SELECT ta.outcome, ta.duration_ms
      FROM training_attempts ta
      JOIN training_items ti ON ti.id = ta.item_id
      JOIN training_item_concepts tic ON tic.item_id = ti.id AND tic.active = 1
      WHERE ti.profile_id = ? AND tic.concept_id = ? AND ta.answered_at IS NOT NULL
      ORDER BY ta.answered_at DESC LIMIT 10
    `).all(profileId, concept.id) as Array<{ outcome: string; duration_ms: number | null }>;
    const successes = summary.successes ?? 0;
    const recent = recentAttempts.slice(0, 5);
    const previous = recentAttempts.slice(5, 10);
    const rate = (rows: typeof recentAttempts) => rows.length ? rows.filter((row) => row.outcome === "excellent").length / rows.length : null;
    const recentRate = rate(recent);
    const previousRate = rate(previous);
    const trend = recentAttempts.length < 6 || previousRate === null || recentRate === null
      ? "new"
      : recentRate > previousRate + 0.1 ? "improving" : recentRate < previousRate - 0.1 ? "declining" : "steady";
    return {
      conceptId: concept.id, family: concept.family, label: concept.label,
      attempts: summary.attempts, successes,
      successRate: summary.attempts ? successes / summary.attempts : null,
      averageResponseMs: summary.average_response_ms === null ? null : Math.round(summary.average_response_ms),
      recentTrend: trend, realGameOccurrences: concept.occurrences,
    };
  }

  private recommendedMix(size: number, profileId: string): DashboardResponse["recommendedSession"] {
    const available = this.db.prepare(`
      SELECT mode, COUNT(*) AS count FROM training_items
      WHERE active = 1 AND profile_id = ? GROUP BY mode
    `).all(profileId) as Array<{ mode: string; count: number }>;
    const counts = new Map(available.map((row) => [row.mode, row.count]));
    const baseTotal = Object.values(BASE_SESSION).reduce((sum, value) => sum + value, 0);
    const mix = Object.entries(BASE_SESSION)
      .filter(([mode]) => (counts.get(mode) ?? 0) > 0)
      .map(([mode, weight]) => ({
        mode, label: MODE_LABELS[mode] ?? mode,
        count: Math.min(counts.get(mode) ?? 0, Math.max(1, Math.round(size * weight / baseTotal))),
      }));
    let remaining = size - mix.reduce((sum, item) => sum + item.count, 0);
    while (remaining > 0 && mix.some((item) => item.count < (counts.get(item.mode) ?? 0))) {
      const target = [...mix].sort((a, b) => (BASE_SESSION[b.mode] ?? 1) - (BASE_SESSION[a.mode] ?? 1))
        .find((item) => item.count < (counts.get(item.mode) ?? 0));
      if (!target) break;
      target.count += 1;
      remaining -= 1;
    }
    return mix;
  }
}

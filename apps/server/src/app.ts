import fs from "node:fs";
import path from "node:path";

import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";

import type { ResponseCategory, WhatChangedCategory } from "../../../packages/contracts/src/api.js";
import type { CandidateSubmission } from "../../../packages/contracts/src/api.js";
import { APP_VERSION } from "../../../packages/contracts/src/version.js";
import { AnalysisService } from "./analysis/analysis-service.js";
import type { AppConfig } from "./config.js";
import { Database } from "./db/database.js";
import { ImportService } from "./imports/import-service.js";
import { LichessSyncService } from "./imports/lichess-sync-service.js";
import { JobWorker } from "./jobs/job-worker.js";
import { id, now } from "./lib/ids.js";
import { OpeningContentService } from "./openings/opening-content-service.js";
import { OpeningGameService } from "./openings/opening-game-service.js";
import { OpeningPgnImportService } from "./openings/opening-pgn-import.js";
import { OpeningLichessImportService } from "./openings/opening-lichess-import.js";
import { OpeningReviewService } from "./openings/opening-review-service.js";
import { OpeningTrainingService } from "./openings/opening-training-service.js";
import { OpeningWorkspaceService } from "./openings/opening-workspace-service.js";
import { OpeningCoverageService } from "./openings/opening-coverage-service.js";
import { OpeningAnalysisService } from "./openings/opening-analysis-service.js";
import { OpeningExplorerService } from "./openings/opening-explorer-service.js";
import { STARTER_OPENING_CURRICULA } from "./openings/starter-curricula.js";
import { TrainingService } from "./training/training-service.js";
import { CandidateTrainingService } from "./training/candidate-training-service.js";
import { V1TrainingService } from "./training/v1-training-service.js";
import { AttemptLifecycle } from "./training/attempt-lifecycle.js";
import { activeProfileId, setActiveProfile } from "./training/profile.js";

interface JobRow {
  id: string;
  kind: string;
  status: "queued" | "running" | "completed" | "failed";
  progress_current: number;
  progress_total: number;
  payload_json: string;
  result_json: string | null;
  error_message: string | null;
}

function jobResponse(row: JobRow) {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_message,
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

export async function buildApp(config: AppConfig): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 5 * 1024 * 1024,
    logger: process.env.NODE_ENV !== "test",
  });
  const database = new Database(config.databasePath, config.migrationsDir);
  const imports = new ImportService(database.connection);
  const lichessSync = new LichessSyncService(database.connection, imports, config.lichessApiToken);
  const training = new TrainingService(database.connection);
  const candidateTraining = new CandidateTrainingService(database.connection, config);
  const v1Training = new V1TrainingService(database.connection);
  const attempts = new AttemptLifecycle(database.connection);
  const openingContent = new OpeningContentService(database.connection);
  openingContent.sync(STARTER_OPENING_CURRICULA);
  const openingImports = new OpeningPgnImportService(database.connection, openingContent);
  const openingLichessImports = new OpeningLichessImportService(openingImports);
  const openingTraining = new OpeningTrainingService(database.connection);
  const openingReviews = new OpeningReviewService(database.connection);
  const openingGames = new OpeningGameService(database.connection);
  const openingWorkspace = new OpeningWorkspaceService(database.connection);
  const openingCoverage = new OpeningCoverageService(database.connection, config.lichessApiToken);
  const openingAnalysis = new OpeningAnalysisService(config);
  const openingExplorer = new OpeningExplorerService(database.connection, config.lichessApiToken);
  const analysis = new AnalysisService(database.connection, config);
  analysis.backfillWhatChanged();
  analysis.backfillCandidates();
  analysis.backfillV1();
  const worker = new JobWorker(database.connection, analysis);
  const activeAnalysisGames = new Set<string>();
  const activeJobs = database.connection.prepare(`
    SELECT payload_json FROM jobs WHERE kind = 'analyze_games' AND status IN ('queued', 'running')
  `).all() as Array<{ payload_json: string }>;
  for (const job of activeJobs) {
    const payload = JSON.parse(job.payload_json) as { gameIds?: unknown };
    if (Array.isArray(payload.gameIds)) {
      for (const gameId of payload.gameIds) if (typeof gameId === "string") activeAnalysisGames.add(gameId);
    }
  }
  const outdatedGames = database.connection.prepare(`
    SELECT g.id FROM games g
    WHERE COALESCE((
      SELECT MAX(ar.analysis_version) FROM analysis_runs ar
      WHERE ar.game_id = g.id AND ar.status = 'completed'
    ), 0) < 2
  `).all() as Array<{ id: string }>;
  for (const game of outdatedGames) {
    if (activeAnalysisGames.has(game.id)) continue;
    database.connection.prepare(`
      INSERT INTO jobs(id, kind, status, progress_total, payload_json, created_at)
      VALUES (?, 'analyze_games', 'queued', 1, ?, ?)
    `).run(id(), JSON.stringify({ gameIds: [game.id] }), now());
  }
  if (config.runWorker) worker.start();

  app.get("/api/v1/health", async () => {
    database.connection.prepare("SELECT 1").get();
    return { status: "ok", version: APP_VERSION };
  });

  app.get("/api/v1/system/engine", async () => ({
    binary: config.stockfishBinary,
    depth: config.stockfishDepth,
    multiPv: config.stockfishMultiPv,
    workerEnabled: config.runWorker,
  }));

  app.get("/api/v1/openings/catalog", async () => openingContent.catalog());

  app.get("/api/v1/openings/repertoires/:repertoireId", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      return openingWorkspace.repertoire(repertoireId);
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "Opening repertoire not found" });
    }
  });

  app.post("/api/v1/openings/repertoires/:repertoireId/lines/:lineId/moves", async (request, reply) => {
    try {
      const { repertoireId, lineId } = request.params as { repertoireId: string; lineId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      return openingWorkspace.addMove({
        repertoireId,
        lineId,
        afterPly: Number(body.afterPly),
        moveUci: requiredString(body.moveUci, "Move"),
        branchTitle: typeof body.branchTitle === "string" ? body.branchTitle : undefined,
        summary: typeof body.summary === "string" ? body.summary : undefined,
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save opening move" });
    }
  });

  app.patch("/api/v1/openings/repertoires/:repertoireId/moves/:moveId/explanation", async (request, reply) => {
    try {
      const { repertoireId, moveId } = request.params as { repertoireId: string; moveId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      return openingWorkspace.updateExplanation(
        repertoireId,
        moveId,
        requiredString(body.summary, "Explanation"),
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save explanation" });
    }
  });

  app.get("/api/v1/openings/repertoires/:repertoireId/coverage", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      const { rating } = request.query as { rating?: string };
      return await openingCoverage.coverage(repertoireId, rating ? Number(rating) : 1600);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not check opening coverage" });
    }
  });

  app.post("/api/v1/openings/analysis", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return await openingAnalysis.analyze(requiredString(body.fen, "Position"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not analyse opening position" });
    }
  });

  app.get("/api/v1/openings/explorer", async (request, reply) => {
    try {
      const { fen, rating } = request.query as { fen?: string; rating?: string };
      return await openingExplorer.position(requiredString(fen, "Position"), rating ? Number(rating) : 1600);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not load practical move frequencies" });
    }
  });

  app.post("/api/v1/openings/imports/pgn/preview", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return openingImports.preview({
        pgn: requiredString(body.pgn, "PGN"),
        learnerColor: body.learnerColor as "white" | "black" | "both",
        name: typeof body.name === "string" ? body.name : undefined,
        sourceType: body.sourceType as "self_authored" | "book_notes" | "lichess_study" | "licensed_pgn" | undefined,
        sourceTitle: typeof body.sourceTitle === "string" ? body.sourceTitle : undefined,
        sourceAuthor: typeof body.sourceAuthor === "string" ? body.sourceAuthor : undefined,
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not preview opening PGN" });
    }
  });

  app.post("/api/v1/openings/imports/pgn", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return openingImports.import({
        pgn: requiredString(body.pgn, "PGN"),
        learnerColor: body.learnerColor as "white" | "black" | "both",
        name: typeof body.name === "string" ? body.name : undefined,
        sourceType: body.sourceType as "self_authored" | "book_notes" | "lichess_study" | "licensed_pgn" | undefined,
        sourceTitle: typeof body.sourceTitle === "string" ? body.sourceTitle : undefined,
        sourceAuthor: typeof body.sourceAuthor === "string" ? body.sourceAuthor : undefined,
        ownershipConfirmed: body.ownershipConfirmed === true,
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not import opening PGN" });
    }
  });

  app.post("/api/v1/openings/imports/lichess/preview", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return await openingLichessImports.preview({
        studyUrl: requiredString(body.studyUrl, "Lichess Study URL"),
        learnerColor: body.learnerColor as "white" | "black" | "both",
        name: typeof body.name === "string" ? body.name : undefined,
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not preview Lichess Study" });
    }
  });

  app.post("/api/v1/openings/imports/lichess", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return await openingLichessImports.import({
        studyUrl: requiredString(body.studyUrl, "Lichess Study URL"),
        learnerColor: body.learnerColor as "white" | "black" | "both",
        name: typeof body.name === "string" ? body.name : undefined,
        selectedChapterIndexes: Array.isArray(body.selectedChapterIndexes)
          ? body.selectedChapterIndexes.map(Number)
          : undefined,
        ownershipConfirmed: body.ownershipConfirmed === true,
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not import Lichess Study" });
    }
  });

  app.get("/api/v1/openings/lessons/active", async () => openingTraining.active());

  app.post("/api/v1/openings/repertoires/:repertoireId/lessons/start", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      return openingTraining.start(repertoireId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start opening lesson" });
    }
  });

  app.post("/api/v1/openings/repertoires/:repertoireId/lines/:lineId/lessons/start", async (request, reply) => {
    try {
      const { repertoireId, lineId } = request.params as { repertoireId: string; lineId: string };
      return openingTraining.start(repertoireId, lineId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start opening line" });
    }
  });

  app.post("/api/v1/openings/lessons/:attemptId/move", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = request.body as { moveUci?: unknown };
      return openingTraining.answerMove(attemptId, requiredString(body?.moveUci, "Move"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not check opening move" });
    }
  });

  app.post("/api/v1/openings/lessons/:attemptId/why", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = (request.body ?? {}) as { concept?: unknown; reveal?: unknown };
      if (body.reveal === true) return openingTraining.answerWhy(attemptId, null);
      return openingTraining.answerWhy(attemptId, requiredString(body.concept, "Reason"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not check explanation" });
    }
  });

  app.post("/api/v1/openings/lessons/:attemptId/continue", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      return openingTraining.continue(attemptId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not continue opening lesson" });
    }
  });

  app.get("/api/v1/openings/reviews/active", async () => openingReviews.active());

  app.post("/api/v1/openings/reviews/:sessionId/resume", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      return openingReviews.resume(sessionId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not resume opening review" });
    }
  });

  app.post("/api/v1/openings/repertoires/:repertoireId/reviews/start", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      const body = (request.body ?? {}) as { mode?: unknown };
      const mode = body.mode ?? "auto";
      if (mode !== "auto" && mode !== "due" && mode !== "new" && mode !== "early") {
        throw new Error("Review mode must be due, new, or early");
      }
      return openingReviews.start(repertoireId, mode);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start opening review" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/move", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as { moveUci?: unknown; assisted?: unknown };
      if (body?.assisted !== undefined && typeof body.assisted !== "boolean") {
        throw new Error("Assisted must be true or false");
      }
      return openingReviews.answer(
        sessionId,
        requiredString(body?.moveUci, "Move"),
        body?.assisted === true,
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not check opening review" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/continue", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      return openingReviews.continue(sessionId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not continue opening review" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/reveal", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      return openingReviews.reveal(sessionId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not reveal opening move" });
    }
  });

  app.post("/api/v1/imports/pgn/preview", async (request, reply) => {
    try {
      const body = request.body as { pgn?: unknown };
      return imports.preview(requiredString(body?.pgn, "PGN"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.post("/api/v1/imports/pgn", async (request, reply) => {
    try {
      const body = request.body as { pgn?: unknown; playerName?: unknown };
      return reply.code(202).send(imports.import(
        requiredString(body?.pgn, "PGN"),
        requiredString(body?.playerName, "Player name"),
      ));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid request" });
    }
  });

  app.get("/api/v1/lichess/connection", async () => lichessSync.connection());

  app.post("/api/v1/lichess/connect", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      return await lichessSync.connect(requiredString(body.username, "Lichess username"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not connect Lichess" });
    }
  });

  app.post("/api/v1/lichess/sync", async (request, reply) => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const result = await lichessSync.sync(body.maxGames === undefined ? 50 : Number(body.maxGames));
      return reply.code(result.jobId ? 202 : 200).send(result);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not sync Lichess games" });
    }
  });

  app.get("/api/v1/imports/:batchId", async (request, reply) => {
    const { batchId } = request.params as { batchId: string };
    const row = database.connection.prepare(`
      SELECT id, status, imported_count, duplicate_count, rejected_count,
             errors_json, created_at, completed_at
      FROM import_batches WHERE id = ?
    `).get(batchId) as Record<string, unknown> | undefined;
    if (!row) return reply.code(404).send({ error: "Import batch not found" });
    return { ...row, errors: JSON.parse(String(row.errors_json)), errors_json: undefined };
  });

  app.get("/api/v1/jobs/active", async () => {
    const profileId = activeProfileId(database.connection);
    if (!profileId) return null;
    const rows = database.connection.prepare(`
      SELECT id, kind, status, progress_current, progress_total, payload_json,
             result_json, error_message
      FROM jobs
      WHERE kind = 'analyze_games'
      ORDER BY created_at DESC
      LIMIT 50
    `).all() as JobRow[];
    const belongsToProfile = database.connection.prepare(
      "SELECT 1 FROM games WHERE id = ? AND profile_id = ?",
    );
    const latest = rows.find((row) => {
      const payload = JSON.parse(row.payload_json) as { gameIds?: unknown };
      return Array.isArray(payload.gameIds) && payload.gameIds.some(
        (gameId) => typeof gameId === "string" && belongsToProfile.get(gameId, profileId),
      );
    });
    return latest && latest.status !== "completed" ? jobResponse(latest) : null;
  });

  app.get("/api/v1/jobs/:jobId", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const row = database.connection.prepare(`
      SELECT id, kind, status, progress_current, progress_total, payload_json,
             result_json, error_message
      FROM jobs WHERE id = ?
    `).get(jobId) as JobRow | undefined;
    if (!row) return reply.code(404).send({ error: "Job not found" });
    return jobResponse(row);
  });

  app.post("/api/v1/jobs/:jobId/retry", async (request, reply) => {
    const { jobId } = request.params as { jobId: string };
    const result = database.connection.prepare(`
      UPDATE jobs SET status = 'queued', progress_current = 0, error_message = NULL,
        started_at = NULL, completed_at = NULL WHERE id = ? AND status = 'failed'
    `).run(jobId);
    if (result.changes === 0) return reply.code(409).send({ error: "Only failed jobs can be retried" });
    return reply.code(202).send({ id: jobId, status: "queued" });
  });

  app.get("/api/v1/games", async () => ({
    games: database.connection.prepare(`
      SELECT id, white_name AS white, black_name AS black, player_color AS playerColor,
             result, played_at AS playedAt, analyzed_at AS analyzedAt
      FROM games WHERE profile_id = ? ORDER BY created_at DESC
    `).all(activeProfileId(database.connection)),
  }));

  app.get("/api/v1/games/:gameId/review", async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const profileId = activeProfileId(database.connection);
    if (!profileId) return reply.code(404).send({ error: "Game not found" });
    const game = database.connection.prepare(`
      SELECT id, white_name AS white, black_name AS black, player_color AS playerColor,
             result, played_at AS playedAt, analyzed_at AS analyzedAt
      FROM games WHERE id = ? AND profile_id = ?
    `).get(gameId, profileId);
    if (!game) return reply.code(404).send({ error: "Game not found" });
    const mistakeRows = database.connection.prepare(`
      SELECT m.ply, m.move_number AS moveNumber, m.san AS playedMove, m.uci AS playedMoveUci,
             ma.centipawn_loss AS centipawnLoss, ma.comparison_loss AS comparisonLoss,
             ma.classification,
             ma.eval_before_cp_white AS evaluationBefore,
             ma.eval_after_cp_white AS evaluationAfter,
             ma.eval_before_mate_white AS evaluationBeforeMate,
             ma.eval_after_mate_white AS evaluationAfterMate,
             m.from_position_id AS beforePositionId,
             ti.id AS trainingItemId,
             COALESCE(ti.id, (
               SELECT diagnosis.id FROM training_items diagnosis
               WHERE diagnosis.source_move_id = m.id AND diagnosis.active = 1
               ORDER BY CASE diagnosis.mode WHEN 'candidate_generation' THEN 0 ELSE 1 END
               LIMIT 1
             )) AS diagnosisItemId,
             bci.explanation
      FROM moves m
      JOIN analysis_runs ar ON ar.game_id = m.game_id AND ar.status = 'completed'
      JOIN move_assessments ma ON ma.run_id = ar.id AND ma.move_id = m.id
      LEFT JOIN training_items ti ON ti.source_move_id = m.id AND ti.mode = 'blunder_check'
      LEFT JOIN blunder_check_items bci ON bci.item_id = ti.id
      WHERE m.game_id = ? AND ma.meaningful = 1
        AND m.mover_color = (SELECT player_color FROM games WHERE id = ?)
        AND ar.completed_at = (SELECT MAX(completed_at) FROM analysis_runs WHERE game_id = ? AND status = 'completed')
      ORDER BY ma.comparison_loss DESC
    `).all(gameId, gameId, gameId) as Array<Record<string, unknown>>;
    const mistakes = mistakeRows.map((mistake) => {
      const diagnosisItemId = typeof mistake.diagnosisItemId === "string" ? mistake.diagnosisItemId : null;
      const concepts = diagnosisItemId ? database.connection.prepare(`
        SELECT c.id, c.family, c.label, tic.source
        FROM training_item_concepts tic JOIN concepts c ON c.id = tic.concept_id
        WHERE tic.item_id = ? AND tic.active = 1
        ORDER BY tic.is_primary DESC, c.family
      `).all(diagnosisItemId) : [];
      const betterCandidates = database.connection.prepare(`
        SELECT el.move_san AS moveSan, el.rank
        FROM position_analyses pa
        JOIN engine_lines el ON el.position_analysis_id = pa.id
        JOIN analysis_runs ar ON ar.id = pa.run_id
        WHERE pa.position_id = ? AND ar.status = 'completed'
          AND ar.completed_at = (SELECT MAX(completed_at) FROM analysis_runs WHERE game_id = ? AND status = 'completed')
          AND el.move_uci != '(none)' AND el.move_uci != ?
        ORDER BY el.rank LIMIT 3
      `).all(mistake.beforePositionId, gameId, mistake.playedMoveUci);
      return {
        ...mistake, concepts, betterCandidates,
        beforePositionId: undefined, playedMoveUci: undefined,
      };
    });
    const opening = openingGames.matchGame(gameId, profileId);
    return { game, opening, mistakes };
  });

  app.post("/api/v1/games/:gameId/opening/practice", async (request, reply) => {
    try {
      const { gameId } = request.params as { gameId: string };
      const profileId = activeProfileId(database.connection);
      if (!profileId) throw new Error("Game not found");
      const target = openingGames.practiceTarget(gameId, profileId);
      return openingReviews.startPosition(target.repertoireId, target.positionId, gameId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start opening practice" });
    }
  });

  app.get("/api/v1/dashboard", async () => v1Training.dashboard());

  app.get("/api/v1/profiles", async () => ({
    activeProfileId: activeProfileId(database.connection),
    profiles: database.connection.prepare(`
      SELECT id, display_name AS displayName FROM player_profiles ORDER BY created_at
    `).all(),
  }));

  app.post("/api/v1/profiles/:profileId/activate", async (request, reply) => {
    try {
      const { profileId } = request.params as { profileId: string };
      setActiveProfile(database.connection, profileId);
      return reply.code(204).send();
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "Player profile not found" });
    }
  });

  app.get("/api/v1/concepts", async () => ({ concepts: v1Training.concepts() }));

  app.patch("/api/v1/training/items/:itemId/classification", async (request, reply) => {
    try {
      const { itemId } = request.params as { itemId: string };
      const body = request.body as { conceptIds?: unknown };
      if (!Array.isArray(body?.conceptIds) || body.conceptIds.some((value) => typeof value !== "string")) {
        throw new Error("Choose one or more diagnoses");
      }
      return { concepts: v1Training.classify(itemId, body.conceptIds as string[]) };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid diagnosis" });
    }
  });

  app.post("/api/v1/training/session", async (request) => {
    const body = (request.body ?? {}) as { size?: unknown };
    return v1Training.createSession(typeof body.size === "number" ? body.size : 15);
  });

  app.get("/api/v1/training/session/active", async () => v1Training.activeSession());

  app.get("/api/v1/training/sessions/:sessionId", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      return v1Training.session(sessionId);
    } catch (error) {
      return reply.code(404).send({ error: error instanceof Error ? error.message : "Session not found" });
    }
  });

  app.post("/api/v1/games/:gameId/analyze", async (request, reply) => {
    const { gameId } = request.params as { gameId: string };
    const game = database.connection.prepare("SELECT id FROM games WHERE id = ?").get(gameId);
    if (!game) return reply.code(404).send({ error: "Game not found" });
    const queued = database.connection.prepare(`
      SELECT id FROM jobs WHERE kind = 'analyze_games' AND status IN ('queued', 'running')
        AND payload_json LIKE ? LIMIT 1
    `).get(`%${gameId}%`) as { id: string } | undefined;
    if (queued) return reply.code(202).send({ id: queued.id, status: "queued" });
    const jobId = id();
    database.connection.prepare(`
      INSERT INTO jobs(id, kind, status, progress_total, payload_json, created_at)
      VALUES (?, 'analyze_games', 'queued', 1, ?, ?)
    `).run(jobId, JSON.stringify({ gameIds: [gameId] }), now());
    return reply.code(202).send({ id: jobId, status: "queued" });
  });

  app.post("/api/v1/training/next", async (request) => {
    const body = (request.body ?? {}) as { pool?: unknown; itemId?: unknown };
    return training.next(typeof body.pool === "string" ? body.pool : "due", typeof body.itemId === "string" ? body.itemId : undefined);
  });

  app.post("/api/v1/training/what-changed/next", async (request) => {
    const body = (request.body ?? {}) as { pool?: unknown; itemId?: unknown };
    return training.nextWhatChanged(typeof body.pool === "string" ? body.pool : "due", typeof body.itemId === "string" ? body.itemId : undefined);
  });

  app.post("/api/v1/training/candidates/next", async (request) => {
    const body = (request.body ?? {}) as { pool?: unknown; itemId?: unknown };
    return candidateTraining.next(typeof body.pool === "string" ? body.pool : "due", typeof body.itemId === "string" ? body.itemId : undefined);
  });

  app.post("/api/v1/training/punish/next", async (request) => {
    const body = (request.body ?? {}) as { pool?: unknown; itemId?: unknown };
    return v1Training.nextPunish(typeof body.pool === "string" ? body.pool : "due", typeof body.itemId === "string" ? body.itemId : undefined);
  });

  app.post("/api/v1/training/quiet/next", async (request) => {
    const body = (request.body ?? {}) as { pool?: unknown; itemId?: unknown };
    return v1Training.nextQuiet(typeof body.pool === "string" ? body.pool : "due", typeof body.itemId === "string" ? body.itemId : undefined);
  });

  app.post("/api/v1/training/items/:itemId/start", async (request, reply) => {
    try {
      const { itemId } = request.params as { itemId: string };
      const body = (request.body ?? {}) as { sessionId?: unknown };
      return attempts.start(itemId, typeof body.sessionId === "string" ? body.sessionId : undefined);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start exercise" });
    }
  });

  app.post("/api/v1/training/attempts/:attemptId/answer", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = request.body as { category?: unknown; moveUci?: unknown };
      return training.answer(
        attemptId,
        requiredString(body?.category, "Category") as ResponseCategory,
        requiredString(body?.moveUci, "Move"),
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid answer" });
    }
  });

  app.post("/api/v1/training/attempts/:attemptId/reveal", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      return training.reveal(attemptId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Cannot reveal answer" });
    }
  });

  app.post("/api/v1/training/what-changed/attempts/:attemptId/answer", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = request.body as { category?: unknown; square?: unknown };
      return training.answerWhatChanged(
        attemptId,
        requiredString(body?.category, "Category") as WhatChangedCategory,
        typeof body?.square === "string" ? body.square : "",
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid answer" });
    }
  });

  app.post("/api/v1/training/what-changed/attempts/:attemptId/reveal", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      return training.revealWhatChanged(attemptId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Cannot reveal answer" });
    }
  });

  app.post("/api/v1/training/candidates/attempts/:attemptId/answer", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = request.body as { candidates?: unknown };
      if (!Array.isArray(body?.candidates)) throw new Error("Candidates are required");
      return await candidateTraining.answer(attemptId, body.candidates as CandidateSubmission[]);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid candidates" });
    }
  });

  app.post("/api/v1/training/candidates/attempts/:attemptId/reveal", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      return candidateTraining.reveal(attemptId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Cannot reveal candidates" });
    }
  });

  app.post("/api/v1/training/punish/attempts/:attemptId/answer", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = request.body as { moveUci?: unknown };
      return v1Training.answerPunish(attemptId, requiredString(body?.moveUci, "Move"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid punishment" });
    }
  });

  app.post("/api/v1/training/punish/attempts/:attemptId/reveal", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      return v1Training.revealPunish(attemptId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Cannot reveal punishment" });
    }
  });

  app.post("/api/v1/training/quiet/attempts/:attemptId/answer", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      const body = request.body as { square?: unknown; moveUci?: unknown };
      return v1Training.answerQuiet(
        attemptId,
        requiredString(body?.square, "Piece"),
        requiredString(body?.moveUci, "Move"),
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid quiet-position answer" });
    }
  });

  app.post("/api/v1/training/quiet/attempts/:attemptId/reveal", async (request, reply) => {
    try {
      const { attemptId } = request.params as { attemptId: string };
      return v1Training.revealQuiet(attemptId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Cannot reveal quiet-position answer" });
    }
  });

  if (fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: path.resolve(config.webDistDir) });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => {
    if (config.runWorker) await worker.close();
    else await analysis.close();
    await candidateTraining.close();
    await openingAnalysis.close();
    database.close();
  });
  return app;
}

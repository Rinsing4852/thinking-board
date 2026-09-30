import type { FastifyInstance } from "fastify";
import type { SqliteDatabase } from "../db/database.js";
import { ensureActiveProfile } from "../training/profile.js";
import type { OpeningReviewService } from "./opening-review-service.js";
import type { OpeningGameService } from "./opening-game-service.js";

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

/** Opening recall HTTP boundaries. Scheduling and graph logic stay in services. */
export function registerOpeningReviewRoutes(
  app: FastifyInstance,
  db: SqliteDatabase,
  openingReviews: OpeningReviewService,
  openingGames: OpeningGameService,
): void {
  app.get("/api/v1/openings/reviews/active", async () => openingReviews.active());

  app.get("/api/v1/openings/reviews/recommended", async () => {
    const profileId = ensureActiveProfile(db);
    openingGames.inbox(profileId);
    return openingReviews.recommendation();
  });

  app.post("/api/v1/openings/reviews/recommended/start", async (request, reply) => {
    try {
      const profileId = ensureActiveProfile(db);
      openingGames.inbox(profileId);
      return openingReviews.startRecommended();
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start recommended opening practice" });
    }
  });

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

  app.post("/api/v1/openings/repertoires/:repertoireId/reviews/tree/start", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      return openingReviews.startTree(repertoireId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not start repertoire run" });
    }
  });

  app.post("/api/v1/openings/repertoires/:repertoireId/lines/:lineId/reviews/start", async (request, reply) => {
    try {
      const { repertoireId, lineId } = request.params as { repertoireId: string; lineId: string };
      return openingReviews.startLine(repertoireId, lineId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not practise this opening line" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/move", { schema: { body: {
    type: "object", required: ["moveUci"], additionalProperties: false,
    properties: { moveUci: { type: "string", pattern: "^[a-h][1-8][a-h][1-8][qrbn]?$" },
      assisted: { type: "boolean" }, queueEntryId: { type: "string", minLength: 1, maxLength: 128 } },
  } } }, async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as { moveUci?: unknown; assisted?: unknown; queueEntryId?: string };
      if (body?.assisted !== undefined && typeof body.assisted !== "boolean") {
        throw new Error("Assisted must be true or false");
      }
      return openingReviews.answer(
        sessionId,
        requiredString(body?.moveUci, "Move"),
        body?.assisted === true,
        false,
        body.queueEntryId,
      );
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not check opening review" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/help", { schema: { body: {
    type: "object", required: ["kind", "queueEntryId"], additionalProperties: false,
    properties: { kind: { type: "string", enum: ["piece", "move"] },
      queueEntryId: { type: "string", minLength: 1, maxLength: 128 } },
  } } }, async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as { kind: "piece" | "move"; queueEntryId: string };
      return openingReviews.help(sessionId, body.kind, body.queueEntryId);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save practice help" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/mistakes", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const body = request.body as { moveUci?: unknown };
      return openingReviews.recordMistake(sessionId, requiredString(body?.moveUci, "Move"));
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not record opening mistake" });
    }
  });

  app.post("/api/v1/openings/reviews/:sessionId/continue", async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const focus = openingReviews.focus(sessionId);
      const body = (request.body ?? {}) as { queueEntryId?: unknown };
      const result = openingReviews.continue(sessionId, body.queueEntryId === undefined
        ? undefined : requiredString(body.queueEntryId, "Practice position"));
      if (result.kind === "complete" && focus) {
        openingGames.markGameReviewed(focus.profileId, focus.gameId, focus.repertoireId);
      }
      return result;
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
}

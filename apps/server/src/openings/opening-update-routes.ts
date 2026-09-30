import type { FastifyInstance } from "fastify";
import type { OpeningUpdateService } from "./opening-update-service.js";

export function registerOpeningUpdateRoutes(app: FastifyInstance, updates: OpeningUpdateService): void {
  app.post("/api/v1/openings/repertoires/:repertoireId/updates/preview", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (body.pgn && body.studyUrl) throw new Error("Choose a PGN or a Lichess Study link, not both");
      return await updates.preview(repertoireId, {
        ...(typeof body.pgn === "string" ? { pgn: body.pgn } : {}),
        ...(typeof body.studyUrl === "string" ? { studyUrl: body.studyUrl } : {}),
      });
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not preview source update" });
    }
  });
  app.post("/api/v1/openings/repertoires/:repertoireId/updates", async (request, reply) => {
    try {
      const { repertoireId } = request.params as { repertoireId: string };
      const body = (request.body ?? {}) as Record<string, unknown>;
      if (typeof body.previewId !== "string") throw new Error("Preview the update before applying it");
      return updates.apply(repertoireId, body.previewId, body.ownershipConfirmed === true);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not update repertoire" });
    }
  });
}

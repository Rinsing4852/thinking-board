import type { FastifyInstance } from "fastify";
import type { OpeningPracticeSelectionService } from "./opening-practice-selection-service.js";

export function registerOpeningPracticeSelectionRoutes(app: FastifyInstance, service: OpeningPracticeSelectionService): void {
  const path = "/api/v1/openings/repertoires/:repertoireId/practice-selection";
  app.get(path, async (request, reply) => {
    try { return service.get((request.params as { repertoireId: string }).repertoireId); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not load practice selection" }); }
  });
  app.patch(path, { preValidation: async (request, reply) => {
    // Fastify normally coerces "false" to false; preference writes require explicit JSON booleans.
    const body = request.body as { enabled?: unknown; lineIds?: unknown } | null;
    if (typeof body?.enabled !== "boolean" || !Array.isArray(body.lineIds)
      || body.lineIds.some(value => typeof value !== "string")) {
      return reply.code(400).send({ error: "Choose saved line IDs and an explicit true/false practice setting" });
    }
  }, schema: { body: { type: "object", required: ["lineIds", "enabled"], additionalProperties: false,
    properties: { lineIds: { type: "array", minItems: 1, maxItems: 1000, uniqueItems: true,
      items: { type: "string", minLength: 1, maxLength: 128 } }, enabled: { type: "boolean" } } } } }, async (request, reply) => {
    try {
      const body = request.body as { lineIds: string[]; enabled: boolean };
      return service.update((request.params as { repertoireId: string }).repertoireId, body.lineIds, body.enabled);
    } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save practice selection" }); }
  });
  app.post(`${path}/frequencies`, async (request, reply) => {
    try { return await service.loadFrequencies((request.params as { repertoireId: string }).repertoireId); }
    catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not load reply frequencies" }); }
  });
}

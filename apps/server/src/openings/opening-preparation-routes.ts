import type { FastifyInstance } from "fastify";
import type { SqliteDatabase } from "../db/database.js";
import type { GameOpeningInboxGroup, OpeningPreparationChoice } from "../../../../packages/contracts/src/api.js";
import { activeProfileId } from "../training/profile.js";
import type { OpeningGameService } from "./opening-game-service.js";
import type { OpeningPreparationService, PreparationTarget } from "./opening-preparation-service.js";

export function preparationTarget(group: GameOpeningInboxGroup): PreparationTarget {
  const departure = group.opening.departure;
  if (!departure || departure.moverColor === group.opening.repertoire.learnerColor) throw new Error("Choose an opponent reply to assess");
  return { fen: departure.fenBefore, opponentMoveUci: departure.moveUci,
    learnerColor: group.opening.repertoire.learnerColor, repertoireId: group.opening.repertoire.id };
}

export function registerOpeningPreparationRoutes(app: FastifyInstance, db: SqliteDatabase,
  games: OpeningGameService, preparation: OpeningPreparationService): void {
  const groupFor = (key: string): GameOpeningInboxGroup => {
    const profile = activeProfileId(db);
    const group = profile ? games.inbox(profile).groups.find(item => item.key === key) : null;
    if (!group) throw new Error("Opening inbox item is no longer available. Reload your games.");
    return group;
  };
  app.post("/api/v1/openings/preparation/assess", { schema: { body: {
    type: "object", additionalProperties: false, required: ["fen", "opponentMoveUci", "learnerColor"],
    properties: {
      fen: { type: "string", minLength: 1, maxLength: 200 },
      opponentMoveUci: { type: "string", pattern: "^[a-h][1-8][a-h][1-8][qrbn]?$" },
      learnerColor: { type: "string", enum: ["white", "black"] },
      repertoireId: { type: "string", minLength: 1, maxLength: 200 },
      groupKey: { type: "string", minLength: 1, maxLength: 128 },
      refresh: { type: "boolean" }, analyze: { type: "boolean" },
    },
  } } }, async (request, reply) => {
    try {
      const body = request.body as PreparationTarget & { groupKey?: string; refresh?: boolean; analyze?: boolean };
      const group = body.groupKey ? groupFor(body.groupKey) : undefined;
      return await preparation.assess(group ? preparationTarget(group) : body, body.refresh === true, body.analyze === true);
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not assess this reply" });
    }
  });
  app.patch("/api/v1/openings/game-inbox/:groupKey/preparation", { schema: { body: {
    type: "object", additionalProperties: false, required: ["choice", "note"],
    properties: { choice: { type: "string", enum: ["idea", "unprepared"] }, note: { type: "string", maxLength: 2000 } },
  } } }, async (request, reply) => {
    try {
      const { groupKey } = request.params as { groupKey: string };
      const group = groupFor(groupKey);
      const body = request.body as { choice: OpeningPreparationChoice; note: string };
      const target = preparationTarget(group);
      const profile = activeProfileId(db)!;
      db.transaction(() => {
        preparation.save(target, body.choice, body.note);
        games.markInboxGroupReviewed(profile, groupKey);
      })();
      return { assessment: preparation.cached(target), inbox: games.inbox(profile),
        message: body.choice === "idea" ? "Idea kept. No new line or memory reviews were added."
          : "Left unprepared. Existing occurrences are reviewed; you can reconsider if it appears again." };
    } catch (error) {
      return reply.code(400).send({ error: error instanceof Error ? error.message : "Could not save your preparation choice" });
    }
  });
}

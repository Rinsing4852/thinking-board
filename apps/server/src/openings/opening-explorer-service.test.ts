import path from "node:path";
import { Chess } from "chess.js";
import { describe, expect, it, vi } from "vitest";
import { Database } from "../db/database.js";
import { OpeningExplorerService } from "./opening-explorer-service.js";

describe("explorer population identity", () => {
  it("keeps blitz and rapid samples separate across fetches and cache reads", async () => {
    const database = new Database(":memory:", path.resolve("migrations"));
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(async input => {
        const rapid = new URL(String(input)).searchParams.get("speeds") === "rapid";
        return Response.json({ white: 1000, draws: 0, black: 0, moves: [
          { uci: "e2e4", san: "e4", white: rapid ? 200 : 800, draws: 0, black: 0 },
          { uci: "d2d4", san: "d4", white: rapid ? 800 : 200, draws: 0, black: 0 },
        ] });
      });
      const service = new OpeningExplorerService(database.connection, "test-token", fetcher);
      const fen = new Chess().fen();
      const blitz = await service.position(fen, 1600, false, "blitz");
      const rapid = await service.position(fen, 1600, false, "rapid");
      expect(blitz.replies.find(move => move.moveUci === "e2e4")?.frequencyPercent).toBe(80);
      expect(rapid.replies.find(move => move.moveUci === "e2e4")?.frequencyPercent).toBe(20);
      expect(service.cachedPosition(fen, 1600, "blitz")?.replies).toEqual(blitz.replies);
      expect(service.cachedPosition(fen, 1600, "rapid")?.replies).toEqual(rapid.replies);
      expect(service.cachedPosition(fen, 1800, "rapid")).toBeNull();
      expect(service.cachedPosition(fen, 1600)).toBeNull();
      await service.position(fen, 1600, false, "blitz");
      await service.position(fen, 1600, false, "rapid");
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally { database.close(); }
  });
});

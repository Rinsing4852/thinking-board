import { Chess } from "chess.js";

import type { OpeningPositionAnalysisResponse } from "../../../../packages/contracts/src/api.js";
import type { AppConfig } from "../config.js";
import { UciEngine } from "../analysis/uci-engine.js";

const CACHE_LIMIT = 128;

export class OpeningAnalysisService {
  private readonly engine: UciEngine;
  private readonly cache = new Map<string, OpeningPositionAnalysisResponse>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly config: AppConfig) {
    this.engine = new UciEngine(config.stockfishBinary, 1, Math.min(64, config.stockfishHashMb));
  }

  analyze(fen: string): Promise<OpeningPositionAnalysisResponse> {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      return Promise.reject(new Error("Position FEN is not valid"));
    }
    const canonicalFen = chess.fen();
    const cached = this.cache.get(canonicalFen);
    if (cached) return Promise.resolve(cached);
    const operation = this.queue.then(() => this.evaluate(chess));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async close(): Promise<void> {
    await this.queue;
    await this.engine.close();
  }

  private async evaluate(chess: Chess): Promise<OpeningPositionAnalysisResponse> {
    const fen = chess.fen();
    const cached = this.cache.get(fen);
    if (cached) return cached;
    const depth = Math.max(10, this.config.stockfishDepth - 2);
    const result = await this.engine.analyze(fen, depth, 3);
    const sideFactor = chess.turn() === "w" ? 1 : -1;
    const response: OpeningPositionAnalysisResponse = {
      fen,
      depth: result.depth,
      lines: result.lines.slice(0, 3).map((line) => ({
        rank: line.rank,
        moveUci: line.moveUci,
        moveSan: line.moveSan,
        pvSan: line.pvSan,
        score: line.mateInWhite !== null
          ? { kind: "mate", value: line.mateInWhite * sideFactor, perspective: "side_to_move" }
          : { kind: "centipawns", value: (line.centipawnsWhite ?? 0) * sideFactor, perspective: "side_to_move" },
      })),
    };
    this.cache.set(fen, response);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    return response;
  }
}

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

  analyze(fen: string, moveUcis: string[] = []): Promise<OpeningPositionAnalysisResponse> {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      return Promise.reject(new Error("Position FEN is not valid"));
    }
    const legal = new Set(chess.moves({ verbose: true }).map(move => `${move.from}${move.to}${move.promotion ?? ""}`));
    if (!Array.isArray(moveUcis) || moveUcis.length > 12 || moveUcis.some(move => !legal.has(move))) {
      return Promise.reject(new Error("Choose up to 12 legal moves to evaluate"));
    }
    const canonicalFen = chess.fen();
    const requested = [...new Set(moveUcis)].sort();
    const key = `${canonicalFen}|${requested.join(",")}`;
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const operation = this.queue.then(() => this.evaluate(chess, requested, key));
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  cached(fen: string): OpeningPositionAnalysisResponse | null {
    return this.cache.get(`${new Chess(fen).fen()}|`) ?? null;
  }

  async close(): Promise<void> {
    await this.queue;
    await this.engine.close();
  }

  private async evaluate(chess: Chess, requested: string[], key: string): Promise<OpeningPositionAnalysisResponse> {
    const fen = chess.fen();
    const cached = this.cache.get(key);
    if (cached) return cached;
    const depth = Math.max(10, this.config.stockfishDepth - 2);
    const baseKey = `${fen}|`;
    const base = this.cache.get(baseKey);
    const result = base ? null : await this.engine.analyze(fen, depth, 3);
    const sideFactor = chess.turn() === "w" ? 1 : -1;
    const response: OpeningPositionAnalysisResponse = {
      fen,
      depth: base?.depth ?? result!.depth,
      lines: base?.lines.slice(0, 3) ?? result!.lines.slice(0, 3).map((line) => ({
        rank: line.rank,
        moveUci: line.moveUci,
        moveSan: line.moveSan,
        pvSan: line.pvSan,
        score: line.mateInWhite !== null
          ? { kind: "mate", value: line.mateInWhite * sideFactor, perspective: "side_to_move" }
          : { kind: "centipawns", value: (line.centipawnsWhite ?? 0) * sideFactor, perspective: "side_to_move" },
      })),
    };
    this.cache.set(baseKey, { ...response, lines: [...response.lines] });
    // Keep the unrestricted leading move as the position score. A popular reply
    // can be weaker than all three engine candidates, so evaluate it explicitly.
    for (const move of requested) {
      if (response.lines.some(line => line.moveUci === move)) continue;
      const moveKey = `${fen}|move:${move}`;
      let evaluated = this.cache.get(moveKey);
      if (!evaluated) {
        const restricted = await this.engine.analyze(fen, depth, 1, [move]);
        const line = restricted.lines.find(line => line.moveUci === move);
        evaluated = { fen, depth: restricted.depth, lines: line ? [{ rank: 100,
          moveUci: line.moveUci, moveSan: line.moveSan, pvSan: line.pvSan,
          score: line.mateInWhite !== null
            ? { kind: "mate", value: line.mateInWhite * sideFactor, perspective: "side_to_move" }
            : { kind: "centipawns", value: (line.centipawnsWhite ?? 0) * sideFactor, perspective: "side_to_move" },
        }] : [] };
        this.cache.set(moveKey, evaluated);
      }
      response.lines.push(...evaluated.lines);
    }
    this.cache.set(key, response);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    return response;
  }
}

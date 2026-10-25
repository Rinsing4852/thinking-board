import type { SqliteDatabase } from "../db/database.js";
import { Chess } from "chess.js";

import type { OpeningPositionAnalysisResponse, OpeningMoveQuality } from "../../../../packages/contracts/src/api.js";
import type { AppConfig } from "../config.js";
import { UciEngine } from "../analysis/uci-engine.js";

const CACHE_LIMIT = 128;

export class OpeningAnalysisService {
  private readonly engine: UciEngine;
  private readonly cache = new Map<string, OpeningPositionAnalysisResponse>();
  private inFlight = new Map<string, { promise: Promise<OpeningPositionAnalysisResponse>; signals: Set<AbortSignal | undefined> }>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly config: AppConfig, private readonly db?: SqliteDatabase) {
    this.engine = new UciEngine(config.stockfishBinary, 1, Math.min(64, config.stockfishHashMb));
  }

  analyze(fen: string, moveUcis: string[] = [], signal?: AbortSignal): Promise<OpeningPositionAnalysisResponse> {
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
    const pending = this.inFlight.get(key);
    if (pending) { pending.signals.add(signal); return pending.promise; }
    const signals = new Set([signal]);
    const cancelled = () => [...signals].every(signal => signal?.aborted);
    const operation = this.queue.then(() => {
      if (cancelled()) throw new Error("Obsolete analysis request cancelled");
      return this.evaluate(chess, requested, key, cancelled);
    });
    this.inFlight.set(key, { promise: operation, signals });
    this.queue = operation.then(() => undefined, () => undefined);
    void operation.finally(() => this.inFlight.delete(key)).catch(() => undefined);
    return operation;
  }

  async assessMove(fen: string, moveUci: string): Promise<OpeningMoveQuality> {
    const uncertain: OpeningMoveQuality = {verdict:"uncertain", message:"Chess quality is unverified. The engine could not provide sufficiently reliable analysis. Your recall result is unchanged."};
    try {
      const board = new Chess(fen);
      board.move({from:moveUci.slice(0,2),to:moveUci.slice(2,4),...(moveUci.length===5?{promotion:moveUci.slice(4)}:{})});
      const result = await this.analyze(fen, [moveUci]);
      const best=result.lines[0], played=result.lines.find(line=>line.moveUci===moveUci);
      if (!best || !played || !Number.isFinite(best.score.value) || !Number.isFinite(played.score.value)) return uncertain;
      const depth=Math.min(best.depth??0,played.depth??0);
      if(depth<10) return uncertain;
      // Both scores are for the original mover, including restricted searches.
      if(best.score.kind==="mate" || played.score.kind==="mate") {
        const bestWin=best.score.kind==="mate"&&best.score.value>0;
        const playedWin=played.score.kind==="mate"&&played.score.value>0;
        if(bestWin&&playedWin) return {verdict:"playable",depth,message:"The engine finds a forced mate after your move. This still differs from the requested saved response."};
        if(bestWin&&!playedWin || played.score.kind==="mate"&&played.score.value<0&&!(best.score.kind==="mate"&&best.score.value<0))
          return {verdict:"weaker",depth,message:"The engine finds a worse mating outcome after this move. This assessment is separate from repertoire recall."};
        return uncertain;
      }
      const lossCp=Math.max(0,Math.round(best.score.value-played.score.value));
      const playable=lossCp<=this.config.acceptableToleranceCp;
      return {verdict:playable?"playable":"weaker",lossCp,depth,message:playable
        ? "The engine regards this as playable within the assessment tolerance. It is not the saved response requested here, so it does not earn repertoire recall credit."
        : `The engine estimates this move gives up ${(lossCp/100).toFixed(2)} pawns compared with its leading move. Chess quality and repertoire recall are assessed separately.`};
    } catch { return uncertain; }
  }

  cached(fen: string): OpeningPositionAnalysisResponse | null {
    return this.cache.get(`${new Chess(fen).fen()}|`) ?? null;
  }

  async close(): Promise<void> {
    await this.queue;
    await this.engine.close();
  }

  private async evaluate(chess: Chess, requested: string[], key: string, cancelled: () => boolean): Promise<OpeningPositionAnalysisResponse> {
    await this.engine.initialize();
    const nodes = this.config.openingAnalysisNodes ?? 200000;
    if (!Number.isSafeInteger(nodes) || nodes < 1000 || nodes > 5000000) throw new Error("Choose an opening analysis budget from 1,000 to 5,000,000 nodes");
    const prefix = `opening-v4|${this.engine.name}|${this.config.stockfishBinary}|${nodes}|1|${Math.min(64, this.config.stockfishHashMb)}|`;
    const read = (key: string): OpeningPositionAnalysisResponse | undefined => {
      const memory = this.cache.get(key); if (memory) return memory;
      const row = this.db?.prepare("SELECT response_json FROM opening_eval_cache WHERE cache_key = ?").get(prefix + key) as { response_json: string } | undefined;
      if (!row) return undefined;
      try { const value = JSON.parse(row.response_json) as OpeningPositionAnalysisResponse;
        if (value.fen !== chess.fen() || !Array.isArray(value.lines)) return undefined;
        this.cache.set(key,value); return value;
      } catch { return undefined; }
    };
    const write = (key: string, value: OpeningPositionAnalysisResponse) => {
      this.cache.set(key,value);
      this.db?.prepare(`INSERT INTO opening_eval_cache(cache_key,response_json,updated_at) VALUES(?,?,?)
        ON CONFLICT(cache_key) DO UPDATE SET response_json=excluded.response_json,updated_at=excluded.updated_at`)
        .run(prefix + key,JSON.stringify(value),new Date().toISOString());
    };
    const fen = chess.fen();
    const cached = read(key);
    if (cached) return cached;
    const depth = Math.max(10, this.config.stockfishDepth - 2);
    const baseKey = `${fen}|`;
    const base = read(baseKey);
    const result = base ? null : await this.engine.analyze(fen, depth, 3, [], nodes);
    const sideFactor = chess.turn() === "w" ? 1 : -1;
    const response: OpeningPositionAnalysisResponse = {
      fen, engineName: this.engine.name, nodes,
      depth: base?.depth ?? Math.min(...result!.lines.map(line => line.depth)),
      lines: base?.lines.slice(0, 3) ?? result!.lines.slice(0, 3).map((line) => ({
        rank: line.rank, depth: line.depth,
        moveUci: line.moveUci,
        moveSan: line.moveSan,
        pvSan: line.pvSan,
        score: line.mateInWhite !== null
          ? { kind: "mate", value: line.mateInWhite * sideFactor, perspective: "side_to_move" }
          : { kind: "centipawns", value: (line.centipawnsWhite ?? 0) * sideFactor, perspective: "side_to_move" },
      })),
    };
    write(baseKey, { ...response, lines: [...response.lines] });
    // Keep the unrestricted leading move as the position score. A popular reply
    // can be weaker than all three engine candidates, so evaluate it explicitly.
    for (const move of requested) {
      if (cancelled()) throw new Error("Obsolete analysis request cancelled");
      if (response.lines.some(line => line.moveUci === move)) continue;
      const moveKey = `${fen}|move:${move}`;
      let evaluated = read(moveKey);
      if (!evaluated) {
        const restricted = await this.engine.analyze(fen, depth, 1, [move], nodes);
        const line = restricted.lines.find(line => line.moveUci === move);
        evaluated = { fen, depth: restricted.depth, lines: line ? [{ rank: 100, depth: line.depth,
          moveUci: line.moveUci, moveSan: line.moveSan, pvSan: line.pvSan,
          score: line.mateInWhite !== null
            ? { kind: "mate", value: line.mateInWhite * sideFactor, perspective: "side_to_move" }
            : { kind: "centipawns", value: (line.centipawnsWhite ?? 0) * sideFactor, perspective: "side_to_move" },
        }] : [] };
        write(moveKey, evaluated);
      }
      response.lines.push(...evaluated.lines);
    }
    write(key, response);
    while (this.cache.size > CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    this.db?.prepare("DELETE FROM opening_eval_cache WHERE cache_key NOT IN (SELECT cache_key FROM opening_eval_cache ORDER BY updated_at DESC LIMIT 2048)").run();
    return response;
  }
}

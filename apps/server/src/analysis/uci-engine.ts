import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import { Chess } from "chess.js";

export interface EngineScore {
  centipawnsWhite: number | null;
  mateInWhite: number | null;
}

export interface EngineLine extends EngineScore {
  rank: number;
  depth: number;
  moveUci: string;
  moveSan: string;
  pvUci: string[];
  pvSan: string[];
}

export interface EngineAnalysis {
  depth: number;
  lines: EngineLine[];
}

interface ParsedInfo {
  depth: number;
  rank: number;
  centipawns: number | null;
  mateIn: number | null;
  pv: string[];
}

function token(parts: string[], key: string): string | undefined {
  const index = parts.indexOf(key);
  return index >= 0 ? parts[index + 1] : undefined;
}

export function parseInfoLine(line: string): ParsedInfo | null {
  if (!line.startsWith("info ") || !line.includes(" pv ")) return null;
  const parts = line.trim().split(/\s+/);
  const depth = Number(token(parts, "depth"));
  const rank = Number(token(parts, "multipv") ?? "1");
  const scoreIndex = parts.indexOf("score");
  const pvIndex = parts.indexOf("pv");
  if (!Number.isFinite(depth) || !Number.isFinite(rank) || scoreIndex < 0 || pvIndex < 0) return null;
  const kind = parts[scoreIndex + 1];
  const value = Number(parts[scoreIndex + 2]);
  if (!Number.isFinite(value)) return null;
  const pv = parts.slice(pvIndex + 1);
  if (pv.length === 0) return null;
  return {
    depth,
    rank,
    centipawns: kind === "cp" ? value : null,
    mateIn: kind === "mate" ? value : null,
    pv,
  };
}

function parseUciMove(value: string): { from: string; to: string; promotion?: string } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)) throw new Error(`Invalid UCI move: ${value}`);
  return {
    from: value.slice(0, 2),
    to: value.slice(2, 4),
    ...(value.length === 5 ? { promotion: value.slice(4, 5) } : {}),
  };
}

function pvToSan(fen: string, pv: string[]): string[] {
  const board = new Chess(fen);
  const san: string[] = [];
  for (const uci of pv) {
    try {
      const move = board.move(parseUciMove(uci));
      if (!move) break;
      san.push(move.san);
    } catch {
      break;
    }
  }
  return san;
}

export class UciEngine {
  private process: ChildProcessWithoutNullStreams | null = null;
  private listeners = new Set<(line: string) => void>();
  private failureListeners = new Set<(error: Error) => void>();
  private initialization: Promise<void> | null = null;
  private analyzing = false;
  private engineName = "Stockfish";
  private lastFailure: Error | null = null;

  constructor(
    private readonly binary: string,
    private readonly threads: number,
    private readonly hashMb: number,
  ) {}

  get name(): string {
    return this.engineName;
  }

  async initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    this.initialization = this.start();
    try {
      await this.initialization;
    } catch (error) {
      this.initialization = null;
      throw error;
    }
  }

  async analyze(
    fen: string,
    depth: number,
    multiPv: number,
    searchMoves: string[] = [],
  ): Promise<EngineAnalysis> {
    await this.initialize();
    if (this.analyzing) throw new Error("Stockfish analysis is already running");
    const board = new Chess(fen);
    if (board.isGameOver()) return this.terminalAnalysis(board, depth);

    this.analyzing = true;
    const infos = new Map<number, ParsedInfo>();
    try {
      const requestedMultiPv = searchMoves.length > 0 ? 1 : multiPv;
      this.send(`setoption name MultiPV value ${requestedMultiPv}`);
      this.send("isready");
      await this.waitFor((line) => line === "readyok", 10_000);

      const completion = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.listeners.delete(listener);
          this.failureListeners.delete(onFailure);
          reject(new Error(`Stockfish timed out at depth ${depth}`));
        }, 120_000);
        const onFailure = (error: Error): void => {
          clearTimeout(timer);
          this.listeners.delete(listener);
          this.failureListeners.delete(onFailure);
          reject(error);
        };
        const listener = (line: string): void => {
          const info = parseInfoLine(line);
          if (info) {
            const existing = infos.get(info.rank);
            if (!existing || info.depth >= existing.depth) infos.set(info.rank, info);
          }
          if (line.startsWith("bestmove ")) {
            clearTimeout(timer);
            this.listeners.delete(listener);
            this.failureListeners.delete(onFailure);
            resolve();
          }
        };
        this.listeners.add(listener);
        this.failureListeners.add(onFailure);
      });
      this.send(`position fen ${fen}`);
      const restrictedMoves = searchMoves.map((move) => {
        parseUciMove(move);
        return move;
      });
      this.send(`go depth ${depth}${restrictedMoves.length ? ` searchmoves ${restrictedMoves.join(" ")}` : ""}`);
      await completion;

      const whiteToMove = board.turn() === "w";
      const lines = [...infos.values()]
        .sort((left, right) => left.rank - right.rank)
        .map((info): EngineLine => {
          const pvSan = pvToSan(fen, info.pv);
          return {
            rank: info.rank,
            depth: info.depth,
            moveUci: info.pv[0] ?? "",
            moveSan: pvSan[0] ?? info.pv[0] ?? "",
            centipawnsWhite: info.centipawns === null
              ? null
              : whiteToMove ? info.centipawns : -info.centipawns,
            mateInWhite: info.mateIn === null
              ? null
              : whiteToMove ? info.mateIn : -info.mateIn,
            pvUci: info.pv,
            pvSan,
          };
        })
        .filter((line) => line.moveUci);
      if (lines.length === 0) throw new Error("Stockfish returned no principal variation");
      return { depth: Math.max(...lines.map((line) => line.depth)), lines };
    } finally {
      this.analyzing = false;
    }
  }

  async close(): Promise<void> {
    const child = this.process;
    if (!child) return;
    this.process = null;
    try {
      if (child.stdin.writable) child.stdin.write("quit\n");
    } finally {
      child.kill();
      this.initialization = null;
      this.lastFailure = null;
    }
  }

  private terminalAnalysis(board: Chess, depth: number): EngineAnalysis {
    if (board.isCheckmate()) {
      const mateInWhite = board.turn() === "w" ? -1 : 1;
      return {
        depth,
        lines: [{
          rank: 1,
          depth,
          moveUci: "(none)",
          moveSan: "#",
          centipawnsWhite: null,
          mateInWhite,
          pvUci: [],
          pvSan: [],
        }],
      };
    }
    return {
      depth,
      lines: [{
        rank: 1,
        depth,
        moveUci: "(none)",
        moveSan: "½–½",
        centipawnsWhite: 0,
        mateInWhite: null,
        pvUci: [],
        pvSan: [],
      }],
    };
  }

  private async start(): Promise<void> {
    const child = spawn(this.binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.process = child;
    this.lastFailure = null;
    child.on("error", (error) => this.fail(new Error(`Could not start Stockfish: ${error.message}`)));
    child.on("exit", (code, signal) => {
      if (this.process !== child) return;
      this.process = null;
      if (code !== 0) this.fail(new Error(`Stockfish exited unexpectedly (${code ?? signal ?? "unknown"})`));
    });
    child.stdin.on("error", (error) => this.fail(new Error(`Stockfish input failed: ${error.message}`)));
    const reader = readline.createInterface({ input: child.stdout });
    reader.on("line", (line) => {
      if (line.startsWith("id name ")) this.engineName = line.slice("id name ".length).trim();
      for (const listener of [...this.listeners]) listener(line.trim());
    });
    child.stderr.on("data", (chunk) => {
      const message = String(chunk).trim();
      if (message) console.error(`[stockfish] ${message}`);
    });
    const uciReady = this.waitFor((line) => line === "uciok", 10_000);
    this.send("uci");
    await uciReady;
    this.send(`setoption name Threads value ${this.threads}`);
    this.send(`setoption name Hash value ${this.hashMb}`);
    const ready = this.waitFor((line) => line === "readyok", 10_000);
    this.send("isready");
    await ready;
  }

  private send(command: string): void {
    if (this.lastFailure) throw this.lastFailure;
    if (!this.process?.stdin.writable) throw new Error("Stockfish is not running");
    this.process.stdin.write(`${command}\n`);
  }

  private waitFor(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    if (this.lastFailure) return Promise.reject(this.lastFailure);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners.delete(listener);
        this.failureListeners.delete(onFailure);
        reject(new Error("Timed out waiting for Stockfish response"));
      }, timeoutMs);
      const onFailure = (error: Error): void => {
        clearTimeout(timer);
        this.listeners.delete(listener);
        this.failureListeners.delete(onFailure);
        reject(error);
      };
      const listener = (line: string): void => {
        if (!predicate(line)) return;
        clearTimeout(timer);
        this.listeners.delete(listener);
        this.failureListeners.delete(onFailure);
        resolve(line);
      };
      this.listeners.add(listener);
      this.failureListeners.add(onFailure);
    });
  }

  private fail(error: Error): void {
    if (this.lastFailure) return;
    this.lastFailure = error;
    for (const listener of [...this.failureListeners]) listener(error);
  }
}

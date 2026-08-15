import path from "node:path";

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}
export interface AppConfig {
  host: string;
  port: number;
  dataDir: string;
  databasePath: string;
  migrationsDir: string;
  webDistDir: string;
  stockfishBinary: string;
  stockfishDepth: number;
  stockfishMultiPv: number;
  stockfishThreads: number;
  stockfishHashMb: number;
  acceptableToleranceCp: number;
  meaningfulLossCp: number;
  runWorker: boolean;
}

export function loadConfig(): AppConfig {
  const root = process.cwd();
  const dataDir = process.env.DATA_DIR ?? path.join(root, "data");
  return {
    host: process.env.HOST ?? "0.0.0.0",
    port: integer("PORT", 8000),
    dataDir,
    databasePath: process.env.DB_PATH ?? path.join(dataDir, "trainer.sqlite3"),
    migrationsDir: process.env.MIGRATIONS_DIR ?? path.join(root, "migrations"),
    webDistDir: process.env.WEB_DIST_DIR ?? path.join(root, "apps", "web", "dist"),
    stockfishBinary: process.env.STOCKFISH_BINARY ?? "stockfish",
    stockfishDepth: integer("STOCKFISH_DEPTH", 14),
    stockfishMultiPv: integer("STOCKFISH_MULTIPV", 3),
    stockfishThreads: integer("STOCKFISH_THREADS", 1),
    stockfishHashMb: integer("STOCKFISH_HASH_MB", 128),
    acceptableToleranceCp: integer("ACCEPTABLE_TOLERANCE_CP", 40),
    meaningfulLossCp: integer("MEANINGFUL_LOSS_CP", 150),
    runWorker: process.env.RUN_ANALYSIS_WORKER !== "false",
  };
}

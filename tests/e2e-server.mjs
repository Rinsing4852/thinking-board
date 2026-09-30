import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const port = process.env.E2E_PORT ?? "8191";
if (!/^819[12]$/.test(port)) throw new Error("Use a reserved e2e test port");
const dataDir = path.join(os.tmpdir(), `thinking-board-e2e-${port}`);
fs.rmSync(dataDir, { recursive: true, force: true });
fs.mkdirSync(dataDir, { recursive: true });

process.env.NODE_ENV = "test";
process.env.HOST = "127.0.0.1";
process.env.PORT = port;
process.env.DATA_DIR = dataDir;
process.env.DB_PATH = path.join(dataDir, "trainer.sqlite3");
process.env.RUN_ANALYSIS_WORKER = "true";
process.env.STOCKFISH_BINARY = path.resolve("tests/fake-stockfish.mjs");

await import("../dist/apps/server/src/index.js");

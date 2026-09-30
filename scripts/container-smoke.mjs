// Run against a disposable container. Never use this on your live installation.
import assert from "node:assert/strict";
const base = process.argv[2];
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Pass a loopback URL for a disposable smoke-test server");
const existing = process.argv.includes("--existing");
async function request(path, body) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10_000),
  });
  assert(response.ok, `${path}: HTTP ${response.status}`);
  return response.json();
}
async function waitFor(action, ready) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const result = await action();
      if (ready(result)) return result;
    } catch { /* Startup/restart can briefly refuse connections. */ }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Smoke-test condition timed out");
}
await waitFor(() => request("/api/v1/health"), (result) => result.status === "ok");
const pgn = `[Event "Container smoke"]
[White "Container Learner"]
[Black "Container Opponent"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;
if (existing) {
  const games = await request("/api/v1/games");
  assert(games.games.some((game) => game.white === "Container Learner"), "Imported game must survive restart");
} else {
  const imported = await request("/api/v1/imports/pgn", { pgn, playerName: "Container Learner" });
  assert(imported.jobId, "Import must queue local analysis");
  const job = await waitFor(() => request(`/api/v1/jobs/${imported.jobId}`),
    (result) => result.status === "completed" || result.status === "failed");
  assert.equal(job.status, "completed", job.error ?? "Local game analysis must complete");
}
const analysis = await request("/api/v1/openings/analysis", { fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" });
assert(analysis.lines.length > 0, "Real local Stockfish must supply candidates");
const catalog = await request("/api/v1/openings/catalog");
assert(catalog.repertoires.length >= 2, "Opening curriculum must load");
console.log(`Container smoke passed (${existing ? "persistent restart" : "fresh installation"}, local Stockfish).`);

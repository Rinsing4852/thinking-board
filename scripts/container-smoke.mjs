// Run against a disposable container. Never use this on your live installation.
import assert from "node:assert/strict";
const base = process.argv[2];
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Pass a loopback URL for a disposable smoke-test server");
const existing = process.argv.includes("--existing");
const cleared = process.argv.includes("--cleared");
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
if (cleared) {
  assert.equal((await request("/api/v1/openings/catalog")).repertoires.length, 0,
    "Deleted opening material must not return after restart");
  assert((await request("/api/v1/games")).games.some(game => game.white === "Container Learner"),
    "Deleting opening material must not remove imported games");
  console.log("Container smoke passed (cleared library survives restart, games retained).");
  process.exit(0);
}
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
if (!existing) assert.equal(catalog.repertoires.length, 0, "Fresh installations must not add unwanted starter repertoires");
const openingPgn = '[Event "Container source update"]\n[Result "*"]\n\n1. e4 {Control the centre.} e5 2. Nf3 Nc6 3. Bc4 *';
let repertoireId;
if (existing) {
  const repertoire = catalog.repertoires.find(item => item.name === "Container source update");
  assert(repertoire?.sourceUpdatedAt, "Source update metadata must survive restart");
  repertoireId = repertoire.id;
} else {
  const imported = await request("/api/v1/openings/imports/pgn", {
    pgn: openingPgn, learnerColor: "white", ownershipConfirmed: true,
  });
  repertoireId = imported.repertoireIds[0];
  const preview = await request(`/api/v1/openings/repertoires/${repertoireId}/updates/preview`, {
    pgn: openingPgn.replace("Control the centre.", "Open the bishop and control the centre.")
      .replace("3. Bc4 *", "3. Bc4 Bc5 (3... Nf6 4. Ng5) 4. c3 *"),
  });
  assert.equal(preview.addedLines, 1);
  assert.equal(preview.extendedLines, 1);
  await request(`/api/v1/openings/repertoires/${repertoireId}/updates`, {
    previewId: preview.previewId, ownershipConfirmed: true,
  });
}
const repertoire = await request(`/api/v1/openings/repertoires/${repertoireId}`);
assert.equal(repertoire.chapters[0].lines.length, 2, "Updated opening branches must be persisted");
assert.equal(repertoire.chapters[0].lines[0].moves[0].explanation.summary,
  "Open the bishop and control the centre.", "Refreshed source notes must be persisted");
if (process.argv.includes("--clear-library")) {
  const before = (await request("/api/v1/games")).games.map(game => game.id).sort();
  await request("/api/v1/openings/library/delete", { confirmed: true, repertoireIds: catalog.repertoires.map(item => item.id) });
  assert.equal((await request("/api/v1/openings/catalog")).repertoires.length, 0);
  assert.deepEqual((await request("/api/v1/games")).games.map(game => game.id).sort(), before);
}
console.log(`Container smoke passed (${existing ? "persistent restart" : "fresh installation"}, local Stockfish).`);

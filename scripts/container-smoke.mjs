// Run against a disposable container. Never use this on your live installation.
import assert from "node:assert/strict";
const base = process.argv[2];
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw new Error("Pass a loopback URL for a disposable smoke-test server");
const existing = process.argv.includes("--existing");
const cleared = process.argv.includes("--cleared");
async function request(path, body, method = body === undefined ? "GET" : "POST") {
  const response = await fetch(`${base}${path}`, {
    method,
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
const openingPgn = '[Event "Container source update"]\n[Result "*"]\n\n1. e4 {Control the centre. [%csl Ge4] [%cal Bf1c4]} e5 2. Nf3 Nc6 3. Bc4 *';
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
const sourceMarks = [{ color: "green", from: "e4", to: "e4" }, { color: "blue", from: "f1", to: "c4" }];
assert.deepEqual(repertoire.chapters[0].lines[0].moves[0].explanation.boardAnnotations, sourceMarks,
  "Imported visual explanations must survive source updates and restart");
const idea = "Develop and take the centre before memorising a deep line.";
if (!existing) {
  const imported = await request("/api/v1/imports/pgn", {
    pgn: '[Event "Container preparation"]\n[White "Container Learner"]\n[Black "Preparation opponent"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 d6 3. d4 *',
    playerName: "Container Learner",
  });
  const job = await waitFor(() => request(`/api/v1/jobs/${imported.jobId}`),
    result => result.status === "completed" || result.status === "failed");
  assert.equal(job.status, "completed", job.error ?? "Preparation game analysis must complete");
}
const group = (await request("/api/v1/openings/game-inbox")).groups
  .find(item => item.opening.repertoire.id === repertoireId && item.opening.departure?.moveUci === "d7d6");
assert(group, "Pasted games must produce an opponent-reply preparation assessment");
if (existing) {
  assert.equal(group.preparation.decision.note, idea, "Preparation notes must survive restart");
  assert.equal(group.unreviewedCount, 0, "Reviewed preparation encounters must survive restart");
} else {
  const assessment = await request("/api/v1/openings/preparation/assess", {
    groupKey: group.key, fen: group.opening.departure.fenBefore, opponentMoveUci: "d7d6",
    learnerColor: "white", analyze: true,
  });
  assert.equal(assessment.frequency.status, "off", "Practical frequencies must remain opt-in");
  assert.equal(assessment.personal.responsesAnalyzed, 1, "Real game analysis must inform preparation");
  const saved = await request(`/api/v1/openings/game-inbox/${group.key}/preparation`, { choice: "idea", note: idea }, "PATCH");
  assert.equal(saved.assessment.decision.note, idea);
  assert.equal((await request(`/api/v1/openings/repertoires/${repertoireId}`)).chapters[0].lines.length, 2,
    "Keeping an idea must not add a line");
}
const selectionPath = `/api/v1/openings/repertoires/${repertoireId}/practice-selection`;
const mainLine = repertoire.chapters[0].lines[0];
const pausedLine = repertoire.chapters[0].lines[1];
if (existing) {
  const selection = await request(selectionPath);
  assert.equal(selection.lines.find(line => line.lineId === pausedLine.id).enabled, false,
    "Practice choices must survive restart separately from archives");
} else {
  const paused = await request(selectionPath, { lineIds: [pausedLine.id], enabled: false }, "PATCH");
  assert.equal(paused.enabledCount, 1, "A paused variation must not disable shared moves in another line");
  assert.equal(paused.lines.find(line => line.lineId === pausedLine.id).frequency.band, "unknown",
    "Missing samples must never classify a line as rare");
}
const pausedDetail = await request(`/api/v1/openings/repertoires/${repertoireId}`);
assert.equal(pausedDetail.chapters[0].lines[1].archived, false, "Practice pauses must not hide repertoire lines");
const varied = await request(`/api/v1/openings/repertoires/${repertoireId}/reviews/tree/start`, {});
assert.equal(varied.lineRun.lineId, mainLine.id, "Automatic varied practice must skip disabled variations");
const oneOff = await request(`/api/v1/openings/repertoires/${repertoireId}/lines/${pausedLine.id}/reviews/start`, {});
assert.equal(oneOff.lineRun.lineId, pausedLine.id, "Deliberate one-off practice must remain available");
assert.equal(oneOff.lineRun.chapterTitle, repertoire.chapters[0].title, "Line recall must identify the source chapter");
const recall = await request(`/api/v1/openings/reviews/${oneOff.sessionId}/move`, {
  moveUci: oneOff.introduction.repertoireMove.moveUci, queueEntryId: oneOff.queueEntryId, activeResponseMs: 2300,
});
assert.deepEqual(recall.explanation.boardAnnotations, sourceMarks, "Recall explanations must retain source marks");
assert.equal(recall.recallSpeed, "normal", "Active recall time must be accepted by the production server");
if (process.argv.includes("--clear-library")) {
  const before = (await request("/api/v1/games")).games.map(game => game.id).sort();
  await request("/api/v1/openings/library/delete", { confirmed: true, repertoireIds: catalog.repertoires.map(item => item.id) });
  assert.equal((await request("/api/v1/openings/catalog")).repertoires.length, 0);
  assert.deepEqual((await request("/api/v1/games")).games.map(game => game.id).sort(), before);
}
console.log(`Container smoke passed (${existing ? "persistent restart" : "fresh installation"}, local Stockfish).`);

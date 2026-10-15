import { expect, test } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:8192" });

async function startPractice(page: import("@playwright/test").Page,
  pgn = '[Event "Quality practice"]\n[Result "*"]\n\n1. e4 {Claim central space and free the bishop. [%csl Ge4] [%cal Bf1c4]} e5 2. Nf3 {Develop the knight and attack the central pawn.} Nc6 3. Bc4 *') {
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn,
    learnerColor: "white", name: "Quality practice", sourceType: "self_authored", sourceTitle: "My notes", ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const repertoireId = (await imported.json()).repertoireIds[0];
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  const started = await page.request.post(`/api/v1/openings/repertoires/${repertoireId}/lines/${detail.chapters[0].lines[0].id}/reviews/start`);
  expect(started.ok()).toBeTruthy();
  await page.goto("/#openings");
  const resume = page.getByRole("button", { name: "Resume opening practice" });
  if (await resume.isVisible()) await resume.click();
  await expect(page.getByText(/Step 1 of \d+/)).toBeVisible();
  return page.getByRole("grid", { name: "Chess position" });
}

test("restores a captured piece when a rejected capture returns", async ({ page }) => {
  const board = await startPractice(page, '[Event "Capture reset"]\n[Result "*"]\n\n1. e4 d5 2. Nc3 *');
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(board).toHaveClass(/interactive/);
  await expect(board.getByRole("gridcell", { name: "d5 black pawn" })).toBeVisible();
  await board.getByRole("gridcell", { name: "e4 white pawn" }).click();
  await board.getByRole("gridcell", { name: "d5 black pawn" }).click();
  await expect(board.getByRole("gridcell", { name: "d5 white pawn" })).toBeVisible();
  await expect(board).not.toHaveClass(/interactive/);
  await expect(board).toHaveClass(/interactive/);
  await expect(board.getByRole("gridcell", { name: "d5 black pawn" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
  await expect(board.locator("cg-board piece.white.pawn:not(.fading)")).toHaveCount(8);
  await expect(board.locator("cg-board piece.black.pawn:not(.fading)")).toHaveCount(8);
  await board.getByRole("gridcell", { name: "b1 white knight" }).click();
  await board.getByRole("gridcell", { name: "c3 empty" }).click();
  // A two-position line cannot interleave an assisted retry with two other
  // positions, so it finishes and leaves the missed move for scheduled review.
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
});

test("cancels a pending incorrect-move return when leaving practice", async ({ page }) => {
  await page.clock.install();
  const board = await startPractice(page);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
  await page.clock.runFor(20);
  const saved = page.waitForResponse(response => /\/mistakes$/.test(response.url()));
  await board.getByRole("gridcell", { name: "d4 empty" }).click();
  await page.clock.runFor(20);
  await saved;
  await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toBeVisible();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume opening practice" })).toBeVisible();
  await page.clock.runFor(1500);
  await page.getByRole("button", { name: "Resume opening practice" }).click();
  await expect(board.getByRole("gridcell", { name: "d2 white pawn" })).toBeVisible();
  await expect(board).toHaveClass(/interactive/);
  await page.clock.runFor(1500);
  await expect(board.getByRole("gridcell", { name: "d2 white pawn" })).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
});

test("keeps manual pauses independent and resumes automatically", async ({ page }) => {
  await page.clock.install();
  const board = await startPractice(page);
  // Hold timers while choosing the manual pause; do not race the 650ms feedback
  // window on a slow runner. Other journeys still exercise real-time advancement.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await page.clock.runFor(20);
  const saved = page.waitForResponse(response => /\/reviews\/[^/]+\/move$/.test(response.url()) && response.request().method() === "POST");
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await page.clock.runFor(20); // Flush Chessground's callback/render, not the feedback window.
  await saved;
  await page.getByRole("button", { name: "Keep this open" }).click();
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  await page.getByRole("button", { name: "Close explanation and resume", exact: true }).click();
  await page.clock.runFor(1000); // Deliberately exceed the auto-advance delay.
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByText("Auto-advance paused")).toBeVisible();
  await page.getByRole("button", { name: "Resume automatic practice" }).click();
  await page.clock.runFor(1000);
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
});

test("plays a complete line without automatic explanations or Continue buttons", async ({ page }, testInfo) => {
  const continuations: string[] = [];
  page.on("request", request => { if (/\/reviews\/[^/]+\/continue$/.test(request.url())) continuations.push(request.url()); });
  const board = await startPractice(page);
  await expect(page.getByText("Why this move belongs", { exact: true })).toBeHidden();
  await expect(page.getByText("Claim central space and free the bishop.", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Explain last move", exact: true })).toBeDisabled();
  for (const [step, from, to] of [[1, "e2 white pawn", "e4 empty"], [2, "g1 white knight", "f3 empty"], [3, "f1 white bishop", "c4 empty"]] as const) {
    await expect(page.getByText(`Step ${step} of 3`)).toBeVisible();
    await expect(board).toHaveClass(/interactive/);
    await board.getByRole("gridcell", { name: from }).click();
    await board.getByRole("gridcell", { name: to }).click();
    await expect(page.getByRole("region", { name: "Requested move explanation" })).toBeHidden();
    await expect(page.getByText("See the full explanation", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeHidden();
    await expect(page.getByText("Claim central space and free the bishop.", { exact: true })).toBeHidden();
    await expect(page.getByText("Develop the knight and attack the central pawn.", { exact: true })).toBeHidden();
  }
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  expect(continuations).toHaveLength(3);
  await page.waitForTimeout(1700);
  expect(continuations).toHaveLength(3);
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Why 3. Bc4?", exact: true })).toBeVisible();
  const explanation = page.getByRole("region", { name: "Requested move explanation" });
  await explanation.getByRole("button", { name: /Add comment|Edit comment/ }).click();
  await expect(page.getByRole("button", { name: "Back to this repertoire", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Close explanation", exact: true })).toBeDisabled();
  await explanation.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close explanation", exact: true }).click();
  await page.waitForTimeout(1700);
  expect(continuations).toHaveLength(3);
  await page.screenshot({ path: testInfo.outputPath("continuous-line-complete.png"), fullPage: true });
});

test("explains the previous move on request after advancing, and saves its comment without spoiling the next move", async ({ page }, testInfo) => {
  const board = await startPractice(page);
  const answered = page.waitForResponse(response => /\/reviews\/[^/]+\/move$/.test(response.url()) && response.request().method() === "POST");
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  const first = await (await answered).json();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(board).toHaveClass(/interactive/);
  await expect(page.locator(".cg-shapes > g > g")).toHaveCount(0);
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  const explanation = page.getByRole("region", { name: "Requested move explanation" });
  await expect(explanation.getByRole("heading", { name: "Why 1. e4?", exact: true })).toBeVisible();
  await expect(explanation.getByText("Claim central space and free the bishop.", { exact: true })).toBeVisible();
  await expect(page.getByText("Develop the knight and attack the central pawn.", { exact: true })).toBeHidden();
  await expect(board).not.toHaveClass(/interactive/);
  await expect(page.locator(".cg-shapes circle[stroke=\'#15781B\']")).toHaveCount(1);
  await expect(page.locator(".cg-shapes line[stroke=\'#003088\']")).toHaveCount(1);
  // The requested explanation brings back e4's board, not the next question's board.
  await expect(board.getByRole("gridcell", { name: "e7 black pawn" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await explanation.getByRole("button", { name: /Add comment|Edit comment/ }).click();
  const note = `Keep the centre in mind — ${testInfo.project.name}.`;
  await explanation.getByLabel("Your learning comment", { exact: true }).fill(note);
  await explanation.getByLabel("Optional idea hint", { exact: true }).fill("Take central space and free a piece.");
  const close = page.getByRole("button", { name: "Close explanation and resume", exact: true });
  await expect(close).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
  const saved = page.waitForResponse(response => response.url().endsWith(`/moves/${first.repertoireMove.moveId}/comment`) && response.request().method() === "PATCH");
  await explanation.getByRole("button", { name: "Save comment", exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(explanation.getByText(note, { exact: true })).toBeVisible();
  await expect(explanation.getByText("Idea hint: Take central space and free a piece.", { exact: true })).toBeVisible();
  await expect(close).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("requested-line-explanation.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await close.click();
  await expect(board).toHaveClass(/interactive/);
  await expect(page.locator(".cg-shapes > g > g")).toHaveCount(0);
  await expect(board.getByRole("gridcell", { name: "e5 black pawn" })).toBeVisible();
  const nextAnswer = page.waitForResponse(response => /\/reviews\/[^/]+\/move$/.test(response.url()) && response.request().method() === "POST");
  await board.getByRole("gridcell", { name: "g1 white knight" }).click();
  await board.getByRole("gridcell", { name: "f3 empty" }).click();
  const second = await (await nextAnswer).json();
  expect(second.explanation.personalComment).not.toBe(note);
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  await expect(explanation.getByRole("heading", { name: "Why 2. Nf3?", exact: true })).toBeVisible();
  await expect(explanation.getByText("Develop the knight and attack the central pawn.", { exact: true })).toBeVisible();
  await explanation.getByRole("button", { name: /Add comment|Edit comment/ }).click();
  await expect(close).toBeDisabled();
  await explanation.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(close).toBeEnabled();
  await close.click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
});

test("builds with automatic saves, retry safety and one board with an optional unsaved exploration mode", async ({ page }, testInfo) => {
  await startPractice(page, `[Event "Paused builder ${testInfo.project.name}"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *`);
  const paused = await (await page.request.get("/api/v1/openings/reviews/active")).json();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  const name = `Automatic build ${testInfo.project.name}`;
  await page.getByLabel("Repertoire name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Start building", exact: true }).click();
  const initialBoard = page.getByRole("grid", { name: "Repertoire board" });
  await initialBoard.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await initialBoard.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeVisible();
  await expect(page.getByLabel("Save each move automatically")).toBeChecked();
  const id = (await (await page.request.get("/api/v1/openings/catalog")).json()).repertoires
    .find((item: { name: string }) => item.name === name).id;
  const board = page.getByRole("grid", { name: "Chess position" });
  const initialBounds = await board.boundingBox();
  expect(initialBounds!.y).toBeGreaterThanOrEqual(0);
  expect(initialBounds!.y + initialBounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect((await page.getByRole("button", { name: "Try moves without saving", exact: true }).boundingBox())!.height).toBeLessThanOrEqual(50);
  await page.screenshot({ path: testInfo.outputPath("first-save-board.png") });
  const boardTop = await board.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
  const requests: string[] = [];
  let fail = true;
  await page.route(`**/api/v1/openings/repertoires/${id}/lines/*/moves`, route => {
    requests.push(route.request().postDataJSON().requestId);
    return fail ? route.fulfill({ status: 503, json: { error: "Temporary save failure" } }) : route.continue();
  });
  await board.getByRole("gridcell", { name: "e7 black pawn" }).click();
  await board.getByRole("gridcell", { name: "e5 empty" }).click();
  await expect(page.getByText("Temporary save failure", { exact: true })).toBeVisible();
  await expect(board).not.toHaveClass(/interactive/);
  fail = false;
  await page.getByRole("button", { name: "Retry saving move", exact: true }).click();
  await expect(page.getByText("e5 was added to the end of this line.", { exact: true })).toBeVisible();
  expect(requests).toHaveLength(2);
  expect(requests[0]).toBe(requests[1]);
  expect(await board.evaluate(element => element.getBoundingClientRect().top + window.scrollY)).toBeCloseTo(boardTop, 0);
  await page.unroute(`**/api/v1/openings/repertoires/${id}/lines/*/moves`);
  await board.getByRole("gridcell", { name: "g1 white knight" }).click();
  await board.getByRole("gridcell", { name: "f3 empty" }).click();
  await expect(page.getByText("Nf3 was added to the end of this line.", { exact: true })).toBeVisible();
  let detail = await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  expect(detail.chapters[0].lines[0].moveCount).toBe(3);
  await page.getByRole("button", { name: "Try moves without saving", exact: true }).click();
  const analysis = page.getByRole("grid", { name: "Analysis board" });
  await expect(board).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(1);
  await analysis.getByRole("gridcell", { name: "b8 black knight" }).click();
  await analysis.getByRole("gridcell", { name: "c6 empty" }).click();
  expect((await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json()).chapters[0].lines[0].moveCount).toBe(3);
  await analysis.getByRole("gridcell", { name: "f1 white bishop" }).click();
  await analysis.getByRole("gridcell", { name: "c4 empty" }).click();
  await page.screenshot({ path: testInfo.outputPath("automatic-builder-analysis.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.getByRole("button", { name: "Add 2 moves to my repertoire", exact: true }).click();
  await expect(page.getByText("Analysis sequence saved. Original lines are kept.", { exact: true })).toBeVisible();
  detail = await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  expect(detail.chapters[0].lines).toHaveLength(1);
  expect(detail.chapters[0].lines[0].moveCount).toBe(5);
  await page.getByRole("button", { name: "Return to saved line", exact: true }).click();
  await page.getByRole("button", { name: "Undo last save", exact: true }).click();
  await expect(page.getByText("Bc4 was removed.", { exact: true })).toBeVisible();
  detail = await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  expect(detail.chapters[0].lines[0].moveCount).toBe(4);
  expect((await (await page.request.get("/api/v1/openings/reviews/active")).json()).sessionId).toBe(paused.sessionId);
});

test("uses optional idea hints without revealing a square, and keeps that assistance after reload", async ({ page }, testInfo) => {
  const pgn = `[Event "Hint audit ${testInfo.project.name}"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *`;
  await startPractice(page, pgn);
  const active = await (await page.request.get("/api/v1/openings/reviews/active")).json();
  expect((await page.request.patch(`/api/v1/openings/repertoires/${active.repertoire.id}/moves/${active.introduction.repertoireMove.moveId}/comment`, {
    data: { comment: "The full explanation names e4.", ideaHint: "Take space in the centre." },
  })).ok()).toBeTruthy();
  await page.reload();
  await page.getByRole("button", { name: "Hint: explain the idea", exact: true }).click();
  const board = page.getByRole("grid", { name: "Chess position" });
  await expect(page.getByText("Take space in the centre.", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("The full explanation names e4.", { exact: true })).toBeHidden();
  await expect(board.locator(".answer-highlight")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Idea hint shown", exact: true })).toBeDisabled();
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(board).toHaveClass(/interactive/);
  await board.getByRole("gridcell", { name: "g1 white knight" }).click();
  await board.getByRole("gridcell", { name: "f3 empty" }).click();
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  const summary = page.locator(".opening-complete-scores");
  await expect(summary.locator("div").filter({ hasText: "remembered first try" }).getByText("1", { exact: true })).toBeVisible();
  await expect(summary.locator("div").filter({ hasText: "moves helped by hints" }).getByText("1", { exact: true })).toBeVisible();
  await expect(board).toBeVisible();
});

test("automatically recalls different saved responses at the same position without a fixed order", async ({ page }, testInfo) => {
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "Shared recall ${testInfo.project.name}"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 (2. Nc3) (2. Bc4) *`,
    learnerColor: "white", ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const id = (await imported.json()).repertoireIds[0];
  expect((await page.request.post(`/api/v1/openings/repertoires/${id}/reviews/start`)).ok()).toBeTruthy();
  let mistakes = 0;
  page.on("request", request => { if (/\/mistakes$/.test(request.url())) mistakes++; });
  await page.goto("/#openings");
  const board = page.getByRole("grid", { name: "Chess position" });
  for (const [step, total, from, to] of [
    [1, 2, "e2 white pawn", "e4 empty"],
    [2, 2, "f1 white bishop", "c4 empty"],
    [3, 4, "b1 white knight", "c3 empty"],
    [4, 4, "g1 white knight", "f3 empty"],
  ] as const) {
    await expect(page.getByText(`Step ${step} of ${total}`, { exact: true })).toBeVisible();
    await expect(board).toHaveClass(/interactive/);
    if (step > 2) await expect(page.getByText("You have another saved response here. Play it on the board.", { exact: true }).filter({ visible: true })).toBeVisible();
    await board.getByRole("gridcell", { name: from }).click();
    await board.getByRole("gridcell", { name: to }).click();
  }
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  expect(mistakes).toBe(0);
  await expect(page.locator(".opening-complete-scores").locator("div").filter({ hasText: "remembered first try" }).getByText("4", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("shared-response-completion.png"), fullPage: true });
});

test("persists relaxed practice and pauses only after the saved move is found", async ({ page }, testInfo) => {
  const { configured: _configured, explorerAvailable: _explorerAvailable, updatedAt: _updatedAt, ...preferences } =
    await (await page.request.get("/api/v1/openings/preferences")).json();
  const settings = { ...preferences, practicePace: "relaxed", pauseAfterMove: "always" };
  expect((await page.request.patch("/api/v1/openings/preferences", { data: settings })).ok()).toBeTruthy();
  try {
    await page.clock.install();
    const board = await startPractice(page, `[Event "Pace audit ${testInfo.project.name}"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *`);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
    await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
    await page.clock.runFor(20);
    const mistake = page.waitForResponse(response => /\/mistakes$/.test(response.url()));
    await board.getByRole("gridcell", { name: "d4 empty" }).click();
    await page.clock.runFor(20);
    await mistake;
    await page.clock.runFor(850);
    await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toBeVisible();
    await page.clock.runFor(800);
    await expect(board).toHaveClass(/interactive/);
    await expect(page.getByRole("button", { name: "Continue practice", exact: true })).toBeHidden();
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await page.clock.runFor(20);
    const answered = page.waitForResponse(response => /\/reviews\/[^/]+\/move$/.test(response.url()));
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await page.clock.runFor(20);
    await answered;
    await page.clock.runFor(3000);
    await expect(page.getByText("Step 1 of 2")).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue practice", exact: true })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath("relaxed-practice-feedback.png"), fullPage: true });
    await page.getByRole("button", { name: "Continue practice", exact: true }).click();
    await page.clock.runFor(1000);
    await expect(page.getByText("Step 2 of 2")).toBeVisible();
  } finally {
    expect((await page.request.patch("/api/v1/openings/preferences", { data: preferences })).ok()).toBeTruthy();
  }
});

test("excludes reading notes and hidden-tab time from the next recall", async ({ page }) => {
  const board = await startPractice(page);
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(board).toHaveClass(/interactive/);
  await page.evaluate(() => {
    const original = performance.now.bind(performance);
    (window as typeof window & { recallOffset: number }).recallOffset = 0;
    Object.defineProperty(performance, "now", { configurable: true,
      value: () => original() + (window as typeof window & { recallOffset: number }).recallOffset });
  });
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  await expect(board).not.toHaveClass(/interactive/);
  await page.evaluate(() => { (window as typeof window & { recallOffset: number }).recallOffset += 120000; });
  await page.getByRole("button", { name: "Close explanation and resume", exact: true }).click();
  await expect(board).toHaveClass(/interactive/);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    (window as typeof window & { recallOffset: number }).recallOffset += 120000;
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(100);
  const answered = page.waitForResponse(response => /\/reviews\/[^/]+\/move$/.test(response.url()));
  await board.getByRole("gridcell", { name: "g1 white knight" }).click();
  await board.getByRole("gridcell", { name: "f3 empty" }).click();
  const response = await answered;
  expect(response.request().postDataJSON().activeResponseMs).toBeLessThan(30000);
  expect(await response.json()).toMatchObject({ recallSpeed: "normal", assisted: false });
});

test("repeats a line, skips paused chapters and restores browsing position on reload", async ({ page }, testInfo) => {
  const pgn = '[Event "Line navigation"]\n[ChapterName "First"]\n[Result "*"]\n\n1.e4 e5 *\n\n'
    + '[Event "Line navigation"]\n[ChapterName "Paused"]\n[Result "*"]\n\n1.e4 c5 2.Nf3 *\n\n'
    + '[Event "Line navigation"]\n[ChapterName "Last"]\n[Result "*"]\n\n1.e4 {Centre [%csl Ge4]} e6 *';
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn, learnerColor: "white", name: "Line navigation", sourceType: "self_authored", sourceTitle: "My notes", ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const repertoireId = (await imported.json()).repertoireIds[0];
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  const [first, paused, last] = detail.chapters.map((chapter: { lines: Array<{ id: string }> }) => chapter.lines[0].id);
  expect((await page.request.patch(`/api/v1/openings/repertoires/${repertoireId}/practice-selection`, { data: { lineIds: [paused], enabled: false } })).ok()).toBeTruthy();
  await page.request.post(`/api/v1/openings/repertoires/${repertoireId}/lines/${first}/reviews/start`);
  await page.goto("/#openings");
  const resume = page.getByRole("button", { name: "Resume opening practice" });
  if (await resume.isVisible()) await resume.click();
  const play = async () => {
    const board = page.getByRole("grid", { name: "Chess position" });
    await expect(board).toHaveClass(/interactive/);
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  };
  await play();
  await page.getByRole("button", { name: "Repeat this line", exact: true }).click();
  await expect(page.getByText(/Line run · First/)).toBeVisible();
  await play();
  await page.getByRole("button", { name: "Next enabled line", exact: true }).click();
  await expect(page.getByText(/Line run · Last/)).toBeVisible();
  await play();
  await expect(page.getByRole("button", { name: "Next enabled line", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Back to this repertoire", exact: true }).click();
  await page.getByRole("button", { name: "Go to move 1: e4", exact: true }).click();
  expect(await page.evaluate(() => Object.fromEntries(new URLSearchParams(window.location.hash.split("?")[1]))))
    .toMatchObject({ line: last, ply: "1" });
  await expect(page.locator(".cg-shapes > g > g")).toHaveCount(0);
  await page.getByRole("button", { name: "Show source arrows and highlights", exact: true }).click();
  await expect(page.locator(".cg-shapes circle[stroke=\'#15781B\']")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Go to move 1: e4", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
  await expect(page.locator(".cg-shapes > g > g")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("restored-line-browser.png"), fullPage: true });
});

test("returns to the same practice position without revealing the answer or explanation", async ({ page }) => {
  const board = await startPractice(page);
  await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "d4 empty" }).click();
  await expect(page.getByText(/^Try again(?:, or ask for a hint\.)?$/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).not.toHaveClass(/answer-highlight/);
  await expect(page.getByText("Claim central space and free the bishop.", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Explain last move", exact: true })).toBeDisabled();
  await expect(board).toHaveClass(/interactive/);
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
});

for (const reducedMotion of [false, true]) {
  test(`holds an incorrect move, returns smoothly and guards retry input (${reducedMotion ? "reduced motion" : "animated"})`, async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
    await page.clock.install();
    const board = await startPractice(page);
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 60_000));
    const boardTop = await board.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
    let mistakes = 0;
    let mistakeTime = 0;
    let answerTime = 0;
    page.on("request", request => {
      if (/\/mistakes$/.test(request.url()) && request.method() === "POST") {
        mistakes++;
        mistakeTime = request.postDataJSON().activeResponseMs;
      }
      if (/\/reviews\/[^/]+\/move$/.test(request.url()) && request.method() === "POST") answerTime = request.postDataJSON().activeResponseMs;
    });
    await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
    await page.clock.runFor(20);
    const saved = page.waitForResponse(response => /\/mistakes$/.test(response.url()));
    await board.getByRole("gridcell", { name: "d4 empty" }).click();
    await page.clock.runFor(20);
    await saved;
    await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toBeVisible();
    await expect(board).not.toHaveClass(/interactive/);
    await expect(page.getByRole("button", { name: "Hint: show the piece" })).toBeDisabled();
    await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toHaveClass(/rejected-move/);
    expect(await board.evaluate(element => element.getBoundingClientRect().top + window.scrollY)).toBeCloseTo(boardTop, 0);
    await board.locator("[data-square='e2']").press("Enter");
    await board.locator("[data-square='e4']").press("Enter");
    await page.clock.runFor(400);
    await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toBeVisible();
    await expect(page.getByText("Step 1 of 3")).toBeVisible();
    await expect(page.getByText("Claim central space and free the bishop.", { exact: true })).toBeHidden();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({ path: testInfo.outputPath("incorrect-move-paused.png"), fullPage: true });
    await page.clock.runFor(300);
    await expect(board.getByRole("gridcell", { name: "d2 white pawn" })).toBeVisible();
    if (reducedMotion) await expect(board.locator("piece.anim")).toHaveCount(0);
    else {
      await expect(board.locator("piece.white.pawn.anim")).toHaveCount(1);
      // React applies the timer's state update after runFor resolves; advance
      // native animation frames from that committed render, not just its timer.
      await page.clock.runFor(120);
      await expect(board).not.toHaveClass(/interactive/);
      const source = await board.locator("[data-square='d2']").boundingBox();
      const destination = await board.locator("[data-square='d4']").boundingBox();
      const piece = await board.locator("piece.white.pawn.anim").boundingBox();
      expect(piece!.y).toBeGreaterThan(destination!.y);
      expect(piece!.y).toBeLessThan(source!.y);
    }
    await page.clock.runFor(400);
    await expect(board.locator("piece.anim")).toHaveCount(0);
    await expect(board).toHaveClass(/interactive/);
    await expect(page.getByRole("button", { name: "Hint: show the piece" })).toBeEnabled();
    expect(mistakes).toBe(1);
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await page.clock.runFor(20);
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await page.clock.runFor(20);
    await expect(page.getByText(/found with help|Learning/, { exact: true }).filter({ visible: true })).toBeVisible();
    expect(answerTime - mistakeTime).toBeGreaterThanOrEqual(0);
    expect(answerTime - mistakeTime).toBeLessThan(500); // The 1s visual reset is not thinking time.
  });
}

test("retains hints across reloads and asks the player to execute a shown answer", async ({ page }, testInfo) => {
  await startPractice(page);
  await page.getByRole("button", { name: "Hint: show the piece" }).click();
  await page.reload();
  const resume = page.getByRole("button", { name: "Resume opening practice" });
  if (await resume.isVisible()) await resume.click();
  const board = page.getByRole("grid", { name: "Chess position" });
  await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).toHaveClass(/answer-highlight/);
  await page.getByRole("button", { name: "Show move", exact: true }).click();
  await expect(board.getByRole("gridcell", { name: "e4 empty" })).toHaveClass(/answer-highlight/);
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  const boardBounds = await board.boundingBox();
  const helpBounds = await page.locator(".opening-recall-help").boundingBox();
  expect(boardBounds).not.toBeNull();
  expect(helpBounds).not.toBeNull();
  expect(helpBounds!.y).toBeGreaterThanOrEqual(boardBounds!.y + boardBounds!.height);
  // Capture from the document top so off-viewport fixed accessibility controls
  // are not painted into the middle of a full-page screenshot after scrolling.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("practice-help.png"), fullPage: true });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText(/found with help|Learning/).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
});

test("keeps practice help below the board and lower ranks reachable when scrolling or resizing", async ({ page }, testInfo) => {
  const board = await startPractice(page);
  const initialViewport = page.viewportSize()!;
  for (const height of [initialViewport.height, 600, 900]) {
    await page.setViewportSize({ width: initialViewport.width, height });
    const help = page.locator(".opening-recall-help");
    for (const scrollTarget of [board, help]) {
      await scrollTarget.scrollIntoViewIfNeeded();
      const boardBounds = await board.boundingBox();
      const helpBounds = await help.boundingBox();
      expect(boardBounds).not.toBeNull();
      expect(helpBounds).not.toBeNull();
      expect(helpBounds!.y).toBeGreaterThanOrEqual(boardBounds!.y + boardBounds!.height);
    }
    // Test actual hit targets, not just visible DOM labels: an overlay can hide
    // pieces while Playwright still reports the underlying cells as visible.
    for (const name of ["e2 white pawn", "g1 white knight"]) {
      const square = board.getByRole("gridcell", { name });
      await square.scrollIntoViewIfNeeded();
      expect(await square.evaluate(element => {
        const rect = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
    }
  }
  await page.setViewportSize(initialViewport);
  await page.getByRole("button", { name: "Hint: show the piece" }).click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("unobstructed-practice-board.png"), fullPage: true });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
});

test("stops on a failed next-position request rather than retrying or skipping", async ({ page }) => {
  const board = await startPractice(page);
  let requests = 0;
  await page.route("**/api/v1/openings/reviews/*/continue", async (route) => {
    requests += 1;
    await route.fulfill({ status: 503, json: { error: "Connection interrupted. Try again." } });
  });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Connection interrupted. Try again.")).toBeVisible();
  await page.waitForTimeout(1600);
  expect(requests).toBe(1);
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await page.unroute("**/api/v1/openings/reviews/*/continue");
  await page.getByRole("button", { name: "Try loading the next position again" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
});

test("rolls back the board when an answer cannot be saved", async ({ page }) => {
  const board = await startPractice(page);
  await page.route("**/api/v1/openings/reviews/*/move", (route) => route.fulfill({ status: 503, json: { error: "Could not save move" } }));
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Could not save move")).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).toBeVisible();
  await page.unroute("**/api/v1/openings/reviews/*/move");
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
});

test("previews and applies source changes from an expanded repertoire card", async ({ page }, testInfo) => {
  const name = `Source update ${testInfo.project.name}`;
  const pgn = `[Event "${name}"]\n[Result "*"]\n\n1. e4 {Occupy the centre.} e5 2. Nf3 Nc6 3. Bc4 *`;
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn, learnerColor: "white", name, ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const repertoireId = (await imported.json()).repertoireIds[0];
  await page.goto("/#openings");
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  // Use the unique card title; details keeps the page compact before interaction.
  const repertoireCard = page.locator("article.opening-card").filter({ hasText: name });
  await expect(pause.or(repertoireCard.locator("summary").first())).toBeVisible();
  if (await pause.isVisible()) await pause.click();
  await repertoireCard.locator("summary").first().click();
  await repertoireCard.getByRole("button", { name: "Update from source", exact: true }).click();
  await repertoireCard.getByLabel("Updated opening PGN", { exact: true }).fill(pgn.replace("Occupy the centre.", "Control the centre and free the bishop.").replace("3. Bc4 *", "3. Bc4 Bc5 (3... Nf6 4. Ng5) 4. c3 *"));
  await repertoireCard.getByRole("button", { name: "Preview update", exact: true }).click();
  await expect(repertoireCard.getByText("1 new line", { exact: true })).toBeVisible();
  await expect(repertoireCard.getByText("1 existing line extended", { exact: true })).toBeVisible();
  const apply = repertoireCard.getByRole("button", { name: "Apply update — keep my progress", exact: true });
  await expect(apply).toBeDisabled();
  await repertoireCard.getByRole("checkbox", { name: "I own this material or have permission to use it." }).check();
  await page.screenshot({ path: testInfo.outputPath("source-update-preview.png"), fullPage: true });
  const viewport = page.viewportSize()!;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
  await apply.click();
  await expect(repertoireCard.getByRole("status")).toContainText("Repertoire updated");
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  expect(detail.chapters[0].lines).toHaveLength(2);
});

test("keeps a preparation idea without a line, then shows it after recall when a line is deliberately added", async ({ page }, testInfo) => {
  const name = `Practice choices ${testInfo.project.name}`;
  const player = `Preparation Learner ${testInfo.project.name}`;
  const firstReply = testInfo.project.name === "webkit" ? "Nf6" : "d5";
  const opening = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "${name}"]\n[Result "*"]\n\n1. d4 ${firstReply} 2. c4 e6 3. Nc3 *`,
    learnerColor: "white", name, ownershipConfirmed: true,
  } });
  expect(opening.ok()).toBeTruthy();
  const repertoireId = (await opening.json()).repertoireIds[0];
  const game = await page.request.post("/api/v1/imports/pgn", { data: {
    pgn: `[Event "Played ${name}"]\n[White "${player}"]\n[Black "Opponent"]\n[Result "*"]\n\n1. d4 ${firstReply} 2. c4 h6 3. Nc3 *`, playerName: player,
  } });
  expect(game.ok()).toBeTruthy();
  const profiles = await (await page.request.get("/api/v1/profiles")).json();
  const learner = profiles.profiles.find((profile: { displayName: string }) => profile.displayName === player);
  expect((await page.request.post(`/api/v1/profiles/${learner.id}/activate`)).ok()).toBeTruthy();
  const before = (await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json()).chapters[0].lines.length;
  await page.goto("/#games");
  const item = page.locator("article.opening-inbox-item").filter({ hasText: name });
  const advice = item.getByRole("region", { name: "Worth preparing?" });
  await expect(advice.getByText(/^Frequency unknown/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preparation-choice-inbox.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await advice.getByRole("button", { name: "Keep an idea instead", exact: true }).click();
  const note = "Complete development and use the centre; no long line needed.";
  await advice.getByLabel("Idea to remember", { exact: true }).fill(note);
  await advice.getByRole("button", { name: "Save idea without a line", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Idea kept. No new line or memory reviews were added.");
  expect((await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json()).chapters[0].lines).toHaveLength(before);
  await page.reload();
  await page.getByRole("button", { name: /Show all/ }).click();
  await expect(advice.getByText(note, { exact: true })).toBeVisible();
  await item.getByRole("button", { name: "Prepare for h6", exact: true }).click();
  const board = item.getByRole("grid", { name: "Position after h6" });
  await board.getByRole("gridcell", { name: "b1 white knight" }).click();
  await board.getByRole("gridcell", { name: "c3 empty" }).click();
  await item.getByRole("button", { name: "Save h6 → Nc3", exact: true }).click();
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  const line = detail.chapters.flatMap((chapter: { lines: Array<{ id: string; moves: Array<{ moveUci: string }> }> }) => chapter.lines)
    .find((candidate: { moves: Array<{ moveUci: string }> }) => candidate.moves.some(move => move.moveUci === "h7h6"));
  expect(line).toBeTruthy();
  const started = await page.request.post(`/api/v1/openings/repertoires/${repertoireId}/lines/${line.id}/reviews/start`);
  expect(started.ok()).toBeTruthy();
  await page.goto("/#openings");
  const resume = page.getByRole("button", { name: "Resume opening practice" });
  if (await resume.isVisible()) await resume.click();
  const practice = page.getByRole("grid", { name: "Chess position" });
  await practice.getByRole("gridcell", { name: "d2 white pawn" }).click();
  await practice.getByRole("gridcell", { name: "d4 empty" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await expect(practice).toHaveClass(/interactive/);
  await practice.getByRole("gridcell", { name: "c2 white pawn" }).click();
  await practice.getByRole("gridcell", { name: "c4 empty" }).click();
  await expect(page.getByText("Step 3 of 3")).toBeVisible();
  await expect(practice).toHaveClass(/interactive/);
  await expect(page.getByText(note, { exact: false })).toBeHidden();
  await practice.getByRole("gridcell", { name: "b1 white knight" }).click();
  await practice.getByRole("gridcell", { name: "c3 empty" }).click();
  await page.getByRole("button", { name: "Keep this open", exact: true }).click();
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  await expect(page.getByText(note, { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preparation-idea-in-practice.png"), fullPage: true });
});

async function openNavigationStudy(page: import("@playwright/test").Page, name: string, pgn: string) {
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "${name}"]\n[Result "*"]\n\n${pgn}`, learnerColor: "white", name, ownershipConfirmed: true,
  } });
  expect(imported.ok(), await imported.text()).toBeTruthy();
  const repertoireId = (await imported.json()).repertoireIds[0];
  await page.goto("/#openings");
  const card = page.locator("article.opening-card").filter({ hasText: name });
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  await expect(pause.or(card.locator("summary").first())).toBeVisible();
  if (await pause.isVisible()) await pause.click();
  await card.locator("summary").first().click();
  await card.getByRole("button", { name: "View all lines", exact: true }).click();
  await expect(page.getByRole("heading", { name, level: 2, exact: true })).toBeVisible();
  const notes = page.getByRole("button", { name: "Notes and move ideas", exact: true });
  if (await notes.isVisible()) await notes.click();
  return repertoireId;
}

test("navigates nested variations through shared moves without changing the repertoire", async ({ page }, testInfo) => {
  const id = await openNavigationStudy(page, `Branch navigation ${testInfo.project.name}`,
    "1. e4 e5 2. Nf3 Nc6 (2... d6 3. d4 (3. Bc4)) 3. Bb5 a6 *");
  const before = await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  const board = page.getByRole("grid", { name: "Chess position" });
  const choices = page.getByRole("region", { name: "Saved continuations", exact: true });
  const library = page.getByRole("complementary", { name: "Opening lines", exact: true });
  const showLibrary = async () => {
    const toggle = page.getByRole("button", { name: /Choose another line/ });
    if (await toggle.isVisible()) await toggle.click();
  };
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await choices.getByRole("button", { name: "Follow 1...e5", exact: true }).click();
  await choices.getByRole("button", { name: "Follow 2.Nf3", exact: true }).click();
  await expect(choices.getByText(/shared by 3 active lines/)).toBeVisible();
  await expect(choices.getByText(/another move order/)).toBeHidden();
  await choices.getByRole("button", { name: "Follow 2...Nc6", exact: true }).click();
  await choices.getByRole("button", { name: "Follow 3.Bb5", exact: true }).click();
  await showLibrary();
  await library.getByRole("button", { name: /^2\.\.\.d6 branch/ }).click();
  // Switching after a fork stops before the differing reply, not at move one.
  await expect(board.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "f3 white knight" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "d7 black pawn" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "b8 black knight" })).toBeVisible();
  await choices.getByRole("button", { name: "Follow 2...d6", exact: true }).click();
  await choices.getByRole("button", { name: "Follow 3.Bc4", exact: true }).click();
  await expect(choices.getByText("3.Bc4 branch", { exact: true })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "c4 white bishop" })).toBeVisible();
  await choices.getByRole("button", { name: /Go to branching point/ }).click();
  await expect(board.getByRole("gridcell", { name: "f1 white bishop" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "d6 black pawn" })).toBeVisible();
  await choices.getByRole("button", { name: "Back to previous line", exact: true }).click();
  await expect(choices.getByText("2...d6 branch", { exact: true })).toBeVisible();
  await showLibrary();
  await library.getByLabel("Find a line", { exact: true }).fill("Bc4");
  await expect(library.getByRole("button", { name: /^3\.Bc4 branch/ })).toBeVisible();
  await expect(library.getByRole("button", { name: /^Main line/ })).toBeHidden();
  await library.getByRole("button", { name: "Clear line search" }).click();
  if (await page.getByRole("button", { name: "Hide line list" }).isVisible()) await page.getByRole("button", { name: "Hide line list" }).click();
  const controls = await page.locator(".opening-line-controls").boundingBox();
  expect(controls!.height).toBeLessThan(125);
  await page.screenshot({ path: testInfo.outputPath("shared-branch-navigation.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  expect(await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json()).toEqual(before);
});

test("keeps the board when changing move order and protects shared comments while editing", async ({ page }, testInfo) => {
  await openNavigationStudy(page, `Move order navigation ${testInfo.project.name}`,
    "1. d4 d5 2. Nf3 (2. c4 e6 3. Nf3 Nf6 4. Nc3) Nf6 3. c4 e6 4. Nc3 *");
  const board = page.getByRole("grid", { name: "Chess position" });
  const choices = page.getByRole("region", { name: "Saved continuations", exact: true });
  await page.getByRole("button", { name: "End", exact: true }).click();
  await expect(page.getByText(/This move is used in 2 lines/)).toBeVisible();
  await choices.getByText("Same position, another move order (1)", { exact: true }).click();
  await page.getByRole("button", { name: "Add comment", exact: true }).click();
  const note = "Develop both knights before choosing the central pawn break.";
  await page.getByLabel("Your learning comment", { exact: true }).fill(note);
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeDisabled();
  await expect(choices.getByRole("button", { name: /same position$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back to repertoires", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Save comment", exact: true }).click();
  await choices.getByRole("button", { name: /same position$/ }).click();
  await expect(board.getByRole("gridcell", { name: "c4 white pawn" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "f3 white knight" })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(choices.getByText("2.c4 branch", { exact: true })).toBeVisible();
  await choices.getByRole("button", { name: "Back to previous line", exact: true }).click();
  await expect(choices.getByText("Main line", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("shared-comment-move-order.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

test("inspects a covered reply in its saved branch and returns to coverage without duplicating it", async ({ page }, testInfo) => {
  const id = await openNavigationStudy(page, `Coverage inspection ${testInfo.project.name}`, "1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bc4 *");
  const url = `/api/v1/openings/repertoires/${id}`;
  const before = await (await page.request.get(url)).json();
  await page.getByRole("button", { name: "Find repertoire gaps", exact: true }).click();
  const panel = page.getByRole("region", { name: "Repertoire coverage and gaps" });
  await panel.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await expect(panel.getByRole("heading", { name: "Start here", exact: true })).toBeVisible();
  const moreTasks = panel.getByRole("button", { name: /^See all / });
  if (await moreTasks.isVisible()) await moreTasks.click();
  const task = panel.locator(".opening-coverage-tasks article").filter({ hasText: "Practise your response to c5" });
  await task.getByRole("button", { name: "Inspect position", exact: true }).click();
  const board = page.getByRole("region", { name: "Opening board and moves" });
  await expect(board).toBeFocused();
  await expect(board.getByRole("gridcell", { name: "c5 black pawn" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save move", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Edit lines", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish editing", exact: true })).toBeHidden();
  expect(await board.locator(".opening-board-prompt").evaluate(element => getComputedStyle(element).position)).toBe("static");
  await expect(page).toHaveURL(/ply=2/);
  await expect.poll(async () => (await board.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await board.boundingBox())!.y).toBeLessThan(80);
  await page.getByRole("button", { name: "Back to coverage", exact: true }).click();
  await expect(page.locator(".opening-workspace-tools > summary")).toBeFocused();
  await expect.poll(async () => (await page.locator(".opening-workspace-tools > summary").boundingBox())!.y).toBeLessThan(80);
  await expect(task.getByRole("button", { name: "Practise response", exact: true })).toBeEnabled();
  expect((await (await page.request.get(url)).json()).chapters).toEqual(before.chapters);
  await page.screenshot({ path: testInfo.outputPath("coverage-inspection.png"), fullPage: true });
  await page.screenshot({ path: testInfo.outputPath("coverage-screen.png") });
});

test("keeps coverage errors beside the action, supports editing depth, and explains empty filters", async ({ page }, testInfo) => {
  await openNavigationStudy(page, `Coverage recovery ${testInfo.project.name}`, "1. e4 e5 2. Nf3 Nc6 3. Bc4 *");
  await page.getByRole("button", { name: "Find repertoire gaps", exact: true }).click();
  const panel = page.getByRole("region", { name: "Repertoire coverage and gaps" });
  await panel.getByText("Change line, move limit or rating", { exact: true }).click();
  const depth = panel.getByRole("spinbutton", { name: "Prepare through my move" });
  await depth.fill("");
  await expect(depth).toHaveValue("");
  await expect(depth).toHaveAttribute("aria-invalid", "true");
  await expect(panel.getByRole("button", { name: /^(Check|Recheck) coverage$/ })).toBeDisabled();
  await depth.fill("2.5");
  await expect(depth).toHaveAttribute("aria-invalid", "true");
  await depth.fill("2");
  let fail = true;
  await page.route("**/api/v1/openings/repertoires/*/coverage?rating=*", route => fail
    ? route.fulfill({ status: 503, json: { error: "Coverage temporarily unavailable. Please try again." } }) : route.continue());
  await panel.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await expect(panel.getByRole("alert")).toHaveText("Coverage temporarily unavailable. Please try again.");
  fail = false;
  await panel.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await expect(panel.getByRole("alert")).toBeHidden();
  await panel.getByText("Detailed estimates and practice history", { exact: true }).click();
  await expect(panel.getByText(/Unknown means/)).toBeVisible();
  await expect(panel.getByText(/Sample evidence:/)).toBeHidden();
  await panel.getByText("Recall and sample details", { exact: true }).click();
  await expect(panel.getByText(/Sample evidence:/)).toBeVisible();
  await panel.getByText(/Explore branches and stopping points/).click();
  await panel.getByRole("combobox", { name: "Show branches" }).selectOption("prepared");
  await expect(panel.locator(".opening-coverage-node")).toHaveCount(0);
  await expect(panel.getByText(/No positions match this filter/)).toBeVisible();
  await panel.getByRole("combobox", { name: "Show branches" }).selectOption("all");
  await expect(panel.locator(".opening-coverage-node")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
});

test("shows honest coverage, distinct recall and reversible stopping points without altering saved lines", async ({ page }, testInfo) => {
  const id = await openNavigationStudy(page, `Coverage map ${testInfo.project.name}`, "1. e4 e5 2. Nf3 Nc6 3. Bc4 *");
  const url = `/api/v1/openings/repertoires/${id}`;
  const before = await (await page.request.get(url)).json();
  await page.getByText("Coverage and repertoire settings", { exact: true }).click();
  const panel = page.getByRole("region", { name: "Repertoire coverage and gaps" });
  await panel.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await expect(panel.getByText("Unknown: 100%", { exact: true })).toBeHidden();
  await panel.getByText("Detailed estimates and practice history", { exact: true }).click();
  await expect(panel.getByText("Unknown: 100%", { exact: true })).toBeVisible();
  await expect(panel.getByText(/distinct saved responses tested/)).toContainText("0/2");
  await expect(panel.getByRole("button", { name: "Practise response", exact: true })).toHaveCount(2);
  await panel.getByText(/Explore branches and stopping points/).click();
  await panel.getByRole("combobox", { name: "Show branches" }).selectOption("all");
  const node = panel.locator(".opening-coverage-node").first();
  await node.locator("summary").click();
  await expect(node.getByText("Reply frequency unknown", { exact: false })).toBeVisible();
  await node.getByRole("button", { name: "Prepared enough — stop here" }).click();
  await expect(panel.getByText("Saved responses / stopping points: 100%", { exact: true })).toBeVisible();
  await node.getByRole("button", { name: "Include this position again" }).click();
  await expect(panel.getByText("Unknown: 100%", { exact: true })).toBeVisible();
  await panel.getByText("Change line, move limit or rating", { exact: true }).click();
  await panel.getByRole("spinbutton", { name: "Prepare through my move" }).fill("2");
  await panel.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await expect(panel.getByRole("heading", { name: "Can this line handle replies until your move 2?" })).toBeVisible();
  expect((await (await page.request.get(url)).json()).chapters).toEqual(before.chapters);
  await page.screenshot({ path: testInfo.outputPath("coverage-map.png"), fullPage: true });
  // Other journeys can leave a paused session; deliberately replace it here.
  page.once("dialog", dialog => dialog.accept());
  await panel.getByRole("button", { name: "Practise response", exact: true }).first().click();
  await expect(page.getByText("Step 1 of 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("grid", { name: "Chess position" }).getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
});

test("discards an older coverage request when the selected rating changes", async ({ page }, testInfo) => {
  await page.route("**/api/v1/openings/preferences", async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), useExplorer: true, explorerAvailable: true } });
  });
  let manual = false;
  let delayedStarted!: () => void;
  const started = new Promise<void>(resolve => { delayedStarted = resolve; });
  let releaseDelayed!: () => void;
  const released = new Promise<void>(resolve => { releaseDelayed = resolve; });
  let delayedFinished!: () => void;
  const finished = new Promise<void>(resolve => { delayedFinished = resolve; });
  await page.route("**/api/v1/openings/repertoires/*/coverage?rating=*", async route => {
    const url = new URL(route.request().url());
    const ratingGroup = Number(url.searchParams.get("rating"));
    const actual = await (await route.fetch()).json();
    const result = { ...actual, repertoireId: url.pathname.split("/")[5], ratingGroup, speeds: ["blitz", "rapid", "classical"],
      positionsChecked: 1, positionsAvailable: 1, coveragePercent: ratingGroup === 2000 ? 20 : 80,
      coveredGames: 200, totalGames: 1000, gaps: [], incomplete: false, message: "Test coverage sample.",
      model: { ...actual.model, preparedPercent: ratingGroup === 2000 ? 20 : 80, missingPercent: ratingGroup === 2000 ? 80 : 20, unknownPercent: 0 } };
    if (manual && ratingGroup !== 2000) {
      delayedStarted(); await released;
      try { await route.fulfill({ json: result }); } catch { /* An aborted browser request may already be gone. */ }
      delayedFinished();
    } else await route.fulfill({ json: result });
  });
  await openNavigationStudy(page, `Coverage navigation ${testInfo.project.name}`, "1. e4 e5 2. Nf3 Nc6 3. Bb5 *");
  manual = true;
  await page.getByText("Coverage and repertoire settings", { exact: true }).click();
  await page.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await started;
  await page.getByText("Change line, move limit or rating", { exact: true }).click();
  await page.getByRole("combobox", { name: "Lichess rating", exact: true }).selectOption("2000");
  await page.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  await page.getByText("Detailed estimates and practice history", { exact: true }).click();
  await expect(page.getByText("Saved responses / stopping points: 20%", { exact: true })).toBeVisible();
  releaseDelayed(); await finished;
  // WebKit may report a cancelled intercepted request as finished rather than
  // requestfailed. The requirement is that its obsolete data never replaces 2000.
  await expect(page.getByText("Saved responses / stopping points: 20%", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved responses / stopping points: 80%", { exact: true })).toBeHidden();
});

test("pauses branches without deleting them and distinguishes move recall from full-line runs", async ({ page }, testInfo) => {
  const name = `Practice selection ${testInfo.project.name}`;
  const id = await openNavigationStudy(page, name, "1. e4 e5 (1... c5 2. Nf3 d6 3. d4) 2. Nf3 Nc6 3. Bc4 *");
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  const main = detail.chapters[0].lines[0];
  const branch = detail.chapters[0].lines[1];
  // Supply real completed recall evidence through the same API used by the board.
  let exercise = await (await page.request.post(`/api/v1/openings/repertoires/${id}/lines/${main.id}/reviews/start`)).json();
  for (;;) {
    const answer = await page.request.post(`/api/v1/openings/reviews/${exercise.sessionId}/move`, { data: {
      moveUci: exercise.introduction.repertoireMove.moveUci, queueEntryId: exercise.queueEntryId,
    } });
    expect(answer.ok()).toBeTruthy();
    const next = await (await page.request.post(`/api/v1/openings/reviews/${exercise.sessionId}/continue`, { data: { queueEntryId: exercise.queueEntryId } })).json();
    if (next.kind === "complete") break;
    exercise = next;
  }
  const panel = page.locator(".opening-practice-selection");
  await page.getByText("Coverage and repertoire settings", { exact: true }).click();
  await panel.locator("summary").first().click();
  await expect(panel.getByText("Full-line recall: 100% unaided · 1/1 completed runs", { exact: true })).toBeVisible();
  await expect(panel.getByText("Full-line recall: no completed full runs yet", { exact: true })).toBeVisible();
  const paused = panel.getByRole("checkbox", { name: `Practise ${name} · 1...c5 branch`, exact: true });
  await page.route("**/practice-selection", async route => {
    if (route.request().method() === "PATCH") await route.fulfill({ status: 503, json: { error: "Selection connection interrupted" } });
    else await route.continue();
  });
  await paused.click();
  await expect(panel.getByRole("alert")).toContainText("Selection connection interrupted");
  await expect(paused).toBeChecked();
  await page.unroute("**/practice-selection");
  await panel.getByRole("button", { name: "Reload selection", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await paused.uncheck();
  await expect(panel.locator("summary").first()).toContainText("1/2 lines on");
  const selection = await (await page.request.get(`/api/v1/openings/repertoires/${id}/practice-selection`)).json();
  expect(selection.lines.find((line: { lineId: string }) => line.lineId === branch.id).enabled).toBe(false);
  await panel.getByRole("button", { name: "Pause filtered lines (2)", exact: true }).click();
  await expect(panel.getByText(/No lines are turned on/)).toBeVisible();
  await expect(panel.getByText("Full-line recall: 100% unaided · 1/1 completed runs", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Practise this line once", exact: true })).toBeEnabled();
  await panel.getByRole("button", { name: "Include filtered lines (2)", exact: true }).click();
  await expect(panel.locator("summary").first()).toContainText("2/2 lines on");
  await page.screenshot({ path: testInfo.outputPath("practice-selection-recall.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("filters reply-frequency evidence without silently pausing rare or unknown lines", async ({ page }, testInfo) => {
  const name = `Frequency selection ${testInfo.project.name}`;
  await openNavigationStudy(page, name, "1. e4 e5 (1... c5 2. Nf3) (1... c6 2. d4) 2. Nf3 *");
  await page.route("**/practice-selection", async route => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
    const response = await route.fetch(); const data = await response.json();
    data.lines.forEach((line: { frequency: object }, index: number) => {
      line.frequency = { band: ["common", "rare", "unknown"][index], percent: [50, 0.5, null][index],
        moveLabel: index === 0 ? "1...e5" : "1...c5", sampleGames: 1000, knownReplies: index === 2 ? 0 : 1, totalReplies: 1 };
    });
    await route.fulfill({ response, json: data });
  });
  const panel = page.locator(".opening-practice-selection");
  await page.getByText("Coverage and repertoire settings", { exact: true }).click();
  await panel.locator("summary").first().click();
  await expect(panel.locator(".opening-selection-line")).toHaveCount(3);
  await panel.getByRole("combobox", { name: "Opponent-reply frequency" }).selectOption("rare");
  await expect(panel.locator(".opening-selection-line")).toHaveCount(1);
  await expect(panel.getByText(/rare · 1...c5: 0.5% at that position/)).toBeVisible();
  await expect(panel.getByRole("checkbox")).toBeChecked();
  await expect(panel.locator("summary").first()).toContainText("3/3 lines on");
  await panel.getByRole("combobox", { name: "Opponent-reply frequency" }).selectOption("unknown");
  await expect(panel.locator(".opening-selection-line")).toHaveCount(1);
  await expect(panel.getByText(/Frequency unknown/)).toBeVisible();
  await panel.getByRole("combobox", { name: "Opponent-reply frequency" }).selectOption("all");
  await expect(panel.locator(".opening-selection-line")).toHaveCount(3);
  await panel.getByRole("combobox", { name: "Sort lines" }).selectOption("frequency");
  await expect(panel.locator(".opening-selection-line").first()).toContainText("common");
});

test("deletes the final line and clears a confirmed library without losing games", async ({ page }, testInfo) => {
  // Own the remaining material too: this test must work without earlier imports.
  const archived = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "Archived safety ${testInfo.project.name}"]\n[Result "*"]\n\n1. e4 g6 2. d4 Bg7 *`,
    learnerColor: "black", ownershipConfirmed: true,
  } });
  expect(archived.ok()).toBeTruthy();
  const archivedId = (await archived.json()).repertoireIds[0];
  expect((await page.request.patch(`/api/v1/openings/repertoires/${archivedId}/archive`, { data: { archived: true } })).ok()).toBeTruthy();
  const name = `Final line ${testInfo.project.name}`;
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "${name}"]\n[Result "*"]\n\n1. d4 d5 2. c4 *`,
    learnerColor: "white", name, ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const repertoireId = (await imported.json()).repertoireIds[0];
  await page.goto("/#openings");
  const pause = page.getByRole("button", { name: "Pause", exact: true });
  const card = page.locator("article.opening-card").filter({ hasText: name });
  await expect(pause.or(card.locator("summary").first())).toBeVisible();
  if (await pause.isVisible()) await pause.click();
  await card.locator("summary").first().click();
  await card.getByRole("button", { name: "View all lines", exact: true }).click();
  await page.getByText("Coverage and repertoire settings", { exact: true }).click();
  await page.locator("details.opening-management > summary").click();
  await page.getByRole("button", { name: "Delete selected line", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("This is the final line, so the repertoire will also be deleted.")).toBeVisible();
  await dialog.getByRole("button", { name: "Keep line", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Delete selected line", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete line", exact: true }).click();
  await expect(page.locator("article.opening-card").filter({ hasText: name })).toHaveCount(0);
  const catalog = await (await page.request.get("/api/v1/openings/catalog")).json();
  expect(catalog.repertoires.some((item: { id: string }) => item.id === repertoireId)).toBe(false);

  const gamePgn = `[Event "Library safety ${testInfo.project.name}"]\n[White "Library Learner"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 e5 *`;
  expect((await page.request.post("/api/v1/imports/pgn", { data: { pgn: gamePgn, playerName: "Library Learner" } })).ok()).toBeTruthy();
  const gamesBefore = await (await page.request.get("/api/v1/games")).json();
  const manager = page.locator("details.opening-library-manager");
  await manager.locator("summary").click();
  const clear = manager.getByRole("button", { name: "Delete all opening repertoires", exact: true });
  await clear.click();
  await expect(dialog.getByText(`Archived safety ${testInfo.project.name}`, { exact: true })).toBeVisible();
  const confirm = dialog.getByRole("button", { name: "Permanently delete all openings", exact: true });
  await expect(confirm).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(clear).toBeFocused();
  await clear.click();
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page.screenshot({ path: testInfo.outputPath("library-deletion.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await confirm.click();
  await expect(page.getByRole("heading", { name: "Your opening library is empty", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume opening practice" })).toBeHidden();
  await expect(manager).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Your opening library is empty", exact: true })).toBeVisible();
  await expect(page.locator("details.opening-settings")).not.toHaveAttribute("open");
  const gamesAfter = await (await page.request.get("/api/v1/games")).json();
  expect(gamesAfter.games.map((game: { id: string }) => game.id).sort())
    .toEqual(gamesBefore.games.map((game: { id: string }) => game.id).sort());
  await page.screenshot({ path: testInfo.outputPath("empty-opening-library.png"), fullPage: true });
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start building", exact: true })).toBeDisabled();
});

test("recovers an unfinished board draft after refresh without changing saved repertoires", async ({ page }) => {
  await page.goto("/#openings");
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  await page.getByRole("textbox", { name: "Repertoire name", exact: true }).fill("Recovered preparation");
  await page.getByLabel("I am preparing").selectOption("black");
  await page.getByRole("button", { name: "Start building", exact: true }).click();
  let board = page.getByRole("grid", { name: "Repertoire board" });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await page.locator(".opening-builder-note textarea").fill("Free the bishop and take space.");
  await page.reload();
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  await expect(page.getByText("Recovered draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Repertoire name", exact: true })).toHaveValue("Recovered preparation");
  await page.getByRole("button", { name: "Continue building", exact: true }).click();
  board = page.getByRole("grid", { name: "Repertoire board" });
  await expect(board.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
  await expect(page.locator(".opening-builder-note textarea")).toHaveValue("Free the bishop and take space.");
  const before = await (await page.request.get("/api/v1/openings/catalog")).json();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(page.getByRole("button", { name: "Start building", exact: true })).toBeDisabled();
  await expect(page.getByRole("textbox", { name: "Repertoire name", exact: true })).toBeEnabled();
  expect(await (await page.request.get("/api/v1/openings/catalog")).json()).toEqual(before);
});

test("restores an unsaved branch and returns from practice to the same browsing position", async ({ page }, testInfo) => {
  const id = await openNavigationStudy(page, `Stable workspace ${testInfo.project.name}`, "1. e4 e5 2. Nf3 *");
  const tools = page.locator(".opening-workspace-tools");
  await expect(tools).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "End", exact: true }).click();
  const originalHash = await page.evaluate(() => location.hash);
  await page.getByRole("button", { name: "Edit lines", exact: true }).click();
  await page.getByLabel("Save each move automatically").uncheck();
  let board = page.getByRole("grid", { name: "Chess position" });
  await board.getByRole("gridcell", { name: "b8 black knight" }).click();
  await board.getByRole("gridcell", { name: "c6 empty" }).click();
  await page.getByLabel("What is the idea behind Nc6?", { exact: false }).fill("Defend the central pawn.");
  await page.reload();
  await page.getByRole("button", { name: "Restore draft", exact: true }).click();
  await expect(page.getByLabel("What is the idea behind Nc6?", { exact: false })).toHaveValue("Defend the central pawn.");
  await page.getByRole("button", { name: "Choose another", exact: true }).click();
  await page.getByRole("button", { name: "Finish editing", exact: true }).click();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Practise this line", exact: true }).click();
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  board = page.locator(".opening-review").getByRole("grid", { name: "Chess position" });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(board).toHaveClass(/interactive/);
  await board.getByRole("gridcell", { name: "g1 white knight" }).click();
  await board.getByRole("gridcell", { name: "f3 empty" }).click();
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to this repertoire", exact: true }).click();
  expect(await page.evaluate(() => location.hash)).toBe(originalHash);
  await expect(page.getByRole("grid", { name: "Chess position" }).getByRole("gridcell", { name: "f3 white knight" })).toBeVisible();
  await expect(page.locator(".opening-line-board piece.anim")).toHaveCount(0);
  expect((await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json()).chapters[0].lines[0].moveCount).toBe(3);
  await page.screenshot({ path: testInfo.outputPath("board-first-workspace.png"), fullPage: true });
});

test("shows a retry when the next-line context cannot load", async ({ page }) => {
  let offline = true;
  await page.route(/\/api\/v1\/openings\/repertoires\/[^/?]+$/, route => offline
    ? route.fulfill({ status: 503, json: { error: "Line list offline" } }) : route.continue());
  const board = await startPractice(page);
  for (const [step, from, to] of [[1, "e2 white pawn", "e4 empty"], [2, "g1 white knight", "f3 empty"], [3, "f1 white bishop", "c4 empty"]] as const) {
    await expect(page.getByText(`Step ${step} of 3`)).toBeVisible();
    await expect(board).toHaveClass(/interactive/);
    await board.getByRole("gridcell", { name: from }).click();
    await board.getByRole("gridcell", { name: to }).click();
  }
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Could not load the line list");
  offline = false;
  await page.getByRole("button", { name: "Retry line list", exact: true }).click();
  await expect(page.getByText(/You have reached the last enabled line/)).toBeVisible();
});

test("links a pasted-game miss to its source game only after the answer", async ({ page }, testInfo) => {
  const name = `Game loop ${testInfo.project.name}`;
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "${name}"]\n[Result "*"]\n\n1. d4 d5 2. c4 *`, learnerColor: "white", name, ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const opponent = `Loop opponent ${testInfo.project.name}`;
  const player = `Loop learner ${testInfo.project.name}`;
  // Game deduplication intentionally ignores headers. Give each browser its own moves too.
  const missedMove = testInfo.project.name === "webkit" ? "a3" : "h3";
  const game = await page.request.post("/api/v1/imports/pgn", { data: {
    pgn: `[Event "${name}"]\n[White "${player}"]\n[Black "${opponent}"]\n[Result "*"]\n\n1. d4 d5 2. ${missedMove} *`,
    playerName: player,
  } });
  expect(game.ok()).toBeTruthy();
  const profiles = await (await page.request.get("/api/v1/profiles")).json();
  const profileId = profiles.profiles.find((profile: { displayName: string }) => profile.displayName === player).id;
  expect((await page.request.post(`/api/v1/profiles/${profileId}/activate`)).ok()).toBeTruthy();
  const games = await (await page.request.get("/api/v1/games")).json();
  const gameId = games.games.find((item: { black: string }) => item.black === opponent).id;
  const started = await page.request.post(`/api/v1/games/${gameId}/opening/practice`);
  expect(started.ok()).toBeTruthy();
  const practice = await started.json();
  await page.goto("/#openings");
  const board = page.getByRole("grid", { name: "Chess position" });
  await expect(page.getByRole("button", { name: "Why this exercise?", exact: true })).toBeHidden();
  await expect(board).toHaveClass(/interactive/);
  await board.getByRole("gridcell", { name: "c2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "c4 empty" }).click();
  await page.getByRole("button", { name: "Why this exercise?", exact: true }).click();
  const evidence = page.getByRole("region", { name: "Why this exercise", exact: true });
  await expect(evidence.getByText(`Move 2: you played ${missedMove}; your preparation was c4.`, { exact: true })).toBeVisible();
  await expect(evidence.getByText(/not necessarily a chess blunder/)).toBeVisible();
  await evidence.getByRole("button", { name: "Review this game", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#games\\?game=${gameId}$`));
  await expect(page.locator(".game-chip.active")).toContainText(opponent);
  await page.screenshot({ path: testInfo.outputPath("game-to-practice-review.png"), fullPage: true });
  // Finish the paused one-position session so the next browser fixture starts without it.
  expect((await page.request.post(`/api/v1/openings/reviews/${practice.sessionId}/continue`, {
    data: { queueEntryId: practice.queueEntryId },
  })).ok()).toBeTruthy();
});


test("builds a Black response to a different first move in the same repertoire", async ({ page }, testInfo) => {
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "Modern roots ${testInfo.project.name}"]\n\n1. e4 g6 2. d4 Bg7 *`, learnerColor: "black", name: `Modern roots ${testInfo.project.name}`,
    sourceType: "self_authored", sourceTitle: "My board", ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const repertoireId = (await imported.json()).repertoireIds[0];
  const original = (await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json()).chapters[0].lines[0];
  await page.goto(`/#openings?repertoire=${encodeURIComponent(repertoireId)}&line=${encodeURIComponent(original.id)}&ply=0`);
  await page.getByRole("button", { name: "Edit lines", exact: true }).click();
  const board = page.getByRole("grid", { name: "Chess position" });
  await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "d4 empty" }).click();
  await expect(page.getByText("d4 was saved as a new branch; the original line is unchanged.", { exact: true })).toBeVisible();
  await board.getByRole("gridcell", { name: "g7 black pawn" }).click();
  await board.getByRole("gridcell", { name: "g6 empty" }).click();
  await expect(page.getByText("g6 was added to the end of this line.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "g6 black pawn" })).toBeVisible();
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  expect(detail.chapters[0].lines).toHaveLength(2);
  expect(detail.chapters[0].lines.find((line: { id: string }) => line.id === original.id).moves).toEqual(original.moves);
  expect(detail.chapters[0].lines.find((line: { title: string }) => line.title === "1.d4").moves
    .map((move: { moveUci: string }) => move.moveUci)).toEqual(["d2d4", "g7g6"]);
});

test("tracks the daily goal, streak and activity without inflating unaided recall", async ({ page }, testInfo) => {
  const player = `Daily learner ${testInfo.project.name}`;
  expect((await page.request.post("/api/v1/imports/pgn", { data: {
    pgn: `[White "${player}"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 e5 *`, playerName: player,
  } })).ok()).toBeTruthy();
  const profiles = await (await page.request.get("/api/v1/profiles")).json();
  const profile = profiles.profiles.find((item: { displayName: string }) => item.displayName === player);
  expect((await page.request.post(`/api/v1/profiles/${profile.id}/activate`)).ok()).toBeTruthy();
  expect((await page.request.patch("/api/v1/openings/preferences", { data: {
    ratingGroup: 1600, platform: "not_sure", useExplorer: false, dailyPracticeGoal: 1, practiceTimeZone: "Europe/London",
  } })).ok()).toBeTruthy();
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "Daily practice ${testInfo.project.name}"]\n\n1. e4 e5 *`, learnerColor: "white", ownershipConfirmed: true,
  } });
  const repertoireId = (await imported.json()).repertoireIds[0];
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  const started = await page.request.post(`/api/v1/openings/repertoires/${repertoireId}/lines/${detail.chapters[0].lines[0].id}/reviews/start`);
  const exercise = await started.json();
  await page.goto("/#openings");
  const resume = page.getByRole("button", { name: "Resume opening practice" });
  if (await resume.isVisible()) await resume.click();
  await page.getByRole("button", { name: "Hint: show the piece", exact: true }).click();
  const board = page.getByRole("grid", { name: "Chess position" });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Practice complete", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to this repertoire", exact: true }).click();
  await page.getByRole("button", { name: "Back to repertoires", exact: true }).click();
  const activity = page.getByRole("region", { name: "Daily opening practice", exact: true });
  await expect(activity).toContainText("Daily goal reached");
  await expect(activity).toContainText("1 / 1 positions · 1-day streak");
  await expect(activity).toContainText("0 recalled without help today");
  await expect(activity.getByRole("progressbar", { name: "Daily practice goal", exact: true })).toHaveAttribute("value", "1");
  await expect(activity.getByLabel("Practice over the last seven days")).toBeVisible();
  await page.reload();
  await expect(activity).toContainText("Daily goal reached");
  await page.screenshot({ path: testInfo.outputPath("daily-practice-tracker.png"), fullPage: true });
  const before = await (await page.request.get("/api/v1/openings/preferences")).json();
  expect((await page.request.patch("/api/v1/openings/preferences", { data: {
    ratingGroup: 1600, platform: "not_sure", useExplorer: false, dailyPracticeGoal: 0,
  } })).status()).toBe(400);
  expect(await (await page.request.get("/api/v1/openings/preferences")).json()).toEqual(before);
  expect((await page.request.get("/api/v1/openings/reviews/recommended")).ok()).toBeTruthy();
  expect(exercise.kind).toBe("exercise");
});

test("draws our strongest move and the three most frequent opponent replies while building", async ({ page }, testInfo) => {
  await page.route("**/api/v1/openings/reviews/active", route => route.fulfill({ json: null }));
  await page.route("**/api/v1/openings/lessons/active", route => route.fulfill({ json: null }));
  await page.route("**/api/v1/openings/preferences", async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), useExplorer: true, explorerAvailable: true, ratingGroup: 1600 } });
  });
  await page.route("**/api/v1/openings/analysis", async route => {
    const { fen, moveUcis = [] } = route.request().postDataJSON();
    const ownTurn = fen.split(" ")[1] === "w";
    const best = ownTurn ? "e2e4" : "d7d5";
    await route.fulfill({ json: { fen, depth: 14, lines: [
      { rank: 1, moveUci: best, moveSan: ownTurn ? "e4" : "d5", pvSan: [], score: { kind: "centipawns", value: 20, perspective: "side_to_move" } },
      ...moveUcis.filter((uci: string) => uci !== best).map((uci: string) => ({ rank: 100, moveUci: uci, moveSan: uci === "e7e6" ? "e6" : uci === "c7c5" ? "c5" : "e5", pvSan: [], score: { kind: "centipawns", value: -60, perspective: "side_to_move" } })),
    ] } });
  });
  await page.route("**/api/v1/openings/explorer?*", async route => {
    const url = new URL(route.request().url()); const fen = url.searchParams.get("fen");
    await route.fulfill({ json: { fen, ratingGroup: 1600, speeds: ["blitz", "rapid", "classical"], totalGames: 1000, cached: false, stale: false, fetchedAt: new Date().toISOString(), opening: null,
      replies: fen?.split(" ")[1] === "b" ? [["e7e6", "e6", 150], ["c7c5", "c5", 500], ["e7e5", "e5", 250], ["d7d5", "d5", 100]].map(([uci, san, games]) => ({ moveUci: uci, moveSan: san, games, frequencyPercent: Number(games) / 10, whiteWins: games, draws: 0, blackWins: 0 })) : [] } });
  });
  await page.goto("/#openings");
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  await page.getByLabel("Repertoire name", { exact: true }).fill(`Board guidance ${testInfo.project.name}`);
  await page.getByRole("button", { name: "Start building", exact: true }).click();
  const guide = page.getByRole("region", { name: "Board move suggestions" });
  await expect(guide).toContainText("Green arrow: engine's leading move");
  const choices = page.getByRole("region", { name: "Moves to consider", exact: true });
  await expect(choices).toHaveCount(1);
  await expect(choices.getByLabel("Position evaluation", { exact: true })).toContainText("Position: +0.20");
  await expect(choices.getByLabel("Evaluation for e4", { exact: true })).toHaveText("+0.20");
  await expect(page.locator(".cg-shapes line[stroke='#15781B']")).toHaveCount(1);
  const initialBoard = page.getByRole("grid", { name: "Repertoire board" });
  await initialBoard.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await initialBoard.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(guide).toContainText("Blue arrows: up to three most frequent replies");
  await expect(choices.getByText("Opponent replies by frequency", { exact: true })).toHaveCount(1);
  await expect(choices.locator(".opening-suggestion-list button > span:first-child > strong")).toHaveText(["c5", "e5", "e6", "d5"]);
  await expect(choices.getByLabel("Position evaluation", { exact: true })).toContainText("Position: -0.20");
  await expect(choices.getByLabel("Evaluation for e6", { exact: true })).toHaveText("+0.60");
  await expect(page.locator(".cg-shapes line[stroke='#003088']")).toHaveCount(3);
  await guide.getByRole("button", { name: "Hide suggestion arrows", exact: true }).click();
  await expect(page.locator(".cg-shapes line")).toHaveCount(0);
  await guide.getByRole("button", { name: "Show suggestion arrows", exact: true }).click();
  await expect(page.locator(".cg-shapes line[stroke='#003088']")).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath("opponent-frequency-arrows.png"), fullPage: true });
  await page.getByRole("button", { name: "Finish editing", exact: true }).click();
  await expect(guide).toBeHidden();
  await expect(page.locator(".cg-shapes line")).toHaveCount(0);
});

test("shows game-based preparation recommendations even with Lichess frequencies off", async ({ page }, testInfo) => {
  const player = `Game coverage learner ${testInfo.project.name}`;
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "Personal coverage ${testInfo.project.name}"]\n\n1. e4 g6 *`, learnerColor: "black", ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  expect((await page.request.post("/api/v1/imports/pgn", { data: {
    pgn: `[White "Opponent"]\n[Black "${player}"]\n[Result "*"]\n\n${testInfo.project.name === "webkit" ? "1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 4. e3 O-O 5. Bd3 d5" : "1. d4 d5 2. c4 e6 3. Nc3 Bb4 4. a3 Bxc3+ 5. bxc3 Ne7"} *`, playerName: player,
  } })).ok()).toBeTruthy();
  const profiles = await (await page.request.get("/api/v1/profiles")).json();
  const profile = profiles.profiles.find((item: { displayName: string }) => item.displayName === player);
  await page.request.post(`/api/v1/profiles/${profile.id}/activate`);
  await page.request.patch("/api/v1/openings/preferences", { data: { ratingGroup: 1600, platform: "lichess", useExplorer: false } });
  await page.route("**/api/v1/openings/reviews/active", route => route.fulfill({ json: null }));
  await page.route("**/api/v1/openings/lessons/active", route => route.fulfill({ json: null }));
  await page.goto("/#openings");
  await expect(page.getByRole("heading", { name: "Recommended next steps", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Consider d4/ })).toBeEnabled();
  await expect(page.getByRole("region", { name: "Lichess recommendation setup", exact: true })).toContainText("Your games still provide preparation recommendations");
  await page.getByRole("button", { name: /Consider d4/ }).click();
  const board = page.getByRole("grid", { name: "Chess position" });
  await expect(board.getByRole("gridcell", { name: "d4 white pawn" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Finish editing", exact: true })).toBeVisible();
});

test("explains large preparation lists as distinct tasks and keeps estimates optional", async ({ page }, testInfo) => {
  await page.route("**/api/v1/openings/repertoires/*/coverage?*", async route => {
    const response = await route.fetch();
    const actual = await response.json();
    const base = actual.gaps[0];
    expect(base).toBeTruthy();
    await route.fulfill({ json: { ...actual,
      personal: { ...actual.personal, replyOccurrences: 100, preparedReplyOccurrences: 84, preparedPercent: 84 },
      model: { ...actual.model, preparedPercent: .1, missingPercent: 99.7, unknownPercent: .2 },
      gaps: Array.from({ length: 558 }, (_, i) => ({ ...base, positionId: `${base.positionId}-fixture-${i}`,
        status: i === 1 ? "missing_response" : i === 2 ? "idea_only" : "needs_practice",
        recallAttempts: 0, recallPercent: null,
        ...(i === 1 || i === 2 ? { responseLineId: null, responseMoveId: null } : {}),
      })),
    } });
  });
  await openNavigationStudy(page, `Plain coverage ${testInfo.project.name}`, "1. e4 e5 2. Nf3 Nc6 3. Bc4 *");
  await page.getByRole("button", { name: "Find repertoire gaps", exact: true }).click();
  await page.getByRole("button", { name: /^(Check|Recheck) coverage$/ }).click();
  const panel = page.getByRole("region", { name: "Repertoire coverage and gaps", exact: true });
  await expect(panel.getByRole("heading", { name: "What should I work on?", exact: true })).toBeVisible();
  const counts = panel.getByLabel("Types of next steps", { exact: true });
  await expect(counts).toContainText("556 saved responses to practise");
  await expect(counts).toContainText("1 opponent reply without a saved answer");
  await expect(counts).toContainText("1 idea to review");
  await expect(panel.locator(".opening-coverage-tasks article")).toHaveCount(3);
  await expect(panel.getByText("Your answer is already saved. It has not been tested in practice yet.", { exact: true })).toBeVisible();
  await expect(panel.getByText("This opponent reply has no saved answer. Open the position and choose what you would play.", { exact: true })).toBeVisible();
  await expect(panel.getByText("You saved an idea, but no response move. Check whether you want to add one.", { exact: true })).toBeVisible();
  await expect(panel.getByText(/of the estimated sequences reach/)).toBeHidden();
  await expect(panel.getByText(/558 improvements/)).toHaveCount(0);
  await expect(panel.getByRole("spinbutton", { name: "Prepare through my move", exact: true })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("plain-coverage-next-steps.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await panel.getByRole("button", { name: "See all 558 practice and preparation tasks", exact: true }).click();
  await expect(panel.locator(".opening-coverage-tasks article")).toHaveCount(558);
  await panel.getByRole("button", { name: "Show just three tasks", exact: true }).click();
  await expect(panel.locator(".opening-coverage-tasks article")).toHaveCount(3);
  await panel.getByText("Detailed estimates and practice history", { exact: true }).click();
  await expect(panel.getByText(/of the estimated sequences reach/)).toBeVisible();
  await expect(panel.getByText(/This is not the percentage of moves you know/)).toBeVisible();
});

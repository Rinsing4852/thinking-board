import { expect, test } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:8192" });

async function startPractice(page: import("@playwright/test").Page) {
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: '[Event "Quality practice"]\n[Result "*"]\n\n1. e4 {Claim central space and free the bishop. [%csl Ge4] [%cal Bf1c4]} e5 2. Nf3 {Develop the knight and attack the central pawn.} Nc6 3. Bc4 *',
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
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  return page.getByRole("grid", { name: "Chess position" });
}

test("keeps manual pauses independent and resumes automatically", async ({ page }) => {
  const board = await startPractice(page);
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await page.getByRole("button", { name: "Keep this open" }).click();
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  await page.getByRole("button", { name: "Close explanation and resume", exact: true }).click();
  await page.waitForTimeout(1000); // Deliberately exceed the auto-advance delay.
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByText("Auto-advance paused")).toBeVisible();
  await page.getByRole("button", { name: "Resume automatic practice" }).click();
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
  await expect(page.locator(".board-annotations")).toHaveCount(0);
  await page.getByRole("button", { name: "Explain last move", exact: true }).click();
  const explanation = page.getByRole("region", { name: "Requested move explanation" });
  await expect(explanation.getByRole("heading", { name: "Why 1. e4?", exact: true })).toBeVisible();
  await expect(explanation.getByText("Claim central space and free the bishop.", { exact: true })).toBeVisible();
  await expect(page.getByText("Develop the knight and attack the central pawn.", { exact: true })).toBeHidden();
  await expect(board).not.toHaveClass(/interactive/);
  await expect(page.locator(".board-annotations circle.annotation-green")).toHaveCount(1);
  await expect(page.locator(".board-annotations line.annotation-blue")).toHaveCount(1);
  // The requested explanation brings back e4's board, not the next question's board.
  await expect(board.getByRole("gridcell", { name: "e7 black pawn" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
  await explanation.getByRole("button", { name: /Add comment|Edit comment/ }).click();
  const note = `Keep the centre in mind — ${testInfo.project.name}.`;
  await explanation.getByLabel("Your learning comment", { exact: true }).fill(note);
  const close = page.getByRole("button", { name: "Close explanation and resume", exact: true });
  await expect(close).toBeDisabled();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeDisabled();
  const saved = page.waitForResponse(response => response.url().endsWith(`/moves/${first.repertoireMove.moveId}/comment`) && response.request().method() === "PATCH");
  await explanation.getByRole("button", { name: "Save comment", exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(explanation.getByText(note, { exact: true })).toBeVisible();
  await expect(close).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath("requested-line-explanation.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await close.click();
  await expect(board).toHaveClass(/interactive/);
  await expect(page.locator(".board-annotations")).toHaveCount(0);
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
  await expect(page.locator(".board-annotations")).toHaveCount(0);
  await page.getByRole("button", { name: "Show source arrows and highlights", exact: true }).click();
  await expect(page.locator(".board-annotations circle.annotation-green")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "Go to move 1: e4", exact: true })).toHaveAttribute("aria-current", "step");
  await expect(page.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
  await expect(page.locator(".board-annotations")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("restored-line-browser.png"), fullPage: true });
});

test("keeps a wrong move in place without revealing its answer or explanation", async ({ page }) => {
  const board = await startPractice(page);
  await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "d4 empty" }).click();
  await expect(page.getByText("Try again", { exact: true })).toBeVisible();
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).not.toHaveClass(/answer-highlight/);
  await expect(page.getByText("Claim central space and free the bishop.", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Explain last move", exact: true })).toBeDisabled();
  await expect(board).toHaveClass(/interactive/);
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Step 2 of 4")).toBeVisible();
});

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
  if (testInfo.project.name === "webkit") {
    const help = await page.getByRole("button", { name: "Move highlighted — play it" }).boundingBox();
    expect(help).not.toBeNull();
    expect(help!.y + help!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  }
  await page.screenshot({ path: testInfo.outputPath("practice-help.png"), fullPage: true });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await expect(page.getByText("Learning", { exact: true })).toBeVisible();
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
    const result = { repertoireId: url.pathname.split("/")[5], ratingGroup, speeds: ["blitz", "rapid", "classical"],
      positionsChecked: 1, positionsAvailable: 1, coveragePercent: ratingGroup === 2000 ? 20 : 80,
      coveredGames: 200, totalGames: 1000, gaps: [], incomplete: false, message: "Test coverage sample." };
    if (manual && ratingGroup !== 2000) {
      delayedStarted(); await released;
      try { await route.fulfill({ json: result }); } catch { /* An aborted browser request may already be gone. */ }
      delayedFinished();
    } else await route.fulfill({ json: result });
  });
  await openNavigationStudy(page, `Coverage navigation ${testInfo.project.name}`, "1. e4 e5 2. Nf3 Nc6 3. Bb5 *");
  manual = true;
  await page.getByText("Coverage and repertoire settings", { exact: true }).click();
  await page.getByRole("button", { name: /^(Check|Refresh) coverage$/ }).click();
  await started;
  const failed = page.waitForEvent("requestfailed", { predicate: request => request.url().includes("/coverage?rating=") && !request.url().endsWith("rating=2000") });
  await page.getByRole("combobox", { name: "Explorer rating", exact: true }).selectOption("2000");
  await page.getByRole("button", { name: "Check coverage", exact: true }).click();
  await expect(page.getByRole("heading", { name: "20% of replies covered", exact: true })).toBeVisible();
  releaseDelayed(); await finished;
  await failed;
  await expect(page.getByRole("heading", { name: "20% of replies covered", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "80% of replies covered", exact: true })).toBeHidden();
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
  await expect(page.getByRole("grid", { name: "Repertoire board" })).toBeVisible();
});

test("recovers an unfinished board draft after refresh without changing saved repertoires", async ({ page }) => {
  await page.goto("/#openings");
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  await page.getByRole("textbox", { name: "Repertoire name", exact: true }).fill("Recovered preparation");
  let board = page.getByRole("grid", { name: "Repertoire board" });
  await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
  await board.getByRole("gridcell", { name: "e4 empty" }).click();
  await page.locator(".opening-builder-note textarea").fill("Free the bishop and take space.");
  await page.reload();
  await page.getByRole("button", { name: "Build on the board", exact: true }).click();
  await expect(page.getByText("Recovered draft", { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Repertoire name", exact: true })).toHaveValue("Recovered preparation");
  board = page.getByRole("grid", { name: "Repertoire board" });
  await expect(board.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
  await expect(page.locator(".opening-builder-note textarea")).toHaveValue("Free the bishop and take space.");
  const before = await (await page.request.get("/api/v1/openings/catalog")).json();
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Discard draft", exact: true }).click();
  await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).toBeVisible();
  expect(await (await page.request.get("/api/v1/openings/catalog")).json()).toEqual(before);
});

test("restores an unsaved branch and returns from practice to the same browsing position", async ({ page }, testInfo) => {
  const id = await openNavigationStudy(page, `Stable workspace ${testInfo.project.name}`, "1. e4 e5 2. Nf3 *");
  const tools = page.locator(".opening-workspace-tools");
  await expect(tools).not.toHaveAttribute("open");
  await page.getByRole("button", { name: "End", exact: true }).click();
  const originalHash = await page.evaluate(() => location.hash);
  await page.getByRole("button", { name: "Edit lines", exact: true }).click();
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
  await expect(page.locator(".opening-line-board .moving-piece")).toHaveCount(0);
  expect((await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json()).chapters[0].lines[0].moveCount).toBe(3);
  await page.screenshot({ path: testInfo.outputPath("board-first-workspace.png"), fullPage: true });
});

test("shows a retry when the next-line context cannot load", async ({ page }) => {
  let offline = true;
  await page.route(/\/api\/v1\/openings\/repertoires\/[^/?]+$/, route => offline
    ? route.fulfill({ status: 503, json: { error: "Line list offline" } }) : route.continue());
  const board = await startPractice(page);
  for (const [from, to] of [["e2 white pawn", "e4 empty"], ["g1 white knight", "f3 empty"], ["f1 white bishop", "c4 empty"]]) {
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

import { expect, test } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:8192" });

async function startPractice(page: import("@playwright/test").Page) {
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: '[Event "Quality practice"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *',
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
  await page.getByText("See the full explanation", { exact: true }).click();
  await page.getByText("See the full explanation", { exact: true }).click();
  await page.waitForTimeout(1000); // Deliberately exceed the auto-advance delay.
  await expect(page.getByText("Step 1 of 3")).toBeVisible();
  await expect(page.getByText("Auto-advance paused")).toBeVisible();
  await page.getByRole("button", { name: "Resume automatic practice" }).click();
  await expect(page.getByText("Step 2 of 3")).toBeVisible();
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
  await page.getByText("See the full explanation", { exact: true }).click();
  await expect(page.getByText(note, { exact: false })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("preparation-idea-in-practice.png"), fullPage: true });
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

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

import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // These home-screen checks must not resume sessions left by other serial journeys.
  await page.route("**/api/v1/openings/reviews/active", route => route.fulfill({ json: null }));
  await page.route("**/api/v1/training/session/active", route => route.fulfill({ json: null }));
});

test("keeps navigation history, keyboard access and first-run actions clear", async ({ page }, testInfo) => {
  const dashboard = await (await page.request.get("/api/v1/dashboard")).json();
  await page.route("**/api/v1/dashboard", route => route.fulfill({ json: { ...dashboard,
    totals: { ...dashboard.totals, games: 0, trainingItems: 0, attempts: 0, gameAttempts: 0, due: 0 },
    recurringProblems: [], recommendedSession: [],
  } }));
  await page.goto("/#today");
  await expect(page.getByRole("button", { name: "Start a 15-exercise session" })).toBeHidden();
  expect(await page.locator(".mode-tabs").evaluate(element => getComputedStyle(element).position)).toBe("static");
  await page.getByRole("button", { name: "Openings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Openings", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(page.getByRole("button", { name: "Openings", exact: true })).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: "Skip to main content" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page).toHaveURL(/#openings$/);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await expect(page.getByRole("button", { name: "Import a game to begin" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("progress-first-run.png"), fullPage: true });
  await page.getByRole("button", { name: "Import a game to begin" }).click();
  await expect(page).toHaveURL(/#games$/);
});

test("puts pasted games before optional sync and invalidates stale previews", async ({ page }, testInfo) => {
  await page.goto("/#games");
  const input = page.getByLabel("PGN text");
  await expect(input).toBeVisible();
  const sync = page.locator("details.lichess-sync-card");
  await expect(sync).not.toHaveAttribute("open");
  const fieldBox = await input.boundingBox();
  const syncBox = await sync.boundingBox();
  expect(fieldBox!.y).toBeLessThan(syncBox!.y);
  if (testInfo.project.name === "webkit") expect(await input.evaluate(element => getComputedStyle(element).fontSize)).toBe("16px");
  await input.fill('[White "UI learner"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 e5 *');
  await page.getByRole("button", { name: "Check PGN", exact: true }).click();
  await expect(page.getByLabel("I am")).toBeVisible();
  await input.fill('[White "Different learner"]\n[Black "Opponent"]\n[Result "*"]\n\n1. d4 d5 *');
  await expect(page.getByLabel("I am")).toBeHidden();
  await expect(page.getByRole("button", { name: "Import & analyse" })).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("paste-first-games.png"), fullPage: true });
  await sync.locator("summary").click();
  await expect(page.getByLabel("Lichess username")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("exposes first-load failures and retry in every thinking drill", async ({ page }) => {
  let fail = true;
  await page.route(/\/api\/v1\/training\/(?:what-changed\/|candidates\/|punish\/|quiet\/)?next$/, route =>
    fail ? route.fulfill({ status: 503, json: { error: "Exercise temporarily unavailable" } }) : route.continue());
  for (const mode of ["1 · What changed", "2 · Candidates", "3 · Blunder check", "4 · Punish", "5 · Quiet plan"]) {
    fail = true;
    await page.goto("/#today");
    await page.getByRole("button", { name: mode, exact: true }).click();
    await expect(page.locator(".exercise-load-state").getByRole("alert")).toHaveText("Exercise temporarily unavailable");
    fail = false;
    await page.getByRole("button", { name: "Retry exercise", exact: true }).click();
    await expect(page.locator(".exercise-load-state")).toBeHidden();
  }
});

test("shows recoverable progress and game-list failures instead of blank screens", async ({ page }) => {
  let fail = true;
  await page.route("**/api/v1/dashboard", route => fail
    ? route.fulfill({ status: 503, json: { error: "Progress temporarily unavailable" } }) : route.continue());
  await page.goto("/#progress");
  await expect(page.getByRole("alert")).toHaveText("Progress temporarily unavailable");
  fail = false;
  await page.getByRole("button", { name: "Retry progress", exact: true }).click();
  await expect(page.getByRole("alert")).toBeHidden();
  fail = true;
  await page.route("**/api/v1/games", route => fail
    ? route.fulfill({ status: 503, json: { error: "Games temporarily unavailable" } }) : route.fulfill({ json: { games: [] } }));
  await page.getByRole("button", { name: "My games", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Games temporarily unavailable");
  fail = false;
  await page.getByRole("button", { name: "Retry game review", exact: true }).click();
  await expect(page.getByText(/No games imported yet/)).toBeVisible();
});

test("searches the whole game library and ignores an obsolete review response", async ({ page }) => {
  const games = Array.from({ length: 20 }, (_, index) => ({ id: `ui-game-${index}`, white: "UI learner",
    black: `Opponent ${index}`, result: "*", playerColor: "white", playedAt: null, analyzedAt: null }));
  await page.route("**/api/v1/games", route => route.fulfill({ json: { games } }));
  let release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  let staleHandled: (() => void) | undefined;
  const handled = new Promise<void>(resolve => { staleHandled = resolve; });
  await page.route(/\/api\/v1\/games\/ui-game-\d+\/review$/, async route => {
    const id = route.request().url().split("/").at(-2);
    if (id === "ui-game-1") await held;
    const game = games.find(game => game.id === id);
    await route.fulfill({ json: { game: id === "ui-game-1" ? { ...game, analyzedAt: "2026-10-06" } : game,
      opening: null, mistakes: [] } }).catch(() => undefined);
    if (id === "ui-game-1") staleHandled!();
  });
  await page.goto("/#games");
  const library = page.locator(".game-chips");
  await expect(library.locator("button")).toHaveCount(8);
  const search = page.getByLabel("Find a game");
  await search.fill("Opponent 19");
  await library.getByRole("button", { name: /UI learner – Opponent 19/ }).click();
  await expect(page).toHaveURL(/#games\?game=ui-game-19$/);
  await expect(library.locator(".active")).toContainText("Opponent 19");
  await search.fill("");
  await expect(library.locator("button")).toHaveCount(9);
  const pending = page.waitForRequest(/\/games\/ui-game-1\/review$/);
  await library.getByRole("button", { name: /UI learner – Opponent 1 / }).click();
  await pending;
  await library.getByRole("button", { name: /UI learner – Opponent 2 / }).click();
  await expect(library.locator(".active")).toContainText("Opponent 2");
  await expect(page.getByText("Opening comparison ready", { exact: true })).toBeVisible();
  release!();
  await handled;
  // WebKit does not reliably emit requestfailed for a cancelled intercepted fetch.
  // Check the visible outcome after releasing the obsolete response instead.
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page).toHaveURL(/#games\?game=ui-game-2$/);
  await expect(page.getByText("Opening comparison ready", { exact: true })).toBeVisible();
  await expect(library.locator(".active")).toContainText("Opponent 2");
  await expect(page.getByText("No major engine mistakes found", { exact: true })).toBeHidden();
});

test("reports a successful import separately from a failed catalogue refresh", async ({ page }, testInfo) => {
  let refreshFails = false;
  await page.route("**/api/v1/openings/catalog", route => refreshFails
    ? route.fulfill({ status: 503, json: { error: "Catalogue unavailable" } }) : route.continue());
  await page.goto("/#openings");
  await page.getByRole("button", { name: "Import repertoire lines", exact: true }).click();
  const importer = page.locator(".opening-importer");
  await importer.getByLabel("Repertoire name").fill(`UI import ${testInfo.project.name}`);
  const line = testInfo.project.name === "webkit" ? "1. d4 d5 2. c4" : "1. e4 e5 2. Nf3";
  await importer.getByLabel("Opening PGN", { exact: true }).fill(`[Event "UI import"]\n[Result "*"]\n\n${line} *`);
  await importer.getByRole("button", { name: "Preview import", exact: true }).click();
  await importer.getByRole("checkbox").check();
  refreshFails = true;
  await importer.getByRole("button", { name: "Import private repertoire", exact: true }).click();
  await expect(importer.getByRole("alert")).toContainText("was imported, but the list could not refresh");
  await expect(importer.getByLabel("Opening PGN", { exact: true })).toHaveValue("");
  await expect(importer.getByRole("button", { name: "Import private repertoire", exact: true })).toBeHidden();
  const catalogue = await (await page.request.get("/api/v1/openings/catalog")).json();
  expect(catalogue.repertoires.some((item: { name: string }) => item.name === `UI import ${testInfo.project.name}`)).toBe(true);
});

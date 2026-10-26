import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:8192" });

async function saveGame(page: import("@playwright/test").Page, learner: string, ageHours: number) {
  const date = new Date(Date.now() - ageHours * 3_600_000).toISOString();
  const response = await page.request.post("/api/v1/imports/pgn", { data: {
    playerName: learner,
    pgn: `[White "${learner}"]\n[Black "Opponent ${ageHours}"]\n[UTCDate "${date.slice(0, 10).replaceAll("-", ".")}"]\n[UTCTime "${date.slice(11, 19)}"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`,
  } });
  expect(response.ok()).toBeTruthy();
  const saved = await response.json();
  await page.request.post(`/api/v1/profiles/${saved.profileId}/activate`);
}

async function analyse(page: import("@playwright/test").Page) {
  const response = await page.request.post("/api/v1/games/analysis", { data: { all: true } });
  const job = await response.json();
  await expect.poll(async () => (await (await page.request.get(`/api/v1/jobs/${job.id}`)).json()).status, { timeout: 20_000 }).toBe("completed");
}

test("reduces remaining practice, resumes its game filter and completes without repeating future reviews", async ({ page }, info) => {
  const learner = `Practice completion ${info.project.name}`;
  await saveGame(page, learner, 2); await saveGame(page, learner, 72); await analyse(page);
  await page.goto("/#today");
  const filter = page.getByRole("combobox", { name: "Practice games", exact: true });
  await filter.selectOption("1");
  const expected = await (await page.request.get("/api/v1/dashboard?gameDays=1")).json();
  const count: number = expected.practice.available;
  expect(count).toBeGreaterThan(0);
  await expect(page.getByText(`${count} exercises due now from games played in the last 1 day`, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: `Start practice · ${count} exercises`, exact: true }).click();
  const initial = await (await page.request.get("/api/v1/training/session/active")).json();
  expect(initial.gameDays).toBe(1);
  await expect(filter).toBeDisabled();
  const finished = new Set<string>();
  for (let index = 0; index < count; index++) {
    const current = await (await page.request.get("/api/v1/training/session/active")).json();
    expect(current.remainingCount).toBe(count - index);
    const item = current.currentItem;
    finished.add(item.itemId);
    const begin: Record<string, string> = {
      blunder_check: "Play my move on the board", candidate_generation: "Start generating candidates",
      punish_blunder: "Find the punishment", what_changed: "Show the opponent’s move", quiet_position: "Find an improving move",
    };
    const trainer = page.locator("#trainer");
    await trainer.getByRole("button", { name: begin[item.mode], exact: true }).click();
    await trainer.getByRole("button", { name: item.mode === "candidate_generation" ? "Show engine candidates" : "Show answer", exact: true }).click();
    await expect.poll(async () => (await (await page.request.get("/api/v1/dashboard?gameDays=1")).json()).practice.available).toBe(count - index - 1);
    await expect(page.locator(".session-progress")).toContainText(`${count - index - 1} remaining · ${index + 1} completed`);
    await expect(trainer.getByRole("button", { name: "Continue session", exact: true })).toBeVisible();
    await trainer.getByRole("button", { name: "Continue session", exact: true }).click();
    if (index === 0 && count > 1) {
      await page.reload();
      await expect(filter).toHaveValue("1"); await expect(filter).toBeDisabled();
      await expect(page.locator(".session-progress")).toContainText(`${count - 1} remaining · 1 completed`);
    }
  }
  await expect(page.getByRole("heading", { name: "Session complete", exact: true })).toBeVisible();
  expect(await (await page.request.get("/api/v1/training/session/active")).json()).toBeNull();
  // Late dashboard refreshes must leave the completion screen intact.
  await page.evaluate(() => window.dispatchEvent(new Event("training-completed")));
  await expect(page.getByRole("heading", { name: "Session complete", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Return to practice", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nothing due now", exact: true })).toBeDisabled();
  await expect(filter).toBeEnabled();
  await filter.selectOption("7");
  await page.getByRole("button", { name: /Start practice/ }).click();
  const next = await (await page.request.get("/api/v1/training/session/active")).json();
  expect(next.items.length).toBeGreaterThan(0);
  expect(next.items.every((item: { itemId: string }) => !finished.has(item.itemId))).toBe(true);
  await page.screenshot({ path: info.outputPath("remaining-practice.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("keeps a narrower game filter when an older exercise response arrives late", async ({ page }, info) => {
  await saveGame(page, `Practice filter race ${info.project.name}`, 72); await analyse(page);
  await page.goto("/#today");
  const filter = page.getByRole("combobox", { name: "Practice games", exact: true });
  await expect(filter).toBeEnabled();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let held = false;
  await page.route("**/api/v1/training/next", async route => {
    if (route.request().postDataJSON().gameDays === 7) {
      const response = await route.fetch(); held = true; await gate; await route.fulfill({ response });
    } else await route.continue();
  });
  try {
    await filter.selectOption("7"); await expect.poll(() => held).toBe(true);
    await expect(filter).toBeEnabled(); await filter.selectOption("1");
    await expect(page.getByRole("heading", { name: "No exercises for this game filter.", exact: true })).toBeVisible();
    const returned = page.waitForResponse(response => response.url().endsWith("/api/v1/training/next") && response.request().postDataJSON().gameDays === 7);
    release(); await returned;
    await expect(page.getByRole("button", { name: "Play my move on the board", exact: true })).toBeHidden();
    await expect(filter).toHaveValue("1");
    await expect(page.getByRole("button", { name: "Nothing due now", exact: true })).toBeDisabled();
  } finally { release(); }
  for (const path of ["session", "next", "what-changed/next", "candidates/next", "quiet/next", "punish/next"]) {
    expect((await page.request.post(`/api/v1/training/${path}`, { data: { gameDays: 3 } })).status()).toBe(400);
  }
  expect((await page.request.get("/api/v1/dashboard?gameDays=3")).status()).toBe(400);
});

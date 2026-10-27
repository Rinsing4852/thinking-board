import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { Chess } from "chess.js";

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

test("keeps a normal Ruy Lopez line out of tactical practice and explains a genuine mate", async ({ page }, info) => {
  const learner = `Tactical selection ${info.project.name}`;
  const saved = await (await page.request.post("/api/v1/imports/pgn", { data: { playerName: learner,
    pgn: `[White "${learner}"]\n[Black "Ruy opponent"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 *`,
  } })).json();
  await page.request.post(`/api/v1/profiles/${saved.profileId}/activate`);
  await analyse(page);
  expect((await (await page.request.post("/api/v1/training/punish/next", { data: { pool: "early" } })).json()).kind).toBe("empty");
  await page.goto("/#today");
  await page.locator(".thinking-mode-picker > summary").click();
  await page.getByRole("button", { name: "4 · Punish", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Punish a tactical mistake", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find the punishment", exact: true })).toBeHidden();
  await saveGame(page, learner, 2); await analyse(page); await page.reload();
  await page.locator(".thinking-mode-picker > summary").click();
  await page.getByRole("button", { name: "4 · Punish", exact: true }).click();
  await page.getByRole("button", { name: "Find the punishment", exact: true }).click();
  await page.getByRole("button", { name: "Show answer", exact: true }).click();
  const feedback = page.locator("#punish-blunder .feedback");
  await expect(feedback).toContainText("forced mate in 1");
  await expect(feedback).toContainText("Qh4#");
  await expect(feedback).not.toContainText("After Bb5");
  await page.screenshot({ path: info.outputPath("verified-tactical-feedback.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("plays a missed winning capture from the learner's side before the game move",async({page},info)=>{
  const board=new Chess();board.loadPgn(fs.readFileSync('scripts/fixtures/missed-queens.pgn','utf8'));
  const source=board.history({verbose:true}).find(move=>move.color==='b'&&move.san==='exd4')!;
  await page.route('**/api/v1/training/session/active',route=>route.fulfill({json:null}));
  await page.route('**/api/v1/training/next',route=>route.fulfill({json:{kind:'exercise',attemptId:null,itemId:'missed-queen',mode:'blunder_check',exerciseKind:'missed_opportunity',
    fenBefore:source.before,fenAfterCandidate:source.after,candidateMoveUci:'e5d4',candidateMoveSan:'exd4',playerColor:'black',moveNumber:28,prompt:'What winning capture did you miss?'}}));
  await page.route('**/api/v1/training/items/missed-queen/start',route=>route.fulfill({json:{attemptId:'missed-attempt'}}));
  await page.route('**/api/v1/training/attempts/missed-attempt/answer',async route=>{
    expect(route.request().postDataJSON()).toEqual({category:'capture',moveUci:'d7h3'});
    await route.fulfill({json:{outcome:'excellent',score:1,categoryCorrect:true,moveCorrect:true,playedMoveSan:'Qxh3',acceptableMoves:[{moveUci:'d7h3',moveSan:'Qxh3',categories:['capture']}],explanation:'Before exd4, you could win the queen with Qxh3.',checklistPoint:'Check both sides before choosing your move.'}});
  });
  await page.goto('/#today');
  await page.getByRole('button',{name:'Find my missed opportunity',exact:true}).click();
  await page.getByRole('button',{name:'× Capture',exact:true}).click();
  const grid=page.getByRole('grid',{name:'Chess position'});
  await grid.getByRole('gridcell',{name:'d7 black queen',exact:true}).click();
  await grid.getByRole('gridcell',{name:'h3 white queen',exact:true}).click();
  await page.getByRole('button',{name:'Check my answer',exact:true}).click();
  await expect(page.getByRole('heading',{name:'You found the missed opportunity',exact:true})).toBeVisible();
  await expect(page.locator('#training .failure-summary')).toContainText('You could have played Qxh3');
  await expect(grid.getByRole('gridcell',{name:'h3 black queen',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('missed-queen-capture.png'),animations:'disabled'});
});

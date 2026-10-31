import { openGameReport } from "./workflow-helpers";
import { expect, test } from "@playwright/test";
test.use({ baseURL: "http://127.0.0.1:8192" });

test("imports Chess.com games through the existing review and requested-analysis workflow", async ({ page }, info) => {
  const username = `chesscom_fixture_${info.project.name}`;
  // Give each browser its own existing learner, then link a different source alias.
  const existing = await (await page.request.post("/api/v1/imports/pgn", { data: {
    playerName: `Learner ${info.project.name}`, pgn: `[White "Learner ${info.project.name}"]\n[Black "Existing opponent"]\n[Date "2026.10.19"]\n[Result "1-0"]\n\n1. d4 d5 1-0`,
  } })).json();
  await page.request.post(`/api/v1/profiles/${existing.profileId}/activate`);
  await page.goto("/#games?focus=import");
  const add = page.locator(".game-import-disclosure");
  if (!(await add.evaluate(element => (element as HTMLDetailsElement).open))) await add.locator("summary").first().click();
  const card = page.locator(".lichess-sync-card").filter({ has: page.locator("summary", { hasText: "Import finished Chess.com games" }) });
  await card.locator("summary").click();
  await card.getByRole("textbox", { name: "Chess.com username", exact: true }).fill("missing_account");
  await card.getByRole("button", { name: "Connect Chess.com", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("not found");
  await card.getByRole("textbox", { name: "Chess.com username", exact: true }).fill(username);
  await card.getByRole("button", { name: "Connect Chess.com", exact: true }).click();
  await expect(card.getByRole("status")).toContainText(`Connected as ${username}`);
  await card.getByLabel("Chess.com game month", { exact: true }).fill("2026-10");
  await card.getByRole("button", { name: "Import this month", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("2 new Chess.com games saved");
  const games = (await (await page.request.get("/api/v1/games")).json()).games;
  expect(games).toHaveLength(3);
  const imported = games.filter((game: {white: string; black: string}) => game.white === username || game.black === username);
  expect(imported.map((game: {playerColor: string}) => game.playerColor).sort()).toEqual(["black", "white"]);
  expect(await (await page.request.get("/api/v1/jobs/active")).json()).toBeNull();
  await card.getByRole("button", { name: "Import this month", exact: true }).click();
  await expect(card.getByRole("status")).toContainText("0 new Chess.com games saved · 2 already saved");
  await page.reload();
  if (!(await add.evaluate(element => (element as HTMLDetailsElement).open))) await add.locator("summary").first().click();
  await expect(card.locator("summary")).toContainText(`Connected as ${username}`);
  await page.goto(`/#games?game=${imported[0].id}`);
  await openGameReport(page);
  const report = page.getByRole("region", { name: "Game move-quality report", exact: true });
  await expect(report).toContainText("No move-quality report yet");
  await report.getByRole("button", { name: "Analyse this game", exact: true }).click();
  await expect(report.getByText("Engine accuracy", { exact: true })).toBeVisible({ timeout: 20000 });
  expect(await (await page.request.get(`/api/v1/games/${imported[1].id}/quality`)).json()).toBeNull();
  await expect(page.getByRole("region", { name: "Saved game replay", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath("chesscom-game-review.png"), fullPage: true });
  await page.getByRole("button", {name:"Back to games",exact:true}).click();
  if (!(await add.evaluate(element => (element as HTMLDetailsElement).open))) await add.locator("summary").first().click();
  await card.locator("summary").click();
  await card.screenshot({ path: info.outputPath("chesscom-import-controls.png") });
  // PGN import can activate another learner without navigating away from My games.
  const other = `Other Chesscom Learner ${info.project.name}`;
  await page.getByLabel("PGN text").fill(`[White "${other}"]\n[Black "Another opponent"]\n[Date "2026.10.21"]\n[Result "1-0"]\n\n1. d4 Nf6 1-0`);
  await page.getByRole("button", { name: "Check PGN", exact: true }).click();
  await page.getByRole("combobox", { name: "I am", exact: true }).selectOption(other);
  await page.getByRole("button", { name: "Save games", exact: true }).click();
  await expect(card.locator("summary")).toContainText("Optional · use your username");
  await expect(card.getByRole("textbox", { name: "Chess.com username", exact: true })).toHaveValue("");
  expect((await (await page.request.get("/api/v1/chesscom/connection")).json()).connected).toBe(false);
  await page.request.post(`/api/v1/profiles/${existing.profileId}/activate`);
  expect((await (await page.request.get("/api/v1/games")).json()).games).toHaveLength(3);
});

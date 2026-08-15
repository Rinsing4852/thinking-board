import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const PGN = fs.readFileSync(path.resolve("tests/fixtures/lichess-game.pgn"), "utf8");

async function expectSquareBoard(page: Page): Promise<void> {
  const geometry = await page.getByRole("grid", { name: "Chess position" }).evaluate((board) => {
    const boardBox = board.getBoundingClientRect();
    const cells = [...board.querySelectorAll<HTMLElement>("[role='gridcell']")]
      .map((cell) => cell.getBoundingClientRect());
    return {
      boardWidth: boardBox.width,
      boardHeight: boardBox.height,
      cellWidths: cells.map((cell) => cell.width),
      cellHeights: cells.map((cell) => cell.height),
    };
  });
  expect(geometry.cellWidths).toHaveLength(64);
  expect(Math.abs(geometry.boardWidth - geometry.boardHeight)).toBeLessThan(1);
  expect(Math.max(...geometry.cellWidths) - Math.min(...geometry.cellWidths)).toBeLessThan(1);
  expect(Math.max(...geometry.cellHeights) - Math.min(...geometry.cellHeights)).toBeLessThan(1);
}

test.describe.serial("stable V1 browser journey", () => {
  test("imports a game and explains every training mode", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Start with one of your games" })).toBeVisible();
    await page.getByRole("textbox", { name: "PGN text" }).fill(PGN);
    await page.getByRole("button", { name: "Check PGN" }).click();
    await page.getByLabel("I am").selectOption({ label: "olleyr" });
    await page.getByRole("button", { name: "Import & analyse" }).click();
    await expect(page.getByText("Analysis complete. Your exercises are ready below.")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Your first exercise is ready" })).toBeVisible();

    await page.getByRole("button", { name: "1 · What changed" }).click();
    await expect(page.getByRole("heading", { name: "What Changed?" })).toBeVisible();
    await page.getByRole("button", { name: "Play their last move" }).click();
    await expect(page.getByText("Choose the most important change", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This is what changed" })).toBeVisible();

    await page.getByRole("button", { name: "2 · Candidates" }).click();
    await page.getByRole("button", { name: "Start generating candidates" }).click();
    await expect(page.getByText("You do not need to type notation.")).toBeVisible();
    await page.getByRole("button", { name: "Show engine candidates" }).click();
    await expect(page.getByText("These are comparison moves, not a demand to find one single “correct” move.")).toBeVisible();

    await page.getByRole("button", { name: "3 · Blunder check" }).click();
    await page.getByRole("button", { name: "Play my move on the board" }).click();
    await expect(page.getByRole("heading", { name: "Before making this move, what can the opponent do immediately?" })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This was the danger to find" })).toBeVisible();

    await page.getByRole("button", { name: "4 · Punish" }).click();
    await page.getByRole("button", { name: "Find the punishment" }).click();
    await expect(page.getByRole("heading", { name: "How can the opponent punish this immediately?" })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This was the immediate punishment" })).toBeVisible();

    await page.getByRole("button", { name: "5 · Quiet plan" }).click();
    await page.getByRole("button", { name: "Assess my pieces" }).click();
    await expect(page.getByText("More than one plan can be reasonable.")).toBeVisible();
    await page.getByRole("button", { name: "Show an example" }).click();
    await expect(page.getByText("It is not claiming that every other plan is wrong.")).toBeVisible();

    await expectSquareBoard(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectSquareBoard(page);
    await expect(page.getByText("Thinking Board v1.0.0", { exact: false })).toBeVisible();
  });

  test("restores a failed analysis and offers recovery", async ({ page }) => {
    const failed = {
      id: "failed-browser-job",
      kind: "analyze_games",
      status: "failed",
      progressCurrent: 0,
      progressTotal: 1,
      result: null,
      error: "Stockfish stopped unexpectedly.",
    };
    await page.route("**/api/v1/jobs/active", (route) => route.fulfill({ json: failed }));
    await page.route("**/api/v1/jobs/failed-browser-job", (route) => route.fulfill({ json: failed }));
    await page.goto("/");
    await expect(page.getByText("Analysis needs attention")).toBeVisible();
    await expect(page.getByText("Stockfish stopped unexpectedly.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry analysis" })).toBeVisible();
  });
});

import fs from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { APP_VERSION } from "../../packages/contracts/src/version";

const PGN = fs.readFileSync(path.resolve("tests/fixtures/lichess-game.pgn"), "utf8");

async function expectSquareBoard(page: Page): Promise<void> {
  const geometry = await page.getByRole("grid", { name: "Chess position" }).last().evaluate((board) => {
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

async function expectSvgPieces(page: Page, boardName: string): Promise<void> {
  const pieces = await page.getByRole("grid", { name: boardName }).locator("cg-board piece").evaluateAll((images) =>
    images.map((image) => {
      const piece = image as HTMLElement;
      const box = piece.getBoundingClientRect();
      return {
        source: getComputedStyle(piece).backgroundImage,
        width: box.width,
        height: box.height,
      };
    }),
  );
  expect(pieces).toHaveLength(32);
  expect(pieces.every((piece) => piece.source.includes("/pieces/cburnett/"))).toBe(true);
  for (const piece of pieces) {
    const source = piece.source.match(/url\(["']?(.*?)["']?\)/)?.[1];
    expect(source).toBeTruthy();
    expect((await page.request.get(source!)).ok()).toBe(true);
  }
  expect(pieces.every((piece) => piece.width > 0 && Math.abs(piece.width - piece.height) < 1)).toBe(true);
}

test.describe.serial("stable V1 browser journey", () => {
  test("remembers the player's practical opening level", async ({ page }) => {
    await page.goto("/#openings");
    const openings = page.locator("#opening-practice");
    await openings.locator("details.opening-settings > summary").click();
    // A serial retry may inherit preferences saved during the first attempt.
    const change = openings.locator(".opening-player-context").getByRole("button", { name: "Change", exact: true });
    if (await change.isVisible()) await change.click();
    await expect(openings.getByRole("heading", { name: /Which games should guide your repertoire\?|Update your practical level/ })).toBeVisible();
    await openings.getByLabel("Rating comes from").selectOption("lichess");
    await openings.getByLabel("Closest playing level").selectOption("1400");
    await openings.getByRole("button", { name: "Use these settings" }).click();
    await expect(openings.getByText("1400+ · common moves off")).toBeVisible();
    await page.reload();
    await expect(openings.getByText("1400+ · common moves off")).toBeVisible();
    await openings.locator("details.opening-settings > summary").click();
    await expect(openings.getByText("Lichess · 1400+")).toBeVisible();
    await expect(openings.getByRole("button", { name: "Change" })).toBeVisible();
  });

  test("keeps mobile opening actions above the board and routes played PGNs clearly", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/#openings");
    const openings = page.locator("#opening-practice");
    await expect(openings.getByRole("grid", { name: "Opening focus board" })).toBeHidden();
    await expect(openings.getByRole("button", { name: /Analyse a played game/ })).toBeVisible();
    await openings.getByRole("button", { name: /Analyse a played game/ }).click();
    await expect(page).toHaveURL(/#games$/);
    await expect(page.getByRole("heading", { name: "Paste a game (PGN)" })).toBeVisible();
    await expect(page.getByLabel("PGN text")).toBeVisible();
  });

  test("supports tap and drag moves on a touch board without selecting page text", async ({ browser }) => {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    try {
      await page.goto("/#openings");
      const openings = page.locator("#opening-practice");
      await openings.getByRole("button", { name: "Build on the board" }).click();
      await openings.getByRole("textbox", { name: "Repertoire name" }).fill("Touch board audit");
      await openings.getByRole("button", { name: "Start building", exact: true }).click();
      const board = openings.getByRole("grid", { name: "Repertoire board" });
      const boardStyles = await board.evaluate((element) => {
        const styles = getComputedStyle(element);
        return { touchAction: styles.touchAction, userSelect: styles.userSelect };
      });
      expect(boardStyles).toEqual({ touchAction: "none", userSelect: "none" });

      const e2 = board.getByRole("gridcell", { name: "e2 white pawn" });
      const e4 = board.getByRole("gridcell", { name: "e4 empty" });
      await e2.scrollIntoViewIfNeeded();
      const e2Box = await e2.boundingBox();
      const e4Box = await e4.boundingBox();
      if (!e2Box || !e4Box) throw new Error("Touch board squares are not visible");
      await page.touchscreen.tap(e2Box.x + e2Box.width / 2, e2Box.y + e2Box.height / 2);
      await page.touchscreen.tap(e4Box.x + e4Box.width / 2, e4Box.y + e4Box.height / 2);
      const savedBoard = openings.getByRole("grid", { name: "Chess position" });
      await expect(savedBoard.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
      const e7 = savedBoard.getByRole("gridcell", { name: "e7 black pawn" });
      const e5 = savedBoard.getByRole("gridcell", { name: "e5 empty" });
      const e7Box = await e7.boundingBox();
      const e5Box = await e5.boundingBox();
      if (!e7Box || !e5Box) throw new Error("Touch board squares are not visible");
      const client = await context.newCDPSession(page);
      const from = { x: e7Box.x + e7Box.width / 2, y: e7Box.y + e7Box.height / 2 };
      const to = { x: e5Box.x + e5Box.width / 2, y: e5Box.y + e5Box.height / 2 };
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [from] });
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }] });
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [to] });
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(savedBoard.getByRole("gridcell", { name: "e5 black pawn" })).toBeVisible();
      expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
    } finally {
      await context.close();
    }
  });

  test("browses complete lines and builds a personal line on the board", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    const starter = openings.locator("article").filter({ hasText: "Practical 1.e4 Repertoire" });
    await expect(starter.locator(".opening-card-body")).toBeHidden();
    expect(await starter.evaluate((card) => card.getBoundingClientRect().height)).toBeLessThan(100);
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "View all lines" }).click();
    await expect(openings.getByRole("heading", { name: "Practical 1.e4 Repertoire", level: 2 })).toBeVisible();
    await expect(openings.getByText("1. e4 e5 2. Nf3 Nc6 3. Bc4", { exact: false })).toBeVisible();
    await openings.getByRole("button", { name: "Next", exact: true }).click();
    await expect(openings.getByRole("heading", { name: "e4", exact: true })).toBeVisible();
    await expect(openings.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
    await openings.getByRole("button", { name: "Add comment" }).click();
    await openings.getByRole("textbox", { name: "Your learning comment" }).fill("Remember: claim the centre before moving the knight.");
    await openings.getByRole("button", { name: "Save comment" }).click();
    await expect(openings.getByText("Remember: claim the centre before moving the knight.")).toBeVisible();
    await openings.getByRole("button", { name: "Back to repertoires" }).click();

    await openings.getByRole("button", { name: "Build on the board" }).click();
    await openings.getByRole("textbox", { name: /Repertoire name/ }).fill("Board-built Italian");
    await openings.getByRole("button", { name: "Start building", exact: true }).click();
    await expect(openings.getByRole("grid", { name: "Repertoire board" })).toBeVisible();
    await expect(openings.getByRole("region", { name: "Moves to consider", exact: true })).toBeVisible();
    await expectSvgPieces(page, "Repertoire board");
    await expect(openings.getByRole("grid", { name: "Repertoire board" }).locator("[role='gridcell'][tabindex='0']")).toHaveCount(1);
    await expect(openings.getByRole("grid", { name: "Analysis board" })).toBeHidden();
    let board = openings.getByRole("grid", { name: "Repertoire board" });
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await expect(openings.getByRole("heading", { name: "Board-built Italian", level: 2 })).toBeVisible();
    await expect(openings.getByRole("button", { name: "Finish editing" })).toBeVisible();
    await openings.getByRole("button", { name: "Add comment" }).click();
    await openings.getByRole("textbox", { name: "Your learning comment" }).fill("Claims the centre and opens the bishop.");
    await openings.getByRole("button", { name: "Save comment" }).click();

    await openings.getByRole("button", { name: "Open analysis board" }).click();
    await expect(openings.getByRole("grid", { name: "Analysis board" }).locator("[role='gridcell'][tabindex='0']")).toHaveCount(1);
    board = openings.getByRole("grid", { name: "Analysis board" });
    const e7 = board.getByRole("gridcell", { name: "e7 black pawn" });
    const e6 = board.getByRole("gridcell", { name: "e6 empty" });
    const e5 = board.getByRole("gridcell", { name: "e5 empty" });
    await e7.scrollIntoViewIfNeeded();
    const e7Box = await e7.boundingBox();
    const e5Box = await e5.boundingBox();
    if (!e7Box || !e5Box) throw new Error("Analysis board squares are not visible");
    await page.mouse.move(e7Box.x + e7Box.width / 2, e7Box.y + e7Box.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(e5Box.x + e5Box.width / 2, e5Box.y + e5Box.height / 2, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await expect(board.locator(".cg-shapes > g > g")).toHaveCount(1);
    await openings.getByRole("button", { name: "Flip board" }).click();
    await expect(board.locator("[role='gridcell']").first()).toHaveAttribute("aria-label", "h1 white rook");
    await openings.getByRole("button", { name: "Flip board" }).click();
    await expect(board.locator("[role='gridcell']").first()).toHaveAttribute("aria-label", "a8 black rook");
    await e7.click();
    await expect(board.locator(".cg-shapes > g > g")).toHaveCount(0);
    await expect(e6).toHaveClass(/target/);
    await expect(e5).toHaveClass(/target/);
    await e7.dragTo(e5);
    await expect(board.getByRole("gridcell", { name: "e5 black pawn" })).toBeVisible();
    await expect(board.locator("cg-board piece.black.pawn")).toHaveCount(8);
    await openings.getByRole("button", { name: "Add 1 move to my repertoire" }).click();
    await expect(openings.getByText("Analysis sequence saved. Original lines are kept.")).toBeVisible();
    await openings.getByRole("button", { name: "Close analysis board" }).click();
    await expect(openings.getByRole("heading", { name: "Board-built Italian", level: 2 })).toBeVisible();
    await expect(openings.getByRole("grid", { name: "Chess position" }).getByRole("gridcell", { name: "e5 black pawn" })).toBeVisible();
    await expect(openings.getByRole("button", { name: "Practise this line" })).toBeEnabled();

    await openings.getByLabel("Save each move automatically").uncheck();
    await expect(openings.getByRole("region", { name: "Moves to consider", exact: true })).toBeVisible();
    board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "g1 white knight" }).click();
    await board.getByRole("gridcell", { name: "f3 empty" }).click();
    await openings.getByRole("textbox", { name: /Why Nf3/ }).fill("Develops, controls the centre and prepares castling.");
    await openings.getByRole("button", { name: "Save move" }).click();
    await expect(openings.getByText("Nf3 was added to the end of this line.")).toBeVisible();
    await openings.getByRole("button", { name: "Undo last save" }).click();
    await expect(openings.getByText("Nf3 was removed.")).toBeVisible();
    board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "g1 white knight" }).click();
    await board.getByRole("gridcell", { name: "f3 empty" }).click();
    await openings.getByRole("textbox", { name: /Why Nf3/ }).fill("Develops, controls the centre and prepares castling.");
    await openings.getByRole("button", { name: "Save move" }).click();
    await expect(openings.getByText("Nf3 was added to the end of this line.")).toBeVisible();

    await openings.getByRole("button", { name: "Previous", exact: true }).click();
    board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "f1 white bishop" }).click();
    await board.getByRole("gridcell", { name: "c4 empty" }).click();
    await openings.getByRole("textbox", { name: "Branch name" }).fill("Italian bishop-first branch");
    await openings.getByRole("button", { name: "Save move" }).click();
    await expect(openings.getByText(/saved as a new branch; the original line is unchanged/i)).toBeVisible();
    await expect(openings.getByRole("button", { name: /Italian bishop-first branch/ })).toBeVisible();

    await openings.getByText("Coverage and repertoire settings", { exact: true }).click();
    await openings.locator("details.opening-management > summary").click();
    await openings.getByRole("button", { name: "Delete selected line" }).click();
    let deletion = openings.getByRole("alertdialog");
    await expect(deletion.getByRole("heading", { name: "Delete “Italian bishop-first branch”?" })).toBeVisible();
    await deletion.getByRole("button", { name: "Keep line" }).click();
    await expect(deletion).toBeHidden();
    await openings.getByRole("button", { name: "Delete selected line" }).click();
    deletion = openings.getByRole("alertdialog");
    await deletion.getByRole("button", { name: "Delete line", exact: true }).click();
    await expect(openings.getByText(/shared moves remain in your other lines/i)).toBeVisible();
    await expect(openings.getByRole("button", { name: /Italian bishop-first branch/ })).toBeHidden();

    await openings.getByRole("button", { name: "Delete repertoire", exact: true }).click();
    deletion = openings.getByRole("alertdialog");
    await expect(deletion.getByRole("heading", { name: "Delete “Board-built Italian”?" })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await deletion.getByRole("button", { name: "Delete repertoire", exact: true }).click();
    await expect(openings.getByRole("heading", { name: "Board-built Italian", level: 3 })).toBeHidden();
  });

  test("practises a chosen line as a continuous board drill", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    const starter = openings.locator("article").filter({ hasText: "Modern Defence with 1...g6" });
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "View all lines" }).click();
    await openings.getByRole("button", { name: "Practise this line" }).click();

    await expect(openings.getByText("Today’s opening practice", { exact: true })).toBeVisible();
    await expect(openings.getByText("Step 1 of", { exact: false })).toBeVisible();
    await expect(openings.getByRole("button", { name: "Hint: show the piece" })).toBeVisible();
    await expect(openings.getByRole("button", { name: "Show move" })).toBeVisible();
    await expect(openings.getByText("EXPLAIN", { exact: true })).toBeHidden();

    let state = await (await page.request.get("/api/v1/openings/reviews/active")).json() as {
      kind: "exercise" | "feedback";
      sessionId: string;
      acceptedMoves?: Array<{ moveUci: string }>;
    };
    for (let decision = 0; decision < 20; decision += 1) {
      if (state.kind === "exercise") {
        const answered = await page.request.post(`/api/v1/openings/reviews/${state.sessionId}/move`, {
          data: { moveUci: state.acceptedMoves![0]!.moveUci },
        });
        expect(answered.ok()).toBe(true);
      }
      const continued = await page.request.post(`/api/v1/openings/reviews/${state.sessionId}/continue`);
      expect(continued.ok()).toBe(true);
      const next = await continued.json() as typeof state | { kind: "complete" };
      if (next.kind === "complete") break;
      state = next;
    }
    expect(await (await page.request.get("/api/v1/openings/reviews/active")).json()).toBeNull();
  });

  test("archives and restores built-in repertoires and individual lines", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    let starter = openings.locator("article").filter({ hasText: "Practical 1.e4 Repertoire" });
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(starter).toBeHidden();
    const archiveLibrary = openings.locator("details.opening-archive-library");
    await archiveLibrary.locator("summary").click();
    await expect(archiveLibrary.getByText("Practical 1.e4 Repertoire")).toBeVisible();
    await archiveLibrary.getByRole("button", { name: "Restore" }).click();
    starter = openings.locator("article").filter({ hasText: "Practical 1.e4 Repertoire" });
    await expect(starter).toBeVisible();

    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "View all lines" }).click();
    await openings.getByText("Coverage and repertoire settings", { exact: true }).click();
    await openings.locator("details.opening-management > summary").click();
    await openings.getByRole("button", { name: "Archive this line" }).click();
    await expect(openings.getByText(/Black develops the bishop first was archived/i)).toBeVisible();
    await openings.getByRole("button", { name: /Black develops the bishop first/ }).click();
    await openings.getByRole("button", { name: "Restore this line" }).click();
    await expect(openings.getByText(/Black develops the bishop first was restored/i)).toBeVisible();
  });

  test("previews and imports a private opening repertoire for both sides", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    await openings.getByRole("button", { name: "Import repertoire lines" }).click();
    await openings.getByRole("textbox", { name: /Repertoire name/ }).fill("Browser repertoire");
    await openings.getByLabel("Practise as").selectOption("both");
    await openings.getByRole("textbox", { name: /Source title/ }).fill("My private reading notes");
    await openings.getByRole("textbox", { name: "Opening PGN" }).fill(`[Event "Browser opening"]
[Result "*"]

1. e4 {Take space in the centre.} e5 2. Nf3 Nc6 (2... Nf6 3. Nxe5) 3. Bc4 *`);
    await openings.getByRole("button", { name: "Preview import" }).click();
    await expect(openings.getByText("Ready to import")).toBeVisible();
    await expect(openings.getByText("2 practice lines")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const filePicker = openings.getByLabel(/Choose a PGN file/);
    expect(await filePicker.evaluate(element => {
      const input = element.getBoundingClientRect();
      const label = element.closest("label")!.getBoundingClientRect();
      return input.width <= label.width + 1 && input.right <= window.innerWidth + 1;
    })).toBe(true);
    await testInfo.attach("mobile-layout", { contentType: "application/json", body: JSON.stringify(await page.evaluate(() => ({
      viewport: window.innerWidth, document: document.documentElement.scrollWidth,
      overflowing: [...document.querySelectorAll("body *")].flatMap(element => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.right > window.innerWidth + 1
          ? [{ tag: element.tagName, className: element.className, width: box.width, right: box.right }] : [];
      }),
    }))) });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await openings.getByRole("checkbox", { name: /I own this material/ }).check();
    await openings.getByRole("button", { name: "Import private repertoire" }).click();
    await expect(openings.getByText("2 private repertoires imported and ready to practise.")).toBeVisible();
    await expect(openings.locator("article.opening-card").getByText("Browser repertoire — White", { exact: true })).toBeVisible();
    await expect(openings.locator("article.opening-card").getByText("Browser repertoire — Black", { exact: true })).toBeVisible();
  });

  test("reviews opening positions with spaced repetition and clear feedback", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    const starter = openings.locator("article").filter({ hasText: "Practical 1.e4 Repertoire" });
    await expect(openings.getByLabel("Ways to practise a repertoire")).toHaveCount(1);
    await expect(starter.getByLabel("0 of 29 positions practised")).toBeVisible();
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "Practise 5 new moves" }).click();
    await expect(openings.getByText("Step 1 of 5")).toBeVisible();
    await expect(page.locator(".site-header")).toHaveClass(/practice-hidden/);
    await expect(openings.getByRole("heading", { name: "Recall your repertoire move for this position." })).toBeVisible();
    await expect(openings.getByText("Correct moves continue automatically", { exact: false })).toBeVisible();

    let board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "g1 white knight" }).click();
    await board.getByRole("gridcell", { name: "f3 empty" }).click();
    await expect(openings.getByText("Try again", { exact: true })).toBeVisible();
    await expect(board.getByRole("gridcell", { name: "g1 white knight" })).toHaveClass(/rejected-move/);
    await expect(board.getByRole("gridcell", { name: "f3 empty" })).toHaveClass(/rejected-move/);
    await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).not.toHaveClass(/answer-highlight/);
    await openings.getByRole("button", { name: "Hint: show the piece" }).click();
    await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).toHaveClass(/answer-highlight/);
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await expect(openings.getByText("Learning", { exact: true })).toBeVisible();
    await expect(openings.getByText("Continuing automatically…")).toBeVisible();
    await expect(openings.getByText("Step 2 of 6")).toBeVisible({ timeout: 5_000 });

    const decisions = [
      { from: "g1 white knight", to: "f3 empty" },
      { from: "f1 white bishop", to: "c4 empty" },
      { from: "d2 white pawn", to: "d3 empty" },
      { from: "e1 white king", to: "g1 empty" },
      { from: "e2 white pawn", to: "e4 empty" },
    ];
    for (const [index, decision] of decisions.entries()) {
      await expect(openings.getByText(`Step ${index + 2} of 6`)).toBeVisible({ timeout: 5_000 });
      board = openings.getByRole("grid", { name: "Chess position" });
      await expect(board).toHaveClass(/interactive/);
      await board.getByRole("gridcell", { name: decision.from }).click();
      await board.getByRole("gridcell", { name: decision.to }).click();
      await expect(openings.getByText("Remembered", { exact: true })).toBeVisible();
    }

    await expect(openings.getByText("Practice complete", { exact: true })).toBeVisible({ timeout: 5_000 });
    const scores = openings.locator(".opening-complete-scores");
    await expect(scores.getByText("4", { exact: true })).toBeVisible();
    const assistedScore = scores.locator("div").filter({ hasText: "moves helped by hints" });
    await expect(assistedScore.getByText("1", { exact: true })).toBeVisible();
    await expect(openings.getByRole("button", { name: "Practice another set" })).toBeVisible();
    await openings.getByRole("button", { name: "Back to opening choices" }).click();
    await expect(page.locator(".site-header")).not.toHaveClass(/practice-hidden/);
    await expect(starter.getByLabel("5 of 29 positions practised")).toBeVisible();
    await starter.locator("summary").click();
    await expect(starter.getByText("5 reviewed", { exact: false })).toBeVisible();
  });

  test("starts an opening lesson, explains the move, and restores the next decision", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    await expect(openings.getByRole("heading", { name: "Opening Practice" })).toBeVisible();
    const starter = openings.locator("article").filter({ hasText: "Practical 1.e4 Repertoire" });
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "Learn the ideas (guided)" }).click();
    await expect(openings.getByText("Decision 1 of 6")).toBeVisible();
    await openings.getByRole("button", { name: "Pause" }).click();
    await expect(openings.getByText("Guided line paused")).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("end the paused guided line");
      await dialog.dismiss();
    });
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "Learn the ideas (guided)" }).click();
    await expect(openings.getByText("Guided line paused")).toBeVisible();
    await openings.getByRole("button", { name: "Resume guided line" }).click();

    const board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "g1 white knight" }).click();
    await board.getByRole("gridcell", { name: "f3 empty" }).click();
    await expect(openings.getByText("Try again", { exact: true })).toBeVisible();
    await expect(openings.getByText(/ask for a hint/i)).toBeVisible();
    await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).not.toHaveClass(/answer-highlight/);
    await openings.getByRole("button", { name: "Hint: show the piece" }).click();
    await expect(openings.getByText(/move the pawn/i)).toBeVisible();
    await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).toHaveClass(/answer-highlight/);
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await expect(openings.getByText("Repertoire move found")).toBeVisible();

    await page.reload();
    await expect(openings.getByRole("heading", { name: "What is the main reason for e4 here?" })).toBeVisible();
    await openings.getByRole("button", { name: "Control or challenge the centre" }).click();
    await expect(openings.getByRole("heading", {
      name: "Claims central space and opens lines for the queen and king's bishop.",
    })).toBeVisible();
    await page.reload();
    await expect(openings.getByRole("heading", {
      name: "Claims central space and opens lines for the queen and king's bishop.",
    })).toBeVisible();
    await openings.getByRole("button", { name: "Continue" }).click();

    await page.reload();
    await expect(openings.getByText("Decision 2 of 6")).toBeVisible();
    await expect(openings.getByRole("heading", { name: "What should White play next?" })).toBeVisible();
    await expect(openings.getByText("e5 will play automatically.")).not.toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expectSquareBoard(page);
    const questionTop = await openings.locator(".opening-question-card").evaluate((element) => element.getBoundingClientRect().top);
    const boardTop = await openings.getByRole("grid", { name: "Chess position" }).evaluate((element) => element.getBoundingClientRect().top);
    expect(boardTop).toBeLessThan(questionTop);
  });

  test("imports a game and explains every training mode", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.getByRole("button", { name: "My games" }).click();
    const pgnInput = page.getByRole("textbox", { name: "PGN text" });
    await expect(pgnInput).toBeVisible();
    await pgnInput.fill(PGN);
    await page.getByRole("button", { name: "Check PGN" }).click();
    await page.getByLabel("I am").selectOption({ label: "olleyr" });
    await page.getByRole("button", { name: "Import & analyse" }).click();
    await expect(page.getByText("Analysis complete. Your exercises and repertoire comparison are ready below.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByRole("heading", { name: "Your first exercise is ready" })).toBeVisible();

    await page.getByRole("button", { name: "1 · What changed" }).click();
    await expect(page.getByRole("heading", { name: "What Changed?" })).toBeVisible();
    await page.getByRole("button", { name: "Play their last move" }).click();
    await expect(page.getByText("Choose the most important change", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This is what changed" })).toBeVisible();
    await page.locator(".trainer-layout").screenshot({ path: testInfo.outputPath("what-changed-feedback.png") });

    await page.getByRole("button", { name: "2 · Candidates" }).click();
    await page.getByRole("button", { name: "Start generating candidates" }).click();
    await expect(page.getByText(/tap or click a piece and a highlighted square/i)).toBeVisible();
    await page.getByRole("button", { name: "Show engine candidates" }).click();
    await expect(page.getByText("These are comparison moves, not a demand to find one single “correct” move.")).toBeVisible();
    await page.locator(".trainer-layout").screenshot({ path: testInfo.outputPath("candidates-feedback.png") });

    await page.getByRole("button", { name: "3 · Blunder check" }).click();
    await page.getByRole("button", { name: "Play my move on the board" }).click();
    await expect(page.getByRole("heading", { name: "Before making this move, what can the opponent do immediately?" })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This was the danger to find" })).toBeVisible();
    await page.locator(".trainer-layout").screenshot({ path: testInfo.outputPath("blunder-check-feedback.png") });

    await page.getByRole("button", { name: "4 · Punish" }).click();
    await page.getByRole("button", { name: "Find the punishment" }).click();
    await expect(page.getByRole("heading", { name: "How can the opponent punish this immediately?" })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This was the immediate punishment" })).toBeVisible();
    await page.locator(".trainer-layout").screenshot({ path: testInfo.outputPath("punish-feedback.png") });

    await page.getByRole("button", { name: "5 · Quiet plan" }).click();
    await page.getByRole("button", { name: "Assess my pieces" }).click();
    await expect(page.getByText("More than one plan can be reasonable.")).toBeVisible();
    await page.getByRole("button", { name: "Show an example" }).click();
    await expect(page.getByText("It is not claiming that every other plan is wrong.")).toBeVisible();
    await page.locator(".trainer-layout").screenshot({ path: testInfo.outputPath("quiet-plan-feedback.png") });

    await expectSquareBoard(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await expectSquareBoard(page);
    await expect(page.getByText(`Thinking Board v${APP_VERSION}`, { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "My games" }).click();
    await expect(page.getByRole("heading", { name: "Opening inbox" })).toBeVisible();
    const f3InboxItem = page.locator(".opening-inbox-item").filter({ hasText: "Recall e4 instead of f3" });
    await expect(f3InboxItem).toBeVisible();
    await expect(f3InboxItem.getByText("Seen once · 1 new")).toBeVisible();
    await f3InboxItem.getByRole("button", { name: "Mark reviewed" }).click();
    await expect(f3InboxItem).toBeHidden();
    await page.getByRole("button", { name: "olleyr – Training opponent" }).click();
    await expect(page.getByText("Opening connection", { exact: true })).toBeVisible();
    await expect(page.getByText("First difference: 1.f3", { exact: true })).toBeVisible();
    await expect(page.getByText("This does not automatically make your move a mistake.", { exact: false })).toBeVisible();
    const differenceBoard = page.getByRole("grid", { name: "Opening difference position" });
    await expect(differenceBoard.getByRole("gridcell", { name: "e2 white pawn" })).toBeVisible();
    await page.getByRole("button", { name: "Game: f3" }).click();
    await expect(differenceBoard.getByRole("gridcell", { name: "f3 white pawn" })).toBeVisible();
    await page.getByRole("button", { name: "Repertoire: e4" }).click();
    await expect(differenceBoard.getByRole("gridcell", { name: "e4 white pawn" })).toBeVisible();
    await page.getByRole("button", { name: "Practise e4 now" }).click();
    await expect(page.locator("#opening-practice .opening-review")).toBeVisible();
    await expect(page.getByText(/Recall your repertoire move|Play one of your saved responses/).filter({ visible: true })).toBeVisible();
    await expectSquareBoard(page);
  });

  test("prepares an opponent surprise directly from the opening inbox", async ({ page }) => {
    const response = await page.request.post("/api/v1/imports/pgn", {
      data: {
        playerName: "olleyr",
        pgn: `[Event "Inbox surprise"]
[Date "2026.09.20"]
[White "olleyr"]
[Black "Training opponent"]
[Result "*"]

1. e4 e5 2. Nf3 d6 *`,
      },
    });
    expect(response.ok()).toBe(true);

    await page.goto("/#games");
    const surprise = page.locator(".opening-inbox-item").filter({ hasText: "surprised you with 2...d6" });
    await expect(surprise).toBeVisible();
    await surprise.getByRole("button", { name: "Prepare for d6" }).click();
    await expect(surprise.getByRole("heading", { name: "How will you answer d6?" })).toBeVisible();
    await expect(surprise.getByText("Nothing is saved until you confirm it.", { exact: false })).toBeVisible();

    const board = surprise.getByRole("grid", { name: "Position after d6" });
    await board.getByRole("gridcell", { name: "d2 white pawn" }).click();
    await board.getByRole("gridcell", { name: "d4 empty" }).click();
    await expect(surprise.getByRole("button", { name: "Save d6 → d4", exact: true })).toBeEnabled();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await surprise.getByRole("button", { name: "Save d6 → d4" }).click();
    await expect(page.getByText(/saved d6 with your d4 reply/i)).toBeVisible();
    await expect(surprise).toBeHidden();
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
    await page.getByRole("button", { name: "My games" }).click();
    await expect(page.getByText("Analysis needs attention")).toBeVisible();
    await expect(page.getByText("Stockfish stopped unexpectedly.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry analysis" })).toBeVisible();
  });
});

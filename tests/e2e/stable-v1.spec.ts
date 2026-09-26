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
  const pieces = await page.getByRole("grid", { name: boardName }).locator("img.piece").evaluateAll((images) =>
    images.map((image) => {
      const piece = image as HTMLImageElement;
      const box = piece.getBoundingClientRect();
      return {
        complete: piece.complete,
        naturalWidth: piece.naturalWidth,
        source: piece.getAttribute("src"),
        width: box.width,
        height: box.height,
      };
    }),
  );
  expect(pieces).toHaveLength(32);
  expect(pieces.every((piece) => piece.complete && piece.naturalWidth > 0)).toBe(true);
  expect(pieces.every((piece) => piece.source?.startsWith("/pieces/cburnett/"))).toBe(true);
  expect(pieces.every((piece) => piece.width > 0 && Math.abs(piece.width - piece.height) < 1)).toBe(true);
}

test.describe.serial("stable V1 browser journey", () => {
  test("remembers the player's practical opening level", async ({ page }) => {
    await page.goto("/#openings");
    const openings = page.locator("#opening-practice");
    await expect(openings.getByRole("heading", { name: "Which games should guide your repertoire?" })).toBeVisible();
    await openings.getByLabel("Rating comes from").selectOption("lichess");
    await openings.getByLabel("Closest playing level").selectOption("1400");
    await openings.getByRole("button", { name: "Use these settings" }).click();
    await expect(openings.getByText("Lichess · 1400+")).toBeVisible();
    await page.reload();
    await expect(openings.getByText("Lichess · 1400+")).toBeVisible();
    await expect(openings.getByRole("button", { name: "Change" })).toBeVisible();
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
    await expect(openings.getByRole("grid", { name: "Repertoire board" })).toBeVisible();
    await expect(openings.getByText("Moves to consider", { exact: true })).toBeVisible();
    await expectSvgPieces(page, "Repertoire board");
    await expect(openings.getByRole("grid", { name: "Repertoire board" }).locator("[role='gridcell'][tabindex='0']")).toHaveCount(1);
    await expect(openings.getByRole("grid", { name: "Analysis board" }).locator("[role='gridcell'][tabindex='0']")).toHaveCount(1);
    let board = openings.getByRole("grid", { name: "Analysis board" });
    const e2 = board.getByRole("gridcell", { name: "e2 white pawn" });
    const e3 = board.getByRole("gridcell", { name: "e3 empty" });
    const e4 = board.getByRole("gridcell", { name: "e4 empty" });
    await e2.scrollIntoViewIfNeeded();
    const e2Box = await e2.boundingBox();
    const e4Box = await e4.boundingBox();
    if (!e2Box || !e4Box) throw new Error("Analysis board squares are not visible");
    await page.mouse.move(e2Box.x + e2Box.width / 2, e2Box.y + e2Box.height / 2);
    await page.mouse.down({ button: "right" });
    await page.mouse.move(e4Box.x + e4Box.width / 2, e4Box.y + e4Box.height / 2, { steps: 6 });
    await page.mouse.up({ button: "right" });
    await expect(board.locator(".board-annotations .annotation-mark")).toHaveCount(1);
    await openings.getByRole("button", { name: "Flip board" }).click();
    await expect(board.locator("[role='gridcell']").first()).toHaveAttribute("aria-label", "h1 white rook");
    await openings.getByRole("button", { name: "Flip board" }).click();
    await expect(board.locator("[role='gridcell']").first()).toHaveAttribute("aria-label", "a8 black rook");
    await e2.click();
    await expect(board.locator(".board-annotations")).toHaveCount(0);
    await expect(e3).toHaveClass(/target/);
    await expect(e4).toHaveClass(/target/);
    await e2.dragTo(e4);
    await expect(board.getByRole("gridcell", { name: "e4 white pawn" }).locator("img.piece")).toHaveClass(/moving-piece/);
    await openings.getByRole("button", { name: "Add 1 move to my repertoire" }).click();
    await openings.getByRole("textbox", { name: /Develops with tempo/ }).fill("Claims the centre and opens the bishop.");
    board = openings.getByRole("grid", { name: "Analysis board" });
    await board.getByRole("gridcell", { name: "e7 black pawn" }).click();
    await board.getByRole("gridcell", { name: "e5 empty" }).click();
    await openings.getByRole("button", { name: "Add 1 move to my repertoire" }).click();
    await openings.getByRole("textbox", { name: /Challenges the centre/ }).fill("Black mirrors the central claim.");
    await openings.getByRole("button", { name: "Save repertoire" }).click();
    await expect(openings.getByRole("heading", { name: "Board-built Italian", level: 2 })).toBeVisible();
    await expect(openings.getByText("1. e4 e5", { exact: true })).toBeVisible();
    await expect(openings.getByRole("button", { name: "Practise this line" })).toBeEnabled();

    await openings.getByRole("button", { name: "Edit lines" }).click();
    await expect(openings.getByText("Moves to consider", { exact: true })).toBeVisible();
    await openings.getByRole("button", { name: "End", exact: true }).click();
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
    await openings.getByRole("button", { name: "Archive this line" }).click();
    await expect(openings.getByText(/Black develops the bishop first was archived/i)).toBeVisible();
    await openings.getByRole("button", { name: /Black develops the bishop first/ }).click();
    await openings.getByRole("button", { name: "Restore this line" }).click();
    await expect(openings.getByText(/Black develops the bishop first was restored/i)).toBeVisible();
  });

  test("previews and imports a private opening repertoire for both sides", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    await openings.getByRole("button", { name: "Import opening PGN" }).click();
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
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await openings.getByRole("checkbox", { name: /I own this material/ }).check();
    await openings.getByRole("button", { name: "Import private repertoire" }).click();
    await expect(openings.getByText("2 private repertoires imported and ready to practise.")).toBeVisible();
    await expect(openings.getByText("Browser repertoire — White", { exact: true })).toBeVisible();
    await expect(openings.getByText("Browser repertoire — Black", { exact: true })).toBeVisible();
  });

  test("reviews opening positions with spaced repetition and clear feedback", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Openings" }).click();
    const openings = page.locator("#opening-practice");
    const starter = openings.locator("article").filter({ hasText: "Practical 1.e4 Repertoire" });
    await expect(openings.getByLabel("Ways to practise a repertoire")).toHaveCount(1);
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "Practise 5 new moves" }).click();
    await expect(openings.getByText("Step 1 of 5")).toBeVisible();
    await expect(page.locator(".site-header")).toHaveClass(/practice-hidden/);
    await expect(openings.getByRole("heading", { name: "Find the move from its purpose." })).toBeVisible();
    await expect(openings.getByText("Correct moves continue automatically", { exact: false })).toBeVisible();

    let board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "g1 white knight" }).click();
    await board.getByRole("gridcell", { name: "f3 empty" }).click();
    await expect(openings.getByText("Try again", { exact: true })).toBeVisible();
    await expect(board.getByRole("gridcell", { name: "g1 white knight" })).toHaveClass(/rejected-move/);
    await expect(board.getByRole("gridcell", { name: "f3 empty" })).toHaveClass(/rejected-move/);
    await expect(board.getByRole("gridcell", { name: "e2 white pawn" })).toHaveClass(/answer-highlight/);
    await board.getByRole("gridcell", { name: "e2 white pawn" }).click();
    await board.getByRole("gridcell", { name: "e4 empty" }).click();
    await expect(openings.getByText("Learning", { exact: true })).toBeVisible();
    await expect(openings.getByText("Next position is loading automatically…")).toBeVisible();
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
      await expect(openings.getByText("play now — moves are checked immediately", { exact: false })).toBeVisible({ timeout: 5_000 });
      board = openings.getByRole("grid", { name: "Chess position" });
      await board.getByRole("gridcell", { name: decision.from }).click();
      await board.getByRole("gridcell", { name: decision.to }).click();
      await expect(openings.getByText("Remembered", { exact: true })).toBeVisible();
    }

    await expect(openings.getByText("Practice complete", { exact: true })).toBeVisible({ timeout: 5_000 });
    const scores = openings.locator(".opening-complete-scores");
    await expect(scores.getByText("5", { exact: true })).toBeVisible();
    const assistedScore = scores.locator("div").filter({ hasText: "answers shown or helped" });
    await expect(assistedScore.getByText("1", { exact: true })).toBeVisible();
    await openings.getByRole("button", { name: "Back to opening choices" }).click();
    await expect(page.locator(".site-header")).not.toHaveClass(/practice-hidden/);
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
    await starter.getByRole("button", { name: "Study line in order" }).click();
    await expect(openings.getByText("Decision 1 of 6")).toBeVisible();
    await openings.getByRole("button", { name: "Pause" }).click();
    await expect(openings.getByText("Guided line paused")).toBeVisible();
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("end the paused guided line");
      await dialog.dismiss();
    });
    await starter.locator("summary").click();
    await starter.getByRole("button", { name: "Study line in order" }).click();
    await expect(openings.getByText("Guided line paused")).toBeVisible();
    await openings.getByRole("button", { name: "Resume guided line" }).click();

    const board = openings.getByRole("grid", { name: "Chess position" });
    await board.getByRole("gridcell", { name: "g1 white knight" }).click();
    await board.getByRole("gridcell", { name: "f3 empty" }).click();
    await expect(openings.getByText("Try again", { exact: true })).toBeVisible();
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

  test("imports a game and explains every training mode", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "My games" }).click();
    const pgnInput = page.getByRole("textbox", { name: "PGN text" });
    await expect(pgnInput).toBeVisible();
    await pgnInput.fill(PGN);
    await page.getByRole("button", { name: "Check PGN" }).click();
    await page.getByLabel("I am").selectOption({ label: "olleyr" });
    await page.getByRole("button", { name: "Import & analyse" }).click();
    await expect(page.getByText("Analysis complete. Your exercises are ready below.")).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Today" }).click();
    await expect(page.getByRole("heading", { name: "Your first exercise is ready" })).toBeVisible();

    await page.getByRole("button", { name: "1 · What changed" }).click();
    await expect(page.getByRole("heading", { name: "What Changed?" })).toBeVisible();
    await page.getByRole("button", { name: "Play their last move" }).click();
    await expect(page.getByText("Choose the most important change", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Show answer" }).click();
    await expect(page.getByRole("heading", { name: "This is what changed" })).toBeVisible();

    await page.getByRole("button", { name: "2 · Candidates" }).click();
    await page.getByRole("button", { name: "Start generating candidates" }).click();
    await expect(page.getByText(/tap or click a piece and a highlighted square/i)).toBeVisible();
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
    await expect(page.getByText("Today’s opening practice", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Find the move from its purpose." })).toBeVisible();
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
    await expect(surprise.getByText("Your reply")).toBeVisible();
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

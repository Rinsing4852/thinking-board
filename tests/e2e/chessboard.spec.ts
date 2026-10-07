import { execFileSync } from "node:child_process";
import { expect, test, type Locator, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/openings/reviews/active", route => route.fulfill({ json: null }));
  await page.route("**/api/v1/training/session/active", route => route.fulfill({ json: null }));
});

async function previewReply(page: Page, fen: string, color: "white" | "black" = "white") {
  await page.route("**/api/v1/training/next", route => route.fulfill({ json: {
    kind: "exercise", itemId: "board-regression", attemptId: null, mode: "blunder_check",
    fenBefore: fen, fenAfterCandidate: fen, candidateMoveUci: "", candidateMoveSan: "Test position",
    playerColor: color, moveNumber: 1, prompt: "Inspect the immediate reply.",
  } }));
  await page.route("**/api/v1/training/items/board-regression/start", route => route.fulfill({ json: { attemptId: "board-attempt" } }));
  await page.goto("/#today");
  await page.getByRole("button", { name: "3 · Blunder check", exact: true }).click();
  await page.getByRole("button", { name: "Play my move on the board", exact: true }).click();
  const board = page.getByRole("grid", { name: "Chess position" });
  await expect(board).toHaveClass(/interactive/);
  await expect(board.locator("[data-square]").first()).toHaveAttribute("data-square", color === "white" ? "a8" : "h1");
  return board;
}

async function play(board: Locator, from: string, to: string) {
  await board.locator(`[data-square='${from}']`).click();
  await board.locator(`[data-square='${to}']`).click();
}

// Check the actual renderer, not just the accessible labels React owns.
async function expectPiece(board: Locator, square: string, piece: string) {
  await expect.poll(async () => {
    const target = await board.locator(`[data-square='${square}']`).boundingBox();
    const boxes = await board.locator(`cg-board piece.${piece.replace(" ", ".")}:not(.fading)`).evaluateAll(elements =>
      elements.map(element => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; }));
    return Boolean(target && boxes.some(box => Math.abs(box.x - target.x) < 1 && Math.abs(box.y - target.y) < 1
      && Math.abs(box.width - target.width) < 1 && Math.abs(box.height - target.height) < 1));
  }).toBe(true);
}

test("moves king and rook when castling and restores both when changing the reply", async ({ page }) => {
  const board = await previewReply(page, "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
  await play(board, "e1", "g1");
  await expect(page.getByText("Your selected reply:")).toContainText("O-O");
  await expectPiece(board, "g1", "white king");
  await expectPiece(board, "f1", "white rook");
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await expectPiece(board, "e1", "white king");
  await expectPiece(board, "h1", "white rook");
});

test("removes the captured pawn when taking en passant", async ({ page }) => {
  const board = await previewReply(page, "4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
  await play(board, "e5", "d6");
  await expectPiece(board, "d6", "white pawn");
  await expect(board.locator("cg-board piece.black.pawn")).toHaveCount(0);
  await expect(board.getByRole("gridcell", { name: "d5 empty" })).toBeVisible();
});

test("supports keyboard selection, promotion cancellation and underpromotion", async ({ page }) => {
  const board = await previewReply(page, "7k/P7/8/8/8/8/8/7K w - - 0 1");
  await board.locator("[data-square='a7']").press("Enter");
  await board.locator("[data-square='a8']").press("Space");
  const dialog = page.getByRole("dialog", { name: "Choose promotion piece" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Promote to queen" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(board.locator("[data-square='a7']")).toBeFocused();
  await expectPiece(board, "a7", "white pawn");
  await play(board, "a7", "a8");
  await dialog.getByRole("button", { name: "Promote to knight" }).click();
  await expectPiece(board, "a8", "white knight");
  await expect(board.locator("cg-board piece.white.pawn")).toHaveCount(0);
  await expect(page.getByText("Your selected reply:")).toContainText("a8=N");
});

test("keeps pinned moves illegal and native pieces aligned after resize and board flip", async ({ page }, testInfo) => {
  const board = await previewReply(page, "4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1");
  await play(board, "e2", "d2");
  await expectPiece(board, "e2", "white rook");
  await expect(page.getByText("Your selected reply:")).toBeHidden();
  await page.getByRole("button", { name: "Flip board", exact: true }).click();
  await page.setViewportSize({ width: 430, height: 932 });
  await expect(board.locator("[data-square]").first()).toHaveAttribute("data-square", "h1");
  await expectPiece(board, "e2", "white rook");
  await play(board, "e2", "e8");
  await expectPiece(board, "e8", "white rook");
  await expect(board.locator("cg-board piece.black.rook")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("chessground-mobile.png"), fullPage: true });
});

test("collects multiple candidates while restoring the original native position", async ({ page }) => {
  const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  await page.route("**/api/v1/training/candidates/next", route => route.fulfill({ json: {
    kind: "exercise", itemId: "board-regression", attemptId: null, mode: "candidate_generation",
    fen, playerColor: "white", moveNumber: 1, prompt: "Generate candidates.",
  } }));
  await page.route("**/api/v1/training/items/board-regression/start", route => route.fulfill({ json: { attemptId: "board-attempt" } }));
  await page.goto("/#today");
  await page.getByRole("button", { name: "2 · Candidates", exact: true }).click();
  await page.getByRole("button", { name: "Start generating candidates", exact: true }).click();
  const board = page.getByRole("grid", { name: "Chess position" });
  for (const [from, to, san] of [["e2", "e4", "e4"], ["d2", "d4", "d4"], ["g1", "f3", "Nf3"]]) {
    await play(board, from!, to!);
    await expect(page.locator(".entered-candidates strong").getByText(san!, { exact: true })).toBeVisible();
    await expectPiece(board, "e2", "white pawn");
    await expectPiece(board, "d2", "white pawn");
    await expectPiece(board, "g1", "white knight");
  }
});

test("drags from Black's side and moves keyboard focus in the displayed direction", async ({ page }) => {
  const board = await previewReply(page, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1", "black");
  await board.locator("[data-square='h1']").press("ArrowRight");
  await expect(board.locator("[data-square='g1']")).toBeFocused();
  await board.locator("[data-square='g1']").press("ArrowDown");
  await expect(board.locator("[data-square='g2']")).toBeFocused();
  const from = board.locator("[data-square='e7']");
  const to = board.locator("[data-square='e5']");
  await from.scrollIntoViewIfNeeded();
  const start = await from.boundingBox(), end = await to.boundingBox();
  if (!start || !end) throw new Error("Drag squares must be visible");
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 8 });
  await expectPiece(board, "e5", "black pawn"); // Observe a rendered drag frame before releasing.
  await page.mouse.up();
  await expectPiece(board, "e5", "black pawn");
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? "")).toBe("");
});

test("provides licence notices and this build's source without private installation data", async ({ page }) => {
  await page.goto("/#openings");
  await page.getByRole("link", { name: "Source & licences", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Source and licences" })).toBeVisible();
  const source = await page.request.get("/source/thinking-board-frontend.tar.gz");
  expect(source.ok()).toBe(true);
  const files = execFileSync("tar", ["-tzf", "-"], { input: await source.body(), encoding: "utf8" }).split("\n");
  expect(files).toContain("thinking-board-frontend/apps/web/src/components/ChessBoard.tsx");
  expect(files).toContain("thinking-board-frontend/vendor/@lichess-org/chessground/src/chessground.ts");
  expect(files.some(file => /(?:^|\/)(?:data|backups|\.git|\.env)(?:\/|$)|\.sqlite3?$/i.test(file))).toBe(false);
  expect(files.filter(file => /\.pgn$/i.test(file))).toEqual(["thinking-board-frontend/vendor/chess.js/benchmarks/benchmark.pgn"]);
  const notices = await page.request.get("/legal/notices.txt");
  expect(await notices.text()).toContain("GNU GENERAL PUBLIC LICENSE");
  expect(await notices.text()).toContain("MIT License");
});

for (const reduce of [false, true]) {
  test(`animates position changes and respects reduced motion (${reduce ? "reduced" : "normal"})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
    await page.route("**/api/v1/training/next", route => route.fulfill({ json: {
      kind: "exercise", itemId: "board-regression", attemptId: null, mode: "blunder_check",
      fenBefore: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      fenAfterCandidate: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      candidateMoveUci: "e2e4", candidateMoveSan: "e4", playerColor: "white", moveNumber: 1, prompt: "Inspect the reply.",
    } }));
    await page.route("**/api/v1/training/items/board-regression/start", route => route.fulfill({ json: { attemptId: "board-attempt" } }));
    await page.goto("/#today");
    const board = page.getByRole("grid", { name: "Chess position" });
    await expectPiece(board, "e2", "white pawn");
    expect(await board.locator(".board-square-layer").evaluate(element => getComputedStyle(element).touchAction)).toBe("auto");
    await board.evaluate(element => {
      // Record observable animation classes, not Chessground/React internal state.
      const observer = new MutationObserver(() => {
        if (element.querySelector("piece.anim")) element.setAttribute("data-test-animation-seen", "true");
      });
      observer.observe(element, { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
    });
    await page.getByRole("button", { name: "Play my move on the board", exact: true }).click();
    await expectPiece(board, "e4", "white pawn");
    expect(await board.locator(".board-square-layer").evaluate(element => getComputedStyle(element).touchAction)).toBe("none");
    if (reduce) await expect(board).not.toHaveAttribute("data-test-animation-seen", "true");
    else await expect(board).toHaveAttribute("data-test-animation-seen", "true");
  });
}

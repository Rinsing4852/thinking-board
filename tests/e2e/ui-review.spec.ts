import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  // These home-screen checks must not resume sessions left by other serial journeys.
  await page.route("**/api/v1/openings/reviews/active", route => route.fulfill({ json: null }));
  await page.route("**/api/v1/training/session/active", route => route.fulfill({ json: null }));
});

test("opens the library and its board without waiting for suggestions or progress", async ({ page }, testInfo) => {
  await page.route("**/api/v1/openings/lessons/active", route => route.fulfill({ json: null }));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let waiting = 0;
  await page.route(/\/api\/v1\/openings\/(?:progress|reviews\/recommended)$/, async route => {
    waiting++; await gate; await route.continue();
  });
  try {
    await page.goto("/#today");
    await page.getByRole("button", { name: "Openings", exact: true }).click();
    const card = page.locator("article.opening-card").filter({ hasText: "Practical 1.e4 Repertoire" });
    await expect(card).toBeVisible();
    await expect.poll(() => waiting).toBe(2);
    await expect(page.getByText("Loading opening practice…", { exact: true })).toBeHidden();
    await expect(page.getByText("Preparing your practice suggestions…", { exact: true })).toBeVisible();
    await card.locator("summary").click();
    await card.getByRole("button", { name: "View all lines", exact: true }).click();
    await expect(page.getByRole("region", { name: "Opening board and moves" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("library-before-statistics.png") });
    const completed = page.waitForResponse(response => response.url().endsWith("/api/v1/openings/progress"));
    release(); await completed;
    await expect(page.getByText("could not be refreshed", { exact: false })).toBeHidden();
  } finally { release(); }
});

test("keeps the library usable when statistics fail and retries summaries independently", async ({ page }) => {
  await page.route("**/api/v1/openings/lessons/active", route => route.fulfill({ json: null }));
  let fail = true;
  await page.route("**/api/v1/openings/progress", route => fail
    ? route.fulfill({ status: 503, json: { error: "Statistics fixture failure" } }) : route.continue());
  await page.goto("/#openings");
  await expect(page.locator("article.opening-card").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Build on the board", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toContainText("Opening statistics could not be refreshed");
  fail = false;
  // The retry action precedes optional content, so late data cannot move it.
  const retried = page.waitForResponse(response => response.url().endsWith("/api/v1/openings/progress") && response.ok());
  await page.getByRole("button", { name: "Retry opening summaries", exact: true }).click();
  await retried;
  await expect(page.getByRole("alert")).toBeHidden();
  await expect(page.locator("article.opening-card").first()).toBeVisible();
});

test("restores a saved opening session before optional summaries complete", async ({ page }, testInfo) => {
  await page.unroute("**/api/v1/openings/reviews/active");
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: '[Event "Fast resume"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 *',
    learnerColor: "white", name: `Fast resume ${testInfo.project.name}`, ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const id = (await imported.json()).repertoireIds[0];
  const started = await page.request.post(`/api/v1/openings/repertoires/${id}/reviews/start`, { data: { mode: "new" } });
  expect(started.ok()).toBeTruthy();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(/\/api\/v1\/openings\/(?:progress|reviews\/recommended)$/, async route => { await gate; await route.continue(); });
  try {
    await page.goto("/#openings");
    await expect(page.getByRole("grid", { name: "Chess position" })).toBeVisible();
    await expect(page.getByText("Loading opening practice…", { exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
    const completed = page.waitForResponse(response => response.url().endsWith("/api/v1/openings/progress"));
    release(); await completed;
  } finally { release(); }
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
  await expect(page.getByRole("region", { name: "Opening progress", exact: true })).toContainText("figures below cover thinking drills");
  await page.screenshot({ path: testInfo.outputPath("progress-first-run.png"), fullPage: true });
  await page.getByRole("button", { name: "View opening progress", exact: true }).click();
  await expect(page).toHaveURL(/#openings$/);
  await page.getByRole("button", { name: "Progress", exact: true }).click();
  await page.getByRole("button", { name: "Import a game to begin" }).click();
  await expect(page).toHaveURL(/#games$/);
});

test("keeps home screens and saved-line workspaces within intermediate tablet widths", async ({ page }, testInfo) => {
  await page.route("**/api/v1/openings/lessons/active", route => route.fulfill({ json: null }));
  // Always render the training board. Previously this depended on whether an
  // earlier game's asynchronous analysis had produced a drill by this point.
  const fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  await page.route("**/api/v1/training/next", route=>route.fulfill({json:{
    kind:"exercise",itemId:"tablet-layout",attemptId:null,mode:"blunder_check",fenBefore:fen,fenAfterCandidate:fen,
    candidateMoveUci:"e2e4",candidateMoveSan:"e4",playerColor:"white",moveNumber:1,prompt:"Inspect this position.",
  }}));
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: '[Event "Tablet layout"]\n[Result "*"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 *',
    learnerColor: "white", name: `My complete practical repertoire with a distinguishing long title ${testInfo.project.name}`, ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const id = (await imported.json()).repertoireIds[0];
  const detail = await (await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  const line = detail.chapters[0].lines[0];
  for (const width of [821, 900, 1024]) {
    await page.setViewportSize({ width, height: 768 });
    for (const view of ["today", "openings", "games", "progress"]) {
      await page.goto(`/#${view}`);
      if(view==="today") await expect(page.getByRole("grid",{name:"Chess position",exact:true})).toBeVisible();
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    await page.goto(`/#openings?repertoire=${encodeURIComponent(id)}&line=${encodeURIComponent(line.id)}&ply=0`);
    const board = page.getByRole("region", { name: "Opening board and moves" });
    await expect(board).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await board.locator(".chessboard").boundingBox();
    expect(box!.width).toBeCloseTo(box!.height, 0);
    await page.screenshot({ path: testInfo.outputPath(`tablet-workspace-${width}.png`), fullPage: true });
  }
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

test("keeps an unsaved preparation idea when background analysis refreshes the inbox", async ({ page }, testInfo) => {
  const name = `Refresh-safe idea ${testInfo.project.name}`;
  const player = `Idea learner ${testInfo.project.name}`;
  const reply = testInfo.project.name === "webkit" ? "Nf6" : "d5";
  const imported = await page.request.post("/api/v1/openings/imports/pgn", { data: {
    pgn: `[Event "${name}"]\n[Result "*"]\n\n1. Nf3 ${reply} 2. g3 e6 3. Bg2 *`,
    learnerColor: "white", name, ownershipConfirmed: true,
  } });
  expect(imported.ok()).toBeTruthy();
  const game = await page.request.post("/api/v1/imports/pgn", { data: {
    pgn: `[White "${player}"]\n[Black "Opponent"]\n[Result "*"]\n\n1. Nf3 ${reply} 2. g3 h6 3. Bg2 *`, playerName: player,
  } });
  expect(game.ok()).toBeTruthy();
  const profiles = await (await page.request.get("/api/v1/profiles")).json();
  const learner = profiles.profiles.find((profile: { displayName: string }) => profile.displayName === player);
  expect((await page.request.post(`/api/v1/profiles/${learner.id}/activate`)).ok()).toBeTruthy();
  let analysisFinished = false;
  let release: (() => void) | undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  const job = { id: "idea-refresh-test-job", status: "analyzing", progressCurrent: 0, progressTotal: 1, error: null };
  await page.route("**/api/v1/jobs/active", route => route.fulfill({ json: analysisFinished ? null : job }));
  await page.route("**/api/v1/jobs/idea-refresh-test-job", async route => {
    await held; analysisFinished = true;
    await route.fulfill({ json: { ...job, status: "completed" } });
  });
  await page.goto("/#games");
  const advice = page.locator("article.opening-inbox-item").filter({ hasText: name }).getByRole("region", { name: "Worth preparing?" });
  await advice.getByRole("button", { name: "Keep an idea instead", exact: true }).click();
  const note = "Finish development before expanding this rare reply.";
  const noteInput = advice.locator(".opening-preparation-note textarea");
  await noteInput.fill(note);
  const refreshed = page.waitForResponse(response => response.url().endsWith("/openings/game-inbox") && response.status() === 200);
  release!();
  await (await refreshed).finished();
  await expect(page.getByText("Analysis complete. Your exercises and repertoire comparison are ready below.", { exact: true })).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(noteInput).toHaveValue(note);
  await advice.getByRole("button", { name: "Save idea without a line", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Idea kept." })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /Show all/ }).click();
  await expect(advice.getByText(note, { exact: true })).toBeVisible();
});

for(const failProgress of [false,true]) {
  test(`keeps repertoire touch targets fixed when delayed summaries ${failProgress?"fail":"arrive"}`,async({page},testInfo)=>{
    await page.route("**/api/v1/openings/lessons/active",route=>route.fulfill({json:null}));
    const recommended=await(await page.request.get("/api/v1/openings/reviews/recommended")).json();
    const progress=await(await page.request.get("/api/v1/openings/progress")).json();
    let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let waiting=0;
    await page.route("**/api/v1/openings/reviews/recommended",async route=>{waiting++;await gate;await route.fulfill({json:recommended});});
    await page.route("**/api/v1/openings/progress",async route=>{waiting++;await gate;await route.fulfill(failProgress?{status:503,json:{error:"Delayed statistics failure"}}:{json:progress});});
    await page.route("**/api/v1/openings/coverage/recommended?*",route=>route.fulfill({json:{ratingGroup:1600,repertoireId:recommended.repertoire?.id,gaps:[{
      positionId:"delayed-gap",fen:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      chapterTitle:"Delayed sample",lineTitle:"Late coverage",moveUci:"d2d4",moveSan:"d4",games:0,frequencyPercent:0,
    }]}}));
    try {
      await page.goto("/#openings");await expect.poll(()=>waiting).toBe(2);
      const card=page.locator("article.opening-card").first(),summary=card.locator("summary").first();
      await summary.scrollIntoViewIfNeeded();
      const before=await summary.evaluate(el=>({top:el.getBoundingClientRect().top,documentTop:el.getBoundingClientRect().top+window.scrollY}));
      const bounds=await summary.boundingBox();expect(bounds).not.toBeNull();
      await page.mouse.move(bounds!.x+24,bounds!.y+24);await page.mouse.down();
      const loaded=page.waitForResponse(response=>response.url().endsWith("/api/v1/openings/progress"));
      release();await loaded;
      await expect(page.getByText("Preparing your practice suggestions…",{exact:true})).toBeHidden();
      if(failProgress)await expect(page.getByRole("alert")).toContainText("Opening statistics could not be refreshed");
      else await expect(page.locator(".opening-home-progress")).toBeVisible();
      await expect(page.locator(".opening-home-shell")).toHaveClass(/has-focus-board/);
      await expect(page.getByRole("button",{name:/Consider d4 Late coverage/})).toBeVisible();
      const after=await summary.evaluate(el=>({top:el.getBoundingClientRect().top,documentTop:el.getBoundingClientRect().top+window.scrollY}));
      expect(Math.abs(after.documentTop-before.documentTop)).toBeLessThanOrEqual(1);
      expect(Math.abs(after.top-before.top)).toBeLessThanOrEqual(1);
      await page.mouse.up();await expect(card.locator("details").first()).toHaveAttribute("open","");
      const open=card.getByRole("button",{name:"View all lines",exact:true});
      if(failProgress){await open.focus();await open.press("Enter");}
      else if(testInfo.project.use.hasTouch)await open.tap();else await open.click();
      await expect(page.getByRole("region",{name:"Opening board and moves",exact:true})).toBeVisible();
      await page.screenshot({path:testInfo.outputPath("stable-delayed-summary.png")});
    } finally {release();await page.mouse.up();}
  });
}

test("starts and resumes practice from the stable action before optional summaries",async({page},testInfo)=>{
  await page.route("**/api/v1/openings/lessons/active",route=>route.fulfill({json:null}));
  const imported=await page.request.post("/api/v1/openings/imports/pgn",{data:{
    pgn:`[Event "Direct practice ${testInfo.project.name} ${testInfo.repeatEachIndex}"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 h6 *`,
    name:`Direct practice ${testInfo.project.name} ${testInfo.repeatEachIndex}`,learnerColor:"white",ownershipConfirmed:true,
  }});expect(imported.ok()).toBeTruthy();const id=(await imported.json()).repertoireIds[0];
  const detail=await(await page.request.get(`/api/v1/openings/repertoires/${id}`)).json();
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let waiting=0,starts=0;
  await page.route(/\/api\/v1\/openings\/(?:progress|reviews\/recommended)$/,async route=>{waiting++;await gate;await route.continue().catch(()=>undefined);});
  await page.route("**/api/v1/openings/reviews/recommended/start",async route=>{
    starts++;const response=await page.request.post(`/api/v1/openings/repertoires/${id}/lines/${detail.chapters[0].lines[0].id}/reviews/start`);
    expect(response.ok()).toBeTruthy();await route.fulfill({json:await response.json()});
  });
  try {
    await page.goto("/#openings");await expect.poll(()=>waiting).toBe(2);
    const action=page.getByRole("region",{name:"Choose how to learn",exact:true}).getByRole("button",{name:"Practise my repertoire",exact:true});
    await action.click();await expect(page.getByRole("grid",{name:"Chess position",exact:true})).toBeVisible();
    const active=await(await page.request.get("/api/v1/openings/reviews/active")).json();
    await page.getByRole("button",{name:"Pause",exact:true}).click();await action.click();
    await expect(page.getByRole("grid",{name:"Chess position",exact:true})).toBeVisible();
    const resumed=await(await page.request.get("/api/v1/openings/reviews/active")).json();
    expect(resumed.queueEntryId).toBe(active.queueEntryId);expect(starts).toBe(1);
  } finally {release();}
});

test("keeps the game-import action fixed while player choices arrive",async({page},testInfo)=>{
  const base=await(await page.request.get("/api/v1/dashboard")).json();
  const profile=base.profile??{id:"delayed-primary",displayName:"Primary learner"};
  await page.route("**/api/v1/dashboard",route=>route.fulfill({json:{...base,profile,
    totals:{...base.totals,games:0,trainingItems:0,attempts:0,due:0},recurringProblems:[],recommendedSession:[]}}));
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let waiting=0;
  await page.route("**/api/v1/profiles",async route=>{waiting++;await gate;await route.fulfill({json:{activeProfileId:profile.id,profiles:[profile,{id:"delayed-other",displayName:"Another learner with a longer name"}]}});});
  try {
    await page.goto("/#progress");await expect.poll(()=>waiting).toBe(1);
    const action=page.getByRole("button",{name:"Import a game to begin",exact:true});
    await action.scrollIntoViewIfNeeded();const before=await action.boundingBox();expect(before).not.toBeNull();
    await page.mouse.move(before!.x+20,before!.y+20);await page.mouse.down();release();
    await expect(page.getByRole("combobox",{name:"Player",exact:true})).toBeEnabled();
    const after=await action.boundingBox();expect(after).not.toBeNull();
    await testInfo.attach("import-action-layout",{body:JSON.stringify({before,after}),contentType:"application/json"});
    expect(Math.abs(after!.y-before!.y)).toBeLessThanOrEqual(1);expect(Math.abs(after!.x-before!.x)).toBeLessThanOrEqual(1);
    await page.mouse.up();await expect(page).toHaveURL(/#games$/);
  } finally {release();await page.mouse.up();}
});

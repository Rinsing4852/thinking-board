import {expect,test,type Page} from "@playwright/test";
import {Chess} from "chess.js";
test.use({baseURL:"http://127.0.0.1:8192"});

// Projects share this disposable server. Extra matching examples must not
// displace the earlier ranking fixtures when the phone project starts.
test.afterEach(async({page},testInfo)=>{
  if(!/^(finds stronger-player study|guesses Black's moves)/.test(testInfo.title))return;
  const library=await(await page.request.get("/api/v1/openings/study-games")).json();
  for(const entry of library.games.filter((entry:{source:string})=>["Home guessing fixture","Black guessing fixture"].includes(entry.source))) {
    expect((await page.request.delete(`/api/v1/openings/study-games/${entry.id}`)).ok()).toBeTruthy();
  }
});

async function openStudy(page:Page,name:string,pgn:string,color="black") {
  await page.route("**/api/v1/openings/reviews/active",route=>route.fulfill({json:null}));
  await page.route("**/api/v1/openings/lessons/active",route=>route.fulfill({json:null}));
  const imported=await page.request.post("/api/v1/openings/imports/pgn",{data:{pgn,name,learnerColor:color,ownershipConfirmed:true}});
  expect(imported.ok()).toBeTruthy();const repertoireId=(await imported.json()).repertoireIds[0];
  const detail=await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json(),lineId=detail.chapters[0].lines[0].id;
  await page.goto(`/#openings?repertoire=${repertoireId}&line=${lineId}&ply=${detail.chapters[0].lines[0].moves.length}`);
  await page.getByRole("button",{name:"Study a game from here",exact:true}).click();
  return {repertoireId,lineId,detail};
}
const game=(moves:string,event:string)=>`[Event "${event}"]\n[White "Example White"]\n[Black "Example Black"]\n[WhiteElo "2400"]\n[BlackElo "2380"]\n[Date "2020.01.02"]\n[Result "1/2-1/2"]\n\n${moves} 1/2-1/2`;

test("uses the supplied move numbers and side in custom-start study games",async({page},testInfo)=>{
  // Browser projects share the disposable test library; reset this fixture so
  // a deduplicated repertoire cannot resume the preceding project's cursor.
  const library=await (await page.request.get("/api/v1/openings/study-games")).json();
  for(const entry of library.games.filter((entry:{source:string})=>entry.source==="Custom numbering fixture")) {
    expect((await page.request.delete(`/api/v1/openings/study-games/${entry.id}`)).ok()).toBeTruthy();
  }
  const board=new Chess();for(const move of ["d4","d5","Nf3","Nf6","c4","e6","Nc3"])board.move(move);
  const headers=`[SetUp "1"]\n[FEN "${board.fen()}"]\n`;
  const imported=await page.request.post("/api/v1/openings/study-games/import",{data:{
    pgn:`${headers}[Result "1/2-1/2"]\n\n4... Be7 5. Bg5 O-O 1/2-1/2`,source:"Custom numbering fixture",
  }});expect(imported.ok()).toBeTruthy();
  await openStudy(page,`Custom study ${testInfo.project.name}`,"1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 *");
  const study=page.getByRole("region",{name:"Model-game study",exact:true});
  await study.locator(".opening-study-candidate").filter({hasText:"Custom numbering fixture"}).getByRole("button",{name:"Study this game",exact:true}).click();
  await expect(study.getByText("Last played: 5.Bg5",{exact:true})).toBeVisible();
  await study.getByRole("button",{name:"Previous move",exact:true}).click();
  await expect(study.getByText("Last played: 4...Be7",{exact:true})).toBeVisible();
  await study.getByRole("button",{name:"Jump to match",exact:true}).click();
  await study.getByRole("button",{name:"Next move",exact:true}).click();
  await expect(study.getByText("Last played: 5...O-O",{exact:true})).toBeVisible();
});

test("studies an exact matching game and a transposition, resumes on reload and preserves opening recall",async({page},testInfo)=>{
  const name=`Model study ${testInfo.project.name}`;
  const {repertoireId,lineId,detail}=await openStudy(page,name,"1. d4 d5 2. Nf3 Nf6 3. c4 e6 *");
  const before=await (await page.request.get("/api/v1/openings/activity")).json();
  const ownGames=await (await page.request.get("/api/v1/games")).json();
  const beforeCoverage=await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}/coverage/repertoire?local=true`)).json();
  const study=page.getByRole("region",{name:"Model-game study",exact:true});
  await study.getByText("Import study games",{exact:true}).click();
  // A new library opens this disclosure automatically; keep the controls visible
  // whether earlier journeys have already imported games.
  if(!await study.getByRole("textbox",{name:"Study-game source",exact:true}).isVisible()) await study.getByText("Import study games",{exact:true}).click();
  await study.getByRole("textbox",{name:"Study-game source",exact:true}).fill("My annotated examples");
  await study.getByRole("textbox",{name:"Complete game PGN",exact:true}).fill(
    `${game("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 {Develop the knight toward the centre.} Be7 5. Bg5 O-O","Direct route")}\n\n${game("1. d4 Nf6 2. c4 e6 3. Nf3 d5 4. Nc3 Be7 5. Bg5 O-O","Transposed route")}`);
  await study.getByRole("button",{name:"Import study PGN",exact:true}).click();
  const cards=study.locator(".opening-study-candidate");
  await expect(study.getByRole("region",{name:"Matching study games",exact:true})).toBeFocused();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("along your saved move order");
  await expect(cards.nth(1)).toContainText("different move order");
  await expect(cards.first()).toContainText("Ratings: White 2400 · Black 2380");
  await cards.first().getByRole("button",{name:"Study this game",exact:true}).click();
  await expect(study.getByRole("region",{name:"Study board and replay",exact:true})).toBeFocused();
  await expect(study.getByRole("grid",{name:"Model-game board",exact:true})).toHaveCount(1);
  await expect(page.getByRole("grid")).toHaveCount(1);
  await expect(study.getByText(/Matching position from your repertoire · Replay step 6 of 10/)).toBeVisible();
  await study.getByRole("button",{name:"Next move",exact:true}).click();
  await expect(study.getByText("Develop the knight toward the centre.",{exact:true})).toBeVisible();
  await expect(study.getByRole("gridcell",{name:"c3 white knight",exact:true})).toBeVisible();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:testInfo.outputPath("model-game-study.png"),fullPage:true});
  await page.reload();
  await expect(study.getByText(/Replay step 7 of 10/)).toBeVisible();
  await expect(study.getByText("Develop the knight toward the centre.",{exact:true})).toBeVisible();
  await study.getByRole("button",{name:"Jump to match",exact:true}).click();
  await expect(study.getByText(/Matching position from your repertoire · Replay step 6 of 10/)).toBeVisible();
  // The server commits the move, but the browser loses its acknowledgement.
  // Require explicit recovery before any further study writes.
  await page.route("**/lines/*/study",async route=>{
    const response=await route.fetch();expect(response.ok()).toBeTruthy();
    await route.fulfill({status:503,json:{error:"Save acknowledgement lost"}});
  });
  await study.getByRole("button",{name:"Next move",exact:true}).click();
  await expect(study.getByRole("alert")).toContainText("The save could not be confirmed");
  await expect(study.getByText(/Matching position from your repertoire · Replay step 6 of 10/)).toBeVisible();
  await expect(study.getByRole("button",{name:"Next move",exact:true})).toBeDisabled();
  await expect(cards.nth(1).getByRole("button",{name:"Study this game",exact:true})).toBeDisabled();
  await page.unroute("**/lines/*/study");
  await study.getByRole("button",{name:"Reload study",exact:true}).click();
  await expect(study.getByText(/Replay step 7 of 10/)).toBeVisible();
  await expect(study.getByRole("button",{name:"Next move",exact:true})).toBeEnabled();
  await cards.nth(1).getByRole("button",{name:"Study this game",exact:true}).click();
  await study.getByRole("button",{name:"Back to saved position",exact:true}).click();
  await expect(page.getByRole("heading",{name:detail.repertoire.name,exact:true})).toBeVisible();
  await expect(page.getByRole("region",{name:"Opening board and moves",exact:true})).toBeFocused();
  await expect(page).toHaveURL(/ply=6/);
  await expect(page.getByRole("gridcell",{name:"e6 black pawn",exact:true})).toBeVisible();
  expect(await (await page.request.get("/api/v1/openings/activity")).json()).toEqual(before);
  expect(await (await page.request.get("/api/v1/games")).json()).toEqual(ownGames);
  expect(await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json()).toEqual(detail);
  const coverage=await (await page.request.get(`/api/v1/openings/repertoires/${repertoireId}/coverage/repertoire?local=true`)).json();
  expect(coverage.planScan.snapshot).toBe(beforeCoverage.planScan.snapshot);
  expect(coverage.plans).toEqual(beforeCoverage.plans);
  expect((await page.request.get(`/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/study?ply=6`)).ok()).toBeTruthy();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test("explains missing study games, rejects broken imports and recovers a failed study request",async({page},testInfo)=>{
  const {repertoireId,lineId}=await openStudy(page,`Study recovery ${testInfo.project.name}`,"1. e4 e5 2. Nf3 Nc6 3. Bb5 *","white");
  const study=page.getByRole("region",{name:"Model-game study",exact:true});
  await expect(study.getByText(/Your study library is empty|No saved game reaches this position/)).toBeVisible();
  if(!await study.getByRole("textbox",{name:"Study-game source",exact:true}).isVisible()) await study.getByText("Import study games",{exact:true}).click();
  await study.getByRole("textbox",{name:"Study-game source",exact:true}).fill("Recovery example");
  await study.getByRole("textbox",{name:"Complete game PGN",exact:true}).fill("1. illegal *");
  await study.getByRole("button",{name:"Import study PGN",exact:true}).click();
  await expect(study.getByRole("alert")).toContainText("No study games were added");
  await expect(study.getByRole("textbox",{name:"Complete game PGN",exact:true})).toHaveValue("1. illegal *");
  await study.getByRole("textbox",{name:"Complete game PGN",exact:true}).fill("");
  let fail=true;
  await page.route("**/study?ply=*",route=>fail?route.fulfill({status:503,json:{error:"Study temporarily unavailable"}}):route.continue());
  await page.reload();
  await expect(study.getByRole("alert")).toContainText("Study temporarily unavailable");
  fail=false;await study.getByRole("button",{name:"Reload study",exact:true}).click();
  await expect(study.getByRole("alert")).toHaveCount(0);
  await expect(study.getByRole("grid",{name:"Model-game board",exact:true})).toBeVisible();
  await page.evaluate(()=>window.scrollTo({top:0,behavior:"instant"}));
  await page.screenshot({path:testInfo.outputPath("model-game-empty-recovery.png"),fullPage:true});
  if(!await study.getByRole("textbox",{name:"Complete game PGN",exact:true}).isVisible()) await study.getByText("Import study games",{exact:true}).click();
  await study.getByRole("textbox",{name:"Study-game source",exact:true}).fill("Removal fixture");
  await study.getByRole("textbox",{name:"Complete game PGN",exact:true}).fill(game("1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6","Removable example"));
  await study.getByRole("button",{name:"Import study PGN",exact:true}).click();
  await study.locator(".opening-study-candidate").getByRole("button",{name:"Study this game",exact:true}).click();
  const endpoint=`/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/study?ply=5`;
  const state=await (await page.request.get(endpoint)).json();
  await study.getByText(/Manage study library/).click();
  await study.getByRole("combobox",{name:"Study game to remove",exact:true}).selectOption(state.replay.game.id);
  page.once("dialog",dialog=>dialog.accept());
  await study.getByRole("button",{name:"Remove study game",exact:true}).click();
  await expect(study.getByText(/No saved game reaches this position/)).toBeVisible();
  await expect(study.getByRole("region",{name:"Matching study games",exact:true})).toBeFocused();
  expect((await (await page.request.get(endpoint)).json()).replay).toBeNull();
});


test("finds stronger-player games automatically, retries the provider and replays a matching continuation",async({page},testInfo)=>{
  const {repertoireId}=await openStudy(page,`Automatic study ${testInfo.project.name}`,"1. d4 d5 2. Nf3 Nf6 3. c4 e6 *");
  const study=page.getByRole("region",{name:"Model-game study",exact:true});
  const rating=study.getByRole("spinbutton",{name:"Your Lichess rating",exact:true});
  // Let an automatic remembered-rating search finish before changing criteria.
  await expect(rating).toBeEnabled();
  await rating.fill("1600");
  const before=await(await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json();
  let unavailable=true;
  await page.route("**/study/discover",route=>unavailable?route.fulfill({status:503,json:{error:"Lichess temporarily unavailable"}}):route.continue());
  await study.getByRole("button",{name:"Find games",exact:true}).click();
  await expect(study.getByRole("alert")).toContainText("Lichess temporarily unavailable");
  unavailable=false;
  await study.getByRole("button",{name:"Find games",exact:true}).click();
  const results=study.getByRole("region",{name:"Stronger-player search results",exact:true});
  await expect(results.locator(".opening-study-discovered")).toHaveCount(2);
  await expect(results).toContainText("300 above your 1600 rating");
  await expect(results).toContainText("different move order");
  await expect(results).not.toContainText("weak0001");
  await expect(results.getByRole("link",{name:"View original on Lichess"}).first()).toHaveAttribute("href","https://lichess.org/study001");
  await page.screenshot({path:testInfo.outputPath("automatic-model-games.png"),fullPage:true});
  await results.getByRole("button",{name:"Replay from this position",exact:true}).first().click();
  await expect(study.getByRole("region",{name:"Study board and replay",exact:true})).toBeFocused();
  await expect(study.getByText(/Matching position from your repertoire · Replay step 6 of 12/)).toBeVisible();
  await study.getByRole("button",{name:"Next move",exact:true}).click();
  await expect(study.getByText("Last played: 4.Nc3",{exact:true})).toBeVisible();
  await page.reload();
  await expect(study.getByText(/Replay step 7 of 12/)).toBeVisible();
  await expect(page.getByRole("grid")).toHaveCount(1);
  expect(await(await page.request.get(`/api/v1/openings/repertoires/${repertoireId}`)).json()).toEqual(before);
  await study.getByRole("button",{name:"Back to saved position",exact:true}).click();
  await expect(page).toHaveURL(/ply=6/);
  // Clear saved replay by removing the discovered example, then ensure the next
  // study visit searches with the remembered rating without a manual import.
  const library=await(await page.request.get("/api/v1/openings/study-games")).json();
  for(const game of library.games.filter((game:{source:string})=>game.source==="https://lichess.org/study001")) await page.request.delete(`/api/v1/openings/study-games/${game.id}`);
  await studyVisitAgain();
  async function studyVisitAgain(){
    await page.getByRole("button",{name:"Study a game from here",exact:true}).click();
    await expect(results.locator(".opening-study-discovered")).toHaveCount(2);
    await expect(rating).toHaveValue("1600");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  }
});

test("finds stronger-player study from home and guesses with hidden answers, hints and saved recovery",async({page},testInfo)=>{
  await page.route("**/api/v1/openings/reviews/active",route=>route.fulfill({json:null}));
  await page.route("**/api/v1/openings/lessons/active",route=>route.fulfill({json:null}));
  const imported=await page.request.post("/api/v1/openings/imports/pgn",{data:{pgn:"1. d4 d5 2. Nf3 Nf6 3. c4 e6 *",name:`Home guess ${testInfo.project.name}`,learnerColor:"white",ownershipConfirmed:true}});
  const repertoireId=(await imported.json()).repertoireIds[0];
  const oldLibrary=await(await page.request.get("/api/v1/openings/study-games")).json();
  for(const entry of oldLibrary.games.filter((entry:{source:string})=>entry.source==="Home guessing fixture"))await page.request.delete(`/api/v1/openings/study-games/${entry.id}`);
  await page.request.post("/api/v1/openings/study-games/import",{data:{pgn:game("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 {A note revealed after guessing.} Be7 5. Bf4 O-O",`Home guess ${testInfo.project.name}`),source:"Home guessing fixture"}});
  const before=await (await page.request.get("/api/v1/openings/activity")).json();
  await page.goto("/#openings");
  const routes=page.getByRole("region",{name:"Choose how to learn",exact:true});
  await expect(routes.getByRole("button",{name:"Practise my repertoire",exact:true})).toBeVisible();
  await routes.getByRole("button",{name:"Review my played game",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Import. Analyse. Learn.",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Openings",exact:true}).click();
  await routes.getByLabel("Repertoire for model-game study").selectOption(repertoireId);
  await routes.screenshot({path:testInfo.outputPath("learning-routes.png")});
  await routes.getByRole("button",{name:"Study a stronger player’s game",exact:true}).click();
  const study=page.getByRole("region",{name:"Model-game study",exact:true});
  await study.locator(".opening-study-candidate").filter({hasText:"Home guessing fixture"}).getByRole("button",{name:"Study this game",exact:true}).click();
  await study.getByRole("button",{name:"Guess the player’s moves",exact:true}).click();
  const quiz=study.getByRole("region",{name:"Guess the player's move",exact:true});
  await expect(quiz.getByText("What did the player play here?",{exact:true})).toBeVisible();
  await study.screenshot({path:testInfo.outputPath("model-game-question.png")});
  await expect(study.getByText("A note revealed after guessing.",{exact:true})).toHaveCount(0);
  const board=quiz.getByRole("grid",{name:"Guess-the-move board",exact:true});
  await board.getByRole("gridcell",{name:"e2 white pawn",exact:true}).click();await board.getByRole("gridcell",{name:"e3 empty",exact:true}).click();
  await expect(quiz.getByText("A different legal move",{exact:true})).toBeVisible();
  await expect(quiz).toContainText("The player played Nc3");
  await expect(quiz.getByText("A note revealed after guessing.",{exact:true})).toBeVisible();
  await quiz.getByRole("button",{name:"Try this position again",exact:true}).click();
  await expect(quiz.getByText("A note revealed after guessing.",{exact:true})).toHaveCount(0);
  await quiz.getByRole("button",{name:"Hint: show the piece",exact:true}).click();
  await expect(quiz).toContainText("knight on b1");
  await page.reload();await expect(quiz).toContainText("knight on b1");
  await board.getByRole("gridcell",{name:"b1 white knight",exact:true}).click();await board.getByRole("gridcell",{name:"c3 empty",exact:true}).click();
  await expect(quiz.getByText("You matched the played move",{exact:true})).toBeVisible();
  await expect(quiz).toContainText("1 first attempts · 0 matched without help");
  await quiz.getByRole("button",{name:"Continue guessing",exact:true}).click();
  await expect(quiz).toContainText("Position after replay step 8 of 10");
  // Save reaches the server, but its acknowledgement is lost.
  await page.route("**/study/guess",async route=>{const response=await route.fetch();expect(response.ok()).toBeTruthy();await route.fulfill({status:503,json:{error:"Acknowledgement lost"}});});
  await quiz.getByRole("button",{name:"Show played move",exact:true}).click();
  await expect(study.getByRole("alert")).toContainText("The save could not be confirmed");
  await expect(quiz.getByRole("button",{name:"Show played move",exact:true})).toBeDisabled();
  await page.unroute("**/study/guess");await study.getByRole("button",{name:"Reload study",exact:true}).click();
  await expect(quiz.getByText("Played move shown",{exact:true})).toBeVisible();
  await quiz.getByRole("button",{name:"Continue guessing",exact:true}).click();await expect(quiz.getByText("Study complete",{exact:true})).toBeVisible();
  expect(await (await page.request.get("/api/v1/openings/activity")).json()).toEqual(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath("model-game-guessing.png"),fullPage:true});
});

test("guesses Black's moves and automatically follows White's continuation",async({page},testInfo)=>{
  const {repertoireId,lineId}=await openStudy(page,`Black guessing ${testInfo.project.name}`,"1. d4 d5 2. Nf3 Nf6 3. c4 e6 *","black");
  const oldLibrary=await(await page.request.get("/api/v1/openings/study-games")).json();
  for(const entry of oldLibrary.games.filter((entry:{source:string})=>entry.source==="Black guessing fixture"))await page.request.delete(`/api/v1/openings/study-games/${entry.id}`);
  const imported=await page.request.post("/api/v1/openings/study-games/import",{data:{pgn:game("1. d4 d5 2. Nf3 Nf6 3. c4 e6 4. Nc3 Be7 5. Bg5 h6","Black quiz"),source:"Black guessing fixture"}});expect(imported.ok()).toBeTruthy();
  await page.reload();
  const study=page.getByRole("region",{name:"Model-game study",exact:true});
  await study.locator(".opening-study-candidate").filter({hasText:"Black guessing fixture"}).getByRole("button",{name:"Study this game",exact:true}).click();
  await study.getByRole("button",{name:"Guess the player’s moves",exact:true}).click();
  const quiz=study.getByRole("region",{name:"Guess the player's move",exact:true});
  await expect(quiz).toContainText("Position after replay step 7 of 10");
  const board=quiz.getByRole("grid",{name:"Guess-the-move board",exact:true});
  await expect(board.getByRole("gridcell",{name:"c3 white knight",exact:true})).toBeVisible();
  await board.getByRole("gridcell",{name:"f8 black bishop",exact:true}).click();await board.getByRole("gridcell",{name:"e7 empty",exact:true}).click();
  await expect(quiz.getByText("You matched the played move",{exact:true})).toBeVisible();
  await quiz.getByRole("button",{name:"Continue guessing",exact:true}).click();
  await expect(quiz).toContainText("Position after replay step 9 of 10");
  await expect(board.getByRole("gridcell",{name:"g5 white bishop",exact:true})).toBeVisible();
  await quiz.getByRole("button",{name:"Show played move",exact:true}).click();await quiz.getByRole("button",{name:"Continue guessing",exact:true}).click();
  await expect(quiz.getByText("Study complete",{exact:true})).toBeVisible();
  const progress=(await(await page.request.get(`/api/v1/openings/repertoires/${repertoireId}/lines/${lineId}/study?ply=6`)).json()).quiz.progress;
  expect(progress).toEqual({attempted:2,matchedUnaided:1,helped:1});
  await quiz.getByRole("button",{name:"Study this game again",exact:true}).click();
  await expect(quiz).toContainText("Position after replay step 7 of 10");
  await expect(quiz).toContainText("2 first attempts · 1 matched without help · 1 helped");
});

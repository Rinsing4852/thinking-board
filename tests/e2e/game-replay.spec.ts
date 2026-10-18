import { expect,test,type Page } from "@playwright/test";
test.use({baseURL:"http://127.0.0.1:8192"});
async function fixture(page:Page,label:string) {
  const repertoire=await page.request.post("/api/v1/openings/imports/pgn",{data:{name:label,learnerColor:"white",ownershipConfirmed:true,pgn:'[Event "Saved response"]\n\n1. e4 e5 2. Nf3 Nc6 *'}});
  expect(repertoire.ok()).toBeTruthy();
  // Use a distinct legal continuation per project to avoid the imported-game
  // deduplicator returning the other project's saved replay.
  const tail=label.includes("webkit")?"3. Nc3 Nc6 4. d3 d6":"3. Nc3 Nc6 4. Bc4 d6";
  const imported=await page.request.post("/api/v1/imports/pgn",{data:{playerName:"Replay learner",pgn:`[White "Replay learner"]\n[Black "Replay opponent"]\n[Result "*"]\n\n1. e4 e5 2. f3 Nf6 ${tail} *`}});
  expect(imported.ok()).toBeTruthy();
  const profiles=await(await page.request.get("/api/v1/profiles")).json();
  const learner=profiles.profiles.find((profile:{displayName:string})=>profile.displayName==="Replay learner");
  expect((await page.request.post(`/api/v1/profiles/${learner.id}/activate`)).ok()).toBeTruthy();
  const games=await(await page.request.get("/api/v1/games")).json();
  const game=games.games.find((game:{white:string;black:string})=>game.white==="Replay learner"&&game.black==="Replay opponent");
  expect(game).toBeTruthy();
  await page.goto(`/#games?game=${game.id}`);
  const replay=page.getByRole("region",{name:"Saved game replay",exact:true});
  await expect(replay.getByRole("grid",{name:"Game replay board",exact:true})).toBeVisible();
  await replay.getByRole("button",{name:/2.f3 · Repertoire difference/}).click();
  return {replay,gameId:game.id,repertoireId:(await repertoire.json()).repertoireIds[0]};
}
async function move(page:Page,from:string,to:string) {
  const board=page.getByRole("grid",{name:"Game replay board",exact:true});
  await board.getByRole("gridcell",{name:new RegExp(`^${from} `)}).press("Enter");
  await board.getByRole("gridcell",{name:new RegExp(`^${to} `)}).press("Enter");
}
test("keeps a replay and hidden recall with each game without changing normal practice",async({page},testInfo)=>{
  const {replay,gameId}=await fixture(page,`Replay ${testInfo.project.name}`);
  await replay.getByRole("combobox",{name:"Game position",exact:true}).selectOption("0");
  await replay.getByRole("button",{name:"Next move",exact:true}).click();
  await replay.getByRole("button",{name:"Next move",exact:true}).click();
  await expect(replay.getByRole("button",{name:"Show answer",exact:true})).toBeVisible();
  const before=await(await page.request.get("/api/v1/openings/activity")).json();
  const board=replay.getByRole("grid",{name:"Game replay board",exact:true});
  await expect(replay.getByText(/Accepted in this saved review/)).toBeHidden();
  await move(page,"d2","d4");await expect(replay.getByText(/may still be a good chess move/)).toBeVisible();
  await expect(replay.getByText(/Accepted in this saved review/)).toBeHidden();
  await move(page,"g1","f3");await expect(replay.getByText(/Nf3 is an accepted repertoire response after another try/)).toBeVisible();
  await expect(board.getByRole("gridcell",{name:"f3 white knight",exact:true})).toBeVisible();
  await replay.getByRole("button",{name:"Continue game as played",exact:true}).click();
  await expect(board.getByRole("gridcell",{name:"f3 white pawn",exact:true})).toBeVisible();
  await page.reload();await expect(replay.getByText(/Game as played · Position 3 of/)).toBeVisible();
  expect(await(await page.request.get("/api/v1/openings/activity")).json()).toEqual(before);
  const saved=await(await page.request.get(`/api/v1/games/${gameId}/replay`)).json();
  expect(saved.checkpoints[0].attempts).toBe(2);
  await expect(page.getByRole("grid")).toHaveCount(1);
  await replay.getByRole("button",{name:/2.f3 · Repertoire difference/}).click();
  await replay.getByRole("button",{name:"Show answer",exact:true}).click();
  await expect(replay.getByText(/helped practice, not an unassisted recall/)).toBeVisible();
  await replay.getByRole("button",{name:"Try again in this game",exact:true}).click();
  await expect(replay.getByText(/Accepted in this saved review/)).toBeHidden();
  const header=await page.locator(".site-header").boundingBox(),boardBox=await board.boundingBox();
  expect(boardBox!.y).toBeGreaterThanOrEqual(header!.y+header!.height);
  await page.screenshot({path:testInfo.outputPath("saved-game-recall.png"),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
test("recovers an uncertain replay save and preserves feedback until explicitly refreshed",async({page},testInfo)=>{
  const {replay,gameId,repertoireId}=await fixture(page,`Recovery ${testInfo.project.name}`);
  const state=await(await page.request.get(`/api/v1/games/${gameId}/replay`)).json();
  // The preceding journey may have the same legal PGN. Start this local round
  // explicitly; never assume that deduplication erases a saved review.
  await page.request.post(`/api/v1/games/${gameId}/replay`,{data:{snapshotId:state.snapshotId,version:state.version,action:"jump",ply:2}});
  await page.reload();
  await page.route(`**/games/${gameId}/replay`,async route=>{
    if(route.request().method()!=="POST")return route.continue();
    const response=await route.fetch();expect(response.ok()).toBeTruthy();
    await route.fulfill({status:503,json:{error:"Save acknowledgement lost"}});
  });
  await replay.getByRole("button",{name:"Show answer",exact:true}).click();
  await expect(replay.getByRole("alert")).toContainText("The save could not be confirmed");
  await expect(replay.getByRole("button",{name:"Show answer",exact:true})).toBeDisabled();
  await page.unroute(`**/games/${gameId}/replay`);
  await replay.getByRole("button",{name:"Reload saved review",exact:true}).click();
  await expect(replay.getByText(/Accepted in this saved review: Nf3/)).toBeVisible();
  const original=await(await page.request.get(`/api/v1/games/${gameId}/replay`)).json();
  expect((await page.request.patch(`/api/v1/openings/repertoires/${repertoireId}`,{data:{name:`Replay feedback refresh ${testInfo.project.name} ${Date.now()}`}})).ok()).toBeTruthy();
  await page.reload();
  await expect(replay.getByText(/This replay keeps the feedback you saved/)).toBeVisible();
  expect((await(await page.request.get(`/api/v1/games/${gameId}/replay`)).json()).snapshotId).toBe(original.snapshotId);
  page.once("dialog",dialog=>dialog.accept());
  await replay.getByRole("button",{name:"Refresh saved feedback",exact:true}).click();
  await expect(replay.getByText(/Accepted in this saved review/)).toBeHidden();
  await replay.getByRole("button",{name:/2.f3 · Repertoire difference/}).click();
  await expect(replay.getByRole("button",{name:"Show answer",exact:true})).toBeEnabled();
});

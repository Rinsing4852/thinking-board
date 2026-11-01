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
  // A question can render before the preceding save unlocks board input.
  await expect(board).toHaveClass(/\binteractive\b/);
  const origin=board.getByRole("gridcell",{name:new RegExp(`^${from} `)});
  await origin.press("Enter");
  await expect(origin).toHaveAttribute("aria-selected","true");
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

test("filters opening recall on one board, resumes a round and distinguishes reviewed from skipped",async({page},info)=>{
  const learner=`Focused learner ${info.project.name}`;
  await page.request.post('/api/v1/openings/imports/pgn',{data:{name:`Focused opening ${info.project.name}`,learnerColor:'white',ownershipConfirmed:true,pgn:'1. e4 e5 *'}});
  const imported=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:learner,pgn:`[White "${learner}"]\n[Black "Focus opponent"]\n[Result "*"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. f3 e5 *`}})).json();
  await page.request.post(`/api/v1/profiles/${imported.profileId}/activate`);
  const game=(await(await page.request.get('/api/v1/games')).json()).games[0];
  await page.goto(`/#games?game=${game.id}`);
  const replay=page.getByRole('region',{name:'Saved game replay',exact:true});
  const controls=replay.getByRole('region',{name:'Practise from this game',exact:true});
  await expect(controls).toContainText('Engine analysis is not included');
  await controls.locator('summary').click();
  await controls.getByRole('checkbox',{name:/Opening recall/}).check();
  await expect(controls.getByRole('checkbox',{name:/Recommended/})).not.toBeChecked();
  await expect(controls).toContainText('2 positions · Opening recall');
  await controls.locator('summary').click();
  await controls.screenshot({path:info.outputPath('game-practice-ready.png')});
  const original=await(await page.request.get(`/api/v1/games/${game.id}/replay`)).json();
  const openingActivity=await(await page.request.get('/api/v1/openings/activity')).json();
  await controls.getByRole('button',{name:'Start practice',exact:true}).click();
  await expect(controls).toContainText('Position 1 of 2');
  await controls.locator('summary').click();
  await expect(controls.getByRole('checkbox',{name:/Opening recall/})).toBeDisabled();
  await controls.locator('summary').click();
  await expect(replay.getByText(/Accepted in this saved review/)).toBeHidden();
  await expect(replay.getByRole('group',{name:'Game replay controls',exact:true})).toBeHidden();
  await page.reload();
  await expect(controls).toContainText('Position 1 of 2');
  await expect(replay.getByText(/Accepted in this saved review/)).toBeHidden();
  await replay.getByRole('button',{name:'Skip this position',exact:true}).click();
  await expect(controls).toContainText('Position 2 of 2');
  await expect(controls).toContainText('0 reviewed · 1 skipped');
  await page.reload();await expect(controls).toContainText('Position 2 of 2');
  await replay.getByRole('button',{name:'Show answer',exact:true}).click();
  await expect(replay.getByText(/helped practice, not an unassisted recall/)).toBeVisible();
  await replay.getByRole('button',{name:'Finish practice',exact:true}).click();
  await expect(controls).toContainText('Practice finished');await expect(controls).toContainText('1 reviewed · 1 skipped');
  await expect(controls).toContainText('does not prove mastery');
  const completed=await(await page.request.get(`/api/v1/games/${game.id}/replay`)).json();
  expect(completed.snapshotId).toBe(original.snapshotId);expect(completed.practice.status).toBe('completed');
  expect(completed.checkpoints.reduce((total:number,p:{attempts:number})=>total+p.attempts,0)).toBe(0);
  expect(await(await page.request.get('/api/v1/openings/activity')).json()).toEqual(openingActivity);
  expect(await(await page.request.get('/api/v1/jobs/active')).json()).toBeNull();
  await page.reload();await expect(controls).toContainText('Practice finished');
  await controls.getByRole('button',{name:'Back to full replay',exact:true}).click();
  await expect(replay.getByRole('combobox',{name:'Game position',exact:true})).toBeVisible();
  await controls.locator('summary').click();
  await controls.getByRole('checkbox',{name:/Opening recall/}).uncheck();
  await expect(controls.getByRole('button',{name:'Start practice',exact:true})).toBeDisabled();
  await controls.getByRole('checkbox',{name:/Move improvements/}).check();
  await expect(controls).toContainText('0 positions · Move improvements');
  await expect(controls.getByRole('button',{name:'Start practice',exact:true})).toBeDisabled();
  await expect(replay.getByRole('grid',{name:'Game replay board',exact:true})).toHaveCount(1);
  await controls.locator('summary').click();
  await controls.screenshot({path:info.outputPath('game-practice-filters.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('tracks review completion in the saved game and library without awarding recall',async({page},info)=>{
 const learner=`Completion learner ${info.project.name}`;
 await page.request.post('/api/v1/openings/imports/pgn',{data:{name:`Completion opening ${info.project.name}`,learnerColor:'white',ownershipConfirmed:true,pgn:'1. e4 e5 *'}});
 const imported=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:learner,pgn:`[White "${learner}"]\n[Black "Completion opponent"]\n\n1. Nf3 Nf6 2. Ng1 Ng8 3. f3 e5 *`}})).json();
 await page.request.post(`/api/v1/profiles/${imported.profileId}/activate`);
 const gameId=(await(await page.request.get('/api/v1/games')).json()).games[0].id;
 await page.goto(`/#games?game=${gameId}`);
 const replay=page.getByRole('region',{name:'Saved game replay',exact:true});
 await replay.getByLabel('Game review status',{exact:true}).selectOption('not_started');
 await expect(replay.getByRole('button',{name:'Mark this decision reviewed',exact:true})).toBeEnabled();
 await replay.getByRole('button',{name:'Mark this decision reviewed',exact:true}).click();
 await expect(replay.getByRole('button',{name:'Reopen this decision',exact:true})).toBeEnabled();
 const saved=await(await page.request.get(`/api/v1/games/${gameId}/replay`)).json();
 expect(saved.checkpoints.find((point:{id:string})=>point.id===saved.activeCheckpointId).reviewed).toBe(true);
 await replay.getByLabel('Game review status',{exact:true}).selectOption('in_progress');
 await expect(replay.getByLabel('Game review status',{exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Back to games',exact:true}).click();
 await page.getByLabel('Filter by review status',{exact:true}).selectOption('in_progress');
 const chip=page.locator('.game-chip').filter({hasText:'Completion opponent'});
 await expect(chip).toHaveCount(1);await expect(chip).toContainText('Partially reviewed');
 await chip.click();
 await replay.getByLabel('Game review status',{exact:true}).selectOption('complete');
 await expect(replay.getByLabel('Game review status',{exact:true})).toBeEnabled();
 await page.reload();await expect(replay.getByLabel('Game review status',{exact:true})).toHaveValue('complete');
 await page.getByRole('button',{name:'Back to games',exact:true}).click();
 await page.getByLabel('Filter by review status',{exact:true}).selectOption('complete');
 await expect(chip).toContainText('Review complete');
 await page.screenshot({path:info.outputPath('game-library-completion.png'),fullPage:true});
});

test('waits for an in-flight review save before refreshing completed-analysis state',async({page},info)=>{
 const {replay,gameId}=await fixture(page,`Concurrent save ${info.project.name}`);
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let saved=false,reads=0;
 await page.route(`**/api/v1/games/${gameId}/replay`,async route=>{
  if(route.request().method()==='GET'){reads++;return route.continue();}
  if(route.request().postDataJSON().action==='review_point'){
   const response=await route.fetch();saved=true;await gate;return route.fulfill({response});
  }
  await route.continue();
 });
 try{
  const mark=replay.getByRole('button',{name:/^(Mark this decision reviewed|Reopen this decision)$/});
  const wasReviewed=(await mark.innerText())==='Reopen this decision';
  await mark.click();await expect.poll(()=>saved).toBe(true);
  let refreshed=false;page.on('response',response=>{if(response.url().endsWith(`/games/${gameId}/review`))refreshed=true;});
  await page.evaluate(()=>window.dispatchEvent(new Event('analysis-requested')));
  await expect.poll(()=>refreshed).toBe(true);expect(reads).toBe(0);
  release();
  await expect(replay.getByRole('button',{name:wasReviewed?'Mark this decision reviewed':'Reopen this decision',exact:true})).toBeEnabled();
  await expect.poll(()=>reads).toBeGreaterThan(0);
  await expect(replay.getByRole('alert')).toHaveCount(0);
 }finally{release();}
});

test('shows an opponent table with source filters and credits cross-game practice to each source review',async({page},info)=>{
 const learner=`Across games ${info.project.name}`;
 await page.request.post('/api/v1/openings/imports/pgn',{data:{name:learner,learnerColor:'white',ownershipConfirmed:true,pgn:'1. e4 e5 *'}});
 await page.request.post('/api/v1/openings/imports/pgn',{data:{name:`${learner} black`,learnerColor:'black',ownershipConfirmed:true,pgn:'1. d4 d5 *'}});
 const cases=[{opponent:'Lichess rival',site:`https://lichess.org/${info.project.name==='webkit'?'crossw01':'crossc01'}`,date:'2026.10.28'},
  {opponent:'Chess.com rival',site:'Chess.com',date:'2026.10.29'},{opponent:'PGN rival',site:'Club game',date:'2026.10.30',black:true}];
 let profileId='';
 for(const game of cases){const imported=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:learner,pgn:`[White "${game.black?game.opponent:learner}"]\n[Black "${game.black?learner:game.opponent}"]\n[Site "${game.site}"]\n[Date "${game.date}"]\n[Result "${game.black?'1/2-1/2':'0-1'}"]\n\n${game.black?'1. d4 f6 2. e4 e5 1/2-1/2':'1. f3 e5 2. g4 Qh4# 0-1'}`}})).json();profileId=imported.profileId;expect(imported.imported).toBe(1);}
 await page.request.post(`/api/v1/profiles/${profileId}/activate`);
 await page.goto('/#games');
 const table=page.getByRole('table');await expect(table.getByRole('row')).toHaveCount(4);
 await expect(table).not.toContainText(learner);
 await page.screenshot({path:info.outputPath('games-source-table.png'),fullPage:true});
 for(const heading of ['Opponent','Colour','Result','Date','Source','Review'])await expect(table.getByRole('columnheader',{name:heading,exact:true})).toBeVisible();
 const source=page.getByRole('combobox',{name:'Filter by source',exact:true});
 expect(await source.evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
 for(const [value,label] of [['lichess','Lichess rival'],['chesscom','Chess.com rival'],['pgn','PGN rival']]){
  await source.selectOption(value!);await expect(table.getByRole('row')).toHaveCount(2);await expect(table.getByRole('button',{name:label!,exact:true})).toBeVisible();
 }
 // A non-button cell also opens the row's game. Back preserves filters.
 await expect(table.getByRole('cell',{name:'Black',exact:true})).toBeVisible();
 await table.getByRole('cell',{name:'Draw',exact:true}).click();
 await expect(page.getByRole('region',{name:'Saved game replay',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Back to games',exact:true}).click();await expect(source).toHaveValue('pgn');
 await source.selectOption('all');
 await page.getByRole('button',{name:'Practise across games',exact:true}).click();
 const practice=page.getByRole('region',{name:'Practice across games',exact:true});
 await practice.getByLabel('Practice type',{exact:true}).selectOption('opening');
 await practice.getByRole('button',{name:'Find practice positions',exact:true}).click();
 await expect(practice).toContainText('Position 1 of 3');
 const games=(await(await page.request.get('/api/v1/games')).json()).games;
 const newest=games.find((game:{white:string;black:string})=>game.black==='PGN rival'||game.white==='PGN rival');
 await practice.getByRole('button',{name:'Skip this position',exact:true}).click();
 await expect(practice).toContainText('Position 2 of 3');
 await practice.getByRole('button',{name:'Show answer',exact:true}).click();
 await expect(practice.getByRole('button',{name:'Next position',exact:true})).toBeEnabled();
 await practice.getByRole('button',{name:'Next position',exact:true}).click();
 await expect(practice).toContainText('Position 3 of 3');
 await practice.getByRole('button',{name:'Show answer',exact:true}).click();
 await practice.getByRole('button',{name:'Finish round',exact:true}).click();
 await expect(practice).toContainText('2 reviewed · 1 skipped');
 const updated=(await(await page.request.get('/api/v1/games')).json()).games;
 expect(updated.filter((game:{reviewProgress:{status:string}})=>game.reviewProgress.status==='complete')).toHaveLength(2);
 expect(updated.find((game:{id:string})=>game.id===newest.id).reviewProgress.status).toBe('not_started');
 const reviewed=updated.find((game:{reviewProgress:{status:string}})=>game.reviewProgress.status==='complete');
 const replay=await(await page.request.get(`/api/v1/games/${reviewed.id}/replay`)).json();
 expect(replay.checkpoints[0]).toMatchObject({reviewed:true,recalled:false});
 await expect(table.getByRole('cell').filter({hasText:'Review complete'})).toHaveCount(2);
 await practice.getByRole('button',{name:'Find practice positions',exact:true}).click();
 await expect(practice).toContainText('Position 1 of 1');
 expect(await(await page.request.get('/api/v1/jobs/active')).json()).toBeNull();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('cross-game-practice.png'),fullPage:true});
});

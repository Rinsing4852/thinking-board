import { expect,test } from "@playwright/test";
test.use({baseURL:"http://127.0.0.1:8192"});
test("requests individual and selected/all analysis, retains reports, and compares completed games",async({page},testInfo)=>{
  const learner=`Quality learner ${testInfo.project.name}`;
  const lines=[`1. e4 c5 2. Nf3 d6 3. Bb5+ Nd7 4. d3 Ngf6${testInfo.project.name==="webkit"?" 5. O-O a6":""}`,`1. d4 g6 2. c4 Bg7 3. Nc3 d6 4. e4 Nf6 5. Nf3 O-O${testInfo.project.name==="webkit"?" 6. Be2 e5":""}`];
  for(let i=0;i<2;i++){
    const imported=await page.request.post("/api/v1/imports/pgn",{data:{pgn:`[White "${learner}"]\n[Black "Quality opponent ${i}"]\n[Date "2026.10.${20+i}"]\n[TimeControl "600+0"]\n[Result "1-0"]\n\n${lines[i]} 1-0`,playerName:learner}});
    expect(imported.ok()).toBeTruthy();expect((await imported.json()).jobId).toBeNull();
  }
  const profiles=await(await page.request.get("/api/v1/profiles")).json();
  const profile=profiles.profiles.find((p:{displayName:string})=>p.displayName===learner);
  expect((await page.request.post(`/api/v1/profiles/${profile.id}/activate`)).ok()).toBeTruthy();
  const games=(await(await page.request.get("/api/v1/games")).json()).games;
  expect(games).toHaveLength(2);expect(await(await page.request.get("/api/v1/jobs/active")).json()).toBeNull();
  await page.goto(`/#games?game=${games[0].id}`);
  const report=page.getByRole("region",{name:"Game move-quality report",exact:true});
  await expect(report).toContainText("No move-quality report yet");
  await report.getByRole("button",{name:"Analyse this game",exact:true}).click();
  await expect(report.getByText("Engine accuracy",{exact:true})).toBeVisible({timeout:20000});
  const first=await(await page.request.get(`/api/v1/games/${games[0].id}/quality`)).json();
  expect(await(await page.request.get(`/api/v1/games/${games[1].id}/quality`)).json()).toBeNull();
  await page.getByRole("button",{name:"Select games to analyse",exact:true}).click();
  const selection=page.getByRole("region",{name:"Choose games for analysis",exact:true});
  await expect(selection.getByRole("button",{name:"Analyse selected games",exact:true})).toBeDisabled();
  await page.locator(".game-select input").first().check();
  await expect(selection).toContainText("1 selected across your saved library");
  await selection.getByRole("button",{name:"Clear selection",exact:true}).click();
  await selection.getByRole("button",{name:"Select all 2 games",exact:true}).click();
  await expect(page.locator(".game-select input:checked")).toHaveCount(2);
  await selection.getByRole("button",{name:"Analyse selected games",exact:true}).click();
  await expect(page.getByRole("status").filter({hasText:"1 games queued · 0 already waiting · 1 saved reports kept."})).toBeVisible();
  await expect.poll(async()=>await(await page.request.get(`/api/v1/games/${games[1].id}/quality`)).json(),{timeout:20000}).not.toBeNull();
  expect((await(await page.request.get(`/api/v1/games/${games[0].id}/quality`)).json()).analyzedAt).toBe(first.analyzedAt);
  await page.reload();
  await expect(report.getByText("Engine accuracy",{exact:true})).toBeVisible();
  await report.locator("summary").filter({hasText:"Move grades and positions"}).click();
  await report.locator(".quality-move").first().click();
  await expect(page.getByRole("combobox",{name:"Game position",exact:true})).toHaveValue("0");
  await report.screenshot({path:testInfo.outputPath("game-quality-report.png")});
  await page.getByRole("navigation",{name:"Main navigation"}).getByRole("button",{name:"Progress",exact:true}).click();
  const progress=page.getByRole("region",{name:"Move quality over time",exact:true});
  await expect(progress).toContainText("2 of 2 saved games have a move-quality report");
  await expect(progress.getByRole("combobox",{name:"Time control",exact:true})).toHaveValue("rapid");
  await expect(progress).toContainText("Your latest 2 eligible games by date played");
  await progress.locator("summary").filter({hasText:"How far do you get"}).click();
  await expect(progress).toContainText("Blunder-free games have no artificial first-blunder number");
  await progress.screenshot({path:testInfo.outputPath("game-quality-progress.png")});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("takes saved games from Today to requested analysis and opens the latest replay in one action",async({page},info)=>{
  const name=`Repair journey ${info.project.name}`;
  const saved=await(await page.request.post("/api/v1/imports/pgn",{data:{playerName:name,pgn:`[White "${name}"]\n[Black "Repair opponent"]\n[Date "2026.10.26"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`}})).json();
  await page.request.post(`/api/v1/profiles/${saved.profileId}/activate`);
  expect(await(await page.request.get('/api/v1/jobs/active')).json()).toBeNull();
  await page.goto('/#today');
  const next=page.getByRole('region',{name:'Next step for saved games',exact:true});
  await expect(next).toContainText('1 saved games awaiting analysis');
  await next.getByRole('button',{name:'Choose games to analyse',exact:true}).click();
  const report=page.getByRole('region',{name:'Game move-quality report',exact:true});
  await expect(report).toContainText('No move-quality report yet');
  const game=(await(await page.request.get('/api/v1/games')).json()).games[0];
  const replayUrl=`/api/v1/games/${game.id}/replay`;
  const original=await(await page.request.get(replayUrl)).json();
  await page.request.post(replayUrl,{data:{snapshotId:original.snapshotId,version:original.version,action:'jump',ply:1}});
  await page.reload();
  await report.getByRole('button',{name:'Analyse this game',exact:true}).click();
  await expect(report.getByText('Engine accuracy',{exact:true})).toBeVisible({timeout:20000});
  expect((await(await page.request.get(replayUrl)).json()).snapshotId).toBe(original.snapshotId);
  await report.getByRole('button',{name:'Review latest analysis',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Game position',exact:true})).toHaveValue('2');
  const current=await(await page.request.get(replayUrl)).json();
  expect(current.snapshotId).not.toBe(original.snapshotId);expect(current.analysisPending).toBe(false);
  expect(current.activeCheckpointId).toMatch(/^engine:/);
  await expect(page.getByRole('region',{name:'Saved game replay',exact:true})).not.toContainText('Engine analysis was not available');
});

test("refreshes expanded learning results on player changes and ignores a late previous-player response",async({page},info)=>{
  const a=`Metrics A ${info.project.name}`,b=`Metrics B ${info.project.name}`;
  await page.request.post('/api/v1/openings/imports/pgn',{data:{pgn:'1. e4 e5 2. Nf3 *',name:`Metrics preparation ${info.project.name}`,learnerColor:'white',ownershipConfirmed:true}});
  const first=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:a,pgn:`[White "${a}"]\n[Black "Opponent A"]\n[Date "2026.10.26"]\n[TimeControl "600+0"]\n[Result "1-0"]\n\n1. e4 e5 2. Bc4 Nc6 1-0`}})).json();
  const second=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:b,pgn:`[White "${b}"]\n[Black "Opponent B"]\n\n1. d4 Nf6 *`}})).json();
  await page.request.post(`/api/v1/profiles/${first.profileId}/activate`);
  const game=(await(await page.request.get('/api/v1/games')).json()).games[0];
  await page.request.get(`/api/v1/games/${game.id}/review`);
  const analysis=await(await page.request.post('/api/v1/games/analysis',{data:{gameIds:[game.id]}})).json();
  await expect.poll(async()=>(await(await page.request.get(`/api/v1/jobs/${analysis.id}`)).json()).status,{timeout:20000}).toBe('completed');
  const metrics=await(await page.request.get('/api/v1/openings/quality/metrics')).json();expect(metrics.games.gamesMatched).toBe(1);
  await page.goto('/#progress');
  const quality=page.getByRole('region',{name:'Move quality over time',exact:true});
  await quality.getByRole('combobox',{name:'Time control',exact:true}).selectOption('rapid');
  const section=page.locator('.opening-learning-measures'),summary=section.locator('summary');
  await summary.click();await expect(section).toContainText('1 matched games');
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});let held=false;
  await page.route('**/api/v1/openings/quality/metrics',async route=>{
    if(!held){held=true;await gate;await route.fulfill({json:metrics}).catch(()=>undefined);}else await route.continue();
  });
  try{
    await summary.click();
    const pending=page.waitForRequest(request=>request.url().endsWith('/api/v1/openings/quality/metrics'));
    await summary.click();await pending;
    const refreshed=page.waitForResponse(response=>response.url().endsWith('/api/v1/openings/quality/metrics')&&response.ok());
    await page.getByRole('combobox',{name:'Player',exact:true}).selectOption(second.profileId);await refreshed;
    await expect(page.getByText(`${b}’s training profile`,{exact:true})).toBeVisible();
    await expect(section).toContainText('0 matched games');
    await expect(quality).toContainText('0 of 1 saved games have a move-quality report');
    await expect(quality.getByRole('alert')).toHaveCount(0);release();
    await expect(section).not.toContainText('1 matched games');
  }finally{release();await page.unroute('**/api/v1/openings/quality/metrics');}
});

test("shows the installed build identifier in the footer",async({page})=>{
  await page.route('**/api/v1/health',route=>route.fulfill({json:{status:'ok',version:'1.5.22',build:'abcdef1234567890'}}));
  await page.goto('/#games');
  await expect(page.locator('footer')).toContainText('Thinking Board v1.5.22 · build abcdef1');
});

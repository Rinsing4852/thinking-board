import {expect,test,type Page} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:8192'});
async function ownGames(page:Page,label:string){
 const name=`Quality ${label}`;
 await page.request.post('/api/v1/openings/imports/pgn',{data:{name:`Preparation ${label}`,learnerColor:'white',ownershipConfirmed:true,pgn:'1. e4 e5 2. Nf3 Nc6 *'}});
 const pgn=['f3','a3','h3','b3','g3'].map((move,i)=>`[White "${name}"]\n[Black "Quality opponent ${i}"]\n[Date "2026.10.${20+i}"]\n[Result "1-0"]\n\n1. ${move} e5 1-0`).join('\n\n');
 const saved=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:name,pgn}})).json();
 await page.request.post(`/api/v1/profiles/${saved.profileId}/activate`);
 return (await(await page.request.get('/api/v1/games')).json()).games;
}
test('[G1_UI] separates library and focused board and restores search on Back and reload',async({page},info)=>{
 const games=await ownGames(page,`navigation ${info.project.name}`);
 await page.goto('/#games');await expect(page.getByRole('grid',{name:'Game replay board',exact:true})).toBeHidden();
 await page.getByLabel('Find a game',{exact:true}).fill('Quality opponent 3');
 await page.getByRole('button',{name:/Quality opponent 3.*1-0/}).click();
 await expect(page.getByRole('grid',{name:'Game replay board',exact:true})).toHaveCount(1);
 await expect(page.getByLabel('Find a game',{exact:true})).toBeHidden();
 await expect(page.getByRole('region',{name:'Opening follow-ups across games',exact:true})).toBeHidden();
 expect(await(await page.request.get('/api/v1/jobs/active')).json()).toBeNull();
 await page.getByRole('button',{name:'Back to games',exact:true}).click();
 await expect(page.getByLabel('Find a game',{exact:true})).toHaveValue('Quality opponent 3');
 await page.goBack();await expect(page.getByRole('grid',{name:'Game replay board',exact:true})).toBeVisible();
 await page.reload();await expect(page.getByRole('grid',{name:'Game replay board',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('focused-game.png'),fullPage:true});
 expect(games.length).toBe(5);
});
test('[G1_PATTERNS] bounds pattern rows and expands one pattern without losing the complete inbox',async({page},info)=>{
 await ownGames(page,`patterns ${info.project.name}`);await page.goto('/#games?view=patterns');
 const inbox=page.getByRole('region',{name:'Opening follow-ups across games',exact:true});
 await expect(inbox.locator('.opening-inbox-item')).toHaveCount(3);
 await expect(page.getByRole('grid',{name:'Game replay board',exact:true})).toBeHidden();
 await expect(inbox.getByRole('button',{name:'Inspect latest game',exact:true})).toBeHidden();
 await inbox.getByRole('button',{name:'Review pattern',exact:true}).first().click();
 await expect(inbox.getByRole('button',{name:'Inspect latest game',exact:true})).toHaveCount(1);
 await inbox.getByRole('button',{name:/Show more patterns/}).click();
 await expect(inbox.locator('.opening-inbox-item')).toHaveCount(5);
 await inbox.getByRole('button',{name:'Review pattern',exact:true}).last().click();
 await expect(inbox.getByRole('button',{name:'Inspect latest game',exact:true})).toHaveCount(1);
});
test('[G2_UI] offers verified tactical categories and retains the selected mating limit',async({page},info)=>{
 const games=await ownGames(page,`tactical ${info.project.name}`),game=games[0];
 // Exercise the public analysis path, not a special UI-only flag.
 const job=await(await page.request.post('/api/v1/games/analysis',{data:{gameIds:[game.id]}})).json();
 await expect.poll(async()=>(await(await page.request.get(`/api/v1/jobs/${job.id}`)).json()).status,{timeout:20000}).toBe('completed');
 await page.goto(`/#games?game=${game.id}`);
 const controls=page.getByRole('region',{name:'Practise from this game',exact:true});await controls.locator('summary').click();
 await expect(controls.getByRole('checkbox',{name:/Defending/})).toBeEnabled();
 await controls.getByRole('combobox',{name:'Maximum mating length',exact:true}).selectOption('4');
 await controls.screenshot({path:info.outputPath('tactical-practice.png')});
 await controls.getByRole('checkbox',{name:/Opening recall/}).check();
 await controls.getByRole('button',{name:'Start practice',exact:true}).click();
 await page.reload();await controls.locator('summary').click();
 await expect(controls.getByRole('combobox',{name:'Maximum mating length',exact:true})).toHaveValue('4');
 await expect(page.getByRole('region',{name:'Saved game replay',exact:true}).getByText(/Accepted in this saved review/)).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('[G3_UI] explains a recurring weakness, links its games and starts existing focused practice',async({page},info)=>{
 const name=`Focus ${info.project.name}`;
 const pgn=[0,1].map(i=>`[White "${name}"]\n[Black "Focus opponent ${i}"]\n[Date "2026.10.${29+i}"]\n[TimeControl "600+0"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`).join('\n\n');
 const saved=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:name,pgn}})).json();await page.request.post(`/api/v1/profiles/${saved.profileId}/activate`);
 const job=await(await page.request.post('/api/v1/games/analysis',{data:{all:true}})).json();
 await expect.poll(async()=>(await(await page.request.get(`/api/v1/jobs/${job.id}`)).json()).status,{timeout:20000}).toBe('completed');
 await page.goto('/#today');const focus=page.getByRole('region',{name:'Learning focus from your games',exact:true});
 await expect(focus).toContainText('Preventing mating threats');await expect(focus).toContainText('2 of 2 comparable');
 await focus.locator('summary').click();await expect(focus.getByRole('link')).toHaveCount(2);
 await focus.screenshot({path:info.outputPath('learning-focus.png')});
 const target=focus.getByRole('link').first();await target.click();
 await expect(page.getByRole('grid',{name:'Game replay board',exact:true})).toBeVisible();
 await page.goto('/#today');await focus.getByRole('button',{name:'Practise this focus',exact:true}).click();
 await expect(page.getByRole('button',{name:'Practise this focus',exact:true})).toBeVisible();
 const session=await(await page.request.get('/api/v1/training/session/active')).json();
 // The regular trainer owns the queue and progress; no second board is introduced.
 expect(session?.remainingCount??session?.session?.remainingCount).toBe(2);
 expect(await(await page.request.get('/api/v1/jobs/active')).json()).toBeNull();
});

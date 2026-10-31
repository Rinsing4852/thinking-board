import {expect,test} from '@playwright/test';
test.use({baseURL:'http://127.0.0.1:8192'});

test('starts a short daily plan, resumes its opening queue and continues to completed game practice',async({page},info)=>{
 const learner=`Daily plan ${info.project.name} ${info.retry}`;
 const imported=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:learner,pgn:`[White "${learner}"]\n[Black "Daily opponent"]\n[Date "2026.10.28"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`}})).json();
 await page.request.post(`/api/v1/profiles/${imported.profileId}/activate`);
 const opening=await(await page.request.post('/api/v1/openings/imports/pgn',{data:{name:`Daily opening ${info.project.name}`,learnerColor:'white',ownershipConfirmed:true,pgn:'1. e4 *'}})).json();
 const catalog=await(await page.request.get('/api/v1/openings/catalog')).json();
 const others=catalog.repertoires.filter((r:{id:string;archived:boolean})=>r.id!==opening.repertoireIds[0]&&!r.archived);
 try{
  for(const r of others)await page.request.patch(`/api/v1/openings/repertoires/${r.id}/archive`,{data:{archived:true}});
  const job=await(await page.request.post('/api/v1/games/analysis',{data:{all:true}})).json();
  await expect.poll(async()=>(await(await page.request.get(`/api/v1/jobs/${job.id}`)).json()).status,{timeout:20000}).toBe('completed');
  await page.goto('/#today');
  const plan=page.getByRole('region',{name:'Your daily practice plan',exact:true});
  await expect(page.getByRole('grid',{name:'Chess position',exact:true})).toBeHidden();
  await expect(plan).toContainText('Opening recall');await expect(plan).toContainText('Game decisions');
  await page.screenshot({path:info.outputPath('daily-plan-start.png'),animations:'disabled'});
  await plan.getByRole('button',{name:'Start daily practice',exact:true}).click();
  await expect(page.getByRole('button',{name:'Back to daily plan',exact:true})).toBeVisible();
  const before=await(await page.request.get('/api/v1/openings/reviews/active')).json();expect(before).toBeTruthy();
  const savedPlan=await(await page.request.get('/api/v1/practice/daily')).json();
  await page.reload();
  await expect(page.getByRole('button',{name:'Back to daily plan',exact:true})).toBeVisible();
  expect((await(await page.request.get('/api/v1/openings/reviews/active')).json()).queueEntryId).toBe(before.queueEntryId);
  // Complete the existing opening queue through its public API; dedicated
  // opening journeys cover board gestures, introductions and feedback timing.
  for(let i=0;i<8;i++){
   const current=await(await page.request.get('/api/v1/openings/reviews/active')).json();if(!current)break;
   if(current.kind==='feedback')await page.request.post(`/api/v1/openings/reviews/${current.sessionId}/continue`,{data:{queueEntryId:current.exercise.queueEntryId}});
   else if(current.phase==='introduction')await page.request.post(`/api/v1/openings/reviews/${current.sessionId}/introduce`,{data:{queueEntryId:current.queueEntryId,moveUci:'e2e4'}});
   else await page.request.post(`/api/v1/openings/reviews/${current.sessionId}/move`,{data:{queueEntryId:current.queueEntryId,moveUci:'e2e4'}});
  }
  expect(await(await page.request.get('/api/v1/openings/reviews/active')).json()).toBeNull();
  await page.getByRole('button',{name:'Back to daily plan',exact:true}).click();
  await plan.getByRole('button',{name:'Continue game practice',exact:true}).click();
  const session=await(await page.request.get('/api/v1/training/session/active')).json();expect(session.remainingCount).toBeGreaterThan(0);
  expect((await(await page.request.get('/api/v1/practice/daily')).json()).id).toBe(savedPlan.id);
  for(let i=0;i<session.items.length;i++){
   const current=await(await page.request.get('/api/v1/training/session/active')).json();if(!current)break;
   const begin:Record<string,string>={blunder_check:'Play my move on the board',candidate_generation:'Start generating candidates',punish_blunder:'Find the punishment',what_changed:'Show the opponent’s move',quiet_position:'Find an improving move'};
   const trainer=page.locator('#trainer');await trainer.getByRole('button',{name:begin[current.currentItem.mode],exact:true}).click();
   await trainer.getByRole('button',{name:current.currentItem.mode==='candidate_generation'?'Show engine candidates':'Show answer',exact:true}).click();
   await trainer.getByRole('button',{name:'Continue session',exact:true}).click();
  }
  await expect(plan).toContainText('Your short plan is complete');
  await page.reload();await expect(plan).toContainText('Your short plan is complete');
  expect((await(await page.request.get('/api/v1/practice/daily')).json()).id).toBe(savedPlan.id);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:info.outputPath('daily-plan-complete.png'),animations:'disabled'});
 }finally{for(const r of others)await page.request.patch(`/api/v1/openings/repertoires/${r.id}/archive`,{data:{archived:false}});}
});

test('reviews key decisions with one board, plays the defensive reply and schedules next-day recall',async({page},info)=>{
 const learner=`Teaching ${info.project.name}`;
 const saved=await(await page.request.post('/api/v1/imports/pgn',{data:{playerName:learner,pgn:`[White "${learner}"]\n[Black "Teaching opponent"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1`}})).json();
 await page.request.post(`/api/v1/profiles/${saved.profileId}/activate`);
 const game=(await(await page.request.get('/api/v1/games')).json()).games[0];
 const job=await(await page.request.post('/api/v1/games/analysis',{data:{gameIds:[game.id]}})).json();
 await expect.poll(async()=>(await(await page.request.get(`/api/v1/jobs/${job.id}`)).json()).status,{timeout:20000}).toBe('completed');
 await page.goto(`/#games?game=${game.id}`);
 const replay=page.getByRole('region',{name:'Saved game replay',exact:true});
 await expect(replay.getByRole('button',{name:'Start practice',exact:true})).toBeVisible();
 await replay.getByRole('button',{name:'Start practice',exact:true}).click();
 const data=await(await page.request.get(`/api/v1/games/${game.id}/replay`)).json();
 const key=data.checkpoints.find((p:{kind:string;ply:number})=>p.kind==='engine'&&p.ply===2);
 expect(key).toBeTruthy();
 const index=data.practice.checkpointIds.indexOf(key.id);expect(index).toBeGreaterThanOrEqual(0);
 for(let position=0;position<index;position++){
   await replay.getByRole('button',{name:'Show answer',exact:true}).click();
   await replay.getByRole('button',{name:'Next practice position',exact:true}).click();
 }
 await expect(replay.getByText('Understand this decision on the board',{exact:true})).toBeHidden();
 await replay.getByRole('button',{name:'Show answer',exact:true}).click();
 await replay.getByText('Understand this decision on the board',{exact:true}).click();
 await replay.getByRole('button',{name:'What the opponent could do after your game move',exact:true}).click();
 await replay.getByRole('button',{name:'Next example move',exact:true}).click();
 await expect(replay.getByRole('gridcell',{name:'h4 black queen',exact:true})).toBeVisible();
 await expect(replay.getByRole('grid',{name:'Game replay board',exact:true})).toHaveCount(1);
 await expect.poll(()=>page.evaluate(()=>{
  const board=document.querySelector('[aria-label="Game replay board"]')!.getBoundingClientRect();
  const header=document.querySelector('.site-header')!.getBoundingClientRect();
  return board.top>=header.bottom&&board.bottom<=innerHeight;
 })).toBe(true);
 await expect(replay.getByRole('group',{name:'Game replay controls',exact:true})).toBeHidden();
 await expect(replay.locator('piece.anim')).toHaveCount(0);
 await page.screenshot({path:info.outputPath('engine-defensive-reply.png'),animations:'disabled'});
 await replay.getByRole('button',{name:'Back to decision',exact:true}).click();
 await replay.getByRole('button',{name:'Practise tomorrow',exact:true}).click();
 await expect(replay).toContainText('24 hours later');
 await page.reload();await expect(replay).toContainText('24 hours later');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('game-teaching-followup.png'),animations:'disabled'});
});

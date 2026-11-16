const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = 'http://127.0.0.1:8765/';
const results = [];
async function check(label, fn) {
  try { await fn(); results.push({label,status:'PASS'}); console.log('PASS', label); }
  catch(e) { results.push({label,status:'FAIL',error:e.message}); console.error('FAIL',label,e.message); }
}
(async () => {
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 await page.goto(base,{waitUntil:'domcontentloaded'});
 await page.locator('#nav button').first().waitFor();
 await check('All navigation destinations reachable through quick links or collapsible groups',async()=>{
  const data=await page.evaluate(()=>({
   expected:Object.keys(sections),groups:Object.values(NAV_GROUPS).flat(),quick:NAV_QUICK,
   buttons:[...document.querySelectorAll('#nav button.nav-route')].map(b=>b.dataset.route),
   initialNav:navPrefs
  }));
  assert.ok(data.expected.length>=25);
  assert.deepEqual([...data.groups,...data.quick].sort(),[...data.expected].sort());
  assert.equal(new Set(data.buttons).size,data.expected.length);
  for(const key of [...data.quick,...data.groups]){
   const targetGroup=Object.entries((await page.evaluate(()=>NAV_GROUPS))).find(([,keys])=>keys.includes(key))?.[0];
   if(targetGroup){
    await page.evaluate(()=>{if(navPrefs.focus){navPrefs.focus=false;navRender()}});
    const toggle=page.locator('#nav .nav-group-toggle').filter({hasText:targetGroup});
    if(await toggle.getAttribute('aria-expanded')!=='true')await toggle.click();
   }
   await page.locator('#nav button.nav-route[data-route="'+key+'"]').click();
   assert.equal(await page.evaluate(()=>page),key);
   assert.equal(await page.locator('#nav button.nav-route.active').count(),1);
  }
 });
 await check('Sidebar group, session focus and visibility preferences preserve records',async()=>{
  await page.evaluate(()=>goto('dashboard'));
  const before=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,quests:db.quests,
   sessions:db.sessions,decisions:db.decisions,maps:db.maps
  }));
  await page.locator('#nav .nav-group-toggle').filter({hasText:'Characters'}).click();
  assert.equal(await page.locator('#nav .nav-group-toggle').filter({hasText:'Characters'}).getAttribute('aria-expanded'),'true');
  await page.locator('#nav .nav-focus-toggle').click();
  assert.equal(await page.locator('#nav .nav-group').count(),0);
  assert.equal(await page.locator('#nav .nav-shortcut').count(),4);
  await page.locator('#nav .nav-focus-toggle').click();
  assert.equal(await page.locator('#nav .nav-group-toggle').filter({hasText:'Characters'}).getAttribute('aria-expanded'),'true');
  await page.locator('#nav-collapse-toggle').click();
  assert.equal(await page.locator('.shell.nav-closed').count(),1);
  await page.locator('#nav-collapse-toggle').click();
  assert.equal(await page.locator('.shell.nav-closed').count(),0);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#nav .nav-group-toggle').filter({hasText:'Characters'}).getAttribute('aria-expanded'),'true');
  const after=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,quests:db.quests,
   sessions:db.sessions,decisions:db.decisions,maps:db.maps
  }));
  assert.equal(after,before);
 });
 await check('Create and edit PC in isolated storage',async()=>{
  await page.evaluate(()=>goto('pcs'));
  await page.locator('button').filter({hasText:'+ Add PC'}).first().click();
  await page.locator('#modalFields input[name=name]').fill('QA TEST Beetlekin');
  await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.evaluate(()=>db.pcs.some(x=>x.name==='QA TEST Beetlekin')),true);
  await page.locator('button').filter({hasText:'View / Edit'}).first().click();
  await page.locator('#modalFields input[name=name]').fill('QA TEST Beetlekin Updated');
  await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.evaluate(()=>db.pcs.some(x=>x.name==='QA TEST Beetlekin Updated')),true);
 });
 await check('Create and edit NPC without changing existing records',async()=>{
  await page.evaluate(()=>goto('npcs'));
  const before=await page.evaluate(()=>db.npcs.length);
  await page.locator('button').filter({hasText:'+ Add NPC'}).first().click();
  await page.locator('#modalFields input[name=name]').fill('QA TEST NPC');
  await page.locator('#editForm button[type=submit]').click();
  assert.equal(await page.evaluate(()=>db.npcs.length),before+1);
 });
 await check('Combat tracker init, damage, next turn',async()=>{
  await page.evaluate(()=>goto('combat'));
  const combatPcId=await page.evaluate(()=>db.pcs.find(x=>x.name==='QA TEST Beetlekin Updated').id);
  await page.locator('#combatPcSelect').selectOption(combatPcId);
  await page.locator('button').filter({hasText:'+ Add PC'}).last().click();
  assert.ok((await page.evaluate(()=>combatState().participants.length))>=1);
  await page.evaluate(()=>combatSort());
  await page.evaluate(()=>combatNext());
  assert.ok((await page.evaluate(()=>combatState().round))>=1);
  const id=await page.evaluate(()=>combatState().participants[0].id);
  await page.evaluate(id=>{const x=combatState().participants.find(p=>p.id===id);x.maxHp=12;x.hp=12;save();combatDamage(id,1)},id);
  assert.equal(await page.evaluate(id=>combatState().participants.find(p=>p.id===id).hp,id),11);
 });
 await check('Home Hive map 30x30 and DM/player views',async()=>{
  await page.evaluate(()=>goto('maps'));
  const data=await page.evaluate(()=>({cols:mapCols(currentMap()),rows:mapRows(currentMap()),name:currentMap().name}));
  assert.deepEqual([data.cols,data.rows],[30,30]);
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.evaluate(()=>mapState().viewMode),'player');
  await page.evaluate(()=>mapSetView('dm'));
  assert.equal(await page.evaluate(()=>mapState().viewMode),'dm');
 });
 await check('Place, move and remove character token',async()=>{
  await page.evaluate(()=>goto('maps'));
  const ref=await page.evaluate(()=>db.pcs.find(x=>x.name==='QA TEST Beetlekin Updated').id);
  await page.locator('#map-roster').selectOption('pc:'+ref);
  await page.getByRole('button',{name:'Place character on map'}).click();
  let id=await page.evaluate(ref=>currentMap().tokens.find(x=>x.ref===ref)?.id,ref);
  assert.ok(id);
  await page.evaluate(id=>{let t=currentMap().tokens.find(x=>x.id===id);mapMove(t,8,9)},id);
  assert.deepEqual(await page.evaluate(id=>{let t=currentMap().tokens.find(x=>x.id===id);return [t.x,t.y]},id),[8,9]);
  await page.evaluate(id=>{mapState().selected=id;mapRemoveToken()},id);
  assert.equal(await page.evaluate(id=>currentMap().tokens.some(x=>x.id===id),id),false);
 });
 await check('Fog of war persists after reload',async()=>{
  await page.evaluate(()=>{goto('maps');mapFogAll(false);mapSetFogTool('reveal');mapPaintFog(42)});
  assert.ok(await page.evaluate(()=>mapFog(currentMap()).includes(42)));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok(await page.evaluate(()=>mapFog(currentMap()).includes(42)));
 });
 await check('Campaign records persist after reload',async()=>{
  assert.ok(await page.evaluate(()=>db.pcs.some(x=>x.name==='QA TEST Beetlekin Updated')));
  assert.ok(await page.evaluate(()=>db.npcs.some(x=>x.name==='QA TEST NPC')));
 });
 await check('JSON export and guarded import exists',async()=>{
  await page.evaluate(()=>goto('dashboard'));
  const promise=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export backup/}).click();
  const download=await promise;
  const file=await download.path();
  const data=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.ok(data.data.pcs.some(x=>x.name==='QA TEST Beetlekin Updated'));
  assert.ok(data.data.npcs.some(x=>x.name==='QA TEST NPC'));
  assert.equal(typeof page.evaluate,'function');
  await page.locator('#importer').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await page.waitForTimeout(250);
  assert.ok(await page.evaluate(()=>db.pcs.some(x=>x.name==='QA TEST Beetlekin Updated')));
 });
 await check('Tablet viewport navigation accessible',async()=>{
  await page.setViewportSize({width:768,height:1024});
  await page.evaluate(()=>goto('maps'));
  assert.equal(await page.locator('#nav button.nav-route').count(),await page.evaluate(()=>Object.keys(sections).length));
  const settingsGroup=page.locator('#nav .nav-group-toggle[data-group="Settings"]');
  if(await settingsGroup.getAttribute('aria-expanded')!=='true')await settingsGroup.click();
  await page.locator('#nav button.nav-route[data-route="settings"]').scrollIntoViewIfNeeded();
  await page.locator('#nav button.nav-route[data-route="settings"]').click();
  assert.equal(await page.evaluate(()=>page),'settings');
 });
 await check('Command Center scratchpad persists without blur',async()=>{
  await page.evaluate(()=>goto('command'));
  const scratch=page.locator('#cc-notes');
  await scratch.fill('QA scratchpad survives an immediate reload');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>db.sessionCommandNotes),'QA scratchpad survives an immediate reload');
  await page.evaluate(()=>goto('command'));
  assert.equal(await page.locator('#cc-notes').inputValue(),'QA scratchpad survives an immediate reload');
 });
 await check('Adventure Runner scene draft coverage is read-only and persists',async()=>{
  await page.evaluate(()=>goto('runner'));
  const before=await page.evaluate(()=>({session:db.campaign.session,quests:JSON.stringify(db.quests),decisions:JSON.stringify(db.decisions||[]),scenes:db.adventureScriptDraft?.scenes?Object.keys(db.adventureScriptDraft.scenes).length:0}));
  const first=page.locator('.ar-scene').first();
  const initial=await first.locator('.ar-scene-count').innerText();
  const raw=await page.evaluate(()=>adventureRunnerScene(0).readAloud||'');
  await page.locator('#ar-readAloud').fill(raw+' QA scene coverage note');
  await page.getByRole('button',{name:/Next scene/}).click();
  assert.ok(Number((await first.locator('.ar-scene-count').innerText()).split('/')[0])>=1);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.ok((await page.evaluate(()=>adventureRunnerScene(0).readAloud||'')).includes('QA scene coverage note'));
  const after=await page.evaluate(()=>({session:db.campaign.session,quests:JSON.stringify(db.quests),decisions:JSON.stringify(db.decisions||[])}));
  assert.equal(after.session,before.session);
  assert.equal(after.quests,before.quests);
  assert.equal(after.decisions,before.decisions);
  assert.ok(initial.includes('/9'));
 });
 await check('DM map shortcuts preserve Runner scene and draft without recording play',async()=>{
  await page.evaluate(()=>{goto('runner');adventureRunnerGo(2)});
  const previous=await page.evaluate(()=>({
    scene:adventurePreviewIndex,
    session:db.campaign.session,
    decisions:JSON.stringify(db.decisions||[]),
    quests:JSON.stringify(db.quests||[])
  }));
  await page.evaluate(()=>goto('maps'));
  await page.evaluate(()=>mapSetView('dm'));
  assert.equal(await page.getByRole('group',{name:'DM session shortcuts'}).count(),1);
  await page.getByRole('button',{name:'← Adventure Runner'}).click();
  assert.equal(await page.evaluate(()=>page),'runner');
  assert.equal(await page.evaluate(()=>adventurePreviewIndex),previous.scene);
  await page.evaluate(()=>goto('maps'));
  await page.getByRole('group',{name:'DM session shortcuts'}).getByRole('button',{name:'Session Command Center',exact:true}).click();
  assert.equal(await page.evaluate(()=>page),'command');
  const after=await page.evaluate(()=>({
    session:db.campaign.session, decisions:JSON.stringify(db.decisions||[]), quests:JSON.stringify(db.quests||[])
  }));
  assert.equal(after.session,previous.session);
  assert.equal(after.decisions,previous.decisions);
  assert.equal(after.quests,previous.quests);
 });
 await check('DM navigation shortcuts are absent from player map view',async()=>{
  await page.evaluate(()=>goto('maps'));
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.getByRole('group',{name:'DM session shortcuts'}).count(),0);
  assert.equal(await page.getByRole('button',{name:'← Adventure Runner'}).count(),0);
  await page.evaluate(()=>mapSetView('dm'));
 });
 await check('Runner quick references show existing NPC and encounter details without altering records',async()=>{
  await page.evaluate(()=>{
    db.npcs.push({id:'qa-quick-npc',name:'QA Reference Moth',role:'Guide',location:'Root Bridge',notes:'Visible description',secret:'DM ONLY secret <script>unsafe</script>'});
    db.encounters.push({id:'qa-quick-encounter',name:'QA Reference Encounter',status:'Planned',enemies:'Two tiny mites',notes:'Use the branch crossing'});
    save();goto('runner');
  });
  const before=await page.evaluate(()=>JSON.stringify({
    npcs:db.npcs,encounters:db.encounters,decisions:db.decisions,quests:db.quests,
    sessions:db.sessions,session:db.campaign.session,script:db.adventureScriptDraft
  }));
  await page.locator('#ar-quick-npc').selectOption('qa-quick-npc');
  assert.match(await page.locator('#ar-reference-detail').innerText(),/QA Reference Moth/);
  assert.match(await page.locator('#ar-reference-detail').innerText(),/DM ONLY secret/);
  assert.equal(await page.locator('#ar-reference-detail script').count(),0);
  await page.locator('#ar-quick-encounter').selectOption('qa-quick-encounter');
  assert.match(await page.locator('#ar-reference-detail').innerText(),/Two tiny mites/);
  assert.equal(await page.locator('#ar-quick-npc').inputValue(),'');
  const after=await page.evaluate(()=>JSON.stringify({
    npcs:db.npcs,encounters:db.encounters,decisions:db.decisions,quests:db.quests,
    sessions:db.sessions,session:db.campaign.session,script:db.adventureScriptDraft
  }));
  assert.equal(after,before);
 });
 await check('Runner references available in tabletop and draft views, absent from player map',async()=>{
  await page.evaluate(()=>goto('runner'));
  await page.getByRole('button',{name:'Tabletop View'}).click();
  assert.equal(await page.locator('#ar-quick-npc').count(),1);
  await page.getByRole('button',{name:'Draft Editor'}).click();
  assert.equal(await page.locator('#ar-quick-encounter').count(),1);
  await page.evaluate(()=>{goto('maps');mapSetView('player')});
  assert.equal(await page.locator('#ar-quick-npc').count(),0);
  await page.evaluate(()=>mapSetView('dm'));
 });
 await check('Runner reference search filters by name, role and enemies without modifying campaign',async()=>{
  await page.evaluate(()=>{
   db.npcs.push({id:'qa-search-guide',name:'QA Lantern Guide',role:'QA-Only-Scout-163',location:'Winter Root'});
   db.npcs.push({id:'qa-search-smith',name:'QA Root Smith',role:'Artisan',location:'Mushroom Hall'});
   db.encounters.push({id:'qa-search-mites',name:'QA Frost Passage',status:'Planned',enemies:'QA-Only-Snow-tuft-163 mites'});
   save();goto('runner');
  });
  const before=await page.evaluate(()=>JSON.stringify({npcs:db.npcs,encounters:db.encounters,sessions:db.sessions,decisions:db.decisions,quests:db.quests,script:db.adventureScriptDraft}));
  await page.locator('#ar-npc-search').fill('QA-Only-Scout-163');
  assert.equal(await page.locator('#ar-quick-npc option').count(),2);
  assert.match(await page.locator('#ar-quick-npc option').last().innerText(),/QA Lantern Guide/);
  await page.locator('#ar-quick-npc').selectOption('qa-search-guide');
  assert.match(await page.locator('#ar-reference-detail').innerText(),/Winter Root/);
  await page.locator('#ar-encounter-search').fill('QA-Only-Snow-tuft-163');
  assert.equal(await page.locator('#ar-quick-encounter option').count(),2);
  await page.locator('#ar-quick-encounter').selectOption('qa-search-mites');
  assert.match(await page.locator('#ar-reference-detail').innerText(),/QA-Only-Snow-tuft-163 mites/);
  await page.locator('#ar-npc-search').fill('no-match-qa-xyz');
  assert.equal(await page.locator('#ar-quick-npc option').count(),1);
  assert.match(await page.locator('#ar-npc-count').innerText(),/^0 of /);
  const after=await page.evaluate(()=>JSON.stringify({npcs:db.npcs,encounters:db.encounters,sessions:db.sessions,decisions:db.decisions,quests:db.quests,script:db.adventureScriptDraft}));
  assert.equal(after,before);
 });
 await check('Runner quick reference filters are absent in player map view',async()=>{
  await page.evaluate(()=>{goto('maps');mapSetView('player')});
  assert.equal(await page.locator('#ar-npc-search').count(),0);
  assert.equal(await page.locator('#ar-encounter-search').count(),0);
  await page.evaluate(()=>mapSetView('dm'));
 });
 await check('Christmas Caper readiness inventory reflects existing scene text and maps without recording play',async()=>{
  await page.evaluate(()=>goto('runner'));
  const before=await page.evaluate(()=>JSON.stringify({
    campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,sessions:db.sessions,
    decisions:db.decisions,quests:db.quests,encounters:db.encounters,maps:db.maps,
    draft:db.adventureScriptDraft
  }));
  const panel=page.locator('#ar-readiness');
  assert.equal(await panel.count(),1);
  await panel.locator('summary').click();
  assert.equal(await panel.locator('tbody tr').count(),10);
  assert.match(await panel.innerText(),/Missing sections/);
  assert.match(await panel.innerText(),/Not assigned/);
  assert.match(await panel.innerText(),/Linked/);
  const row=panel.locator('tbody tr').first();
  assert.match(await row.innerText(),/Welcome to Hearthhollow/);
  const scene=await page.evaluate(()=>adventureRunnerScene(0));
  const missing=await page.evaluate(()=>ADVENTURE_FIELDS.filter(key=>!String(adventureRunnerScene(0)[key]||'').trim()));
  assert.equal(await row.locator('td').first().innerText(),String(9-missing.length)+'/9');
  const after=await page.evaluate(()=>JSON.stringify({
    campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,sessions:db.sessions,
    decisions:db.decisions,quests:db.quests,encounters:db.encounters,maps:db.maps,
    draft:db.adventureScriptDraft
  }));
  assert.equal(after,before);
  assert.ok(scene);
 });
 await check('No uncaught browser JS errors',async()=>{assert.deepEqual(errors,[])});
 const failed=results.filter(r=>r.status==='FAIL');
 fs.writeFileSync('qa-smoke-results.json',JSON.stringify({results,failed:failed.length},null,2));
 await browser.close();
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
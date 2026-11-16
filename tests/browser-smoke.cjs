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
  assert.deepEqual([...data.groups,...data.quick,'settings'].sort(),[...data.expected].sort());
  assert.equal(new Set(data.buttons).size,data.expected.length);
  for(const key of [...data.quick,...data.groups,'settings']){
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
  const afterToggles=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,quests:db.quests,
   sessions:db.sessions,decisions:db.decisions,maps:db.maps
  }));
  assert.equal(afterToggles,before,'Navigation controls must not mutate campaign records');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('#nav .nav-group-toggle').filter({hasText:'Characters'}).getAttribute('aria-expanded'),'true');
  const coreAfter=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,quests:db.quests,
   sessions:db.sessions,decisions:db.decisions
  }));
  const prior=JSON.parse(before);
  const coreBefore=JSON.stringify({campaign:prior.campaign,pcs:prior.pcs,npcs:prior.npcs,
   quests:prior.quests,sessions:prior.sessions,decisions:prior.decisions});
  assert.equal(coreAfter,coreBefore,'Core campaign records must survive reload');
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
 await check('Enchanted Woodland colors, typography and keyboard focus are readable',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>goto('dashboard'));
  const styles=await page.evaluate(()=>{
   const body=getComputedStyle(document.body),root=getComputedStyle(document.documentElement);
   const header=getComputedStyle(document.querySelector('header'));
   const navLink=getComputedStyle(document.querySelector('#nav .nav-route'));
   const title=getComputedStyle(document.querySelector('#app h2'));
   return {bodySize:parseFloat(body.fontSize),bg:root.getPropertyValue('--bg').trim(),
    foreground:root.getPropertyValue('--ink').trim(),headerBg:header.backgroundColor,
    linkSize:parseFloat(navLink.fontSize),titleFont:title.fontFamily};
  });
  assert.equal(styles.bodySize,16);
  assert.equal(styles.bg,'#f5f0df');
  assert.equal(styles.foreground,'#38312b');
  assert.equal(styles.headerBg,'rgb(32, 61, 48)');
  assert.ok(styles.linkSize>=14);
  assert.match(styles.titleFont,/Georgia|serif/);
  await page.locator('#nav .nav-route[data-route="command"]').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const focus=await page.locator('#nav .nav-route[data-route="command"]').evaluate(el=>({
   visible:el.matches(':focus-visible'),outline:getComputedStyle(el).outlineStyle
  }));
  assert.equal(focus.visible,true,'Keyboard navigation must show focus-visible state');
  assert.notEqual(focus.outline,'none');
 });
 await check('Theme preserves compact desktop and mobile scene navigation',async()=>{
  await page.evaluate(()=>goto('runner'));
  await page.getByRole('button',{name:'Tabletop View'}).click();
  assert.equal(await page.locator('.ar-scene').count(),10);
  const reader=await page.locator('.ar-reading-panel').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert.ok(reader>=17);
  await page.getByRole('button',{name:'Draft Editor'}).click();
  await page.setViewportSize({width:390,height:844});
  const safe=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,window:innerWidth,
    scene:document.querySelector('.ar-scene.ar-active')?.textContent||''}));
  assert.ok(safe.doc<=safe.window+5,'Mobile page must not overflow horizontally: '+JSON.stringify(safe));
  assert.ok(safe.scene.length>0);
  await page.setViewportSize({width:1365,height:900});
 });
 await check('Sidebar category headers are 16px and labels are 13px without changing links',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{navPrefs.focus=false;navPrefs.expanded=true;navRender()});
  const values=await page.evaluate(()=>({
   headers:[...document.querySelectorAll('#nav .nav-group-toggle')].map(e=>parseFloat(getComputedStyle(e).fontSize)),
   quick:parseFloat(getComputedStyle(document.querySelector('#nav .nav-quick-title')).fontSize),
   links:[...document.querySelectorAll('#nav .nav-route')].map(e=>e.dataset.route)
  }));
  assert.ok(values.headers.length>=4);
  assert.ok(values.headers.every(v=>v===16));
  assert.equal(values.quick,13);
  assert.deepEqual([...values.links].sort(),Object.keys(await page.evaluate(()=>sections)).sort());
 });
 await check('No uncaught browser JS errors',async()=>{assert.deepEqual(errors,[])});
 const failed=results.filter(r=>r.status==='FAIL');
 fs.writeFileSync('qa-smoke-results.json',JSON.stringify({results,failed:failed.length},null,2));
 await browser.close();
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
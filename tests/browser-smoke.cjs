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
  assert.equal(styles.bg,'#edf0eb');
  assert.equal(styles.foreground,'#20342e');
  assert.match(await page.locator('header').evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
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
 await check('Tabletop quick cues prioritize narration dialogue checks choices and preserve draft data',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{adventureSpotlight='readAloud';adventureReadMode=false;goto('runner')});
  const before=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,sessions:db.sessions,
   decisions:db.decisions,quests:db.quests,maps:db.maps,draft:db.adventureScriptDraft
  }));
  await page.getByRole('button',{name:'Tabletop View'}).click();
  const quick=page.locator('.ar-priority-cues .ar-tab');
  assert.equal(await quick.count(),5);
  assert.deepEqual(await quick.allTextContents().then(xs=>xs.map(x=>x.replace(/[●○]/g,'').trim())),
   ['Read aloud to players','NPC dialogue','Skill checks and consequences','Choices, branches and follow-ups','All sections']);
  const other=page.locator('.ar-other-cues');
  assert.equal(await other.count(),1);
  assert.equal(await other.evaluate(e=>e.open),false);
  await quick.nth(1).click();
  assert.equal(await page.locator('.ar-reading-section').count(),1);
  assert.equal(await page.locator('.ar-reading-section').getAttribute('aria-label'),'NPC dialogue');
  await other.locator('summary').click();
  assert.equal(await other.evaluate(e=>e.open),true);
  assert.equal(await other.locator('button.ar-tab').count(),5);
  await other.getByRole('button',{name:'Music / ambience cues'}).click();
  assert.equal(await page.locator('.ar-reading-section').getAttribute('aria-label'),'Music / ambience cues');
  assert.equal(await page.locator('.ar-other-cues').evaluate(e=>e.open),true,'Secondary cue remains expanded while selected');
  await page.getByRole('button',{name:'All sections'}).click();
  assert.equal(await page.locator('.ar-reading-section').count(),9);
  await page.locator('.ar-scene').nth(1).click();
  assert.equal(await page.locator('.ar-priority-cues .ar-tab').count(),5);
  const after=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,sessions:db.sessions,
   decisions:db.decisions,quests:db.quests,maps:db.maps,draft:db.adventureScriptDraft
  }));
  assert.equal(after,before,'Reading controls may not write campaign state');
  await page.getByRole('button',{name:'Draft Editor'}).click();
 });
 await check('Tabletop quick cues fit narrow mobile viewports',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>goto('runner'));
  await page.getByRole('button',{name:'Tabletop View'}).click();
  assert.equal(await page.locator('.ar-priority-cues .ar-tab').count(),5);
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dims.scroll<=dims.width+5,'Mobile overflow: '+JSON.stringify(dims));
  await page.setViewportSize({width:1365,height:900});
  await page.getByRole('button',{name:'Draft Editor'}).click();
 });
 await check('Adventure Runner footer controls keep long-session navigation accessible without writing campaign state',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{adventureReadMode=false;adventureSpotlight='all';adventurePreviewIndex=0;goto('runner')});
  const before=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,quests:db.quests,
   decisions:db.decisions,sessions:db.sessions,maps:db.maps,draft:db.adventureScriptDraft
  }));
  await page.getByRole('button',{name:'Tabletop View'}).click();
  const footer=page.locator('.ar-reading-footer');
  assert.equal(await footer.count(),1);
  assert.equal(await footer.getByRole('button',{name:'Earlier scene'}).isDisabled(),true);
  assert.equal(await footer.getByRole('button',{name:'Following scene'}).isEnabled(),true);
  await footer.getByRole('button',{name:'Back to quick cues'}).click();
  assert.equal(await page.locator('.ar-priority-cues .ar-tab[aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('.ar-priority-cues .ar-tab[aria-pressed="true"]').evaluate(el=>document.activeElement===el),true);
  await footer.getByRole('button',{name:'Following scene'}).click();
  assert.equal(await page.locator('.ar-scene[aria-current="step"]').count(),1);
  assert.match(await page.locator('.ar-scene[aria-current="step"]').innerText(),/02/);
  await page.locator('.ar-reading-footer').getByRole('button',{name:'Earlier scene'}).click();
  assert.match(await page.locator('.ar-scene[aria-current="step"]').innerText(),/01/);
  const after=await page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,quests:db.quests,
   decisions:db.decisions,sessions:db.sessions,maps:db.maps,draft:db.adventureScriptDraft
  }));
  assert.equal(after,before);
  await page.getByRole('button',{name:'Draft Editor'}).click();
  assert.equal(await page.locator('.ar-reading-footer').count(),0);
 });
 await check('Reading footer is mobile-accessible without horizontal overflow',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{adventureSpotlight='all';goto('runner')});
  await page.getByRole('button',{name:'Tabletop View'}).click();
  const footer=page.locator('.ar-reading-footer');
  assert.equal(await footer.getByRole('button').count(),3);
  const sizes=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth}));
  assert.ok(sizes.page<=sizes.viewport+5,JSON.stringify(sizes));
  await page.getByRole('button',{name:'Draft Editor'}).click();
  await page.setViewportSize({width:1365,height:900});
 });
 await check('Six-hero review checkboxes stay expanded, update counts and persist after reload',async()=>{
  await page.evaluate(()=>{
   db.pcs=Array.from({length:6},(_,i)=>({
    id:'qa-review-'+i,name:'QA Review Hero '+(i+1),species:'Beetlekin',
    class:'Fighter',background:'Soldier',level:1,status:'Active'
   }));
   db.heroReadiness={};
   save();
   selectedSheetPC=db.pcs[0].id;
   goto('sheet');
  });
  const first=page.locator('.hero-ready-card').first();
  const second=page.locator('.hero-ready-card').nth(1);
  assert.equal(await page.locator('.hero-ready-card').count(),6);
  await first.locator('summary').click();
  await second.locator('summary').click();
  const boxes=first.locator('input[type="checkbox"]');
  assert.equal(await boxes.count(),5);
  await boxes.first().check();
  assert.equal(await first.evaluate(el=>el.open),true,'Clicked hero must stay expanded');
  assert.equal(await second.evaluate(el=>el.open),true,'Other expanded hero must stay expanded');
  assert.equal(await boxes.first().evaluate(el=>document.activeElement===el),true,'Checkbox retains focus');
  assert.equal(await first.locator('.hero-review-count').innerText(),'1/5');
  for(let i=1;i<5;i++)await boxes.nth(i).check();
  assert.equal(await first.locator('.hero-review-count').innerText(),'5/5');
  assert.equal(await page.locator('#hero-review-total').innerText(),'1/6 reviewed');
  await boxes.first().uncheck();
  assert.equal(await first.locator('.hero-review-count').innerText(),'4/5');
  assert.equal(await page.locator('#hero-review-total').innerText(),'0/6 reviewed');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')).heroReadiness['qa-review-0']);
  assert.equal(stored.build,false);
  assert.equal(stored.mechanics,true);
  assert.equal(stored.resources,true);
  await page.reload();
  await page.evaluate(()=>goto('sheet'));
  assert.equal(await page.locator('.hero-ready-card').first().locator('.hero-review-count').innerText(),'4/5');
  assert.equal(await page.locator('#hero-review-total').innerText(),'0/6 reviewed');
 });
 await check('Enchanted Evergarden stylesheet loads and improves contrast without editing campaign',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{navSearchQuery='';navPrefs.focus=false;navPrefs.expanded=true;goto('dashboard')});
  const before=await page.evaluate(()=>JSON.stringify(db));
  const style=await page.evaluate(()=>{
   const sheet=[...document.styleSheets].find(x=>x.href&&x.href.includes('enchanted-evergarden.css'));
   const header=getComputedStyle(document.querySelector('header'));
   const nav=getComputedStyle(document.querySelector('#nav'));
   return {loaded:!!sheet,header:header.backgroundImage,nav:nav.backgroundImage,search:!!document.getElementById('nav-tool-search')};
  });
  assert.ok(style.loaded,'Theme stylesheet missing');
  assert.match(style.header,/gradient/);
  assert.match(style.nav,/gradient/);
  assert.ok(style.search,'Search field missing');
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'Pure styling cannot modify campaign');
 });
 await check('Tool search finds hidden navigation destinations and restores sidebar',async()=>{
  await page.evaluate(()=>{navSearchQuery='';navPrefs.open='Campaign';navPrefs.focus=false;goto('dashboard')});
  const search=page.locator('#nav-tool-search');
  await search.fill('character');
  const results=page.locator('.nav-search-results');
  assert.equal(await results.isVisible(),true);
  assert.equal(await page.locator('.nav-browse').isVisible(),false);
  assert.ok(await results.getByRole('button',{name:'Player Characters'}).count()===1);
  await search.fill('zzzzz-no-match');
  assert.match(await results.innerText(),/No matching tools/);
  await search.fill('battle');
  await results.getByRole('button',{name:/Battle Maps/}).click();
  assert.equal(await page.evaluate(()=>page),'maps');
  assert.equal(await page.locator('.nav-search-results').isVisible(),false);
  assert.equal(await page.locator('.nav-browse').isVisible(),true);
  await page.evaluate(()=>goto('dashboard'));
  await page.locator('#nav-tool-search').fill('music');
  await page.locator('.nav-search-results').getByRole('button',{name:/Music/}).click();
  assert.equal(await page.evaluate(()=>page),'music');
  assert.equal(await page.locator('#nav-tool-search').inputValue(),'');
 });
 await check('Theme and navigation remain usable on narrow mobile screens and Session Mode',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{navSearchQuery='';navPrefs.focus=false;navPrefs.expanded=true;goto('dashboard')});
  const search=page.locator('#nav-tool-search');
  await search.fill('combat');
  assert.equal(await page.locator('.nav-search-results').getByRole('button',{name:/Combat/}).count(),1);
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dims.scroll<=dims.width+5,'Theme caused mobile overflow: '+JSON.stringify(dims));
  await search.fill('');
  await page.locator('.nav-focus-toggle').click();
  assert.equal(await page.locator('.nav-quick-links button').count(),4);
  await page.locator('#nav-tool-search').fill('character');
  assert.ok(await page.locator('.nav-search-results button').count()>0,'Search must work in Session Mode');
  await page.locator('#nav-tool-search').fill('');
  await page.locator('.nav-focus-toggle').click();
  await page.setViewportSize({width:1365,height:900});
 });
 await check('Phase 2 Command Center previews current script and shows real sheet HP/AC without writes',async()=>{
  await page.setViewportSize({width:1365,height:900});
  const before=await page.evaluate(()=>JSON.stringify(db));
  await page.evaluate(()=>{
   db.pcs=[{id:'phase2-hero',name:'QA Lantern Hero',species:'Firefly Folk',class:'Wizard',level:1,status:'Active',hp:7,maxHp:7,ac:10}];
   db.sheets={'phase2-hero':{scores:{STR:8,DEX:14,CON:12,INT:17,WIS:10,CHA:10},currentHp:9,maxHp:11,ac:14}};
   db.combat={name:'QA Encounter',round:1,turn:0,active:false,participants:[],history:[]};
   db.adventureScriptDraft={adventureId:'vesper-adventure-1',scenes:{'a1-scene-01':{readAloud:'QA scene text: a lantern glows brightly.',dmNotes:'Private DM-only details.'}}};
   adventurePreviewIndex=0;christmasIntroSelection=null;
   goto('command');
  });
  const dashboard=page.locator('#app');
  assert.equal(await dashboard.locator('.cc-atglance .cc-overview-tile').count(),4);
  assert.equal(await dashboard.locator('.cc-person').count(),1);
  assert.match(await dashboard.locator('.cc-person .cc-stats').innerText(),/9 \/ 11/);
  assert.match(await dashboard.locator('.cc-person .cc-stats').innerText(),/AC 14/);
  assert.match(await dashboard.locator('.cc-scene-quote').innerText(),/lantern glows brightly/);
  assert.doesNotMatch(await dashboard.locator('.cc-scene-quote').innerText(),/Private DM-only details/);
  assert.equal(await dashboard.locator('.cc-scene-preview').getAttribute('data-cc-scene-index'),'0');
  assert.equal(await dashboard.locator('.cc-scene-controls button').first().isDisabled(),true);
  const protectedBefore=await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,campaign:db.campaign,sessions:db.sessions,decisions:db.decisions,script:db.adventureScriptDraft}));
  await dashboard.locator('.cc-scene-controls').getByRole('button',{name:'Next scene'}).click();
  assert.equal(await page.evaluate(()=>page),'runner');
  assert.equal(await page.evaluate(()=>adventurePreviewIndex),1);
  assert.equal(await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,campaign:db.campaign,sessions:db.sessions,decisions:db.decisions,script:db.adventureScriptDraft})),protectedBefore,'Scene preview navigation must not change protected campaign records');
  await page.evaluate(snapshot=>{db=JSON.parse(snapshot);adventurePreviewIndex=0;goto('command')},before);
  assert.deepEqual(await page.evaluate(()=>db.pcs.map(x=>x.id)),JSON.parse(before).pcs.map(x=>x.id),'Synthetic QA heroes must not persist in the displayed campaign');
 });
 await check('Phase 2 Command Center fits a narrow mobile viewport',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>goto('command'));
  assert.equal(await page.locator('.cc-atglance .cc-overview-tile').count(),4);
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dims.scroll<=dims.width+5,'Mobile Command Center overflow: '+JSON.stringify(dims));
  await page.setViewportSize({width:1365,height:900});
 });
 await check('Phase 3 reading view presents distinct cue panels and quick tools without altering story records',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{adventurePreviewIndex=0;adventureSpotlight='all';adventureReadMode=true;christmasIntroSelection=null;goto('runner')});
  const protectedBefore=await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sessions:db.sessions,decisions:db.decisions,draft:db.adventureScriptDraft}));
  const panel=page.locator('.ar-reading-panel');
  assert.equal(await panel.count(),1);
  assert.equal(await page.locator('.ar-reading-section').count(),9);
  assert.equal(await panel.locator('.ar-cue-npc-dialogue').count(),1);
  assert.equal(await panel.locator('.ar-cue-checks').count(),1);
  assert.equal(await panel.locator('.ar-cue-choices').count(),1);
  const checksBorder=await panel.locator('.ar-cue-checks').evaluate(x=>getComputedStyle(x).borderLeftColor);
  const dialogueBorder=await panel.locator('.ar-cue-npc-dialogue').evaluate(x=>getComputedStyle(x).borderLeftColor);
  assert.notEqual(checksBorder,dialogueBorder,'DM cue colors should differ by category');
  assert.equal(await panel.locator('.ar-reading-tools').count(),1);
  assert.equal(await panel.getByRole('button',{name:/Open scene map/}).count(),1);
  assert.equal(await panel.getByRole('button',{name:/Music & ambience/}).count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sessions:db.sessions,decisions:db.decisions,draft:db.adventureScriptDraft})),protectedBefore,'Reading UI must not write story data');
  await panel.getByRole('button',{name:/Music & ambience/}).click();
  assert.equal(await page.evaluate(()=>page),'music');
  assert.equal(await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sessions:db.sessions,decisions:db.decisions,draft:db.adventureScriptDraft})),protectedBefore,'Opening music should not change story data');
 });
 await check('Phase 3 reading controls remain usable on mobile',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{adventurePreviewIndex=0;adventureSpotlight='readAloud';adventureReadMode=true;goto('runner')});
  assert.equal(await page.locator('.ar-reading-section.ar-narration').count(),1);
  const fontsize=await page.locator('.ar-narration .ar-reading-text').evaluate(x=>parseFloat(getComputedStyle(x).fontSize));
  assert.ok(fontsize>=17,'Narration font too small');
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dims.scroll<=dims.width+5,'Phase 3 mobile page overflow: '+JSON.stringify(dims));
  await page.setViewportSize({width:1365,height:900});
 });
 await check('Phase 4 hero sheet overview preserves existing stats and sheet sections',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{
    db.pcs=[{id:'qa-phase4-hero',name:'Frost Lantern',species:'Firefly Folk',class:'Ranger',background:'Guide',level:1,status:'Active',hp:9,maxHp:11,ac:13}];
    db.sheets={'qa-phase4-hero':{...defaultSheet(db.pcs[0]),currentHp:9,maxHp:11,ac:13,speed:30}};
    selectedSheetPC='qa-phase4-hero';goto('sheet');
  });
  const protectedBefore=await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,decisions:db.decisions,sessions:db.sessions}));
  assert.equal(await page.locator('.sheet-hero-banner').count(),1);
  assert.match(await page.locator('.sheet-hero-heading h2').innerText(),/Frost Lantern/);
  const hp=await page.locator('.sheet-hero-stats').innerText();
  assert.match(hp,/9 \/ 11/);assert.match(hp,/13/);assert.match(hp,/30/);
  assert.equal(await page.locator('.sheet-quick-nav a').count(),6);
  for(const id of ['sheet-abilities','sheet-combat','sheet-skills','sheet-spells','sheet-equipment','sheet-features']){
    assert.equal(await page.locator('#'+id).count(),1,'Missing anchor '+id);
  }
  assert.match(await page.locator('.sheet-hero-avatar').innerText(),/FL/);
  assert.equal(await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,decisions:db.decisions,sessions:db.sessions})),protectedBefore,'Pure sheet presentation must not modify records');
  await page.locator('.sheet-quick-nav a[href="#sheet-spells"]').click();
  assert.equal(await page.evaluate(()=>location.hash),'#sheet-spells');
  assert.equal(await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,decisions:db.decisions,sessions:db.sessions})),protectedBefore,'Jump link must not save data');
 });
 await check('Phase 4 sheet maintains narrow screen readability and accessible character picker',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{selectedSheetPC=db.pcs[0]?.id;goto('sheet')});
  assert.equal(await page.locator('#sheet-pc-picker').count(),1);
  assert.equal(await page.locator('.sheet-hero-stat').count(),3);
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dims.scroll<=dims.width+5,'Phase 4 sheet mobile overflow: '+JSON.stringify(dims));
  await page.setViewportSize({width:1365,height:900});
 });
 await check('Phase 5 DM tabletop has compact fog controls and local TV status without changing map mechanics',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{tabletopMode=false;mapState().viewMode='dm';mapState().fogTool='off';goto('maps')});
  const protectedBefore=await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,scenes:db.maps.scenes,history:db.maps.history,decisions:db.decisions,session:db.campaign.session}));
  const desk=page.locator('.map-session-desk');
  assert.equal(await desk.count(),1);
  assert.equal(await desk.locator('.map-tv-status').count(),1);
  assert.match(await desk.locator('.map-tv-status').innerText(),/TV tab|Player display unavailable/);
  assert.equal(await desk.locator('.map-desk-fog').count(),3);
  await desk.getByRole('button',{name:/Reveal fog/}).click();
  assert.equal(await page.evaluate(()=>mapState().fogTool),'reveal');
  assert.equal(await page.locator('.map-desk-fog[aria-pressed="true"]').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify({pcs:db.pcs,sheets:db.sheets,scenes:db.maps.scenes,history:db.maps.history,decisions:db.decisions,session:db.campaign.session})),protectedBefore,'Selecting paint tool must not mutate map or campaign records');
  await page.locator('.map-desk-fog').first().click();
  assert.equal(await page.evaluate(()=>mapState().fogTool),'off');
  await page.evaluate(()=>{window.__qaOriginalLive=window.SHLive;window.SHLive={available:true,connected:true};mapTvUpdateStatus()});
  assert.equal(await page.locator('.map-session-desk .map-tv-status').getAttribute('data-connected'),'true');
  assert.match(await page.locator('.map-session-desk .map-tv-status').innerText(),/TV tab connected/);
  await page.evaluate(()=>{window.SHLive=window.__qaOriginalLive;delete window.__qaOriginalLive;mapTvUpdateStatus()});
 });
 await check('Phase 5 fullscreen and player view hide DM controls and retain zoom tools',async()=>{
  await page.setViewportSize({width:1365,height:900});
  await page.evaluate(()=>{tabletopMode=true;mapState().viewMode='dm';mapState().fogTool='off';goto('maps');tabletopMode=true;render()});
  assert.equal(await page.locator('.tabletop-dm-fog button').count(),3);
  assert.equal(await page.locator('.tabletop-toolbar .map-tv-status').count(),1);
  assert.ok(await page.getByRole('button',{name:'Zoom in'}).count()>0);
  await page.evaluate(()=>{mapState().viewMode='player';render()});
  assert.equal(await page.locator('.tabletop-dm-fog').count(),0);
  assert.equal(await page.locator('.tabletop-toolbar .map-tv-status').count(),0);
  assert.equal(await page.locator('.map-dm-marker-layer').count(),0);
  await page.evaluate(()=>{tabletopMode=false;mapState().viewMode='dm';render()});
 });
 await check('Phase 5 DM toolbar remains usable on mobile without horizontal page overflow',async()=>{
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{tabletopMode=false;mapState().viewMode='dm';goto('maps')});
  assert.equal(await page.locator('.map-session-desk').count(),1);
  const dims=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(dims.scroll<=dims.width+5,'Phase 5 DM toolbar overflow: '+JSON.stringify(dims));
  await page.setViewportSize({width:1365,height:900});
 });
 await check('No uncaught browser JS errors',async()=>{assert.deepEqual(errors,[])});
 const failed=results.filter(r=>r.status==='FAIL');
 fs.writeFileSync('qa-smoke-results.json',JSON.stringify({results,failed:failed.length},null,2));
 await browser.close();
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
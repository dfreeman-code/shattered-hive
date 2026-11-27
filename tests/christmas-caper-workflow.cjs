const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
async function ready(url){
 for(let i=0;i<50;i++){
  try{await new Promise((resolve,reject)=>http.get(url,res=>{res.resume();res.statusCode===200?resolve():reject(new Error(String(res.statusCode))) }).on('error',reject));return;}
  catch{await new Promise(r=>setTimeout(r,200));}
 }
 throw Error('Local server failed');
}
(async()=>{
 const server=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready('http://127.0.0.1:8767/index.html');
  browser=await chromium.launch({headless:true});
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await page.goto('http://127.0.0.1:8767/index.html');
  const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  const initial=await read();
  assert.equal(initial.campaign.session,0);
  assert.equal(initial.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(initial.quests.find(x=>x.id==='vesper-adventure-1').status,'Available');
  assert.ok(initial.decisions.every(x=>x.status==='Not decided'));
  assert.equal(initial.christmasEncounterPrepVersion,1,'Christmas prep should initialize safely');
  assert.equal(initial.encounters.filter(x=>x.id.startsWith('caper-encounter-')).length,4);
  assert.equal(initial.music.filter(x=>x.id.startsWith('caper-music-')).length,3);
  // A complete six-PC party is preserved without requiring access to real user characters.
  await page.evaluate(()=>{
    const key='shattered-hive-v1',data=JSON.parse(localStorage.getItem(key));
    data.pcs=Array.from({length:6},(_,i)=>({id:'test-hero-'+i,name:'Test Hero '+(i+1),class:'Fighter',species:'Beetlekin',level:1,status:'Active'}));
    localStorage.setItem(key,JSON.stringify(data));
  });
  await page.reload();
  const sixBefore=(await read()).pcs.map(p=>({...p}));
  await page.getByRole('button',{name:/Adventure Runner/}).click();
  assert.match(await page.locator('#app').innerText(),/Party:\s*6 character records/);
  await page.getByRole('button',{name:'Open Hero Introductions'}).click();
  assert.match(await page.locator('#app').innerText(),/Six heroes, six beginnings/);
  assert.equal(await page.locator('.ar-scene').count(),7,'six solo scenes plus gathering');
  assert.match(await page.locator('#app').innerText(),/Test Hero 1/);
  for(let i=0;i<6;i++){
    await page.locator('.ar-scene').nth(i).click();
    const text=await page.locator('#ar-readAloud').inputValue();
    assert.match(text,new RegExp('Test Hero '+(i+1)));
    assert.notEqual(text,'','Each hero must have individualized opening narration');
    assert.equal(await page.locator('.ar-field textarea').count(),9);
  }
  await page.locator('.ar-scene').first().click();
  await page.locator('#ar-readAloud').fill('Custom introduction for Test Hero 1');
  await page.locator('.ar-scene').nth(1).click();
  await page.locator('.ar-scene').first().click();
  assert.equal(await page.locator('#ar-readAloud').inputValue(),'Custom introduction for Test Hero 1');
  await page.getByRole('button',{name:'Tabletop View'}).click();
  assert.match(await page.locator('.ar-reading-text').first().innerText(),/Custom introduction/);
  await page.locator('.ar-scene').last().click();
  assert.match(await page.locator('.ar-reading-text').first().innerText(),/six separate trails converge/i);
  await page.getByRole('button',{name:'Continue to original Scene 1'}).first().click();
  assert.equal(await page.locator('.ar-scene').count(),10,'Original 10-scene structure must remain');
  await page.reload();
  await page.getByRole('button',{name:/Adventure Runner/}).click();
  await page.getByRole('button',{name:'Open Hero Introductions'}).click();
  await page.locator('.ar-scene').first().click();
  assert.equal(await page.locator('#ar-readAloud').inputValue(),'Custom introduction for Test Hero 1');
  assert.deepEqual((await read()).pcs,sixBefore,'Prologue preparation must not change PCs');
  assert.equal((await read()).sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.ok((await read()).decisions.every(x=>x.status==='Not decided'));
  await page.getByRole('button',{name:'Continue to original Scene 1'}).first().click();

  await page.locator('.ar-scene').nth(3).click();
  assert.match(await page.locator('#app').innerText(),/Frozen Berry Crossing/);
  await page.locator('.ar-scene').nth(6).click();
  assert.match(await page.locator('#app').innerText(),/Hollowroot Guardian/);
  await page.getByRole('button',{name:'Open Encounter Library'}).click();
  assert.match(await page.locator('#app').innerText(),/Hungry Snow-Tuft Mites/);
  await page.getByRole('button',{name:/Adventure Runner/}).click();
  await page.getByRole('button',{name:'Open Music Cues'}).click();
  assert.match(await page.locator('#app').innerText(),/Session 1: The Great Christmas Caper/);
  await page.getByRole('button',{name:/Combat Tracker/}).first().click();
  assert.equal(await page.locator('#combatPcSelect option').count(),7);
  assert.match(await page.locator('#combatPresetSelect').innerText(),/Snow-Tuft Mite/);
  assert.match(await page.locator('#combatPresetSelect').innerText(),/Hollowroot Guardian/);
  assert.deepEqual((await read()).pcs,sixBefore,'No test party member may be altered by prep UI');
  await page.getByRole('button',{name:/Adventure Runner/}).click();


  await page.getByRole('button',{name:/Adventure Runner/}).click();
  assert.match(await page.locator('#app').innerText(),/PRE-CAMPAIGN DRAFT/);
  assert.equal(await page.locator('.ar-scene').count(),10);
  assert.equal(await page.locator('.ar-field textarea').count(),9);
  for(let i=0;i<10;i++){
   await page.locator('.ar-scene').nth(i).click();
   assert.equal(await page.locator('.ar-scene[aria-current="step"]').count(),1);
   assert.equal(await page.locator('.ar-field textarea').count(),9);
  }
  await page.locator('.ar-scene').first().click();
  await page.locator('#ar-readAloud').fill('TEST ONLY: Snow falls on Hearthhollow.');
  await page.locator('#ar-dmNotes').fill('TEST ONLY: This must never count as a played scene.');
  await page.getByRole('button',{name:'Save scene draft'}).click();
  assert.equal((await read()).adventureScriptDraft.scenes['a1-scene-01'].readAloud,'TEST ONLY: Snow falls on Hearthhollow.');
  await page.reload();
  await page.getByRole('button',{name:/Adventure Runner/}).click();
  assert.equal(await page.locator('#ar-readAloud').inputValue(),'TEST ONLY: Snow falls on Hearthhollow.');

  const sample=await page.evaluate(()=>{
   return {adventureId:'vesper-adventure-1',version:1,scenes:ADVENTURE_ONE_SCENES.map((title,index)=>{
    const s={id:adventureSceneId(index),title};
    ADVENTURE_FIELDS.forEach(field=>s[field]='TEST ONLY scene '+(index+1)+' '+field);
    return s;
   })};
  });
  await page.locator('#ar-import').setInputFiles({name:'approved-test-script.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(sample))});
  await page.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('shattered-hive-v1')||'{}').adventureScriptDraft?.scenes||{}).length===10,null,{timeout:10000});
  let state=await read();
  assert.equal(Object.keys(state.adventureScriptDraft.scenes).length,10);
  assert.equal(state.adventureScriptDraft.scenes['a1-scene-10'].rewards,'TEST ONLY scene 10 rewards');
  await page.locator('.ar-scene').last().click();
  assert.equal(await page.locator('#ar-rewards').inputValue(),'TEST ONLY scene 10 rewards');
  // Rejected import must leave existing draft unchanged.
  const before=JSON.stringify(state.adventureScriptDraft);
  const malformed=structuredClone(sample);malformed.scenes[0].title='Wrong Scene';
  await page.locator('#ar-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(malformed))});
  assert.equal(JSON.stringify((await read()).adventureScriptDraft),before);
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export script JSON'}).click()]);
  const exported=JSON.parse(require('node:fs').readFileSync(await download.path(),'utf8'));
  assert.equal(exported.scenes.length,10);
  assert.equal(exported.scenes[9].rewards,'TEST ONLY scene 10 rewards');

  await page.locator('#nav button').filter({hasText:'Session Command Center'}).click();
  assert.match(await page.locator('#app').innerText(),/Session Command Center/);
  assert.match(await page.locator('#app').innerText(),/Session 1 — The Great Christmas Caper/);
  await page.locator('#cc-notes').fill('TEST ONLY: prep notebook');
  await page.locator('#cc-notes').blur();
  assert.equal((await read()).sessionCommandNotes,'TEST ONLY: prep notebook');
  await page.reload();
  await page.locator('#nav button').filter({hasText:'Session Command Center'}).click();
  assert.equal(await page.locator('#cc-notes').inputValue(),'TEST ONLY: prep notebook');
  await page.getByRole('button',{name:'Player-safe board'}).click();
  assert.equal(await page.locator('#cc-player-board').count(),1);
  assert.ok(!(await page.locator('#cc-player-board').innerText()).includes('TEST ONLY: prep notebook'));
  assert.ok(!(await page.locator('#cc-player-board').innerText()).includes('The Hollow King'));
  await page.getByRole('button',{name:'Close player board'}).click();
  assert.equal(await page.locator('#cc-player-board').count(),0);

  await page.getByRole('button',{name:'Open Battle Map'}).click();
  assert.match(await page.locator('#app').innerText(),/Map|Battle/i);
  await page.getByRole('group',{name:'DM session shortcuts'}).getByRole('button',{name:'Session Command Center',exact:true}).click();
  await page.getByRole('button',{name:'Full Combat Tracker'}).click();
  assert.ok((await page.locator('#app').innerText()).length>100);
  // Build Workshop: isolated six synthetic Bug Hero submissions, never live PCs.
  const review=await browser.newContext({viewport:{width:1280,height:820}});
  const wp=await review.newPage();
  wp.on('dialog',d=>{void d.accept().catch(()=>{});});
  await wp.goto('http://127.0.0.1:8767/index.html');
  const inputPowers=['Magic spells','Sneaking and climbing','Super strength','Archery and exploring','Protecting friends','Super strength'];
  const extras=['','','A Martial Warlock','','',''];
  const expected=['Wizard','Rogue','Warlock','Ranger','Paladin','Fighter'];
  await wp.evaluate(({inputPowers,extras})=>{
   const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
   data.pcs=Array.from({length:6},(_,i)=>({id:'workshop-'+i,name:'Workshop Hero '+i,level:1,class:'Unassigned',background:'',species:'Spiderkin',status:'Active',
    notes:'Player-chosen notes must remain intact',bugHero:{power:inputPowers[i],extra:extras[i],dream:'My own dream',fear:'My own fear'}}));
   localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
  },{inputPowers,extras});
  await wp.reload();
  await wp.evaluate(()=>goto('sheet'));
  for(let i=0;i<6;i++){
   await wp.locator('.card.section select').first().selectOption('workshop-'+i);
   const workshop=wp.locator('#hero-build-workshop');
   assert.ok(await workshop.count(),'Workshop appears for all six hero archetypes');
   await workshop.locator('summary').click();
   assert.match(await workshop.innerText(),new RegExp('Recommended class\\s*'+expected[i]));
   assert.match(await workshop.innerText(),/My own fear/);
   assert.match(await workshop.innerText(),/My own dream/);
   if(i===0){
    const before=JSON.parse(await wp.evaluate(()=>localStorage.getItem('shattered-hive-v1')));
    assert.equal(before.pcs[0].class,'Unassigned','Review alone cannot assign class');
    await workshop.getByRole('button',{name:/Apply approved class and background/}).click();
    const updated=JSON.parse(await wp.evaluate(()=>localStorage.getItem('shattered-hive-v1')));
    assert.equal(updated.pcs[0].class,'Wizard');
    assert.equal(updated.pcs[0].background,'Sage');
    assert.equal(updated.pcs[0].notes,'Player-chosen notes must remain intact');
    assert.equal(updated.campaign.session,0);
    assert.ok(updated.decisions.every(d=>d.status==='Not decided'));
   }
  }
  await review.close();

  // Wizard workshop runs against disposable fictional PCs only; never the real cloud account.
  const wizardContext=await browser.newContext({viewport:{width:1280,height:800}});
  const wiz=await wizardContext.newPage();
  wiz.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await wiz.goto('http://127.0.0.1:8767/index.html');
  await wiz.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    data.pcs=[
      {id:'test-wizard',name:'Test Silk Scholar',class:'Unassigned',background:'',level:1,species:'Spiderkin',status:'Active',
       hp:'',ac:'',maxHp:'',notes:'Never overwrite my original player notes',bugHero:{power:'Magic spells',gear:'Magic staff',dream:'Learn forgotten spells',fear:'Lady spiders'}},
      {id:'test-custom',name:'Custom Spell Scholar',class:'Wizard',background:'Sage',level:1,species:'Spiderkin',status:'Active',
       hp:9,ac:15,maxHp:9,notes:'An existing build',bugHero:{power:'Magic spells',gear:'Staff'}}];
    localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
  });
  await wiz.reload();
  await wiz.evaluate(()=>goto('sheet'));
  await wiz.locator('.card.section select').first().selectOption('test-wizard');
  const summary=wiz.locator('#hero-build-workshop summary');
  await summary.click();
  assert.match(await wiz.locator('#hero-build-workshop').innerText(),/The Forbidden Thread/);
  assert.match(await wiz.locator('#hero-build-workshop').innerText(),/INT 17/);
  const getWizardState=()=>wiz.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  let w=await getWizardState();
  assert.equal(w.pcs[0].class,'Unassigned','Preview cannot apply a class automatically');
  assert.ok(!w.christmasPrologueDraft?.scenes?.['hero:test-wizard'],'Preview cannot automatically write prologue');
  await wiz.getByRole('button',{name:'Apply approved level-1 Wizard sheet'}).click();
  w=await getWizardState();
  assert.equal(w.pcs[0].class,'Wizard');
  assert.equal(w.pcs[0].background,'Sage');
  assert.equal(w.pcs[0].hp,8);
  assert.equal(w.pcs[0].ac,12);
  assert.equal(w.pcs[0].notes,'Never overwrite my original player notes');
  assert.deepEqual(w.sheets['test-wizard'].scores,{STR:8,DEX:14,CON:14,INT:17,WIS:12,CHA:10});
  assert.deepEqual(w.sheets['test-wizard'].saves,['INT','WIS']);
  assert.equal(w.sheets['test-wizard'].spellSlots['1'],2);
  assert.equal(w.sheets['test-wizard'].spellAbility,'INT');
  assert.match(w.sheets['test-wizard'].spellPrepared,/Find Familiar/);
  assert.match(w.sheets['test-wizard'].spellPrepared,/Magic Initiate/);
  assert.equal(w.sheets['test-wizard'].maxHp,8);
  assert.equal(w.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.ok(w.decisions.every(x=>x.status==='Not decided'));
  await wiz.locator('#hero-build-workshop summary').click();
  await wiz.getByRole('button',{name:'Save suggested solo introduction draft'}).click();
  w=await getWizardState();
  assert.match(w.christmasPrologueDraft.scenes['hero:test-wizard'].readAloud,/frozen roots/);
  assert.match(w.christmasPrologueDraft.scenes['hero:test-wizard'].dmNotes,/Learn forgotten spells/);
  assert.ok(!w.adventureScriptDraft?.scenes?.['a1-scene-01']?.readAloud?.includes('frozen roots'),
   'Original ten-scene script must not be replaced by the prologue');
  await wiz.reload();
  await wiz.evaluate(()=>goto('sheet'));
  await wiz.locator('.card.section select').first().selectOption('test-custom');
  await wiz.locator('#hero-build-workshop summary').click();
  assert.equal(await wiz.getByRole('button',{name:'Apply approved level-1 Wizard sheet'}).isDisabled(),true,
   'Existing player-created sheet must be protected from overwrite');
  w=await getWizardState();
  assert.equal(w.pcs[1].hp,9);
  assert.equal(w.pcs[1].notes,'An existing build');
  await wizardContext.close();


  // Rogue workshop uses disposable, local-only David fixtures (including an already customized David record); no production saves touched.
  const rogueContext=await browser.newContext({viewport:{width:1280,height:800}});
  const roguePage=await rogueContext.newPage();
  roguePage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await roguePage.goto('http://127.0.0.1:8767/index.html');
  await roguePage.evaluate(()=>{
    const d=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    d.pcs=[
     {id:'test-rogue',name:'David',class:'Unassigned',background:'',level:1,species:'Mantisborn',status:'Active',hp:'',maxHp:'',ac:'',
       notes:'Original player history remains exactly as written',bugHero:{power:'Sneaking and climbing',gear:'Spear',dream:'Taste caramel popcorn',fear:'Deep Water',extra:'Strange Yellow markings'}},
     {id:'test-rogue-existing',name:'David',class:'Rogue',background:'Wayfarer',level:1,species:'Mantisborn',status:'Active',hp:12,maxHp:12,ac:15,
       notes:'Keep my existing numbers',bugHero:{power:'Sneaking and climbing',gear:'Spear'}}
    ];
    localStorage.setItem('shattered-hive-v1',JSON.stringify(d));
  });
  await roguePage.reload();
  await roguePage.evaluate(()=>goto('sheet'));
  await roguePage.locator('.card.section select').first().selectOption('test-rogue');
  await roguePage.locator('#hero-build-workshop summary').click();
  assert.match(await roguePage.locator('#hero-build-workshop').innerText(),/The Caramel Trail/);
  assert.match(await roguePage.locator('#hero-build-workshop').innerText(),/DEX 17/);
  const rogueState=()=>roguePage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  let rs=await rogueState();
  assert.equal(rs.pcs[0].class,'Unassigned','Preview must not assign class');
  assert.ok(!rs.christmasPrologueDraft?.scenes?.['hero:test-rogue'],'Preview must not store decisions');
  await roguePage.getByRole('button',{name:'Apply approved level-1 Rogue sheet'}).click();
  rs=await rogueState();
  assert.equal(rs.pcs[0].class,'Rogue');
  assert.equal(rs.pcs[0].background,'Wayfarer');
  assert.equal(rs.pcs[0].hp,10);
  assert.equal(rs.pcs[0].ac,14);
  assert.equal(rs.pcs[0].notes,'Original player history remains exactly as written');
  assert.deepEqual(rs.sheets['test-rogue'].scores,{STR:12,DEX:17,CON:14,INT:10,WIS:13,CHA:8});
  assert.deepEqual(rs.sheets['test-rogue'].saves,['DEX','INT']);
  assert.deepEqual(rs.sheets['test-rogue'].expertise,['Stealth','Investigation']);
  assert.match(rs.sheets['test-rogue'].features,/not a Finesse weapon/);
  assert.equal(rs.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(rs.campaign.session,0);
  assert.ok(rs.decisions.every(x=>x.status==='Not decided'));
  await roguePage.locator('#hero-build-workshop summary').click();
  await roguePage.getByRole('button',{name:'Save suggested solo introduction draft'}).click();
  rs=await rogueState();
  assert.match(rs.christmasPrologueDraft.scenes['hero:test-rogue'].readAloud,/caramel popcorn/);
  assert.match(rs.christmasPrologueDraft.scenes['hero:test-rogue'].dmNotes,/Strange Yellow markings|yellow markings/i);
  await roguePage.reload();
  await roguePage.evaluate(()=>goto('sheet'));
  await roguePage.locator('.card.section select').first().selectOption('test-rogue-existing');
  await roguePage.locator('#hero-build-workshop summary').click();
  assert.equal(await roguePage.getByRole('button',{name:'Apply approved level-1 Rogue sheet'}).isDisabled(),true);
  rs=await rogueState();
  assert.equal(rs.pcs[1].hp,12);
  assert.equal(rs.pcs[1].ac,15);
  assert.equal(rs.pcs[1].notes,'Keep my existing numbers');
  await rogueContext.close();


  // Warlock review uses disposable browser-local Snoop Bugg fixtures; one starts blank and one has protected existing data.
  const warlockContext=await browser.newContext({viewport:{width:1280,height:800}});
  const warlockPage=await warlockContext.newPage();
  warlockPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await warlockPage.goto('http://127.0.0.1:8767/index.html');
  await warlockPage.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    data.pcs=[
      {id:'warlock-test',name:'Snoop Bugg',class:'Unassigned',background:'',level:1,species:'Spiderkin',status:'Active',
       hp:'',maxHp:'',ac:'',notes:'Never change my submitted history',bugHero:{power:'Super strength',gear:'Two little daggers',extra:'A Martial Warlock',
        dream:'To be my patron favorite',fear:'Being afraid',trait:'Mischievous'}},
      {id:'warlock-existing',name:'Snoop Bugg',class:'Warlock',background:'Charlatan',level:1,species:'Spiderkin',status:'Active',
       hp:11,maxHp:11,ac:16,notes:'My original equipment stays',bugHero:{power:'Super strength',extra:'A Martial Warlock'}}
    ];
    localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
  });
  await warlockPage.reload();
  await warlockPage.evaluate(()=>goto('sheet'));
  await warlockPage.locator('.card.section select').first().selectOption('warlock-test');
  await warlockPage.locator('#hero-build-workshop summary').click();
  assert.match(await warlockPage.locator('#hero-build-workshop').innerText(),/The Patron’s Favorite/);
  assert.match(await warlockPage.locator('#hero-build-workshop').innerText(),/CHA 17/);
  assert.match(await warlockPage.locator('#hero-build-workshop').innerText(),/30 GP/);
  const warlockState=()=>warlockPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  let ws=await warlockState();
  assert.equal(ws.pcs[0].class,'Unassigned','Opening build view must not assign class');
  assert.ok(!ws.christmasPrologueDraft?.scenes?.['hero:warlock-test'],'Preview must not store a patron agreement');
  await warlockPage.getByRole('button',{name:'Apply approved level-1 Warlock sheet'}).click();
  ws=await warlockState();
  assert.equal(ws.pcs[0].class,'Warlock');
  assert.equal(ws.pcs[0].background,'Charlatan');
  assert.equal(ws.pcs[0].hp,10);
  assert.equal(ws.pcs[0].ac,13);
  assert.equal(ws.pcs[0].notes,'Never change my submitted history');
  assert.deepEqual(ws.sheets['warlock-test'].scores,{STR:10,DEX:14,CON:14,INT:8,WIS:12,CHA:17});
  assert.deepEqual(ws.sheets['warlock-test'].saves,['WIS','CHA']);
  assert.equal(ws.sheets['warlock-test'].spellSlots['1'],1);
  assert.equal(ws.sheets['warlock-test'].spellAbility,'CHA');
  assert.match(ws.sheets['warlock-test'].features,/Pact of the Blade/);
  assert.match(ws.sheets['warlock-test'].inventory,/30 GP/);
  assert.match(ws.sheets['warlock-test'].features,/Spiderkin \(approved campaign homebrew\)/);
  assert.match(ws.sheets['warlock-test'].proficiencies,/Does not automatically grant shield training/);
  assert.equal(ws.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(ws.campaign.session,0);
  assert.ok(ws.decisions.every(x=>x.status==='Not decided'));
  await warlockPage.locator('#hero-build-workshop summary').click();
  await warlockPage.getByRole('button',{name:'Save suggested solo introduction draft'}).click();
  ws=await warlockState();
  assert.match(ws.christmasPrologueDraft.scenes['hero:warlock-test'].readAloud,/voice arrives/);
  assert.match(ws.christmasPrologueDraft.scenes['hero:warlock-test'].dmNotes,/patron/);
  assert.deepEqual(ws.pcs[0].bugHero.extra,'A Martial Warlock');
  await warlockPage.reload();
  await warlockPage.evaluate(()=>goto('sheet'));
  await warlockPage.locator('.card.section select').first().selectOption('warlock-existing');
  await warlockPage.locator('#hero-build-workshop summary').click();
  assert.equal(await warlockPage.getByRole('button',{name:'Apply approved level-1 Warlock sheet'}).isDisabled(),true);
  ws=await warlockState();
  assert.equal(ws.pcs[1].hp,11);
  assert.equal(ws.pcs[1].ac,16);
  assert.equal(ws.pcs[1].notes,'My original equipment stays');
  await warlockContext.close();


  // Ranger preview uses disposable local-only Dr. Newton Sparknic fixtures, including a protected customized record.
  const rangerContext=await browser.newContext({viewport:{width:1280,height:800}});
  const rangerPage=await rangerContext.newPage();
  rangerPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await rangerPage.goto('http://127.0.0.1:8767/index.html');
  await rangerPage.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    data.pcs=[
      {id:'ranger-test',name:'Dr.Newton Sparknic',class:'Unassigned',background:'',level:1,species:'Firefly Folk',status:'Active',hp:'',maxHp:'',ac:'',
        notes:'Original family inventor story must remain',bugHero:{power:'Archery and exploring',gear:'Tools and gadgets',fear:'Spiders',
        dream:'Greatest inventor and tamer',trait:'Curious',extra:'Pet Scarlet Dwarf Dragonfly, Photuris Mysticalampas Firefly'}},
      {id:'ranger-custom',name:'Dr.Newton Sparknic',class:'Ranger',background:'Guide',level:1,species:'Firefly Folk',status:'Active',hp:13,maxHp:13,ac:16,
        notes:'Hand-selected armor',bugHero:{power:'Archery and exploring',gear:'Tools and gadgets'}}
    ];
    localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
  });
  await rangerPage.reload();
  await rangerPage.evaluate(()=>goto('sheet'));
  await rangerPage.locator('.card.section select').first().selectOption('ranger-test');
  await rangerPage.locator('#hero-build-workshop summary').click();
  assert.match(await rangerPage.locator('#hero-build-workshop').innerText(),/Sixfold Silver Thread/);
  assert.match(await rangerPage.locator('#hero-build-workshop').innerText(),/Hunter’s Mark/);
  assert.match(await rangerPage.locator('#hero-build-workshop').innerText(),/AC 15/);
  assert.match(await rangerPage.locator('#hero-build-workshop').innerText(),/10 GP/);
  const rangerState=()=>rangerPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  let rangerBefore=await rangerState();
  assert.equal(rangerBefore.pcs[0].class,'Unassigned');
  assert.ok(!rangerBefore.christmasPrologueDraft?.scenes?.['hero:ranger-test']);
  await rangerPage.getByRole('button',{name:'Apply approved level-1 Ranger sheet'}).click();
  let rangerAfter=await rangerState();
  assert.equal(rangerAfter.pcs[0].class,'Ranger');
  assert.equal(rangerAfter.pcs[0].background,'Guide');
  assert.equal(rangerAfter.pcs[0].hp,12);
  assert.equal(rangerAfter.pcs[0].ac,15);
  assert.equal(rangerAfter.pcs[0].notes,'Original family inventor story must remain');
  assert.deepEqual(rangerAfter.sheets['ranger-test'].scores,{STR:8,DEX:17,CON:14,INT:12,WIS:14,CHA:10});
  assert.deepEqual(rangerAfter.sheets['ranger-test'].saves,['STR','DEX']);
  assert.equal(rangerAfter.sheets['ranger-test'].spellAbility,'WIS');
  assert.equal(rangerAfter.sheets['ranger-test'].spellSlots['1'],2);
  assert.match(rangerAfter.sheets['ranger-test'].spellPrepared,/Hunter’s Mark always prepared/);
  assert.match(rangerAfter.sheets['ranger-test'].features,/story companions only/);
  assert.match(rangerAfter.sheets['ranger-test'].features,/Weapon Mastery/);
  assert.match(rangerAfter.sheets['ranger-test'].inventory,/Studded Leather Armor/);
  assert.match(rangerAfter.sheets['ranger-test'].inventory,/40 Arrows, two Quivers, and 10 GP/);
  assert.equal(rangerAfter.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(rangerAfter.campaign.session,0);
  assert.ok(rangerAfter.decisions.every(d=>d.status==='Not decided'));
  await rangerPage.locator('#hero-build-workshop summary').click();
  await rangerPage.getByRole('button',{name:'Save suggested solo introduction draft'}).click();
  rangerAfter=await rangerState();
  assert.match(rangerAfter.christmasPrologueDraft.scenes['hero:ranger-test'].readAloud,/scarlet dragonfly/);
  assert.match(rangerAfter.christmasPrologueDraft.scenes['hero:ranger-test'].dmNotes,/fear of spiders/);
  assert.equal(rangerAfter.pcs[0].bugHero.extra,'Pet Scarlet Dwarf Dragonfly, Photuris Mysticalampas Firefly');
  await rangerPage.reload();
  await rangerPage.evaluate(()=>goto('sheet'));
  await rangerPage.locator('.card.section select').first().selectOption('ranger-custom');
  await rangerPage.locator('#hero-build-workshop summary').click();
  assert.equal(await rangerPage.getByRole('button',{name:'Apply approved level-1 Ranger sheet'}).isDisabled(),true,
    'Customized Ranger must not be overwritten');
  rangerAfter=await rangerState();
  assert.equal(rangerAfter.pcs[1].hp,13);
  assert.equal(rangerAfter.pcs[1].ac,16);
  assert.equal(rangerAfter.pcs[1].notes,'Hand-selected armor');
  await rangerContext.close();


  // Paladin checks use two disposable browser-local Mister Potts records; one has existing custom values that must be protected.
  const paladinContext=await browser.newContext({viewport:{width:1280,height:800}});
  const paladinPage=await paladinContext.newPage();
  paladinPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await paladinPage.goto('http://127.0.0.1:8767/index.html');
  await paladinPage.evaluate(()=>{
   const d=JSON.parse(localStorage.getItem('shattered-hive-v1'));
   d.pcs=[
    {id:'test-paladin',name:'Mister Potts',class:'Unassigned',background:'',level:1,species:'Beetlekin',status:'Active',
     hp:'',maxHp:'',ac:'',notes:'Keep the original player story intact',
     bugHero:{power:'Protecting friends',gear:'Sword and shield',trait:'Brave',fear:'Dry Grass',dream:'Guard all insects',extra:'Orange mohawk'}},
    {id:'custom-paladin',name:'Mister Potts',class:'Paladin',background:'Guard',level:1,species:'Beetlekin',status:'Active',
     hp:14,maxHp:14,ac:16,notes:'Manual build must remain',bugHero:{power:'Protecting friends',gear:'Sword and shield'}}
   ];
   localStorage.setItem('shattered-hive-v1',JSON.stringify(d));
  });
  await paladinPage.reload();
  await paladinPage.evaluate(()=>goto('sheet'));
  await paladinPage.locator('.card.section select').first().selectOption('test-paladin');
  await paladinPage.locator('#hero-build-workshop summary').click();
  assert.match(await paladinPage.locator('#hero-build-workshop').innerText(),/Guardian and the Dry Grass/);
  assert.match(await paladinPage.locator('#hero-build-workshop').innerText(),/WIS 13/);
  assert.match(await paladinPage.locator('#hero-build-workshop').innerText(),/21 GP/);
  const paladinState=()=>paladinPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  let ps=await paladinState();
  assert.equal(ps.pcs[0].class,'Unassigned');
  assert.ok(!ps.christmasPrologueDraft?.scenes?.['hero:test-paladin']);
  await paladinPage.getByRole('button',{name:'Apply approved level-1 Paladin sheet'}).click();
  ps=await paladinState();
  assert.equal(ps.pcs[0].class,'Paladin');
  assert.equal(ps.pcs[0].background,'Guard');
  assert.equal(ps.pcs[0].hp,11);
  assert.equal(ps.pcs[0].ac,18);
  assert.equal(ps.pcs[0].notes,'Keep the original player story intact');
  assert.deepEqual(ps.sheets['test-paladin'].scores,{STR:17,DEX:8,CON:13,INT:10,WIS:13,CHA:14});
  assert.deepEqual(ps.sheets['test-paladin'].saves,['WIS','CHA']);
  assert.equal(ps.sheets['test-paladin'].spellSlots['1'],2);
  assert.equal(ps.sheets['test-paladin'].spellAbility,'CHA');
  assert.equal(ps.sheets['test-paladin'].initiativeBonus,2);
  assert.match(ps.sheets['test-paladin'].features,/Lay on Hands/);
  assert.match(ps.sheets['test-paladin'].features,/Sacred Oath|oath/i);
  assert.match(ps.sheets['test-paladin'].features,/do not stack/);
  assert.match(ps.sheets['test-paladin'].inventory,/21 GP/);
  assert.match(ps.sheets['test-paladin'].inventory,/Red Ant Sword uses ordinary longsword mechanics/);
  assert.match(ps.sheets['test-paladin'].features,/Beetlekin \(approved campaign homebrew\)/);
  assert.equal(ps.campaign.session,0);
  assert.equal(ps.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.ok(ps.decisions.every(d=>d.status==='Not decided'));
  await paladinPage.locator('#hero-build-workshop summary').click();
  await paladinPage.getByRole('button',{name:'Save suggested solo introduction draft'}).click();
  ps=await paladinState();
  assert.match(ps.christmasPrologueDraft.scenes['hero:test-paladin'].readAloud,/dry grass/);
  assert.match(ps.christmasPrologueDraft.scenes['hero:test-paladin'].dmNotes,/orange mohawk/);
  assert.equal(ps.pcs[0].bugHero.dream,'Guard all insects');
  await paladinPage.reload();
  await paladinPage.evaluate(()=>goto('sheet'));
  await paladinPage.locator('.card.section select').first().selectOption('custom-paladin');
  await paladinPage.locator('#hero-build-workshop summary').click();
  assert.equal(await paladinPage.getByRole('button',{name:'Apply approved level-1 Paladin sheet'}).isDisabled(),true);
  ps=await paladinState();
  assert.equal(ps.pcs[1].hp,14);
  assert.equal(ps.pcs[1].ac,16);
  assert.equal(ps.pcs[1].notes,'Manual build must remain');
  await paladinContext.close();


  // Fighter final-hero workshop: disposable browser-only Jawshua Red Hawk fixtures, including one customized record; no cloud campaign access.
  const fighterContext=await browser.newContext({viewport:{width:1280,height:800}});
  const fighterPage=await fighterContext.newPage();
  fighterPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await fighterPage.goto('http://127.0.0.1:8767/index.html');
  await fighterPage.evaluate(()=>{
   const d=JSON.parse(localStorage.getItem('shattered-hive-v1'));
   d.pcs=[
    {id:'test-fighter',name:'Jawshua Red Hawk',class:'Unassigned',background:'',level:1,species:'Antfolk',status:'Active',
     hp:'',maxHp:'',ac:'',notes:'Do not overwrite the original family character notes',
     bugHero:{power:'Super strength',gear:'Sword and shield',trait:'Funny',fear:'Water',dream:'Wish I were taller',
      extra:'Trap Jaw Ant, natural scent defenses',outfit:'Armor, great sword and platform shoes'}},
    {id:'test-fighter-custom',name:'Jawshua Red Hawk',class:'Fighter',background:'Soldier',level:1,species:'Antfolk',status:'Active',
     hp:15,maxHp:15,ac:18,notes:'My manually chosen armor stays',
     bugHero:{power:'Super strength',gear:'Greatsword'}}
   ];
   localStorage.setItem('shattered-hive-v1',JSON.stringify(d));
  });
  await fighterPage.reload();
  await fighterPage.evaluate(()=>goto('sheet'));
  await fighterPage.locator('.card.section select').first().selectOption('test-fighter');
  await fighterPage.locator('#hero-build-workshop summary').click();
  assert.match(await fighterPage.locator('#hero-build-workshop').innerText(),/Crossing of Little Giants/);
  assert.match(await fighterPage.locator('#hero-build-workshop').innerText(),/CON 15/);
  assert.match(await fighterPage.locator('#hero-build-workshop').innerText(),/18 GP/);
  const fighterState=()=>fighterPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  let fs=await fighterState();
  assert.equal(fs.pcs[0].class,'Unassigned','Preview cannot automatically change the class');
  assert.ok(!fs.christmasPrologueDraft?.scenes?.['hero:test-fighter'],'Preview cannot choose a story outcome');
  await fighterPage.getByRole('button',{name:'Apply approved level-1 Fighter sheet'}).click();
  fs=await fighterState();
  assert.equal(fs.pcs[0].class,'Fighter');
  assert.equal(fs.pcs[0].background,'Soldier');
  assert.equal(fs.pcs[0].hp,12);
  assert.equal(fs.pcs[0].ac,17);
  assert.equal(fs.pcs[0].notes,'Do not overwrite the original family character notes');
  assert.deepEqual(fs.sheets['test-fighter'].scores,{STR:17,DEX:13,CON:15,INT:8,WIS:12,CHA:10});
  assert.deepEqual(fs.sheets['test-fighter'].saves,['STR','CON']);
  assert.equal(fs.sheets['test-fighter'].spellAbility,'');
  assert.match(fs.sheets['test-fighter'].features,/Second Wind/);
  assert.match(fs.sheets['test-fighter'].features,/Savage Attacker/);
  assert.match(fs.sheets['test-fighter'].inventory,/18 GP/);
  assert.match(fs.sheets['test-fighter'].features,/Antfolk \(approved campaign homebrew\)/);
  assert.match(fs.sheets['test-fighter'].attacks,/Greatsword: \+5 to hit, 2d6\+3/);
  assert.match(fs.sheets['test-fighter'].features,/no automatic extra|NO automatic extra/i);
  assert.equal(fs.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(fs.campaign.session,0);
  assert.ok(fs.decisions.every(x=>x.status==='Not decided'));
  await fighterPage.locator('#hero-build-workshop summary').click();
  await fighterPage.getByRole('button',{name:'Save suggested solo introduction draft'}).click();
  fs=await fighterState();
  assert.match(fs.christmasPrologueDraft.scenes['hero:test-fighter'].readAloud,/platform shoes/);
  assert.match(fs.christmasPrologueDraft.scenes['hero:test-fighter'].dmNotes,/water/);
  assert.equal(fs.pcs[0].bugHero.dream,'Wish I were taller');
  await fighterPage.reload();
  await fighterPage.evaluate(()=>goto('sheet'));
  await fighterPage.locator('.card.section select').first().selectOption('test-fighter-custom');
  await fighterPage.locator('#hero-build-workshop summary').click();
  assert.equal(await fighterPage.getByRole('button',{name:'Apply approved level-1 Fighter sheet'}).isDisabled(),true);
  fs=await fighterState();
  assert.equal(fs.pcs[1].hp,15);
  assert.equal(fs.pcs[1].ac,18);
  assert.equal(fs.pcs[1].notes,'My manually chosen armor stays');
  await fighterContext.close();


  // Six-hero review and gathering: isolated browser; no cloud account or real family data.
  const readinessContext=await browser.newContext({viewport:{width:1280,height:800}});
  const prepPage=await readinessContext.newPage();
  prepPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await prepPage.goto('http://127.0.0.1:8767/index.html');
  await prepPage.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    const powers=['Magic spells','Sneaking and climbing','Super strength','Archery and exploring','Protecting friends','Super strength'];
    const species=['Spiderkin','Mantisborn','Spiderkin','Firefly Folk','Beetlekin','Antfolk'];
    const classes=['Wizard','Rogue','Warlock','Ranger','Paladin','Fighter'];
    data.pcs=Array.from({length:6},(_,i)=>({
      id:'party-review-'+i,name:'Review Hero '+(i+1),class:classes[i],background:'',level:1,species:species[i],status:'Active',
      notes:'Original notes '+i,bugHero:{power:powers[i],extra:i===2?'A Martial Warlock':'',dream:'Unique dream '+i,fear:'Unique fear '+i}
    }));
    data.christmasPrologueDraft={scenes:{}};
    localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
  });
  await prepPage.reload();
  await prepPage.evaluate(()=>goto('sheet'));
  assert.equal(await prepPage.locator('.hero-ready-card').count(),6,'All six PC reviews appear');
  assert.match(await prepPage.locator('#hero-party-readiness').innerText(),/0\/6 reviewed/);
  const prepState=()=>prepPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  const prepBefore=await prepState();
  await prepPage.locator('.hero-ready-card').first().locator('summary').click();
  await prepPage.locator('.hero-ready-card').first().locator('input[type=checkbox]').first().check();
  let prepAfter=await prepState();
  assert.equal(prepAfter.heroReadiness['party-review-0'].build,true);
  assert.equal(prepAfter.heroReadiness['party-review-0'].scene,undefined);
  assert.deepEqual(prepAfter.pcs,prepBefore.pcs,'Review status must not change any character');
  assert.equal(prepAfter.campaign.session,0,'Review status cannot start campaign');
  assert.ok(prepAfter.decisions.every(x=>x.status==='Not decided'),'Review status cannot decide story');
  await prepPage.reload();
  await prepPage.evaluate(()=>goto('sheet'));
  await prepPage.locator('.hero-ready-card').first().locator('summary').click();
  assert.equal(await prepPage.locator('.hero-ready-card').first().locator('input[type=checkbox]').first().isChecked(),true,
    'Review acknowledgment should survive reload');
  await prepPage.evaluate(()=>goto('runner'));
  await prepPage.getByRole('button',{name:'Open Hero Introductions'}).click();
  await prepPage.locator('.ar-scene').last().click();
  const gatherButton=prepPage.getByRole('button',{name:'Prepare personalized gathering draft'});
  assert.equal(await gatherButton.isEnabled(),true);
  await gatherButton.click();
  prepAfter=await prepState();
  assert.match(prepAfter.christmasPrologueDraft.scenes.gathering.readAloud,/six small figures/);
  assert.match(prepAfter.christmasPrologueDraft.scenes.gathering.dmNotes,/Review Hero 1/);
  assert.match(prepAfter.christmasPrologueDraft.scenes.gathering.dmNotes,/Review Hero 6/);
  assert.match(prepAfter.christmasPrologueDraft.scenes.gathering.dmNotes,/Unique dream 3/);
  assert.equal(prepAfter.campaign.session,0);
  assert.ok(prepAfter.decisions.every(x=>x.status==='Not decided'));
  assert.equal(await prepPage.getByRole('button',{name:'Prepare personalized gathering draft'}).isDisabled(),true,
    'Saved gathering must not be overwritten');
  await prepPage.reload();
  await prepPage.evaluate(()=>goto('runner'));
  await prepPage.getByRole('button',{name:'Open Hero Introductions'}).click();
  await prepPage.locator('.ar-scene').last().click();
  assert.match(await prepPage.locator('#ar-readAloud').inputValue(),/six small figures/);
  await prepPage.getByRole('button',{name:'Continue to original Scene 1'}).first().click();
  assert.equal(await prepPage.locator('.ar-scene').count(),10);
  prepAfter=await prepState();
  assert.equal(prepAfter.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.deepEqual(prepAfter.pcs,prepBefore.pcs);
  await readinessContext.close();

  // Phase 2: complete six-hero gathering is a non-mutating template until the DM explicitly saves.
  const gatheringContext=await browser.newContext({viewport:{width:1280,height:800}});
  const gatheringPage=await gatheringContext.newPage();
  gatheringPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await gatheringPage.goto('http://127.0.0.1:8767/index.html');
  await gatheringPage.evaluate(()=>{
    const d=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    const names=['Vismund Cygnus','David','Snoop Bugg','Dr.Newton Sparknic','Mister Potts','Jawshua Red Hawk'];
    const species=['Spiderkin','Mantisborn','Spiderkin','Firefly Folk','Beetlekin','Antfolk'];
    const classes=['Wizard','Rogue','Warlock','Ranger','Paladin','Fighter'];
    d.pcs=names.map((name,i)=>({id:'gather-hero-'+i,name,class:classes[i],level:1,species:species[i],
      status:'Active',hp:12,maxHp:12,ac:15,notes:'Do not change character '+i,bugHero:{dream:'Personal dream '+i,fear:'Private fear '+i}}));
    d.christmasPrologueDraft={scenes:{'hero:gather-hero-0':{readAloud:'Protected Vismund solo draft'}}};
    localStorage.setItem('shattered-hive-v1',JSON.stringify(d));
  });
  await gatheringPage.reload();
  const gatheringState=()=>gatheringPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  const gatheringBefore=await gatheringState();
  await gatheringPage.evaluate(()=>goto('runner'));
  await gatheringPage.getByRole('button',{name:'Open Hero Introductions'}).click();
  await gatheringPage.locator('.ar-scene').last().click();
  const gathered=await gatheringPage.locator('#ar-readAloud').inputValue();
  assert.match(gathered,/BEAT 1 — HEARTHHOLLOW AT STARFALL EVE/);
  assert.match(gathered,/BEAT 2 — SIX ENTRANCES/);
  assert.match(gathered,/BEAT 3 — MAYOR MARIBEL WELCOMES YOU/);
  assert.match(gathered,/BEAT 4 — OPEN INVITATION/);
  assert.match(gathered,/TRANSITION/);
  let guidance=await gatheringPage.locator('#ar-dmNotes').inputValue();
  for(const name of ['Vismund Cygnus','David','Snoop Bugg','Dr.Newton Sparknic','Mister Potts','Jawshua Red Hawk'])
    assert.ok(guidance.includes(name),'DM entrance cue for '+name);
  assert.match(await gatheringPage.locator('#ar-npcDialogue').inputValue(),/MAYOR MARIBEL/);
  assert.match(await gatheringPage.locator('#ar-checks').inputValue(),/FAILED CHECK/);
  assert.match(await gatheringPage.locator('#ar-choices').inputValue(),/IF NO ONE HELPS/);
  assert.match(await gatheringPage.locator('#ar-clues').inputValue(),/PRIVATE, OPTIONAL/);
  assert.match(await gatheringPage.locator('#ar-music').inputValue(),/CUE C/);
  const gatheringPreview=await gatheringState();
  assert.deepEqual(gatheringPreview,gatheringBefore,'Viewing proposed gathering must not save anything');
  await gatheringPage.getByRole('button',{name:'Prepare personalized gathering draft'}).click();
  const gatheringSaved=await gatheringState();
  assert.match(gatheringSaved.christmasPrologueDraft.scenes.gathering.readAloud,/BEAT 4 — OPEN INVITATION/);
  assert.equal(await gatheringPage.getByRole('button',{name:'Prepare personalized gathering draft'}).isDisabled(),true);
  assert.deepEqual(gatheringSaved.pcs,gatheringBefore.pcs);
  assert.deepEqual(gatheringSaved.sheets,gatheringBefore.sheets);
  assert.deepEqual(gatheringSaved.christmasPrologueDraft.scenes['hero:gather-hero-0'],
    gatheringBefore.christmasPrologueDraft.scenes['hero:gather-hero-0']);
  assert.deepEqual(gatheringSaved.adventureScriptDraft,gatheringBefore.adventureScriptDraft);
  assert.deepEqual(gatheringSaved.decisions,gatheringBefore.decisions);
  assert.equal(gatheringSaved.campaign.session,gatheringBefore.campaign.session);
  await gatheringPage.reload();
  await gatheringPage.evaluate(()=>goto('runner'));
  await gatheringPage.getByRole('button',{name:'Open Hero Introductions'}).click();
  await gatheringPage.locator('.ar-scene').last().click();
  assert.match(await gatheringPage.locator('#ar-readAloud').inputValue(),/BEAT 4 — OPEN INVITATION/);
  const comparison=gatheringPage.locator('.ar-final-script-preview');
  assert.equal(await comparison.count(),1,'Saved gathering has read-only final comparison');
  await comparison.locator('summary').click();
  assert.match(await comparison.innerText(),/BEAT 3 — MAYOR MARIBEL WELCOMES YOU/);
  await gatheringPage.getByRole('button',{name:'Continue to original Scene 1'}).first().click();
  assert.equal(await gatheringPage.locator('.ar-scene').count(),10);
  const gatheringAfter=await gatheringState();
  assert.deepEqual(gatheringAfter.pcs,gatheringBefore.pcs);
  assert.equal(gatheringAfter.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.ok(gatheringAfter.decisions.every(x=>x.status==='Not decided'));
  await gatheringContext.close();

  // Finalized six-hero DM scripts are view-only fallback templates.
  // Existing saved introduction drafts, PC sheets, story decisions and original 10 scenes stay unchanged.
  const solosContext=await browser.newContext({viewport:{width:1280,height:800}});
  const solosPage=await solosContext.newPage();
  solosPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await solosPage.goto('http://127.0.0.1:8767/index.html');
  await solosPage.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    const names=['Vismund Cygnus','David','Snoop Bugg','Dr.Newton Sparknic','Mister Potts','Jawshua Red Hawk'];
    const species=['Spiderkin','Mantisborn','Spiderkin','Firefly Folk','Beetlekin','Antfolk'];
    const classes=['Wizard','Rogue','Warlock','Ranger','Paladin','Fighter'];
    data.pcs=names.map((name,i)=>({id:'solo-'+i,name,class:classes[i],level:1,species:species[i],
      status:'Active',hp:10,maxHp:10,ac:15,notes:'Preserve player history '+i,bugHero:{dream:'Personal dream '+i,fear:'Personal fear '+i}}));
    data.christmasPrologueDraft={scenes:{'hero:solo-0':{readAloud:'Saved original Vismund script takes priority',dmNotes:'Keep custom notes'}}};
    localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
  });
  await solosPage.reload();
  const soloBefore=await solosPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  await solosPage.evaluate(()=>goto('runner'));
  await solosPage.getByRole('button',{name:'Open Hero Introductions'}).click();
  assert.equal(await solosPage.locator('.ar-scene').count(),7);
  const names=['The Forbidden Thread','The Caramel Trail','The Patron’s Favorite','The Sixfold Silver Thread','The Guardian and the Dry Grass','The Crossing of Little Giants'];
  const clues=['six tiny lights','caramel popcorn','scimitar-shaped shadow','silver thread','lantern-bug','seed-courier'];
  for(let i=0;i<6;i++){
    await solosPage.locator('.ar-scene').nth(i).click();
    const aloud=await solosPage.locator('#ar-readAloud').inputValue();
    const checks=await solosPage.locator('#ar-checks').inputValue();
    const notes=await solosPage.locator('#ar-dmNotes').inputValue();
    if(i===0){
      assert.match(aloud,/Saved original Vismund script takes priority/);
      assert.equal(notes,'Keep custom notes');
      const comparison=solosPage.locator('.ar-final-script-preview');
      assert.equal(await comparison.count(),1,'Existing saved intro has a read-only finalized script comparison');
      await comparison.locator('summary').click();
      assert.match(await comparison.innerText(),/SCENE 2 — THE SIXFOLD CLUE/);
    }else{
      assert.match(aloud,/SCENE 1 — DISCOVERY/);
      assert.match(aloud,/SCENE 2 — THE SIXFOLD CLUE/);
      assert.match(aloud,/SCENE 3 — THE INVITATION/);
      assert.match(aloud,new RegExp(clues[i],'i'));
      assert.match(notes,/DM SCRIPT:/);
      assert.ok(notes.includes(names[i]),'DM notes include named scene: '+names[i]);
      assert.match(checks,/Failure changes the texture/);
      assert.match(await solosPage.locator('#ar-choices').inputValue(),/DM FOLLOW-UP/);
    }
  }
  const soloAfter=await solosPage.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  assert.deepEqual(soloAfter.pcs,soloBefore.pcs,'Read-only prologues cannot change character records');
  assert.deepEqual(soloAfter.sheets,soloBefore.sheets,'Read-only prologues cannot change completed sheets');
  assert.deepEqual(soloAfter.christmasPrologueDraft,soloBefore.christmasPrologueDraft,
    'Existing saved prologue text and unpersisted defaults cannot be overwritten');
  assert.deepEqual(soloAfter.adventureScriptDraft,soloBefore.adventureScriptDraft,
    'Finalized prologues cannot alter original ten-scene draft');
  assert.deepEqual(soloAfter.decisions,soloBefore.decisions,'No gameplay choices recorded');
  assert.equal(soloAfter.campaign.session,soloBefore.campaign.session,'Campaign not started');
  await solosContext.close();

  const after=await read();
  assert.equal(after.campaign.session,0);
  assert.equal(after.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(after.quests.find(x=>x.id==='vesper-adventure-1').status,'Available');
  assert.ok(after.decisions.every(x=>x.status==='Not decided'));
  assert.deepEqual(errors,[],'JS browser errors');
  console.log('PASS: 10 scenes; 9 fields; save/reload; JSON import/export & reject; command scratchpad; player board; map/combat navigation; zero gameplay changes');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});

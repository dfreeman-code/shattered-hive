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


  // Rogue workshop uses fake local-only character data; no production saves touched.
  const rogueContext=await browser.newContext({viewport:{width:1280,height:800}});
  const roguePage=await rogueContext.newPage();
  roguePage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await roguePage.goto('http://127.0.0.1:8767/index.html');
  await roguePage.evaluate(()=>{
    const d=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    d.pcs=[
     {id:'test-rogue',name:'Test Mantid Scout',class:'Unassigned',background:'',level:1,species:'Mantisborn',status:'Active',hp:'',maxHp:'',ac:'',
       notes:'Original player history remains exactly as written',bugHero:{power:'Sneaking and climbing',gear:'Spear',dream:'Taste caramel popcorn',fear:'Deep Water',extra:'Strange Yellow markings'}},
     {id:'test-rogue-existing',name:'Existing Mantid Scout',class:'Rogue',background:'Wayfarer',level:1,species:'Mantisborn',status:'Active',hp:12,maxHp:12,ac:15,
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
  assert.deepEqual(rs.sheets['test-rogue'].scores,{STR:8,DEX:17,CON:14,INT:12,WIS:14,CHA:10});
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


  // Warlock review is tested only against two disposable, invented PC records.
  const warlockContext=await browser.newContext({viewport:{width:1280,height:800}});
  const warlockPage=await warlockContext.newPage();
  warlockPage.on('dialog',dialog=>{void dialog.accept().catch(()=>{});});
  await warlockPage.goto('http://127.0.0.1:8767/index.html');
  await warlockPage.evaluate(()=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    data.pcs=[
      {id:'warlock-test',name:'Test Pact Spider',class:'Unassigned',background:'',level:1,species:'Spiderkin',status:'Active',
       hp:'',maxHp:'',ac:'',notes:'Never change my submitted history',bugHero:{power:'Super strength',gear:'Two little daggers',extra:'A Martial Warlock',
        dream:'To be my patron favorite',fear:'Being afraid',trait:'Mischievous'}},
      {id:'warlock-existing',name:'Custom Pact Spider',class:'Warlock',background:'Charlatan',level:1,species:'Spiderkin',status:'Active',
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
  assert.match(ws.sheets['warlock-test'].proficiencies,/no extra/gi);
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

  const after=await read();
  assert.equal(after.campaign.session,0);
  assert.equal(after.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(after.quests.find(x=>x.id==='vesper-adventure-1').status,'Available');
  assert.ok(after.decisions.every(x=>x.status==='Not decided'));
  assert.deepEqual(errors,[],'JS browser errors');
  console.log('PASS: 10 scenes; 9 fields; save/reload; JSON import/export & reject; command scratchpad; player board; map/combat navigation; zero gameplay changes');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});

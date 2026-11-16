/* Great Christmas Caper — isolated, non-production DM dress rehearsal.
 * The browser is a fresh anonymous context against localhost. No real cloud account.
 * Never calls combatFinish(), marks sessions Played, or records decisions.
 */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base='http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results=[],errors=[];
 const check=async(label,fn)=>{
  try{await fn();results.push({label,status:'PASS'});console.log('PASS',label)}
  catch(e){results.push({label,status:'FAIL',message:e.message});console.error('FAIL',label,e.stack||e)}
 };
 try{
  const context=await browser.newContext({viewport:{width:1400,height:950},acceptDownloads:true});
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/,route=>route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const snapshot=()=>page.evaluate(()=>JSON.stringify({
   campaign:db.campaign,
   sessions:db.sessions,
   quests:db.quests,
   decisions:db.decisions,
   pcs:db.pcs,
   npcs:db.npcs,
   encounters:db.encounters,
   storyArchive:db.storyArchive
  }));
  const baseline=await snapshot();
  await check('Pre-session safeguards: nothing played or decided',async()=>{
   const state=await page.evaluate(()=>({
    round:db.campaign.session,
    planned:db.sessions.find(x=>x.id==='vesper-session-1')?.status,
    quest:db.quests.find(x=>x.id==='vesper-adventure-1')?.status,
    decisions:db.decisions.map(x=>x.status),
    scenes:ADVENTURE_ONE_SCENES.length,
    fields:ADVENTURE_FIELDS.length
   }));
   assert.equal(state.round,0);
   assert.equal(state.planned,'Planned');
   assert.equal(state.quest,'Available');
   assert.ok(state.decisions.every(x=>x==='Not decided'));
   assert.equal(state.scenes,10);assert.equal(state.fields,9);
  });
  await check('Command Center: planned session, private scratchpad, player-safe board',async()=>{
   await page.evaluate(()=>goto('command'));
   assert.match(await page.locator('#app').innerText(),/The Great Christmas Caper/);
   await page.locator('#cc-notes').fill('QA ONLY: never treat as played');
   await page.getByRole('button',{name:'Player-safe board'}).click();
   const board=await page.locator('#cc-player-board').innerText();
   assert.ok(!board.includes('QA ONLY: never treat as played'));
   assert.ok(!board.includes('DM secrets'));
   await page.getByRole('button',{name:'Close player board'}).click();
   assert.equal(await page.locator('#cc-player-board').count(),0);
  });
  await check('Every canonical scene opens, reads, and links to its suggested map without progressing play',async()=>{
   await page.evaluate(()=>goto('runner'));
   const titles=await page.evaluate(()=>[...ADVENTURE_ONE_SCENES]);
   const seenMaps=new Set();
   for(let i=0;i<10;i++){
    await page.evaluate(i=>adventureRunnerGo(i),i);
    assert.equal(await page.locator('.ar-scene-head h3').innerText(),titles[i]);
    assert.equal(await page.locator('.ar-scene[aria-current="step"]').count(),1);
    await page.getByRole('button',{name:'Tabletop View'}).click();
    assert.equal(await page.locator('.ar-reading-panel').count(),1);
    assert.equal(await page.locator('#ar-quick-npc').count(),1);
    assert.equal(await page.locator('.ar-reading-section').count(),1);
    await page.getByRole('button',{name:'Draft Editor'}).click();
    assert.equal(await page.locator('.ar-field textarea').count(),9);
    const id=await page.evaluate(i=>adventureRunnerMapId(i),i);
    if(id){
     const known=await page.evaluate(id=>mapState().scenes.some(x=>x.id===id),id);
     assert.ok(known,'Scene '+(i+1)+' linked to missing map '+id);
     await page.getByRole('button',{name:'Open battle map'}).click();
     assert.equal(await page.evaluate(()=>page),'maps');
     assert.equal(await page.evaluate(()=>mapState().active),id);
     assert.equal(await page.evaluate(()=>mapState().viewMode),'dm');
     assert.deepEqual(await page.evaluate(()=>[mapCols(currentMap()),mapRows(currentMap())]),[30,30]);
     seenMaps.add(id);
     await page.getByRole('group',{name:'DM session shortcuts'}).getByRole('button',{name:'← Adventure Runner'}).click();
     assert.equal(await page.evaluate(()=>adventurePreviewIndex),i);
    }else{
     assert.equal(await page.getByRole('button',{name:'Open battle map'}).isDisabled(),true);
    }
   }
   assert.ok(seenMaps.size>=4,'Expected multiple unique Christmas Caper battle maps');
   console.log('Verified scene-linked map IDs:',[...seenMaps].join(', '));
  });
  await check('Tabletop reference NPC/encounter lookup and search never edit records',async()=>{
   await page.evaluate(()=>goto('runner'));
   const npcId=await page.evaluate(()=>db.npcs[0]?.id||'');
   const encounterId=await page.evaluate(()=>db.encounters[0]?.id||'');
   if(npcId){
    await page.locator('#ar-quick-npc').selectOption(String(npcId));
    assert.ok((await page.locator('#ar-reference-detail').innerText()).length>3);
    assert.equal(await page.locator('#ar-reference-detail script').count(),0);
    const name=await page.evaluate(()=>db.npcs[0].name);
    await page.locator('#ar-npc-search').fill(String(name).slice(0,9));
    assert.ok(await page.locator('#ar-quick-npc option').count()>=2);
   }
   if(encounterId){
    await page.locator('#ar-quick-encounter').selectOption(String(encounterId));
    assert.ok((await page.locator('#ar-reference-detail').innerText()).length>3);
   }
  });
  await check('Fog-of-war and Player View restrict DM controls; return preserves scene',async()=>{
   await page.evaluate(()=>{adventureRunnerGo(3);adventureRunnerOpenMap()});
   assert.equal(await page.evaluate(()=>page),'maps');
   const mapId=await page.evaluate(()=>mapState().active);
   await page.evaluate(()=>{mapFogAll(false);mapSetFogTool('reveal');mapPaintFog(37)});
   assert.ok(await page.evaluate(()=>mapFog(currentMap()).includes(37)));
   await page.evaluate(()=>mapSetView('player'));
   assert.equal(await page.evaluate(()=>mapState().viewMode),'player');
   assert.equal(await page.getByRole('group',{name:'DM session shortcuts'}).count(),0);
   await page.evaluate(()=>mapSetView('dm'));
   await page.getByRole('group',{name:'DM session shortcuts'}).getByRole('button',{name:'← Adventure Runner'}).click();
   assert.equal(await page.evaluate(()=>adventurePreviewIndex),3);
   assert.equal(await page.evaluate(()=>mapState().scenes.find(m=>m.id===mapId).revealed.includes(37)),true);
  });
  await check('Combat preview logs turns without archiving a played encounter',async()=>{
   await page.evaluate(()=>{goto('combat');combatAddPreset('spore');combatNext()});
   assert.ok(await page.evaluate(()=>combatState().active));
   assert.ok(await page.evaluate(()=>combatState().participants.length>0));
   assert.ok(await page.evaluate(()=>combatState().history.length>0));
   assert.equal(await page.evaluate(()=>db.encounters.filter(x=>x.status==='Completed').length),0);
  });
  await check('Protected campaign, quest, decision, encounter and hero records remain unchanged',async()=>{
   assert.equal(await snapshot(),baseline);
   await page.reload({waitUntil:'domcontentloaded'});
   assert.equal(await snapshot(),baseline);
   assert.match(await page.evaluate(()=>db.sessionCommandNotes),/QA ONLY/);
  });
  await check('No uncaught JavaScript errors',async()=>assert.deepEqual(errors,[]));
  const failed=results.filter(x=>x.status==='FAIL');
  require('node:fs').writeFileSync('christmas-dress-rehearsal-results.json',JSON.stringify({results,failed:failed.length},null,2));
  await context.close();
  if(failed.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error('DRESS REHEARSAL FAILED',e.stack||e);process.exitCode=1});

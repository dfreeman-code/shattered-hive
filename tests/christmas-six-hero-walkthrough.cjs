/* Isolated six-hero Great Christmas Caper end-to-end DM walkthrough.
 * Uses a localhost browser with deliberately synthetic PCs and script text.
 * Never authenticates to Supabase or requests a live campaign backup.
 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const URL='http://127.0.0.1:8783/index.html';
async function ready(){
 for(let i=0;i<50;i++){
  try {await new Promise((ok,bad)=>http.get(URL,r=>{r.resume();r.statusCode===200?ok():bad(Error('HTTP '+r.statusCode));}).on('error',bad));return;}
  catch {await new Promise(r=>setTimeout(r,200));}
 }
 throw Error('Local walkthrough server unavailable');
}
(async()=>{
 const server=spawn('python3',['-m','http.server','8783','--bind','127.0.0.1'],{stdio:'ignore'});
 const checks=[],errors=[],blockedRemote=[];
 let browser;
 async function check(name,fn){
  try {await fn();checks.push({name,status:'PASS'});console.log('PASS',name);}
  catch(e){checks.push({name,status:'FAIL',reason:String(e.message||e)});console.error('FAIL',name,e.stack||e);}
 }
 try {
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:930},acceptDownloads:true});
  const p=await context.newPage();
  p.on('pageerror',e=>errors.push(String(e)));
  p.on('dialog',d=>d.accept().catch(()=>{}));
  await p.route(/https?:\/\/[^/]+\.supabase\.co\//,route=>{blockedRemote.push(route.request().url());return route.abort();});
  await p.goto(URL,{waitUntil:'domcontentloaded'});
  const read=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  const party=['Beetlekin','Antfolk','Mantisborn','Mothkin','Spiderkin','Firefly Folk'];
  await check('Fresh isolated browser is on unplayed Vesper storyline',async()=>{
   const d=await read();
   assert.equal(d.campaign.session,0);
   assert.equal(d.sessions.find(x=>x.id==='vesper-session-1')?.status,'Planned');
   assert.equal(d.quests.find(x=>x.id==='vesper-adventure-1')?.status,'Available');
   assert.ok(d.decisions.every(x=>x.status==='Not decided'));
  });
  await check('Load six synthetic heroes and ten complete synthetic scripts only in disposable browser storage',async()=>{
   await p.evaluate(species=>{
    const d=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    d.pcs=species.map((name,i)=>({id:'qa-hero-'+(i+1),name:'QA Hero '+(i+1),species:name,class:['Paladin','Rogue','Fighter','Ranger','Wizard','Bard'][i],level:1,status:'Active',hp:12,ac:13,notes:'SYNTHETIC QA ONLY'}));
    d.adventureScriptDraft={adventureId:'vesper-adventure-1',scenes:{}};
    ADVENTURE_ONE_SCENES.forEach((title,i)=>{
     const scene={};
     ADVENTURE_FIELDS.forEach(field=>scene[field]='QA ONLY — scene '+(i+1)+' '+field+'; no canonical text or player decision.');
     d.adventureScriptDraft.scenes[adventureSceneId(i)]=scene;
    });
    localStorage.setItem('shattered-hive-v1',JSON.stringify(d));
   },party);
   await p.reload({waitUntil:'domcontentloaded'});
   const d=await read();
   assert.equal(d.pcs.length,6);
   assert.equal(new Set(d.pcs.map(x=>x.id)).size,6);
   assert.equal(Object.keys(d.adventureScriptDraft.scenes).length,10);
   assert.equal(d.pcs[4].class,'Wizard');
  });
  const protectedRecords=()=>p.evaluate(()=>JSON.stringify({
   campaign:db.campaign,pcs:db.pcs,npcs:db.npcs,sessions:db.sessions,quests:db.quests,
   decisions:db.decisions,encounters:db.encounters,music:db.music,storyArchives:db.storyArchives,
   draft:db.adventureScriptDraft,prologue:db.christmasIntroDraft
  }));
  const baseline=await protectedRecords();
  await check('Six personalized prologue introductions and gathering scene open safely',async()=>{
   await p.evaluate(()=>goto('runner'));
   assert.match(await p.locator('#app').innerText(),/Party:\s*6 character records/);
   await p.getByRole('button',{name:'Open Hero Introductions'}).click();
   assert.equal(await p.locator('.ar-scene').count(),7);
   for(let i=0;i<6;i++){
    await p.locator('.ar-scene').nth(i).click();
    assert.match(await p.locator('#ar-readAloud').inputValue(),new RegExp('QA Hero '+(i+1)));
    assert.equal(await p.locator('.ar-field textarea').count(),9);
   }
   await p.locator('.ar-scene').last().click();
   assert.match(await p.locator('#ar-readAloud').inputValue(),/BEAT 1 — HEARTHHOLLOW AT STARFALL EVE|six separate trails converge/i);
   await p.getByRole('button',{name:'Continue to original Scene 1'}).first().click();
   assert.equal(await p.locator('.ar-scene').count(),10);
  });
  await check('All ten scenes expose nine script sections and compact live narration/dialogue/check/choice cues',async()=>{
   const titles=await p.evaluate(()=>[...ADVENTURE_ONE_SCENES]);
   for(let i=0;i<10;i++){
    await p.evaluate(i=>adventureRunnerGo(i),i);
    assert.equal(await p.locator('.ar-scene-head h3').innerText(),titles[i]);
    assert.equal(await p.locator('.ar-field textarea').count(),9);
    assert.match(await p.locator('#ar-readAloud').inputValue(),new RegExp('QA ONLY — scene '+(i+1)+' readAloud'));
    await p.getByRole('button',{name:'Tabletop View'}).click();
    assert.equal(await p.locator('.ar-priority-cues .ar-tab').count(),5);
    await p.getByRole('button',{name:'NPC dialogue'}).click();
    assert.match(await p.locator('.ar-reading-text').innerText(),new RegExp('scene '+(i+1)+' npcDialogue'));
    await p.getByRole('button',{name:'Skill checks and consequences'}).click();
    assert.match(await p.locator('.ar-reading-text').innerText(),new RegExp('scene '+(i+1)+' checks'));
    await p.getByRole('button',{name:'Choices, branches and follow-ups'}).click();
    assert.match(await p.locator('.ar-reading-text').innerText(),new RegExp('scene '+(i+1)+' choices'));
    await p.getByRole('button',{name:'All sections'}).click();
    assert.equal(await p.locator('.ar-reading-section').count(),9);
    await p.getByRole('button',{name:'Draft Editor'}).click();
   }
  });
  await check('Linked Christmas maps load in DM view and return to the same Adventure Runner scene',async()=>{
   const visited=new Set();
   for(let i=0;i<10;i++){
    await p.evaluate(i=>adventureRunnerGo(i),i);
    const id=await p.evaluate(i=>adventureRunnerMapId(i),i);
    if(!id){assert.ok(await p.getByRole('button',{name:'Open battle map'}).isDisabled());continue;}
    assert.ok(await p.evaluate(id=>mapState().scenes.some(m=>m.id===id),id),'Missing map '+id);
    await p.getByRole('button',{name:'Open battle map'}).click();
    assert.equal(await p.evaluate(()=>page),'maps');
    assert.equal(await p.evaluate(()=>mapState().active),id);
    assert.equal(await p.evaluate(()=>mapState().viewMode),'dm');
    visited.add(id);
    await p.getByRole('group',{name:'DM session shortcuts'}).getByRole('button',{name:'← Adventure Runner'}).click();
    assert.equal(await p.evaluate(()=>adventurePreviewIndex),i);
   }
   assert.ok(visited.size>=4,'Expected at least four distinct scene map locations');
   console.log('Verified linked maps:',[...visited].join(', '));
  });
  await check('NPC/encounter quick reference, four prepared encounters, and three music cues remain available',async()=>{
   await p.evaluate(()=>goto('runner'));
   const state=await read();
   assert.equal(state.encounters.filter(e=>e.id.startsWith('caper-encounter-')).length,4);
   assert.equal(state.music.filter(e=>e.id.startsWith('caper-music-')).length,3);
   const npc=state.npcs.find(n=>n.name)?.id;
   const encounter=state.encounters.find(e=>e.id.startsWith('caper-encounter-'))?.id;
   if(npc){await p.locator('#ar-quick-npc').selectOption(npc);assert.ok((await p.locator('#ar-reference-detail').innerText()).length>5);}
   if(encounter){await p.locator('#ar-quick-encounter').selectOption(encounter);assert.ok((await p.locator('#ar-reference-detail').innerText()).length>5);}
   await p.getByRole('button',{name:'Open Music Cues'}).click();
   assert.match(await p.locator('#app').innerText(),/Session 1: The Great Christmas Caper/);
   await p.evaluate(()=>goto('runner'));
   await p.getByRole('button',{name:'Open Encounter Library'}).click();
   assert.match(await p.locator('#app').innerText(),/Hungry Snow-Tuft Mites/);
  });
  await check('Command Center displays six synthetic heroes and player board omits DM notes and secrets',async()=>{
   await p.evaluate(()=>goto('command'));
   const text=await p.locator('#app').innerText();
   for(let i=1;i<=6;i++)assert.match(text,new RegExp('QA Hero '+i));
   await p.getByRole('button',{name:'Player-safe board'}).click();
   const board=await p.locator('#cc-player-board').innerText();
   for(let i=1;i<=6;i++)assert.ok(board.includes('QA Hero '+i));
   assert.ok(!board.includes('SYNTHETIC QA ONLY'));
   assert.ok(!board.includes('DM ONLY:'));
   await p.getByRole('button',{name:'Close player board'}).click();
  });
  await check('Map player mode hides DM shortcuts and preview combat does not change encounter completion',async()=>{
   await p.evaluate(()=>{goto('runner');adventureRunnerGo(3);adventureRunnerOpenMap();});
   assert.equal(await p.evaluate(()=>mapState().viewMode),'dm');
   await p.evaluate(()=>mapSetView('player'));
   assert.equal(await p.getByRole('group',{name:'DM session shortcuts'}).count(),0);
   await p.evaluate(()=>mapSetView('dm'));
   await p.evaluate(()=>{goto('combat');combatAddPreset('mite');combatNext();});
   assert.ok(await p.evaluate(()=>combatState().participants.length>0));
   assert.ok(await p.evaluate(()=>combatState().history.length>0));
   assert.equal((await read()).encounters.some(e=>e.status==='Completed'),false);
  });
  await check('No protected records or pre-campaign outcomes are changed after walkthrough and reload',async()=>{
   assert.equal(await protectedRecords(),baseline,'Reader navigation and combat preview cannot mutate protected story records');
   await p.reload({waitUntil:'domcontentloaded'});
   assert.equal(await protectedRecords(),baseline,'Protected records must survive refresh');
   const d=await read();
   assert.equal(d.campaign.session,0);
   assert.equal(d.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
   assert.equal(d.quests.find(x=>x.id==='vesper-adventure-1').status,'Available');
   assert.ok(d.decisions.every(x=>x.status==='Not decided'));
  });
  await check('No uncaught browser JS errors or successful cloud authentication',async()=>{
   assert.deepEqual(errors,[]);
   assert.equal(await p.evaluate(()=>typeof window.SHCloud?.user==='object'&&!!window.SHCloud.user?.id),false);
  });
  await context.close();
 } finally {
  const failed=checks.filter(x=>x.status==='FAIL');
  fs.writeFileSync('christmas-six-hero-walkthrough-results.json',JSON.stringify({checks,failed:failed.length,blockedCloudRequests:blockedRemote.length,synthetic:true},null,2));
  if(browser)await browser.close();
  server.kill();
  if(failed.length)process.exitCode=1;
 }
})().catch(e=>{console.error('WALKTHROUGH FAILED',e.stack||e);process.exitCode=1});

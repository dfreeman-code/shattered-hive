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
  assert.match(await page.locator('#app').innerText(),/Party:\\s*6 character records/);
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
  const after=await read();
  assert.equal(after.campaign.session,0);
  assert.equal(after.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(after.quests.find(x=>x.id==='vesper-adventure-1').status,'Available');
  assert.ok(after.decisions.every(x=>x.status==='Not decided'));
  assert.deepEqual(errors,[],'JS browser errors');
  console.log('PASS: 10 scenes; 9 fields; save/reload; JSON import/export & reject; command scratchpad; player board; map/combat navigation; zero gameplay changes');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});

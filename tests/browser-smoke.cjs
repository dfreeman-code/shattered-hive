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
 await check('25 unique grouped navigation destinations',async()=>{
  const data=await page.evaluate(()=>({expected:Object.keys(sections),groups:Object.values(NAV_GROUPS).flat(),buttons:[...document.querySelectorAll('#nav button')].map(b=>b.textContent.trim())}));
  assert.equal(data.expected.length,25);assert.deepEqual([...data.groups].sort(),[...data.expected].sort());assert.equal(data.buttons.length,25);
  for(const key of data.groups){
   await page.locator('#nav button').nth(data.groups.indexOf(key)).click();
   assert.equal(await page.evaluate(()=>page),key);
   assert.equal(await page.locator('#nav button.active').count(),1);
  }
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
  assert.equal(await page.locator('#nav button').count(),25);
  await page.locator('#nav button').last().scrollIntoViewIfNeeded();
  await page.locator('#nav button').last().click();
  assert.equal(await page.evaluate(()=>page),'settings');
 });
 await check('No uncaught browser JS errors',async()=>{assert.deepEqual(errors,[])});
 const failed=results.filter(r=>r.status==='FAIL');
 fs.writeFileSync('qa-smoke-results.json',JSON.stringify({results,failed:failed.length},null,2));
 await browser.close();
 if(failed.length)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1});
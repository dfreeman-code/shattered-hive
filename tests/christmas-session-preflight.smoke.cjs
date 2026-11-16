/* Read-only Christmas Caper preflight browser smoke; no live Supabase writes. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',err=>errors.push(String(err)));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof goto==='function'&&typeof christmasCaperSessionPreflight==='function');
  const before=await page.evaluate(()=>{
   const six=Array.from({length:6},(_,i)=>({id:'test-hero-'+i,name:'Test Hero '+i,species:'Beetlekin',class:'Wizard',level:1,status:'Active'}));
   db.pcs=six;
   db.adventureScriptDraft={adventureId:'vesper-adventure-1',scenes:{}};
   db.adventureScriptDraft.scenes['a1-scene-01']={readAloud:'An opening read aloud.'};
   db.christmasSceneMaps={'a1-scene-01':'does-not-exist'};
   save();
   return JSON.stringify(db);
  });
  await page.evaluate(()=>goto('command'));
  const panel=page.locator('[aria-label="Christmas Caper session readiness"]');
  await panel.waitFor();
  const text=await panel.innerText();
  assert.match(text,/Available heroes[\s\S]*6\/6/);
  assert.match(text,/Full script sections[\s\S]*0\/10/);
  assert.match(text,/Encounter notes/);
  assert.match(text,/Music cues/);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'command center must not modify campaign');
  await panel.locator('summary').click();
  assert.equal(await panel.locator('ol li').count(),10);
  assert.match(await panel.locator('ol li').first().innerText(),/1\/9 sections · Map missing/);
  await panel.getByRole('button',{name:'Open Scene 1'}).click();
  assert.ok(await page.getByRole('heading',{name:'Adventure Runner'}).count());
  assert.equal(await page.evaluate(()=>adventurePreviewIndex),0);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'opening scene must not change campaign');
  await page.evaluate(()=>goto('command'));
  await page.getByRole('button',{name:'Six hero introductions'}).click();
  assert.ok(await page.getByRole('heading',{name:'Six heroes, six beginnings'}).count());
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'opening solo introductions must not change campaign');
  assert.deepEqual(errors,[]);
  await page.close();
  // Mobile preflight remains readable and all ten scenes accessible.
  const mobile=await browser.newPage({viewport:{width:390,height:844}});
  await mobile.goto(BASE,{waitUntil:'domcontentloaded'});
  await mobile.evaluate(()=>goto('command'));
  assert.ok(await mobile.locator('[aria-label="Christmas Caper session readiness"]').isVisible());
  await mobile.locator('.cc-caper-scenes summary').click();
  assert.equal(await mobile.locator('.cc-caper-scenes li').count(),10);
  await mobile.close();
  console.log('PASS read-only preflight counts, map issue labels, scenes, hero intros, mobile layout and no campaign mutation');
 }finally{await browser.close()}
})().catch(e=>{console.error('CHRISTMAS PREFLIGHT TEST FAILED',e);process.exitCode=1});

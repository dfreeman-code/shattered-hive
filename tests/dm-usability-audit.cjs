const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
async function ready(url){
 for(let i=0;i<50;i++){
  try {await new Promise((ok,bad)=>http.get(url,r=>{r.resume();r.statusCode===200?ok():bad(Error('HTTP '+r.statusCode));}).on('error',bad));return;}
  catch {await new Promise(r=>setTimeout(r,200));}
 }
 throw Error('Server did not start');
}
(async()=>{
 const server=spawn('python3',['-m','http.server','8768','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try {
  await ready('http://127.0.0.1:8768/index.html');
  browser=await chromium.launch({headless:true});
  const errors=[], warnings=[];
  const ctx=await browser.newContext({viewport:{width:1365,height:900},acceptDownloads:true});
  const page=await ctx.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8768/index.html');
  await page.getByRole('button',{name:/Adventure Runner/}).click();
  assert.equal(await page.locator('.ar-scene').count(),10,'10 scenes available');
  for(let scene=0;scene<10;scene++){
   await page.locator('.ar-scene').nth(scene).click();
   assert.equal(await page.locator('.ar-scene[aria-current="step"]').count(),1);
   assert.equal(await page.locator('.ar-field textarea').count(),9,'Each scene has 9 preparation sections');
   const readable=await page.locator('.ar-scene-head').isVisible();
   assert.ok(readable,'Scene title is shown');
  }
  // Audit whether unsaved scene drafts are protected before navigating away.
  await page.locator('.ar-scene').first().click();
  await page.locator('#ar-readAloud').fill('UNSAVED TEST DRAFT - DO NOT STORE');
  await page.locator('.ar-scene').nth(1).click();
  await page.locator('.ar-scene').first().click();
  assert.equal(await page.locator('#ar-readAloud').inputValue(),'UNSAVED TEST DRAFT - DO NOT STORE','Unsaved text must be automatically preserved when changing scenes');
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')))).adventureScriptDraft.scenes['a1-scene-01'].readAloud,'UNSAVED TEST DRAFT - DO NOT STORE');
  // Saved text must persist through navigation and reload.
  await page.locator('#ar-readAloud').fill('SAVED TEST DRAFT');
  await page.getByRole('button',{name:'Save scene draft'}).click();
  await page.locator('.ar-scene').nth(1).click();
  await page.locator('.ar-scene').first().click();
  assert.equal(await page.locator('#ar-readAloud').inputValue(),'SAVED TEST DRAFT');
  await page.reload();
  await page.getByRole('button',{name:/Adventure Runner/}).click();
  assert.equal(await page.locator('#ar-readAloud').inputValue(),'SAVED TEST DRAFT');
  // Command Center, battle map, music, and combat reachable.
  await page.getByRole('button',{name:/Session Command Center/}).click();
  assert.ok(await page.locator('#cc-notes').isVisible());
  await page.getByRole('button',{name:'Open Adventure Runner'}).click();
  assert.ok(await page.locator('#ar-readAloud').isVisible(),'Command Center button must open the Adventure Runner');
  await page.locator('#ar-dmNotes').fill('NAVIGATION TEST NOTES');
  await page.getByRole('button',{name:'Back to Command Center'}).click();
  await page.getByRole('button',{name:'Open Adventure Runner'}).click();
  assert.equal(await page.locator('#ar-dmNotes').inputValue(),'NAVIGATION TEST NOTES','Leaving the runner via Command Center button preserves text');
  await page.getByRole('button',{name:/Music & Ambience/}).first().click();
  assert.ok((await page.locator('#app').innerText()).length>30);
  await page.getByRole('button',{name:/Battle Maps/}).first().click();
  assert.ok((await page.locator('#app').innerText()).length>30);
  await page.getByRole('button',{name:/Combat Tracker/}).first().click();
  assert.ok((await page.locator('#app').innerText()).length>30);
  // Small-screen usability: ensure controls remain accessible, log overflow rather than guessing layout quality.
  const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mp=await mobile.newPage();
  mp.on('pageerror',e=>errors.push(e.message));
  await mp.goto('http://127.0.0.1:8768/index.html');
  await mp.getByRole('button',{name:/Adventure Runner/}).click();
  assert.equal(await mp.locator('.ar-scene').count(),10);
  assert.ok(await mp.locator('#ar-readAloud').isVisible());
  const overflow=await mp.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+4);
  if(overflow)warnings.push('MOBILE_HORIZONTAL_OVERFLOW: Adventure Runner content wider than mobile viewport.');
  const buttons=await mp.locator('.ar-scene').all();
  for(const btn of buttons){await btn.scrollIntoViewIfNeeded();assert.ok(await btn.isVisible());}
  const data=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  assert.equal(data.campaign.session,0);
  assert.equal(data.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
  assert.equal(data.quests.find(x=>x.id==='vesper-adventure-1').status,'Available');
  assert.ok(data.decisions.every(x=>x.status==='Not decided'));
  assert.deepEqual(errors,[],'Uncaught errors: '+errors.join('; '));
  console.log('PASS: desktop/mobile runner navigation, 10 scenes, 9 fields, save/reload, Command Center, maps, combat, music, and pre-campaign safeguards.');
  warnings.forEach(w=>console.log('USABILITY FINDING: '+w));
  console.log('AUDIT FINDINGS: '+warnings.length);
  await mobile.close();
 } finally {if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});

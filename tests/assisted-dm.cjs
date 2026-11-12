const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
async function ready(url){for(let n=0;n<40;n++){try{await new Promise((ok,bad)=>http.get(url,r=>{r.resume();r.statusCode===200?ok():bad(Error(String(r.statusCode)))}).on('error',bad));return}catch{}await new Promise(r=>setTimeout(r,250))}throw Error('server not ready')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8766','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready('http://127.0.0.1:8766/');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8766/index.html');
  const original=await page.evaluate(()=>JSON.stringify(localStorage.getItem('shattered-hive-v1')));
  await page.getByRole('button',{name:/AI Dungeon Master/}).click();
  assert.match(await page.locator('#app').innerText(),/Assisted DM — private AI connection/);
  assert.match(await page.locator('#app').innerText(),/Vesper storyline/);
  assert.equal(await page.getByRole('button',{name:'Copy request + DM context'}).count(),1);
  await page.getByRole('button',{name:'Analyze Player Decisions'}).click();
  assert.match(await page.locator('#dmPrompt').inputValue(),/Not decided prompts/);
  const context=await page.evaluate(()=>dmSnapshot());
  assert.equal(context.records.decisions.every(x=>x.classification==='Unplayed prompt / unconfirmed'),true);
  assert.equal('storyArchives' in context,false,'No archived secrets should be included');
  assert.equal('maps' in context.records,false,'Do not copy large map images');
  await page.locator('#dmPrompt').fill('How can Vismund discover the Heartroot?');
  const payload=await page.evaluate(()=>dmRequestPayload());
  assert.match(payload,/Vismund/);assert.match(payload,/REQUEST:/);
  assert.match(payload,/King Vesper/);
  assert.doesNotMatch(payload,/Queen Aurelia & Mycora/);
  await page.getByRole('button',{name:'Keep draft this session'}).click();
  assert.match(await page.locator('#dmHistory').innerText(),/Vismund discover/);
  const after=await page.evaluate(()=>JSON.stringify(localStorage.getItem('shattered-hive-v1')));
  assert.equal(after,original,'Read-only DM actions must not change campaign storage');
  await page.reload();await page.getByRole('button',{name:/AI Dungeon Master/}).click();
  assert.match(await page.locator('#dmHistory').innerText(),/No drafts saved this session/);
  for(const item of ['Player Decisions','Story Archive','Battle Maps','NPCs','Settings']){
   await page.getByRole('button',{name:new RegExp(item)}).first().click();
   assert.ok((await page.locator('#app').innerText()).length>20,item+' renders');
  }
  assert.deepEqual(errors,[],'Page errors: '+errors.join('; '));
  console.log('PASS: DM panel, Vesper context, unconfirmed decision classification, read-only storage, ephemeral drafts, navigation regression');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

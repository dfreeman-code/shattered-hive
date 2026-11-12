const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
async function ready(url){for(let i=0;i<40;i++){try{await new Promise((resolve,reject)=>http.get(url,r=>{r.resume();r.statusCode===200?resolve():reject(Error('Not ready'))}).on('error',reject));return}catch{}await new Promise(r=>setTimeout(r,250))}throw Error('Web server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8767','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready('http://127.0.0.1:8767/');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  await page.route('https://example.workers.dev/chat',async route=>{
   const headers=route.request().headers(),body=route.request().postDataJSON();
   assert.equal(headers.authorization,'Bearer sample-test-secret');
   assert.match(body.prompt,/next session/);
   assert.ok(body.context.records.decisions.every(d=>d.classification));
   await route.fulfill({status:200,headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:JSON.stringify({answer:'Suggested: Check Heartroot clues. Not approved.',mode:'assisted',writes:false})});
  });
  await page.goto('http://127.0.0.1:8767/index.html');
  await page.getByRole('button',{name:/AI Dungeon Master/}).click();
  const before=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  await page.locator('#dmWorkerUrl').fill('https://example.workers.dev');
  await page.locator('#dmAccessToken').fill('sample-test-secret');
  await page.locator('#dmPrompt').fill('Prepare next session');
  await page.getByRole('button',{name:'Ask AI'}).click();
  await page.locator('#dmChat').getByText(/Check Heartroot clues/).waitFor();
  assert.match(await page.locator('#dmChat').innerText(),/unapproved/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),before,'AI chat cannot modify campaign save');
  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes('sample-test-secret'));
  await page.reload();await page.getByRole('button',{name:/AI Dungeon Master/}).click();
  assert.match(await page.locator('#dmChat').innerText(),/No AI messages yet/);
  for(const name of ['Player Decisions','Story Archive','Battle Maps','Settings']){
   await page.getByRole('button',{name:new RegExp(name)}).first().click();
   assert.ok((await page.locator('#app').innerText()).length>15);
  }
  assert.deepEqual(errs,[]);
  console.log('PASS: Mocked live AI chat, unapproved labeling, no campaign writes, ephemeral chat, navigation');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

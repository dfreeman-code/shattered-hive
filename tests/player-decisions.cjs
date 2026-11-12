const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const http = require('node:http');

async function ready(url) {
 for(let i=0;i<40;i++){
  try{await new Promise((resolve,reject)=>http.get(url,res=>{res.resume();res.statusCode===200?resolve():reject(new Error('not ready'))}).on('error',reject));return;}catch{}
  await new Promise(r=>setTimeout(r,250));
 }
 throw Error('Local test web server did not start');
}
(async()=>{
 const server=spawn('python3',['-m','http.server','8765','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready('http://127.0.0.1:8765/');
  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({acceptDownloads:true});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8765/index.html');
  await page.getByRole('button',{name:/Player Decisions/}).click();
  assert.match(await page.locator('#app').innerText(),/King Vesper, the Hollow King/);
  let state=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1'))||null);
  // Initial state is only committed after the first save. The UI must still show starter prompts.
  assert.equal(await page.locator('#app article.card').count(),10,'Expected 10 unplayed prompts');
  assert.equal(await page.locator('#app .kpi').first().innerText(),'0');
  await page.locator('#app article.card').first().getByRole('button',{name:'View / Edit'}).click();
  await page.locator('#editForm select[name="status"]').selectOption('Decided');
  await page.locator('#editForm textarea[name="choice"]').fill('The heroes forgave Pip after he apologized');
  await page.locator('#editForm textarea[name="consequence"]').fill('Pip is a trusted engineering ally');
  await page.getByRole('button',{name:'Save record'}).click();
  assert.equal(await page.locator('#app .kpi').first().innerText(),'1');
  await page.reload();
  await page.getByRole('button',{name:/Player Decisions/}).click();
  assert.match(await page.locator('#app').innerText(),/The heroes forgave Pip/);
  state=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
  assert.equal(state.decisions.length,10);
  assert.equal(state.decisions.find(x=>x.id==='a1-pip').status,'Decided');
  assert.equal(state.npcs.length>0,true,'Existing NPCs should be intact');
  assert.equal(state.quests.length>0,true,'Existing quests should be intact');
  await page.getByRole('button',{name:'+ Add Decision'}).click();
  await page.locator('#editForm input[name="name"]').fill('A new choice from our table');
  await page.locator('#editForm textarea[name="choice"]').fill('Players rescued both villages');
  await page.getByRole('button',{name:'Save record'}).click();
  assert.equal(await page.locator('#app article.card').count(),11);
  await page.locator('#search').fill('A new choice from our table');
  assert.equal(await page.locator('#app article.card').count(),1);
  await page.locator('#app article.card').getByRole('button',{name:'Delete'}).click();
  await page.locator('#search').fill('');
  assert.equal(await page.locator('#app article.card').count(),10);
  // Export/import persistence.
  await page.getByRole('button',{name:/Settings/}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export JSON'}).click()]);
  const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));
  assert.equal(exported.data.decisions.find(x=>x.id==='a1-pip').status,'Decided');
  assert.equal(exported.data.npcs.length,state.npcs.length);
  await page.evaluate(()=>localStorage.clear());
  await page.reload();
  await page.locator('#importer').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
  await page.getByRole('button',{name:/Player Decisions/}).click();
  assert.match(await page.locator('#app').innerText(),/The heroes forgave Pip/);
  // Legacy backup import (without decisions) must preserve its other records.
  const legacy=structuredClone(exported);delete legacy.data.decisions;delete legacy.data.decisionPromptsInitialized;
  await page.getByRole('button',{name:/Settings/}).click();
  await page.locator('#importer').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.getByRole('button',{name:/Player Decisions/}).click();
  assert.equal(await page.locator('#app article.card').count(),10);
  assert.equal(await page.locator('#app .kpi').first().innerText(),'0');
  for(const tab of ['Player Characters','NPCs','Quests','Battle Maps','Sessions']){
   await page.getByRole('button',{name:new RegExp(tab)}).first().click();
   assert.ok((await page.locator('#app').innerText()).length>20,tab+' should render');
  }
  assert.deepEqual(errors,[],'Browser console errors: '+errors.join('; '));
  console.log('PASS: navigation, starter prompts, decision save/reload, add/delete/search, JSON export/import, legacy import, and screen regression checks');
 } finally {if(browser)await browser.close();server.kill();}
})().catch(err=>{console.error(err);process.exitCode=1;});
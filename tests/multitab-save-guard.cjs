/* SH-REL-001: isolated two-editor-tab regression, no live campaign data. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true});
 const a=await context.newPage(),b=await context.newPage();
 const dialogs=[];
 b.on('dialog',async dialog=>{dialogs.push(dialog.message());if(dialog.type()==='beforeunload')await dialog.accept();else await dialog.dismiss();});
 const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
 try{
  await a.goto(base,{waitUntil:'domcontentloaded'});
  await b.goto(base,{waitUntil:'domcontentloaded'});
  const key='shattered-hive-v1';
  const before=await a.evaluate(k=>localStorage.getItem(k),key);
  assert.equal(await b.evaluate(k=>localStorage.getItem(k),key),before);
  await a.evaluate(()=>{db.notes.push({id:'tab-a',name:'From A',content:'Stored edit'});save()});
  const afterA=await a.evaluate(k=>localStorage.getItem(k),key);
  assert.ok(JSON.parse(afterA).notes.some(x=>x.id==='tab-a'),'Tab A should persist');
  const resultB=await b.evaluate(()=>{db.notes.push({id:'tab-b',name:'From B',content:'Unsaved edit'});return save()});
  assert.equal(resultB,false,'Stale tab B must refuse to save');
  assert.equal(await a.evaluate(k=>localStorage.getItem(k),key),afterA,'Stale tab may not overwrite storage');
  assert.ok(await b.evaluate(()=>db.notes.some(x=>x.id==='tab-b')),'Blocked edit must remain in memory');
  assert.ok(dialogs.some(x=>x.includes('Another campaign tab')),'Explain collision to user');
  const download=b.waitForEvent('download');
  await b.evaluate(()=>exportData());
  const exported=await download;
  assert.ok(exported.suggestedFilename().endsWith('.json'),'Backup remains available after block');
  // Reopen the stale editor; it now loads the latest saved campaign.
  await b.reload({waitUntil:'domcontentloaded'});
  assert.ok(await b.evaluate(()=>db.notes.some(x=>x.id==='tab-a')),'Reload sees newest saved edit');
  assert.equal(await b.evaluate(()=>{db.notes.push({id:'after-reload',name:'New edit'});return save()}),true,'Reloaded tab may save');
  assert.ok(await a.evaluate(k=>JSON.parse(localStorage.getItem(k)).notes.some(x=>x.id==='after-reload'),key));
  console.log('PASS: stale-tab overwrite prevented; unsaved memory, backup, and reload preserved');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

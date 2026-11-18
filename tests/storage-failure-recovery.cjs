/* Phase 2 storage-failure regression — disposable browser context only.
 * Run using a local checkout and mocked storage failures; never use production data.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const dialogs=[];
 page.on('dialog',async d=>{dialogs.push(d.message());await d.dismiss()});
 try{
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  const setup=await page.evaluate(()=>{
   window.__originalStorageSet=Storage.prototype.setItem;
   window.__failWrites=true;
   window.__cloudQueueCalls=0;
   window.__livePublishCalls=0;
   if(window.SHCloud)SHCloud.queueSave=()=>window.__cloudQueueCalls++;
   if(window.SHLive)SHLive.publish=()=>window.__livePublishCalls++;
   Storage.prototype.setItem=function(key,value){
    if(key==='shattered-hive-v1'&&window.__failWrites)
     throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__originalStorageSet.call(this,key,value);
   };
   const stored=localStorage.getItem('shattered-hive-v1');
   db.notes.push({id:'unsaved-quota-test',name:'Unsaved only',content:'Keep this edit'});
   return {stored,ok:save()};
  });
  assert.equal(setup.ok,false,'Quota error must return a failed save');
  const status=page.locator('#campaign-save-warning');
  await status.waitFor({state:'visible'});
  assert.match(await status.innerText(),/NOT saved/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),setup.stored,'Failed write cannot modify saved data');
  assert.ok(await page.evaluate(()=>db.notes.some(x=>x.id==='unsaved-quota-test')),'Unsaved edit stays in memory');
  assert.deepEqual(await page.evaluate(()=>[window.__cloudQueueCalls,window.__livePublishCalls]),[0,0],'Failed save cannot notify cloud or live display');
  assert.ok(dialogs.some(x=>x.includes('Export a backup')),'Failure tells user to export');
  assert.ok(await page.evaluate(()=>{
   const e=new Event('beforeunload',{cancelable:true});
   window.dispatchEvent(e);
   return e.defaultPrevented;
  }),'Pending changes trigger beforeunload protection');

  const backupPromise=page.waitForEvent('download');
  await status.getByRole('button',{name:'Export unsaved backup'}).click();
  const backup=await backupPromise;
  assert.ok(backup.suggestedFilename().endsWith('.json'),'User can export unsaved memory');
  const path=await backup.path();
  const fs=require('node:fs');
  const data=JSON.parse(fs.readFileSync(path,'utf8')).data;
  assert.ok(data.notes.some(x=>x.id==='unsaved-quota-test'),'Backup contains unsaved edit');

  await page.evaluate(()=>{window.__failWrites=false});
  await status.getByRole('button',{name:'Retry browser save'}).click();
  await status.waitFor({state:'detached'});
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')).notes.some(x=>x.id==='unsaved-quota-test')),'Retry persists previously unsaved edit');
  assert.deepEqual(await page.evaluate(()=>[window.__cloudQueueCalls,window.__livePublishCalls]),[1,1],'Successful retry resumes existing notifications');
  assert.equal(await page.evaluate(()=>{
   const e=new Event('beforeunload',{cancelable:true});window.dispatchEvent(e);return e.defaultPrevented;
  }),false,'No departure prompt after successful save');

  // Storage API unavailable during write should also fail closed and recover.
  await page.evaluate(()=>{
   Storage.prototype.setItem=function(key,value){
    if(key==='shattered-hive-v1'&&window.__failWrites)throw new DOMException('Denied','SecurityError');
    return window.__originalStorageSet.call(this,key,value);
   };
   window.__failWrites=true;db.notes.push({id:'unsaved-security-test',name:'Storage unavailable'});
  });
  assert.equal(await page.evaluate(()=>save()),false);
  await status.waitFor({state:'visible'});
  assert.ok(await page.evaluate(()=>db.notes.some(x=>x.id==='unsaved-security-test')));
  await page.evaluate(()=>{window.__failWrites=false;});
  await status.getByRole('button',{name:'Retry browser save'}).click();
  await status.waitFor({state:'detached'});
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')).notes.some(x=>x.id==='unsaved-security-test')));
  console.log('PASS Phase 2 quota, unavailable storage, persistent warning, export, retry, and interruption safeguard');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

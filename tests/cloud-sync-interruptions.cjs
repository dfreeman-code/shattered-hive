/* Phase 4 mocked multi-device cloud interruption and recovery regression.
 * All Supabase requests are intercepted; no real account or campaign is used.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
 let revision=0,payload=null,history=[],requests=0,loseNextResponse=false;
 const clone=v=>JSON.parse(JSON.stringify(v));
 const respond=(route,body)=>route.fulfill({status:200,contentType:'application/json',
   headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 const store=doc=>{
  revision++;payload=clone(doc);
  history.push({revision,payload:clone(payload),created_at:new Date().toISOString()});
 };
 page.on('dialog',async d=>{await d.accept()});
 await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/,async route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.pathname==='/rest/v1/shattered_hive_cloud_saves'){
   const full=(u.searchParams.get('select')||'').includes('payload');
   return respond(route,revision?[{revision,updated_at:new Date().toISOString(),...(full?{payload:clone(payload)}:{})}]:[]);
  }
  if(u.pathname==='/rest/v1/shattered_hive_save_history'){
   const target=u.searchParams.get('revision'),full=(u.searchParams.get('select')||'').includes('payload');
   let rows=history.slice();
   if(target?.startsWith('eq.'))rows=rows.filter(x=>x.revision===Number(target.slice(3)));
   return respond(route,rows.map(x=>full?{revision:x.revision,payload:clone(x.payload)}:
    {revision:x.revision,created_at:x.created_at,pc_count:x.payload.pcs.length,
     npc_count:x.payload.npcs.length,map_count:x.payload.maps?.scenes?.length||0}));
  }
  if(u.pathname==='/rest/v1/rpc/shattered_hive_store'){
   requests++;
   const data=req.postDataJSON();
   if(data.expected_revision!==revision)return respond(route,null);
   store(data.document);
   if(loseNextResponse){
    loseNextResponse=false;
    // The server committed, but browser did not receive its confirmation.
    return route.abort('failed');
   }
   return respond(route,revision);
  }
  if(u.pathname.startsWith('/auth/v1/'))
   return respond(route,{access_token:'mock-token',refresh_token:'mock-refresh',
    expires_in:3600,user:{id:'mock-user',email:'mock@example.org'}});
  throw Error('Unexpected Supabase endpoint '+u.pathname);
 });
 await context.addInitScript(()=>{
  localStorage.setItem('shattered-hive-cloud-session-v1',JSON.stringify({
   access_token:'mock-token',refresh_token:'mock-refresh',
   expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'mock-user',email:'mock@example.org'}
  }));
 });
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('#cloud-header-status').click();
  await page.locator('#cloud-sync-panel').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Upload this browser to cloud (first time)'}).waitFor();
  const firstBackup=page.waitForEvent('download');
  await page.getByRole('button',{name:'Upload this browser to cloud (first time)'}).click();
  await firstBackup;
  await page.waitForFunction(()=>window.SHCloud?.isLinked(),null,{timeout:15000});
  assert.equal(revision,1);

  loseNextResponse=true;
  await page.evaluate(()=>{
   db.notes.push({id:'offline-hero-note',name:'Important unsynced note',content:'Preserve me'});
   save();
   SHCloud.uploadPending();
  });
  await page.waitForFunction(()=>!SHCloud.isLinked()&&
    document.querySelector('#cloud-sync-status')?.textContent?.includes('could not be confirmed'),null,{timeout:15000});
  assert.equal(revision,2,'Server committed despite lost response');
  assert.ok(payload.notes.some(n=>n.id==='offline-hero-note'));
  const afterFailed=requests;
  await page.evaluate(()=>{
   db.notes.push({id:'during-uncertainty',name:'Further local edits',content:'Never upload blindly'});
   save();
  });
  await page.waitForTimeout(1600);
  assert.equal(requests,afterFailed,'No auto-retry while response is ambiguous');
  assert.equal(revision,2,'No duplicate revision');
  assert.ok(await page.evaluate(()=>db.notes.some(n=>n.id==='during-uncertainty')),'In-memory changes retained');
  assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')).notes.some(n=>n.id==='during-uncertainty')),'Browser save retained');

  // After reload, remote revision 2 differs because of the newer local edit.
  // The client must remain blocked and offer recovery, not overwrite either.
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#cloud-header-status').click();
  await page.locator('#cloud-sync-panel').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('#cloud-sync-status')?.textContent?.includes('unconfirmed local differences'),null,{timeout:15000});
  assert.equal(await page.evaluate(()=>SHCloud.isLinked()),false);
  assert.equal(revision,2);
  await page.evaluate(()=>SHCloud.previewRecovery());
  await page.waitForFunction(()=>document.querySelector('#cloud-sync-status')?.textContent?.includes('Recovery preview ready'),null,{timeout:15000});
  const backup=page.waitForEvent('download');
  await page.evaluate(()=>SHCloud.applyRecovery());
  await backup;
  await page.waitForFunction(()=>SHCloud.isLinked(),null,{timeout:15000});
  assert.equal(revision,3,'Reviewed recovery creates one new cloud revision');
  assert.ok(payload.notes.some(n=>n.id==='during-uncertainty'),'Post-interruption edit preserved');

  // External device changes a different record; a stale local upload must fail
  // without changing either local or cloud campaign.
  // Recovery replaces the campaign and navigates back to Dashboard.
  // Reopen Settings so its status messages remain available for assertions.
  await page.locator('#cloud-header-status').click();
  await page.locator('#cloud-sync-panel').waitFor({state:'visible'});
  const otherDevice=clone(payload);
  otherDevice.npcs.push({id:'remote-npc',name:'Remote NPC',species:'Mothkin'});
  store(otherDevice);
  await page.evaluate(()=>{
   db.pcs.push({id:'local-pc',name:'Local PC',species:'Beetlekin'});
   save();
   SHCloud.uploadPending();
  });
  await page.waitForFunction(()=>document.querySelector('#cloud-sync-status')?.textContent?.includes('SYNC CONFLICT'),null,{timeout:15000});
  assert.equal(revision,4,'Stale write cannot replace newer revision');
  assert.ok(!payload.pcs.some(p=>p.id==='local-pc'),'Remote untouched after conflict');
  assert.ok(await page.evaluate(()=>db.pcs.some(p=>p.id==='local-pc')),'Local PC retained');
  await page.evaluate(()=>SHCloud.previewRecovery());
  await page.waitForFunction(()=>document.querySelector('#cloud-sync-status')?.textContent?.includes('Recovery preview ready'),null,{timeout:15000});
  const recoveryBackup=page.waitForEvent('download');
  await page.evaluate(()=>SHCloud.applyRecovery());
  await recoveryBackup;
  await page.waitForFunction(()=>SHCloud.isLinked(),null,{timeout:15000});
  assert.equal(revision,5,'Conflict recovery creates new revision');
  assert.ok(payload.pcs.some(p=>p.id==='local-pc'),'Merged local PC');
  assert.ok(payload.npcs.some(n=>n.id==='remote-npc'),'Merged remote NPC');
  console.log('PASS Phase 4 ambiguous committed upload, no blind retry, offline edits, revision conflict and 3-way recovery');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

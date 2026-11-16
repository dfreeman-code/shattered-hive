/* Cloud Sync 2.1 integration tests: mock Supabase ONLY; no live user data. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765/';
const SESSION='shattered-hive-cloud-session-v1';
const META='shattered-hive-cloud-sync-meta-v1';
const DATA='shattered-hive-v1';
const PENDING='shattered-hive-cloud-pending-v2-1';
const clone=x=>JSON.parse(JSON.stringify(x));
function fingerprint(v){
 const s=JSON.stringify(v);let h=2166136261;
 for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);
 return (h>>>0).toString(16)+':'+s.length;
}
function pc(id,name){return {id,name,status:'Active',species:'Beetlekin',class:'Unassigned',level:1};}
async function bootBrowser(browser,width,initial,remote,options={}){
 const ctx=await browser.newContext({viewport:{width,height:900},acceptDownloads:true});
 const state={remote:clone(remote),revision:options.revision||5,history:new Map(),refreshes:0,writes:0,failRefresh:!!options.failRefresh,failUpload:false};
 state.history.set(state.revision,clone(state.remote));
 ctx.route(/https:\/\/[^/]+\.supabase\.co\/.*/,async route=>{
   const u=new URL(route.request().url());
   const path=u.pathname;
   const json=(x,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(x)});
   if(path==='/auth/v1/token'){state.refreshes++;return state.failRefresh?json({message:'Invalid Refresh Token'},401):json({access_token:'renewed-token',refresh_token:'renewed-refresh-'+state.refreshes,expires_in:3600,user:{id:'test-user',email:'dm@example.test'}});}
   if(path==='/auth/v1/user')return json({id:'test-user',email:'dm@example.test'});
   if(path==='/rest/v1/shattered_hive_cloud_saves'){
     if((u.searchParams.get('select')||'').includes('payload'))return json([{revision:state.revision,payload:clone(state.remote),updated_at:'2026-11-15T12:00:00Z'}]);
     return json([{revision:state.revision,updated_at:'2026-11-15T12:00:00Z'}]);
   }
   if(path==='/rest/v1/shattered_hive_save_history'){
     const wanted=u.searchParams.get('revision');
     if(wanted){const revision=Number(wanted.replace('eq.',''));const payload=state.history.get(revision);return json(payload?[{revision,payload:clone(payload)}]:[]);}
     return json([...state.history.keys()].map(revision=>({revision,created_at:'2026-11-15T12:00:00Z',pc_count:4,npc_count:6,map_count:5})));
   }
   if(path==='/rest/v1/rpc/shattered_hive_store'){
     if(state.failUpload)return json({message:'network unavailable'},503);
     const body=route.request().postDataJSON();
     if(body.expected_revision!==state.revision)return json(null);
     state.remote=clone(body.document);state.revision++;state.history.set(state.revision,clone(state.remote));state.writes++;
     return json(state.revision);
   }
   if(path==='/auth/v1/otp')return json({});
   return json({message:'Unexpected '+path},404);
 });
 await ctx.addInitScript(({initial,session,meta})=>{
   localStorage.setItem('shattered-hive-v1',JSON.stringify(initial));
   localStorage.setItem('shattered-hive-cloud-session-v1',JSON.stringify(session));
   if(meta)localStorage.setItem('shattered-hive-cloud-sync-meta-v1',JSON.stringify(meta));
 },{initial,session:{access_token:'old-token',refresh_token:'refresh-token',expires_at:options.expiresSoon?Math.floor(Date.now()/1000)+30:Math.floor(Date.now()/1000)+3600,user:{id:'test-user',email:'dm@example.test'}},meta:options.withoutBaseline?null:{revision:state.revision,userId:'test-user',fingerprint:fingerprint(initial),lastSyncedAt:'2026-11-15T11:00:00Z'}});
 const page=await ctx.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto(BASE,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!window.SHCloud && !!document.querySelector('#cloud-header-status'));
 return {ctx,page,state,errors};
}
(async()=>{
 const browser=await chromium.launch({headless:true});
 try {
   // Read a genuine locally initialized Chronicle document as the mock seed.
   const plain=await browser.newPage();
   await plain.goto(BASE,{waitUntil:'domcontentloaded'});
   await plain.waitForFunction(()=>!!window.SHCloud);
   const seed=await plain.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
   assert.ok(seed&&seed.campaign&&seed.maps);
   seed.pcs=[pc('p1','One'),pc('p2','Two'),pc('p3','Three'),pc('p4','Four')];
   await plain.close();
   // Proactive session renewal and ordinary uploading.
   {
     const {page,ctx,state,errors}=await bootBrowser(browser,1280,seed,seed,{expiresSoon:true});
     await page.waitForFunction(()=>document.querySelector('#cloud-header-status')?.textContent.includes('synced'));
     assert.ok(state.refreshes>=1,'refresh before token expiry');
     await page.evaluate(()=>{db.pcs.push({id:'p5',name:'Five',status:'Active'});save();});
     await page.waitForFunction(()=>document.querySelector('#cloud-header-status')?.textContent.includes('synced')&&JSON.parse(localStorage.getItem('shattered-hive-cloud-sync-meta-v1')).revision===6);
     assert.equal(state.remote.pcs.length,5);
     assert.equal(localStorageKeyStatus(await page.evaluate((k)=>localStorage.getItem(k),PENDING)),false);
     assert.deepEqual(errors,[]);
     console.log('PASS proactive token refresh, debounce and confirmed upload');
     await ctx.close();
   }
   // Failed upload retains pending marker across reload; expiry warns without deleting data.
   {
     const {page,ctx,state,errors}=await bootBrowser(browser,390,seed,seed);
     await page.waitForFunction(()=>document.querySelector('#cloud-header-status')?.textContent.includes('synced'));
     state.failUpload=true;
     await page.evaluate(()=>{db.pcs.push({id:'p5',name:'Pending',status:'Active'});save();});
     await page.waitForTimeout(1700);
     const status=await page.locator('#cloud-header-status').innerText();
     assert.match(status,/unsynced edits|attention needed/);
     assert.ok(await page.evaluate(k=>!!localStorage.getItem(k),PENDING));
     assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),DATA)).pcs.length,5);
     await page.reload({waitUntil:'domcontentloaded'});
     await page.waitForFunction(()=>document.querySelector('#cloud-header-status')?.textContent.includes('unsynced'));
     assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),DATA)).pcs.length,5);
     await page.evaluate(()=>goto('settings'));
     assert.ok(await page.getByText('Unsynced browser changes.',{exact:false}).count());
     assert.ok(await page.getByRole('button',{name:'Export browser backup'}).count());
     assert.deepEqual(errors,[]);
     console.log('PASS offline pending edit persistence, refresh warning, backup control and mobile layout');
     await ctx.close();
   }
   // Distinct local/remote edits merge after explicit human confirmation, revision-checked.
   {
     const local=clone(seed);local.pcs.push(pc('local-new','Mister Potts'));
     const remote=clone(seed);remote.pcs.push(pc('remote-new','Jawshua Red Hawk'));
     const {page,ctx,state,errors}=await bootBrowser(browser,1280,local,remote);
     state.history.set(5,clone(seed));state.revision=6; // baseline revision 5, remote changed after it
     await page.evaluate(()=>goto('settings'));
     await page.getByRole('button',{name:'Preview safe recovery'}).click();
     await page.getByRole('button',{name:'Confirm reviewed recovery'}).waitFor();
     let pre=state.writes;assert.equal(pre,0);
     page.once('dialog',dlg=>dlg.accept());
     await page.getByRole('button',{name:'Confirm reviewed recovery'}).click();
     await page.waitForFunction(()=>document.querySelector('#cloud-header-status')?.textContent.includes('synced'));
     assert.equal(state.remote.pcs.length,6);
     assert.equal(state.writes,1);
     assert.deepEqual(state.remote.quests,seed.quests);
     assert.deepEqual(state.remote.maps,seed.maps);
     assert.ok(state.remote.pcs.some(x=>x.name==='Mister Potts'));
     assert.ok(state.remote.pcs.some(x=>x.name==='Jawshua Red Hawk'));
     assert.deepEqual(errors,[]);
     console.log('PASS approved three-way merge of disjoint heroes; unrelated story and maps unchanged');
     await ctx.close();
   }
   // Conflicting edits fail closed; no cloud write or browser replacement.
   {
     const local=clone(seed);local.pcs[0].name='Local revision';
     const remote=clone(seed);remote.pcs[0].name='Cloud revision';
     const {page,ctx,state,errors}=await bootBrowser(browser,1280,local,remote);
     state.history.set(5,clone(seed));state.revision=6;
     await page.evaluate(()=>goto('settings'));
     await page.getByRole('button',{name:'Preview safe recovery'}).click();
     await page.waitForFunction(()=>document.querySelector('#cloud-sync-status')?.textContent.includes('manual review'));
     assert.equal(state.writes,0);
     assert.equal((await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),DATA)).pcs[0].name,'Local revision');
     assert.deepEqual(errors,[]);
     console.log('PASS competing edits to same record do not overwrite either version');
     await ctx.close();
   }
   // No baseline means no automatic merge.
   {
     const local=clone(seed);local.pcs.push(pc('p5','Unknown source'));
     const {page,ctx,state}=await bootBrowser(browser,1280,local,seed,{withoutBaseline:true});
     await page.evaluate(()=>goto('settings'));
     await page.getByRole('button',{name:'Preview safe recovery'}).click();
     await page.waitForFunction(()=>document.querySelector('#cloud-sync-status')?.textContent.includes('No verified sync baseline'));
     assert.equal(state.writes,0);
     console.log('PASS unrecognized browser campaign requires manual backup and recovery');
     await ctx.close();
   }
   console.log('CLOUD SYNC 2.1 BROWSER TESTS PASSED');
 } catch(e){console.error('CLOUD SYNC 2.1 TEST FAILED',e.stack||e);process.exitCode=1;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
function localStorageKeyStatus(value){return !!value;}

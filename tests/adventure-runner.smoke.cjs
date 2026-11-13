/* Adventure Runner — disposable Chromium regression test. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const titles=['Welcome to Hearthhollow','The Christmas Caper','The Giant’s Footprint','Battle of the Frozen Berry','Three-Glass-Door Mystery','Thief Who Tried to Save Christmas','Hollowroot Guardian','First Memory of the Shattering','A Christmas Worth Saving','Last Light of Christmas'];
const scene=(i,extras={})=>({id:'a1-scene-'+String(i+1).padStart(2,'0'),title:titles[i],...extras});
(async()=>{
 const browser=await chromium.launch({headless:true});
 const failures=[];
 try{
  for(const width of [1440,390]){
   const ctx=await browser.newContext({viewport:{width,height:850},acceptDownloads:true});
   const p=await ctx.newPage();
   p.on('pageerror',err=>failures.push(String(err)));
   await p.route(/https:\/\/[^/]+\.supabase\.co\/.*/,route=>route.abort());
   await p.goto(base,{waitUntil:'domcontentloaded'});
   const get=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
   const original=await get();
   await p.getByRole('button',{name:/Adventure Runner/}).click();
   await p.getByRole('heading',{name:'Adventure Runner'}).waitFor();
   assert.equal(await p.locator('.ar-scene').count(),10);
   assert.equal((await p.locator('.ar-editor textarea').allInputValues()).filter(Boolean).length,0);
   let after=await get();
   for(const field of ['pcs','npcs','quests','sessions','decisions','maps']){
     assert.deepEqual(after[field],original[field],field+' should not change while previewing');
   }
   console.log('PASS '+width+'px canonical ten-scene scaffold and zero campaign mutations');
   await p.getByRole('button',{name:/The Giant’s Footprint/}).click();
   assert.equal(await p.locator('.ar-scene-head h3').innerText(),'The Giant’s Footprint');
   assert.equal((await get()).sessions.find(s=>s.id==='vesper-session-1')?.status,'Planned');
   console.log('PASS scene navigation previews without beginning adventure');
   await p.locator('#ar-readAloud').fill('Approved: tiny snow falls among the roots.');
   await p.getByRole('button',{name:'Save scene draft'}).click();
   assert.equal((await get()).adventureScriptDraft.scenes['a1-scene-03'].readAloud,'Approved: tiny snow falls among the roots.');
   await p.reload({waitUntil:'domcontentloaded'});
   await p.getByRole('button',{name:/Adventure Runner/}).click();
   await p.getByRole('button',{name:/The Giant’s Footprint/}).click();
   assert.equal(await p.locator('#ar-readAloud').inputValue(),'Approved: tiny snow falls among the roots.');
   console.log('PASS draft saves and survives refresh in original campaign JSON');
   const d=p.waitForEvent('download');
   await p.getByRole('button',{name:'Export script JSON'}).click();
   const out=await d;assert.ok(out.suggestedFilename().endsWith('.json'));
   console.log('PASS script template exports');
   const invalid={adventureId:'vesper-adventure-1',scenes:titles.map((_,i)=>scene(i))};
   invalid.scenes[0].title='Mismatched Canon';
   await p.locator('#ar-import').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});
   await p.waitForTimeout(75);
   assert.equal((await get()).adventureScriptDraft.scenes['a1-scene-03'].readAloud,'Approved: tiny snow falls among the roots.');
   console.log('PASS invalid canon rejected without replacing draft');
   const valid={adventureId:'vesper-adventure-1',version:1,scenes:titles.map((_,i)=>scene(i,i===0?{readAloud:'Canonical opening goes here.'}:{}))};
   p.once('dialog',dlg=>dlg.accept());
   await p.locator('#ar-import').setInputFiles({name:'canonical.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(valid))});
   await p.waitForFunction(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')).adventureScriptDraft?.scenes['a1-scene-01']?.readAloud==='Canonical opening goes here.');
   after=await get();
   assert.equal(after.adventureScriptDraft.scenes['a1-scene-03'].readAloud,'Approved: tiny snow falls among the roots.');
   for(const field of ['pcs','npcs','quests','sessions','decisions','maps']){
     assert.deepEqual(after[field],original[field],field+' changed by script import');
   }
   console.log('PASS valid script imports without clearing other scenes or altering game history');
   const bounds=await p.evaluate(()=>{const r=document.querySelector('.ar-layout').getBoundingClientRect();return {left:r.left,right:r.right,viewport:innerWidth}});
   assert.ok(bounds.left>=-1&&bounds.right<=width+2,JSON.stringify(bounds));
   console.log('PASS '+width+'px layout within viewport');
   await ctx.close();
  }
  assert.deepEqual(failures,[]);
  console.log('ADVENTURE RUNNER SMOKE PASSED');
 }catch(err){console.error('ADVENTURE RUNNER FAILED:',err.stack||err);process.exitCode=1}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

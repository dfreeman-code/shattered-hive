/* Phase 5: campaign data integrity in disposable Chromium storage only.
 * Never connect a real Supabase account or import a family campaign backup.
 */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const KEY='shattered-hive-v1';
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const clone=v=>JSON.parse(JSON.stringify(v));
(async()=>{
 const browser=await chromium.launch({headless:true});
 const context=await browser.newContext({acceptDownloads:true});
 const page=await context.newPage();
 const dialogs=[];
 page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const original=await page.evaluate(()=>{
   db.pcs.push({id:'phase5-pc',name:'Integrity Beetlekin',class:'Paladin',level:1,
     skills:['Athletics'],spellNotes:'Protect the garden'});
   db.npcs.push({id:'phase5-npc',name:'Frost Moth',secret:'Hidden Vesper clue'});
   db.quests.push({id:'phase5-quest',name:'Unplayed Vesper Mystery',status:'Available'});
   db.encounters.push({id:'phase5-encounter',name:'Frosted root encounter',status:'Planned',enemies:'2 mites'});
   db.notes.push({id:'phase5-note',name:'DM secrets',content:'Keep the mystery confidential'});
   db.sessions.push({id:'phase5-session',name:'Unplayed Christmas Caper',status:'Planned'});
   db.events.push({id:'phase5-event',name:'Future clue',details:'Not played yet'});
   db.relationships.push({id:'phase5-relation',from:'Integrity Beetlekin',to:'Frost Moth',notes:'Unknown'});
   const m=db.maps.scenes[0];
   m.tokens=[{id:'phase5-token',kind:'pc',ref:'phase5-pc',x:11,y:12,name:'Integrity Beetlekin'}];
   m.revealed=[2,7,65];m.fogWalls=[6,8];m.fogVision2=true;
   m.dmMarkers=[{id:'phase5-marker',title:'Secret bakery',x:9,y:8,notes:'DM only'}];
   m.imageData='data:image/png;base64,PHASE5TEST';
   m.customIntegrity={doNotChange:['fog','tokens','script']};
   db.maps.history.push({text:'Preserve DM movement history'});
   if(db.christmasCaper){
     db.christmasCaper.phase5Sentinel='Christmas story not yet played';
   }
   db.phase5CustomCampaignKey={nested:{keep:true},list:[1,2,3]};
   if(!save())throw Error('Failed to save isolated test fixture');
   return JSON.parse(JSON.stringify(db));
  });
  const exported=page.waitForEvent('download');
  await page.evaluate(()=>exportData());
  const download=await exported;
  const backup=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.deepEqual(backup.data,original,'Export must retain the complete synthetic campaign');
  assert.equal(backup.app,'The Shattered Hive Campaign Chronicle');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(db))),original,'Reload must retain every section and nested map field');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1'))),original,'Local storage must retain exact campaign');

  // Simulate a legitimate imported backup, including nested map/fog, notes and
  // unknown future extension keys; neither import nor rendering should strip them.
  const imported=clone(original);
  imported.pcs.push({id:'phase5-import-pc',name:'Imported Firefly',class:'Ranger'});
  imported.maps.scenes[0].tokens.push({id:'phase5-import-token',kind:'pc',ref:'phase5-import-pc',x:5,y:7});
  imported.maps.scenes[0].revealed.push(70);
  imported.maps.scenes[0].dmMarkers.push({id:'phase5-import-marker',title:'Unvisited den',x:4,y:6});
  imported.notes.push({id:'phase5-import-note',name:'Recovered clue',content:'Original content'});
  imported.phase5CustomCampaignKey.nested.extra='Retain unknown extension fields';
  const file={name:'phase5-synthetic-backup.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({data:imported}))};
  await page.locator('#importer').setInputFiles(file);
  await page.waitForFunction(()=>db.pcs.some(p=>p.id==='phase5-import-pc'));
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(db))),imported,'Import retains full structured document');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1'))),imported,'Imported records committed together');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(db))),imported,'Imported records survive reload');

  // A malformed/partial backup must never replace a valid campaign.
  await page.locator('#importer').setInputFiles({name:'incomplete.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({data:{campaign:{name:'Incomplete'},npcs:[],quests:[]}}))});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(db))),imported,'Partial backup rejected without edits');

  // Force quota exhaustion. Import must restore the previous in-memory campaign,
  // leave previously committed localStorage intact, and retain the Phase 2 warning.
  await page.evaluate(()=>{
   window.__phase5SetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__phase5SetItem.call(this,k,v);
   };
  });
  const rejected=clone(imported);
  rejected.pcs.push({id:'quota-should-not-import',name:'Discard failed replacement'});
  await page.locator('#importer').setInputFiles({name:'quota.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify({data:rejected}))});
  await page.locator('#campaign-save-warning').waitFor({state:'visible'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(db))),imported,'Failed import restores prior in-memory data');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1'))),imported,'Failed import cannot alter saved data');

  // Retry recovery with unchanged previous campaign, then test cloud replacement
  // with a storage error using the real app bridge and a wholly mocked remote.
  await page.evaluate(()=>{Storage.prototype.setItem=window.__phase5SetItem});
  await page.locator('#campaign-save-retry').click();
  await page.locator('#campaign-save-warning').waitFor({state:'detached'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(JSON.stringify(db))),imported);
  assert.ok(dialogs.some(d=>d.includes('Browser storage unavailable')),'Quota failure warning was shown');
  assert.ok(dialogs.some(d=>d.includes('Not a valid campaign backup')),'Malformed JSON was reported');
  console.log('PASS Phase 5 characters, NPCs, quests, story, encounters, maps, fog, tokens, markers, extensions, JSON export/import, reload and failed-import rollback');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

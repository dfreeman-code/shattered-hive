/* Phase 3 startup map migration safety, isolated local browser storage only. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');

const KEY='shattered-hive-v1';
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext();
  const page=await context.newPage();
  const dialogs=[];
  page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});
  await page.goto(base,{waitUntil:'domcontentloaded'});
  const sample=await page.evaluate(()=>{
   const home={
    id:'evergarden-home-hive',name:'Customized Home Hive',
    desc:'Party-designed settlement',asset:'custom-hive-art',
    cols:62,rows:48,theme:'village',playerShared:false,
    tokens:[{id:'hero-token',kind:'pc',ref:'hero-1',x:40,y:24}],
    revealed:[2,3,1000],fogWalls:[51,52],
    dmMarkers:[{id:'custom-mark',x:28,y:19,title:'Hidden bakery'}],
    customField:{retained:'yes'},imageData:'data:image/png;base64,TEST'
   };
   const legacy={
    id:'old-tunnel',name:'Legacy Root Tunnel',cols:55,rows:35,
    tokens:[{id:'legacy-token',x:12,y:8}],revealed:[1,2],
    dmMarkers:[{id:'legacy-marker',x:3,y:5}],fogWalls:[15],
    imageData:'data:image/png;base64,CUSTOM'
   };
   const campaign=clone(db);
   campaign.pcs.push({id:'hero-1',name:'Preserved Hero',species:'Spiderkin'});
   campaign.maps={
    scenes:[home,legacy],archivedScenes:[],
    active:home.id,selected:'hero-token',fogTool:'paint',viewMode:'dm',
    showGrid:false,history:[{text:'Preserve map history'}],
    christmasCaperMapsSeeded:false,christmasFinalTwoMapsSeeded:false,
    homeHiveOfficialV1:false
   };
   campaign.christmasEncounterPrepVersion=1;
   localStorage.setItem(KEY,JSON.stringify(campaign));
   return {home,legacy,pcs:campaign.pcs,history:campaign.maps.history};
  });
  // No cloud keys and no production Supabase connection are used.
  await page.reload({waitUntil:'domcontentloaded'});
  const snapshot=await page.evaluate(()=>{
   const m=db.maps;
   return {home:m.scenes.find(x=>x.id==='evergarden-home-hive'),
     legacy:m.archivedScenes.find(x=>x.id==='old-tunnel'),
     active:m.active,selected:m.selected,fogTool:m.fogTool,viewMode:m.viewMode,
     showGrid:m.showGrid,history:m.history,pcs:db.pcs,
     markers:m.scenes.find(x=>x.id==='evergarden-home-hive').dmMarkers,
     persisted:JSON.parse(localStorage.getItem(KEY)).maps};
  });
  assert.equal(snapshot.home.name,sample.home.name,'Custom Home Hive name preserved');
  for(const k of ['cols','rows','asset','playerShared','tokens','revealed','fogWalls','customField','imageData'])
   assert.deepEqual(snapshot.home[k],sample.home[k],k+' preserved');
  assert.deepEqual(snapshot.home.dmMarkers.find(x=>x.id==='custom-mark'),sample.home.dmMarkers[0],'Custom marker preserved');
  assert.deepEqual(snapshot.legacy,sample.legacy,'Legacy map archived with all data unchanged');
  assert.equal(snapshot.active,'evergarden-home-hive');
  assert.equal(snapshot.selected,'hero-token');
  assert.equal(snapshot.fogTool,'paint');
  assert.equal(snapshot.showGrid,false);
  assert.deepEqual(snapshot.history,sample.history);
  assert.deepEqual(snapshot.pcs,sample.pcs);
  assert.deepEqual(snapshot.persisted.scenes.find(x=>x.id==='evergarden-home-hive').tokens,sample.home.tokens);
  assert.ok(snapshot.markers.some(x=>x.id.startsWith('caper-guide-')),'Existing DM suggestions seeded non-destructively');
  const written=await page.evaluate(()=>localStorage.getItem(KEY));
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>localStorage.getItem(KEY)),written,'Reload must not rewrite completed migration');
  assert.equal(await page.evaluate(()=>db.maps.archivedScenes.filter(x=>x.id==='old-tunnel').length),1,'No duplicate archive entries');

  // An existing customized Home Hive in the archive must be restored, not replaced.
  await page.evaluate(()=>{
   const copy=clone(db);
   const home=copy.maps.scenes.find(x=>x.id==='evergarden-home-hive');
   copy.maps.scenes=copy.maps.scenes.filter(x=>x.id!==home.id);
   copy.maps.archivedScenes.push(home);
   copy.maps.homeHiveOfficialV1=false;
   localStorage.setItem(KEY,JSON.stringify(copy));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal(await page.evaluate(()=>db.maps.scenes.find(x=>x.id==='evergarden-home-hive')?.name),'Customized Home Hive','Archived Home Hive restored');
  assert.equal(await page.evaluate(()=>db.maps.archivedScenes.filter(x=>x.id==='evergarden-home-hive').length),0,'Restored home is not duplicated in archive');

  // Simulate blocked localStorage during the complete one-time startup upgrade.
  const failContext=await browser.newContext();
  const failed=await failContext.newPage();
  failed.on('dialog',async d=>{await d.accept()});
  await failed.goto(base,{waitUntil:'domcontentloaded'});
  await failed.evaluate(()=>{
   const data=clone(db);
   data.christmasEncounterPrepVersion=1;
   data.maps.homeHiveOfficialV1=false;
   data.maps.christmasCaperMapsSeeded=false;
   data.maps.christmasFinalTwoMapsSeeded=false;
   localStorage.setItem(KEY,JSON.stringify(data));
  });
  await failed.addInitScript(()=>{
   const original=Storage.prototype.setItem;
   window.__blockMapWrites=true;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1'&&window.__blockMapWrites)throw new DOMException('Quota full','QuotaExceededError');
    return original.call(this,k,v);
   };
  });
  await failed.reload({waitUntil:'domcontentloaded'});
  await failed.locator('#campaign-save-warning').waitFor({state:'visible'});
  assert.equal(await failed.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).maps.homeHiveOfficialV1),false,'Failed migration must not overwrite stored source');
  assert.equal(await failed.evaluate(()=>db.maps.homeHiveOfficialV1),true,'Unsaved migrated state remains exportable in memory');
  const backupPromise=failed.waitForEvent('download');
  await failed.locator('#campaign-save-backup').click();
  const backup=await backupPromise;
  assert.ok(backup.suggestedFilename().endsWith('.json'));
  await failed.evaluate(()=>{window.__blockMapWrites=false});
  await failed.locator('#campaign-save-retry').click();
  await failed.locator('#campaign-save-warning').waitFor({state:'detached'});
  assert.equal(await failed.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).maps.homeHiveOfficialV1),true,'Retry saves entire migrated campaign');
  console.log('PASS Phase 3 custom maps, archive, fog, tokens, markers, reload idempotence and failed-save recovery');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

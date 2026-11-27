/* Mister Potts Guard playing cards and starting currency: synthetic browser QA only. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext();
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.dismiss());
 await page.route(/https?:\/\/[^/]+\.supabase\.co\//,r=>r.abort());
 try{
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   const potts={id:'qa-potts',name:'Mister Potts',species:'Beetlekin',class:'Paladin',
    background:'Guard',level:1,status:'Active',ac:18,hp:11,maxHp:11,
    notes:'Red Ant Sword, mohawk and fear of dry grass preserved'},
    other={id:'qa-newton',name:'Dr.Newton Sparknic',species:'Firefly Folk',class:'Ranger',
    background:'Guide',level:1,status:'Active',notes:'Other hero unchanged'};
   db.pcs=[potts,other];
   db.sheets={
    'qa-potts':{...defaultSheet(potts),inventory:POTTS_REVIEWED_INVENTORY,
     features:POTTS_REVIEWED_FEATURES,proficiencies:POTTS_REVIEWED_PROFICIENCIES,
     scores:{STR:17,DEX:8,CON:13,INT:10,WIS:13,CHA:14},spellPrepared:'Bless; Shield of Faith',
     attacks:'Red Ant Sword +5, shield AC18',skills:['Athletics','Perception','Insight','Persuasion']},
    'qa-newton':{...defaultSheet(other),inventory:'Newton Ranger equipment preserved'}
   };
   db.heroReadiness={'qa-potts':{build:true,scene:true,story:true,mechanics:true,resources:true}};
   db.christmasPrologueDraft={scenes:{'hero:qa-potts':{readAloud:'The Guardian and the Dry Grass preserved'}}};
   selectedSheetPC='qa-potts';
   window.confirm=()=>false;window.alert=()=>{};
   if(!save())throw Error('Synthetic fixture did not save');
   goto('sheet');
  });
  const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const before=await snapshot();
  assert.equal(await page.locator('#potts-equipment-apply').count(),1);
  assert.deepEqual(await snapshot(),before,'Preview never writes');
  await page.locator('#potts-equipment-apply').click();
  assert.deepEqual(await snapshot(),before,'Cancel preserves all data');
  await page.evaluate(()=>{db.sheets['qa-potts'].inventory+='\\nNew user note';render()});
  assert.equal(await page.locator('#potts-equipment-apply').count(),0,'Inventory drift hides action');
  assert.equal(await page.evaluate(()=>applyPottsEquipmentClarification()),false);
  await page.evaluate(()=>{
   db.sheets['qa-potts'].inventory=POTTS_REVIEWED_INVENTORY;
   db.sheets['qa-potts'].features+='\\nPlayer update';
   render();
  });
  assert.equal(await page.locator('#potts-equipment-apply').count(),0,'Features drift hides action');
  await page.evaluate(()=>{
   db.sheets['qa-potts'].features=POTTS_REVIEWED_FEATURES;
   db.sheets['qa-potts'].proficiencies+='\\nPlayer change';
   render();
  });
  assert.equal(await page.locator('#potts-equipment-apply').count(),0,'Proficiencies drift hides action');
  await page.evaluate(()=>{
   db.sheets['qa-potts'].proficiencies=POTTS_REVIEWED_PROFICIENCIES;
   render();window.confirm=()=>true;
  });
  assert.equal(await page.locator('#potts-equipment-apply').count(),1);
  await page.locator('#potts-equipment-apply').click();
  const after=await snapshot(),expected=structuredClone(before);
  for(const key of ['inventory','features','proficiencies'])
   expected.sheets['qa-potts'][key]=after.sheets['qa-potts'][key];
  assert.deepEqual(after,expected,'Exactly three approved text fields change');
  assert.match(after.sheets['qa-potts'].inventory,/Playing Card Set \(Guard gaming set, DM-approved\)/);
  assert.match(after.sheets['qa-potts'].inventory,/Total starting currency: 21 GP \(9 GP Paladin \+ 12 GP Guard\)/);
  assert.match(after.sheets['qa-potts'].inventory,/Chain Mail, Shield, Longsword, 6 Javelins/);
  assert.match(after.sheets['qa-potts'].features,/Playing Card Set \(confirmed Guard gaming set\)/);
  assert.match(after.sheets['qa-potts'].proficiencies,/Playing Card Set \(confirmed Guard gaming set proficiency\)/);
  assert.equal(after.sheets['qa-potts'].ac,18,'Armor class preserved');
  assert.equal(after.sheets['qa-newton'].inventory,'Newton Ranger equipment preserved');
  assert.equal(after.christmasPrologueDraft.scenes['hero:qa-potts'].readAloud,'The Guardian and the Dry Grass preserved');
  assert.equal(await page.locator('#potts-equipment-apply').count(),0,'Action not repeatable');
  assert.equal(await page.evaluate(()=>applyPottsEquipmentClarification()),false);
  assert.deepEqual(await snapshot(),after,'No repeat changes');
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snapshot(),after,'Persisted data survives reload');
  await page.evaluate(()=>{
   Object.assign(db.sheets['qa-potts'],{
    inventory:POTTS_REVIEWED_INVENTORY,
    features:POTTS_REVIEWED_FEATURES,
    proficiencies:POTTS_REVIEWED_PROFICIENCIES
   });
   if(!save())throw Error('Synthetic reset save failed');
   selectedSheetPC='qa-potts';goto('sheet');
   window.confirm=()=>true;window.alert=()=>{};
   window.__pottsSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__pottsSetItem.call(this,k,v);
   };
  });
  const preFailure=await snapshot(),stored=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  assert.equal(await page.locator('#potts-equipment-apply').count(),1);
  await page.locator('#potts-equipment-apply').click();
  assert.deepEqual(await snapshot(),preFailure,'Save failure restores all three fields');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),stored);
  await page.evaluate(()=>Storage.prototype.setItem=window.__pottsSetItem);
  assert.deepEqual(errors,[],'No unhandled browser errors');
  console.log('PASS Mister Potts Playing Card Set and 21 GP: consent, drift protection, exactly three-field change, other heroes/story, idempotence, reload, failed-storage rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

/* David's opt-in Rogue equipment reconciliation — isolated synthetic browser test.
   Never contacts authenticated Supabase or accesses any real family campaign. */
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
   const david={id:'qa-david',name:'David',species:'Mantisborn',class:'Rogue',background:'Wayfarer',level:1,status:'Active',notes:'PRESERVE DAVID HISTORY',hp:10,ac:14};
   const other={id:'qa-other',name:'Snoop Bugg',species:'Spiderkin',class:'Warlock',background:'Charlatan',level:1,status:'Active',notes:'PRESERVE OTHER HISTORY'};
   db.pcs=[david,other];
   db.sheets={
    'qa-david':{...defaultSheet(david),inventory:DAVID_EQUIPMENT_REVIEWED,languages:'Garden Tongue',features:'PRESERVE FEATURES',spellPrepared:''},
    'qa-other':{...defaultSheet(other),inventory:'PRESERVE OTHER EQUIPMENT'}
   };
   db.heroReadiness={'qa-david':{build:true,mechanics:true,resources:true,story:true,scene:true}};
   selectedSheetPC='qa-david';
   window.confirm=()=>false;
   window.alert=()=>{};
   if(!save())throw Error('Failed to save synthetic baseline');
   goto('sheet');
  });
  const snap=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const before=await snap();
  assert.equal(await page.locator('#david-equipment-apply').count(),1);
  assert.match(await page.locator('#david-equipment-review').innerText(),/24 GP/);
  assert.deepEqual(await snap(),before,'Preview must be read-only');
  await page.locator('#david-equipment-apply').click();
  assert.deepEqual(await snap(),before,'No changes without confirmation');
  await page.evaluate(()=>{db.sheets['qa-david'].inventory+='\\nPersonal item added later';render()});
  assert.equal(await page.locator('#david-equipment-apply').count(),0,'Manual inventory drift hides action');
  assert.equal(await page.evaluate(()=>applyDavidEquipmentReconciliation()),false);
  assert.match(await page.evaluate(()=>db.sheets['qa-david'].inventory),/Personal item added later/);
  await page.evaluate(()=>{db.sheets['qa-david'].inventory=DAVID_EQUIPMENT_REVIEWED;render();window.confirm=()=>true});
  assert.equal(await page.locator('#david-equipment-apply').count(),1);
  await page.locator('#david-equipment-apply').click();
  const after=await snap();
  const expected=structuredClone(before);
  expected.sheets['qa-david'].inventory=after.sheets['qa-david'].inventory;
  assert.deepEqual(after,expected,'Only David inventory text may change');
  assert.match(after.sheets['qa-david'].inventory,/Total starting currency: 24 GP/);
  assert.match(after.sheets['qa-david'].inventory,/Gaming Set \(type not yet chosen\)/);
  assert.match(after.sheets['qa-david'].inventory,/additional language.*awaits/);
  assert.match(after.sheets['qa-david'].inventory,/Spear not granted as starting equipment/);
  assert.equal(after.sheets['qa-david'].languages,'Garden Tongue','No extra language selected');
  assert.equal(after.sheets['qa-other'].inventory,'PRESERVE OTHER EQUIPMENT');
  assert.equal(await page.locator('#david-equipment-apply').count(),0,'No double application');
  assert.equal(await page.evaluate(()=>applyDavidEquipmentReconciliation()),false);
  assert.deepEqual(await snap(),after);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1'))),after);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snap(),after,'Inventory persists on reload');
  // Failure path: preserve in-memory and local campaign on rejected storage write.
  await page.evaluate(()=>{
   db.sheets['qa-david'].inventory=DAVID_EQUIPMENT_REVIEWED;
   if(!save())throw Error('Failed to reset synthetic fixture');
   selectedSheetPC='qa-david';goto('sheet');
   window.confirm=()=>true;
   window.alert=()=>{};
   window.__davidSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__davidSetItem.call(this,k,v);
   };
  });
  const beforeFailure=await snap();
  const persisted=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  await page.locator('#david-equipment-apply').click();
  assert.deepEqual(await snap(),beforeFailure,'Failed save rolls back all in-memory changes');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),persisted,'Failed save keeps persisted data');
  await page.evaluate(()=>Storage.prototype.setItem=window.__davidSetItem);
  assert.deepEqual(errors,[],'No unhandled script exceptions');
  console.log('PASS David guarded option A 24 GP, pending gaming set/language/spear, consent, drift protection, only-inventory change, idempotence, reload, failed-save rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

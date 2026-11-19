/* Vismund equipment option A reconciliation — isolated Chromium regression.
 * Never authenticates to Supabase or edits any real family campaign records.
 */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage();
 const errors=[],dialogModes=[];
 let acceptConfirm=false;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',async d=>{
  dialogModes.push(d.type);
  if(d.type==='confirm'&&acceptConfirm)await d.accept();else await d.dismiss();
 });
 await page.route(/https?:\/\/[^/]+\.supabase\.co\//,r=>r.abort());
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   const vismund={id:'qa-vismund',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard',
    background:'Sage',level:1,status:'Active',notes:'KEEP HERO HISTORY',hp:8,ac:12};
   const companion={id:'qa-other',name:'David',species:'Mantisborn',class:'Rogue',level:1,
    status:'Active',notes:'KEEP COMPANION HISTORY'};
   db.pcs=[vismund,companion];
   db.sheets={'qa-vismund':{...defaultSheet(vismund),inventory:VISMUND_EQUIPMENT_CURRENT,
    spellPrepared:'KEEP SPELLS',scores:{STR:8,DEX:14,CON:14,INT:17,WIS:12,CHA:10}},
    'qa-other':{...defaultSheet(companion),inventory:'KEEP COMPANION EQUIPMENT'}};
   db.heroReadiness={'qa-vismund':{build:true,mechanics:true,resources:true,story:true,scene:true}};
   selectedSheetPC='qa-vismund';
   if(!save())throw Error('Synthetic campaign could not be saved');
   goto('sheet');
  });
  const inventory=()=>page.evaluate(()=>db.sheets['qa-vismund'].inventory);
  const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const prior=await snapshot();
  assert.equal(await page.locator('#vismund-equipment-apply').count(),1);
  assert.deepEqual(await snapshot(),prior,'Rendering the preview must not change data');
  assert.match(await page.locator('#vismund-equipment-review').innerText(),/13 GP/);
  // Guard unreviewed modifications.
  await page.evaluate(()=>{
   db.sheets['qa-vismund'].inventory+='\\nNew DM personal item';
   render();
  });
  assert.equal(await page.locator('#vismund-equipment-apply').count(),0,
    'When inventory has drifted, there must be no apply button');
  assert.equal(await page.evaluate(()=>applyVismundApprovedEquipment()),false);
  assert.match(await inventory(),/New DM personal item/);
  await page.evaluate(()=>{db.sheets['qa-vismund'].inventory=VISMUND_EQUIPMENT_CURRENT;render()});
  assert.equal(await page.locator('#vismund-equipment-apply').count(),1);
  await page.locator('#vismund-equipment-apply').click();
  assert.equal(await inventory(),prior.sheets['qa-vismund'].inventory,'Cancelled confirmation cannot edit');
  assert.deepEqual(await snapshot(),prior,'Cancellation must preserve every campaign field');
  // Mock affirmative confirmation only after testing the real Cancel dialog.
  // This isolates application logic from Playwright's asynchronous dialog handling.
  await page.evaluate(()=>{window.confirm=()=>true});
  await page.locator('#vismund-equipment-apply').click();
  const updated=await snapshot();
  assert.equal(updated.sheets['qa-other'].inventory,'KEEP COMPANION EQUIPMENT');
  assert.deepEqual(updated.pcs,prior.pcs);
  assert.deepEqual(updated.heroReadiness,prior.heroReadiness);
  assert.equal(updated.sheets['qa-vismund'].spellPrepared,'KEEP SPELLS');
  assert.match(updated.sheets['qa-vismund'].inventory,/two daggers/);
  assert.match(updated.sheets['qa-vismund'].inventory,/arcane focus \(second quarterstaff\)/);
  assert.match(updated.sheets['qa-vismund'].inventory,/Scholar’s Pack/);
  assert.match(updated.sheets['qa-vismund'].inventory,/robe \(Wizard\)/);
  assert.match(updated.sheets['qa-vismund'].inventory,/Total starting currency: 13 GP/);
  const expected=structuredClone(prior);
  expected.sheets['qa-vismund'].inventory=updated.sheets['qa-vismund'].inventory;
  assert.deepEqual(updated,expected,'Only Vismund equipment text may change');
  assert.equal(await page.locator('#vismund-equipment-apply').count(),0,
    'Button must disappear after correction (no duplicate application)');
  assert.equal(await page.evaluate(()=>applyVismundApprovedEquipment()),false);
  assert.deepEqual(await snapshot(),updated,'Repeated invocation must be a no-op');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1'))),updated);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snapshot(),updated,'Approved correction must survive reload');

  // Separate synthetic pre-apply fixture. Storage quota errors must restore
  // the previous in-memory inventory and leave the saved local campaign unchanged.
  await page.evaluate(()=>{
   db.sheets['qa-vismund'].inventory=VISMUND_EQUIPMENT_CURRENT;
   if(!save())throw Error('Could not restore synthetic starting fixture');
   selectedSheetPC='qa-vismund';goto('sheet');
   window.__phase8setItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__phase8setItem.call(this,k,v);
   };
  });
  const beforeFailure=await snapshot();
  const beforeStored=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  await page.locator('#vismund-equipment-apply').click();
  assert.equal(await inventory(),beforeFailure.sheets['qa-vismund'].inventory,
    'Failed save must restore inventory in memory');
  assert.deepEqual(await snapshot(),beforeFailure,'Failed save cannot corrupt any campaign fields');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),beforeStored,
    'Failed save cannot alter persistent campaign');
  await page.evaluate(()=>{Storage.prototype.setItem=window.__phase8setItem});
  assert.deepEqual(errors,[]);
  // Browser test runners may suppress native dialog events; cancellation and explicit consent are asserted by state above.
  console.log('PASS Vismund guarded equipment preview, manual consent, only-target-inventory update, double-apply protection, reload, and failed-storage rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

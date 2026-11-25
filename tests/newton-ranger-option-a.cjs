/* Newton Ranger option A — browser QA with synthetic campaign, never live cloud. */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext(),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.dismiss());
 await page.route(/https?:\/\/[^/]+\.supabase\.co\//,r=>r.abort());
 try{
  await page.goto(process.env.BASE_URL||'http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   const newton={id:'qa-newton',name:'Dr.Newton Sparknic',species:'Firefly Folk',class:'Ranger',
    background:'Guide',level:1,ac:15,hp:12,maxHp:12,status:'Active',notes:'Newton backstory preserved'};
   const other={id:'qa-snoop',name:'Snoop Bugg',species:'Spiderkin',class:'Warlock',
    background:'Charlatan',level:1,ac:13,hp:10,status:'Active',notes:'Other hero preserved'};
   db.pcs=[newton,other];
   db.sheets={
    'qa-newton':{...defaultSheet(newton),
     inventory:NEWTON_RANGER_REVIEWED_INVENTORY,
     attacks:NEWTON_RANGER_REVIEWED_ATTACKS,
     scores:{STR:8,DEX:17,CON:14,INT:12,WIS:14,CHA:10},
     ac:15,skills:['Stealth','Survival','Animal Handling','Perception','Nature'],
     features:'Preserve features and pet descriptions',
     spellPrepared:'Preserve Hunter Mark and Magic Initiate',
     languages:'Garden Tongue'},
    'qa-snoop':{...defaultSheet(other),inventory:'Other hero items untouched'}
   };
   db.heroReadiness={'qa-newton':{build:true,scene:true,story:true,mechanics:true,resources:true}};
   selectedSheetPC='qa-newton';
   window.confirm=()=>false;window.alert=()=>{};
   if(!save())throw Error('Synthetic baseline failed to save');
   goto('sheet');
  });
  const snap=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const before=await snap();
  assert.equal(await page.locator('#newton-ranger-equipment-apply').count(),1);
  assert.deepEqual(await snap(),before,'Read-only preview');
  await page.locator('#newton-ranger-equipment-apply').click();
  assert.deepEqual(await snap(),before,'Cancelled action must be read-only');
  await page.evaluate(()=>{db.sheets['qa-newton'].inventory+='\\nLater player change';render()});
  assert.equal(await page.locator('#newton-ranger-equipment-apply').count(),0,'Inventory drift must hide action');
  assert.equal(await page.evaluate(()=>applyNewtonRangerEquipment()),false);
  await page.evaluate(()=>{db.sheets['qa-newton'].inventory=NEWTON_RANGER_REVIEWED_INVENTORY;db.sheets['qa-newton'].attacks+='\\nLater attack';render()});
  assert.equal(await page.locator('#newton-ranger-equipment-apply').count(),0,'Attacks drift must hide action');
  await page.evaluate(()=>{
   db.sheets['qa-newton'].attacks=NEWTON_RANGER_REVIEWED_ATTACKS;
   db.sheets['qa-newton'].ac=16;render();
  });
  assert.equal(await page.locator('#newton-ranger-equipment-apply').count(),0,'AC drift must hide action');
  await page.evaluate(()=>{db.sheets['qa-newton'].ac=15;render();window.confirm=()=>true});
  assert.equal(await page.locator('#newton-ranger-equipment-apply').count(),1);
  await page.locator('#newton-ranger-equipment-apply').click();
  const after=await snap(),expected=structuredClone(before);
  expected.sheets['qa-newton'].inventory=after.sheets['qa-newton'].inventory;
  expected.sheets['qa-newton'].attacks=after.sheets['qa-newton'].attacks;
  assert.deepEqual(after,expected,'Only Newton inventory and attack label may change');
  assert.match(after.sheets['qa-newton'].inventory,/Studded Leather Armor, Scimitar, Shortsword, Longbow/);
  assert.match(after.sheets['qa-newton'].inventory,/Total starting currency: 10 GP \(3 GP Guide \+ 7 GP Ranger\)/);
  assert.match(after.sheets['qa-newton'].inventory,/40 arrows and 2 quivers total/);
  assert.match(after.sheets['qa-newton'].inventory,/AC 15 \(12 \+ Dexterity modifier 3\)/);
  assert.match(after.sheets['qa-newton'].inventory,/Scarlet Dwarf Dragonfly and Photuris Mysticalampas Firefly/);
  assert.match(after.sheets['qa-newton'].attacks,/Longbow \(Ranger option A\): \+5 to hit/);
  assert.equal(after.sheets['qa-newton'].ac,15);
  assert.equal(after.pcs[0].ac,15);
  assert.equal(after.sheets['qa-snoop'].inventory,'Other hero items untouched');
  assert.equal(await page.locator('#newton-ranger-equipment-apply').count(),0,'Idempotent');
  assert.equal(await page.evaluate(()=>applyNewtonRangerEquipment()),false);
  assert.deepEqual(await snap(),after);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snap(),after,'Reload persistence');

  // Force local persistence failure; every modified field must be restored.
  await page.evaluate(()=>{
   db.sheets['qa-newton'].inventory=NEWTON_RANGER_REVIEWED_INVENTORY;
   db.sheets['qa-newton'].attacks=NEWTON_RANGER_REVIEWED_ATTACKS;
   if(!save())throw Error('Synthetic fixture reset failed');
   selectedSheetPC='qa-newton';goto('sheet');
   window.confirm=()=>true;window.alert=()=>{};
   window.__newtonSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__newtonSetItem.call(this,k,v);
   };
  });
  const prior=await snap(),stored=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  await page.locator('#newton-ranger-equipment-apply').click();
  assert.deepEqual(await snap(),prior,'Save failure restores both text fields');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),stored);
  await page.evaluate(()=>Storage.prototype.setItem=window.__newtonSetItem);
  assert.deepEqual(errors,[],'No unhandled browser errors');
  console.log('PASS Newton Ranger Option A and Guide option A: approval, 10 GP, 40 arrows, 2 quivers, AC 15, drift protection, unrelated heroes, reload and failed-storage rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

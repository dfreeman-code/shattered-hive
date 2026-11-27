/* Jawshua approved Soldier Dice Set / 18 GP: isolated synthetic browser coverage. */
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
   const hero={id:'qa-jawshua',name:'Jawshua Red Hawk',species:'Antfolk',
    class:'Fighter',background:'Soldier',level:1,ac:17,hp:12,maxHp:12,
    status:'Active',notes:'Trap Jaw Ant fears water, original character notes'};
   const other={id:'qa-potts',name:'Mister Potts',species:'Beetlekin',
    class:'Paladin',background:'Guard',level:1,status:'Active'};
   db.pcs=[hero,other];
   db.sheets={'qa-jawshua':{...defaultSheet(hero),
    inventory:JAWSHUA_REVIEWED_INVENTORY,
    features:JAWSHUA_REVIEWED_FEATURES,
    proficiencies:JAWSHUA_REVIEWED_PROFICIENCIES,
    scores:{STR:17,DEX:13,CON:15,INT:8,WIS:12,CHA:10},
    attacks:'Greatsword, Flail and Javelin attacks preserved',
    skills:['Athletics','Intimidation','Perception','Insight','Survival']},
    'qa-potts':{...defaultSheet(other),inventory:'Potts inventory preserved'}};
   db.heroReadiness={'qa-jawshua':{build:true,scene:true,story:true,mechanics:true,resources:true}};
   db.christmasPrologueDraft={scenes:{'hero:qa-jawshua':{readAloud:'The Crossing of Little Giants is unchanged'}}};
   selectedSheetPC='qa-jawshua';
   window.confirm=()=>false;window.alert=()=>{};
   if(!save())throw Error('Synthetic baseline save failed');
   goto('sheet');
  });
  const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const before=await snapshot();
  assert.equal(await page.locator('#jawshua-equipment-apply').count(),1);
  assert.deepEqual(await snapshot(),before,'Preview is read-only');
  await page.locator('#jawshua-equipment-apply').click();
  assert.deepEqual(await snapshot(),before,'Cancellation makes no changes');
  await page.evaluate(()=>{db.sheets['qa-jawshua'].inventory+='\\nNew note';render()});
  assert.equal(await page.locator('#jawshua-equipment-apply').count(),0,'Inventory drift hides action');
  assert.equal(await page.evaluate(()=>applyJawshuaEquipment()),false);
  await page.evaluate(()=>{
   db.sheets['qa-jawshua'].inventory=JAWSHUA_REVIEWED_INVENTORY;
   db.sheets['qa-jawshua'].features+='\\nChanged later';render();
  });
  assert.equal(await page.locator('#jawshua-equipment-apply').count(),0,'Features drift hides action');
  await page.evaluate(()=>{
   db.sheets['qa-jawshua'].features=JAWSHUA_REVIEWED_FEATURES;
   db.sheets['qa-jawshua'].proficiencies+='\\nEdited later';render();
  });
  assert.equal(await page.locator('#jawshua-equipment-apply').count(),0,'Proficiencies drift hides action');
  await page.evaluate(()=>{
   db.sheets['qa-jawshua'].proficiencies=JAWSHUA_REVIEWED_PROFICIENCIES;
   window.confirm=()=>true;render();
  });
  assert.equal(await page.locator('#jawshua-equipment-apply').count(),1);
  await page.locator('#jawshua-equipment-apply').click();
  const after=await snapshot(),expected=structuredClone(before);
  for(const field of ['inventory','features','proficiencies'])
    expected.sheets['qa-jawshua'][field]=after.sheets['qa-jawshua'][field];
  assert.deepEqual(after,expected,'Only the three explicitly reviewed hero text fields change');
  assert.match(after.sheets['qa-jawshua'].inventory,/Dice Set \(DM-approved Soldier gaming set\)/);
  assert.match(after.sheets['qa-jawshua'].inventory,/Total starting currency: 18 GP \(4 GP Fighter \+ 14 GP Soldier\)/);
  assert.match(after.sheets['qa-jawshua'].features,/Dice Set \(confirmed Soldier gaming set\)/);
  assert.match(after.sheets['qa-jawshua'].proficiencies,/gaming set proficiency: Dice Set/);
  assert.match(after.sheets['qa-jawshua'].inventory,/Greatsword, Flail, 8 Javelins/);
  assert.equal(after.sheets['qa-potts'].inventory,'Potts inventory preserved');
  assert.equal(after.christmasPrologueDraft.scenes['hero:qa-jawshua'].readAloud,'The Crossing of Little Giants is unchanged');
  assert.equal(await page.locator('#jawshua-equipment-apply').count(),0);
  assert.equal(await page.evaluate(()=>applyJawshuaEquipment()),false,'Replay guarded');
  assert.deepEqual(await snapshot(),after);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snapshot(),after,'Persisted values remain after reload');
  await page.evaluate(()=>{
   Object.assign(db.sheets['qa-jawshua'],{
    inventory:JAWSHUA_REVIEWED_INVENTORY,
    features:JAWSHUA_REVIEWED_FEATURES,
    proficiencies:JAWSHUA_REVIEWED_PROFICIENCIES
   });
   if(!save())throw Error('Failed synthetic reset');
   selectedSheetPC='qa-jawshua';goto('sheet');
   window.confirm=()=>true;window.alert=()=>{};
   window.__jawshuaSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__jawshuaSetItem.call(this,k,v);
   };
  });
  const beforeFailure=await snapshot(),persisted=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  await page.locator('#jawshua-equipment-apply').click();
  assert.deepEqual(await snapshot(),beforeFailure,'Save error restores all original text');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),persisted);
  await page.evaluate(()=>Storage.prototype.setItem=window.__jawshuaSetItem);
  assert.deepEqual(errors,[],'No browser exceptions');
  console.log('PASS Jawshua Dice Set and 18 GP: read-only preview, consent, field drift guards, only-three-field update, unrelated hero/story protection, idempotence, reload, failed-storage rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

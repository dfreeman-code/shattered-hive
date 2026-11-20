/* David's final approved options. Runs only against synthetic local browser campaign records. */
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
   const david={id:'qa-david',name:'David',species:'Mantisborn',class:'Rogue',
    background:'Wayfarer',level:1,status:'Active',hp:10,maxHp:10,ac:14,notes:'David history remains'},
    other={id:'qa-other',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard',level:1,
    background:'Sage',status:'Active',notes:'Other hero history remains'};
   db.pcs=[david,other];
   db.sheets={'qa-david':{...defaultSheet(david),...DAVID_FINAL_REVIEWED_FIELDS,
    scores:{STR:8,DEX:17,CON:14,INT:12,WIS:14,CHA:10},skills:['Stealth','Investigation'],
    expertise:['Stealth','Investigation'],spellPrepared:'KEEP SPELL NOTES'},
    'qa-other':{...defaultSheet(other),inventory:'Other equipment unchanged'}};
   db.heroReadiness={'qa-david':{build:true,scene:true,story:true,mechanics:true,resources:true}};
   db.christmasPrologueDraft={scenes:{'qa-david':{readAloud:'Keep solo scene'}}};
   selectedSheetPC='qa-david';
   window.confirm=()=>false;window.alert=()=>{};
   if(!save())throw Error('Synthetic campaign baseline save failed');
   goto('sheet');
  });
  const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const before=await snapshot();
  assert.equal(await page.locator('#david-final-choices-apply').count(),1);
  assert.deepEqual(await snapshot(),before,'Preview is read-only');
  await page.locator('#david-final-choices-apply').click();
  assert.deepEqual(await snapshot(),before,'Cancel protects all data');
  // Different identity or previously edited field prevents the action.
  await page.evaluate(()=>{db.sheets['qa-david'].languages='Garden Tongue, Elvish';render()});
  assert.equal(await page.locator('#david-final-choices-apply').count(),0);
  assert.equal(await page.evaluate(()=>applyDavidFinalChoices()),false);
  assert.equal(await page.evaluate(()=>db.sheets['qa-david'].languages),'Garden Tongue, Elvish');
  await page.evaluate(()=>{db.sheets['qa-david'].languages='Garden Tongue';render();});
  assert.equal(await page.locator('#david-final-choices-apply').count(),1);
  // A confirmation changes only the five anticipated text fields.
  await page.evaluate(()=>window.confirm=()=>true);
  await page.locator('#david-final-choices-apply').click();
  const after=await snapshot();
  const expected=structuredClone(before);
  for(const key of ['inventory','languages','features','proficiencies','attacks'])
   expected.sheets['qa-david'][key]=after.sheets['qa-david'][key];
  assert.deepEqual(after,expected,'All other character/campaign fields must remain unchanged');
  assert.match(after.sheets['qa-david'].inventory,/Gaming Set \(Dice Set\)/);
  assert.match(after.sheets['qa-david'].inventory,/DM-approved spear:/);
  assert.match(after.sheets['qa-david'].inventory,/24 GP \(8 GP Rogue \+ 16 GP Wayfarer\)/);
  assert.match(after.sheets['qa-david'].languages,/Garden Tongue, Gnomish/);
  assert.match(after.sheets['qa-david'].features,/Gnomish, approved/);
  assert.match(after.sheets['qa-david'].proficiencies,/Gnomish \(approved\)/);
  assert.match(after.sheets['qa-david'].attacks,/Spear \(DM-approved starting equipment\)/);
  assert.match(after.sheets['qa-david'].attacks,/not eligible for Sneak Attack/);
  assert.equal(await page.locator('#david-final-choices-apply').count(),0,
   'No second addition once applied');
  assert.equal(await page.evaluate(()=>applyDavidFinalChoices()),false);
  assert.deepEqual(await snapshot(),after);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snapshot(),after,'State persists after refresh');

  // Storage failures must rollback every field and leave local campaign unchanged.
  await page.evaluate(()=>{
   Object.assign(db.sheets['qa-david'],DAVID_FINAL_REVIEWED_FIELDS);
   if(!save())throw Error('Synthetic rollback scenario seed failed');
   selectedSheetPC='qa-david';goto('sheet');
   window.confirm=()=>true;window.alert=()=>{};
   window.__davidSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__davidSetItem.call(this,k,v);
   };
  });
  const prior=await snapshot(),stored=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  assert.equal(await page.locator('#david-final-choices-apply').count(),1);
  await page.locator('#david-final-choices-apply').click();
  assert.deepEqual(await snapshot(),prior,'Failed storage write restores five source fields');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),stored);
  await page.evaluate(()=>Storage.prototype.setItem=window.__davidSetItem);
  assert.deepEqual(errors,[]);
  console.log('PASS David final choices: opt-in Spear Dice Set Gnomish, exact-match guard, cancel/no-op, five-field-only, other heroes preserved, 24 GP unchanged, reload, storage rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

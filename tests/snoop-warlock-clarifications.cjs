/* Opt-in Snoop record clarifications, isolated with synthetic local campaign only. */
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
   const snoop={id:'qa-snoop',name:'Snoop Bugg',species:'Spiderkin',class:'Warlock',background:'Charlatan',level:1,status:'Active',hp:10,maxHp:10,ac:13,notes:'Keep Snoop backstory'};
   const other={id:'qa-david',name:'David',species:'Mantisborn',class:'Rogue',background:'Wayfarer',level:1,status:'Active',notes:'Keep David backstory'};
   db.pcs=[snoop,other];
   db.sheets={'qa-snoop':{...defaultSheet(snoop),inventory:SNOOP_REVIEWED_INVENTORY,
    features:SNOOP_REVIEWED_FEATURES,skills:[...SNOOP_REVIEWED_SKILLS],
    spellPrepared:'Keep Snoop approved spells',languages:'Garden Tongue',attacks:'Keep Snoop pact scimitar'},
    'qa-david':{...defaultSheet(other),inventory:'Keep David equipment'}};
   db.heroReadiness={'qa-snoop':{build:true,scene:true,story:true,mechanics:true,resources:true}};
   selectedSheetPC='qa-snoop';
   window.confirm=()=>false;window.alert=()=>{};
   if(!save())throw Error('Failed synthetic fixture baseline save');
   goto('sheet');
  });
  const snapshot=()=>page.evaluate(()=>JSON.parse(JSON.stringify(db)));
  const before=await snapshot();
  assert.equal(await page.locator('#snoop-clarifications-apply').count(),1);
  assert.deepEqual(await snapshot(),before,'Preview must not edit data');
  await page.locator('#snoop-clarifications-apply').click();
  assert.deepEqual(await snapshot(),before,'Cancellation must be read-only');
  await page.evaluate(()=>{db.sheets['qa-snoop'].features+='\\nUnrelated edits';render()});
  assert.equal(await page.locator('#snoop-clarifications-apply').count(),0,'Drift hides action');
  assert.equal(await page.evaluate(()=>applySnoopClarifications()),false);
  await page.evaluate(()=>{db.sheets['qa-snoop'].features=SNOOP_REVIEWED_FEATURES;db.sheets['qa-snoop'].skills=[...SNOOP_REVIEWED_SKILLS,'Religion'];render()});
  assert.equal(await page.locator('#snoop-clarifications-apply').count(),0,'Skills drift hides action');
  await page.evaluate(()=>{db.sheets['qa-snoop'].skills=[...SNOOP_REVIEWED_SKILLS];render();window.confirm=()=>true});
  assert.equal(await page.locator('#snoop-clarifications-apply').count(),1);
  await page.locator('#snoop-clarifications-apply').click();
  const after=await snapshot(),expected=structuredClone(before);
  expected.sheets['qa-snoop'].inventory=after.sheets['qa-snoop'].inventory;
  expected.sheets['qa-snoop'].features=after.sheets['qa-snoop'].features;
  assert.deepEqual(after,expected,'Exactly two Snoop text fields may change');
  assert.match(after.sheets['qa-snoop'].inventory,/Total starting currency: 30 GP \(15 GP Warlock \+ 15 GP Charlatan\)/);
  assert.match(after.sheets['qa-snoop'].features,/Skilled origin feat \(confirmed choices\): Athletics, Perception and Stealth/);
  assert.deepEqual(after.sheets['qa-snoop'].skills,SNOOP_REVIEWED_SKILLS_PLACEHOLDER(), 'Skills unchanged');
  assert.equal(after.sheets['qa-david'].inventory,'Keep David equipment');
  assert.equal(await page.locator('#snoop-clarifications-apply').count(),0,'Cannot double-apply');
  assert.equal(await page.evaluate(()=>applySnoopClarifications()),false);
  assert.deepEqual(await snapshot(),after);
  await page.reload({waitUntil:'domcontentloaded'});
  assert.deepEqual(await snapshot(),after,'Persisted data unchanged on reload');
  await page.evaluate(()=>{
   db.sheets['qa-snoop'].inventory=SNOOP_REVIEWED_INVENTORY;
   db.sheets['qa-snoop'].features=SNOOP_REVIEWED_FEATURES;
   if(!save())throw Error('Failed to reset synthetic fixture');
   selectedSheetPC='qa-snoop';goto('sheet');
   window.confirm=()=>true;window.alert=()=>{};
   window.__snoopSetItem=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){
    if(k==='shattered-hive-v1')throw new DOMException('Quota exceeded','QuotaExceededError');
    return window.__snoopSetItem.call(this,k,v);
   };
  });
  const beforeFailure=await snapshot(),persisted=await page.evaluate(()=>localStorage.getItem('shattered-hive-v1'));
  await page.locator('#snoop-clarifications-apply').click();
  assert.deepEqual(await snapshot(),beforeFailure,'Failed save rolls both changes back');
  assert.equal(await page.evaluate(()=>localStorage.getItem('shattered-hive-v1')),persisted);
  await page.evaluate(()=>Storage.prototype.setItem=window.__snoopSetItem);
  assert.deepEqual(errors,[]);
  console.log('PASS Snoop 30 GP and confirmed Skilled choices: protected consent, drift guard, exactly-two-field change, unrelated-data preservation, idempotence, reload, failed-save rollback');
 }finally{await context.close();await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
function SNOOP_REVIEWED_SKILLS_PLACEHOLDER(){
 return ['Deception','Sleight of Hand','Arcana','Intimidation','Athletics','Perception','Stealth'];
}

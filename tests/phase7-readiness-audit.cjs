/* Phase 7 final readiness inventory: synthetic browser data only.
 * Never authenticates to Supabase, never opens the user's private campaign.
 */
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext();
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/https?:\/\/[^/]+\.supabase\.co\//,route=>route.abort());
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>{
   const species=['Beetlekin','Antfolk','Mantisborn','Mothkin','Spiderkin','Firefly Folk'];
   db.pcs=species.map((s,i)=>({id:'p7-hero-'+i,name:'Phase7 Hero '+(i+1),
    species:s,class:['Paladin','Fighter','Rogue','Bard','Wizard','Ranger'][i],
    level:1,background:'Sage',hp:10,maxHp:10,ac:13,status:'Active'}));
   db.sheets={};
   db.heroReadiness={};
   db.christmasPrologueDraft={scenes:{}};
   db.adventureScriptDraft={adventureId:'vesper-adventure-1',scenes:{}};
   for(let i=0;i<6;i++){
    const id='p7-hero-'+i;
    db.sheets[id]={scores:{STR:12,DEX:13,CON:14,INT:15,WIS:11,CHA:10},attacks:'Staff',spellPrepared:''};
    db.heroReadiness[id]={build:true,mechanics:true,resources:true,story:true,scene:true};
    db.christmasPrologueDraft.scenes['hero:'+id]={readAloud:'A personal invitation'};
   }
   ADVENTURE_ONE_SCENES.forEach((title,i)=>{
    const fields={};ADVENTURE_FIELDS.forEach(k=>fields[k]='QA approved draft content');
    db.adventureScriptDraft.scenes[adventureSceneId(i)]=fields;
   });
   for(const prep of CHRISTMAS_PREP_ENCOUNTERS){
    let record=db.encounters.find(e=>e.id===prep.id);
    if(!record){record={id:prep.id,name:prep.name||prep.id};db.encounters.push(record)}
    record.notes='Phase 7 prepared encounter';
   }
   db.campaign.session=0;
   const first=db.sessions.find(x=>x.id==='vesper-session-1');
   if(first)first.status='Planned';
   if(!save())throw Error('Fixture save failed');
  });
  let before=await page.evaluate(()=>JSON.stringify(db));
  let audit=await page.evaluate(()=>phase7ReadinessFacts());
  assert.equal(audit.partyCount,6);
  assert.equal(audit.heroes.length,6);
  assert.ok(audit.heroes.every(h=>h.missing.length===0));
  assert.equal(audit.introCount,6);
  assert.ok(audit.script.every(s=>s.filled===9));
  assert.ok(audit.script.filter(s=>s.mapId).every(s=>s.mapFound));
  assert.ok(audit.encounters.every(e=>e.present&&e.details));
  assert.ok(audit.unplayed);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'Audit function must be strictly read only');
  await page.evaluate(()=>goto('command'));
  const panel=page.locator('#phase7-readiness');
  await panel.waitFor({state:'visible'});
  assert.match(await panel.innerText(),/0 items to review/);
  assert.equal(await panel.locator('[data-phase7-hero]').count(),6);
  // Command Center navigation may initialize existing derived UI state.\n  // Hold that constant, then verify the new audit itself is strictly read-only.\n  const afterNavigation=await page.evaluate(()=>JSON.stringify(db));\n  await page.evaluate(()=>phase7ReadinessFacts());\n  assert.equal(await page.evaluate(()=>JSON.stringify(db)),afterNavigation,'Readiness inventory cannot change loaded campaign');

  // Introduce real preparation gaps without changing session outcomes.
  await page.evaluate(()=>{
   db.pcs[0].class='Unassigned';
   db.pcs[0].background='';
   delete db.sheets['p7-hero-0'];
   delete db.christmasPrologueDraft.scenes['hero:p7-hero-0'];
   db.heroReadiness['p7-hero-0'].scene=false;
   db.adventureScriptDraft.scenes[adventureSceneId(0)].checks='';
   const missing=db.encounters.find(e=>e.id===CHRISTMAS_PREP_ENCOUNTERS[0].id);
   db.encounters=db.encounters.filter(e=>e!==missing);
   render();
  });
  before=await page.evaluate(()=>JSON.stringify(db));
  audit=await page.evaluate(()=>phase7ReadinessFacts());
  assert.ok(audit.heroes[0].missing.includes('Class or background not recorded'));
  assert.ok(audit.heroes[0].missing.includes('Ability scores not entered'));
  assert.ok(audit.heroes[0].missing.includes('Personal introduction not saved'));
  assert.ok(audit.heroes[0].missing.includes('DM review acknowledgements incomplete'));
  assert.equal(audit.script[0].filled,8);
  assert.equal(audit.encounters[0].present,false);
  assert.equal(audit.heroes.length,6);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before,'Incomplete audit must not repair or change data');
  assert.match(await panel.innerText(),/items to review/);
  assert.match(await panel.innerText(),/Active heroes:\s*6\/6/);
  await panel.getByText('Review each hero').click();
  assert.match(await panel.innerText(),/Phase7 Hero 1/);
  assert.match(await panel.innerText(),/Class or background not recorded/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.evaluate(()=>goto('command'));
  assert.ok(await page.locator('#phase7-readiness').count());
  assert.deepEqual(errors,[]);
  console.log('PASS Phase 7 read-only live-data inventory: six PCs, sheets, prologues, script sections, map links, encounter gaps, session status, no mutations, UI and reload');
  await context.close();
 }finally{await browser.close()}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

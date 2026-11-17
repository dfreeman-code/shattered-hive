const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<50;i++){try{await new Promise((ok,bad)=>http.get('http://127.0.0.1:8792/',r=>{r.resume();r.statusCode===200?ok():bad(Error('HTTP'))}).on('error',bad));return}catch{await new Promise(r=>setTimeout(r,200))}}throw Error('Server did not start')}
async function until(fn){for(let i=0;i<55;i++){if(await fn())return;await new Promise(r=>setTimeout(r,160))}throw Error('Live display update timed out')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8792','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1450,height:900}});
  const dm=await context.newPage(),errors=[];dm.on('pageerror',e=>errors.push(e.message));dm.on('dialog',d=>d.accept());
  await dm.goto('http://127.0.0.1:8792/',{waitUntil:'load'});
  await dm.evaluate(()=>{
   db.pcs.push({id:'auto-fog-hero',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard'});
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const m=currentMap();m.playerShared=true;m.revealed=[];m.autoRevealOnPcMove=true;
   m.tokens=[{id:'auto-pc',kind:'pc',ref:'auto-fog-hero',name:'Vismund Cygnus',x:3,y:3},{id:'auto-npc',kind:'npc',name:'Hidden Monarch',x:8,y:8,showToPlayers:false},{id:'auto-monster',kind:'monster',name:'Mite',x:24,y:24,showToPlayers:true}];
   goto('maps');
  });
  assert.equal(await dm.locator('input[onchange="mapAutoFogToggle(this.checked)"]').isChecked(),true);
  assert.equal(await dm.evaluate(()=>mapFog(currentMap()).length),0);
  const m1=await dm.evaluate(()=>{mapMove(currentMap().tokens.find(t=>t.id==='auto-pc'),5,3);return {cells:mapFog(currentMap()),cloud:db.maps.active}});
  assert.equal(m1.cells.length,15,'3 horizontal cells with 1-square radius = 15 revealed squares');
  for(const idx of [2+2*30,3+3*30,4+3*30,5+3*30,6+4*30])assert(m1.cells.includes(idx),'Expected explored square '+idx);
  assert(!m1.cells.includes(8+8*30),'Distant hidden square leaked');
  const beforeNpc=await dm.evaluate(()=>mapFog(currentMap()).slice());
  await dm.evaluate(()=>mapMove(currentMap().tokens.find(t=>t.id==='auto-npc'),12,12));
  assert.deepEqual(await dm.evaluate(()=>mapFog(currentMap())),beforeNpc,'NPC movement revealed squares');
  await dm.evaluate(()=>mapAutoFogToggle(false));
  const beforeDisabled=await dm.evaluate(()=>mapFog(currentMap()).slice());
  await dm.evaluate(()=>mapMove(currentMap().tokens.find(t=>t.id==='auto-pc'),10,10));
  assert.deepEqual(await dm.evaluate(()=>mapFog(currentMap())),beforeDisabled,'Disabled automatic reveal modified fog');
  assert.equal(await dm.locator('input[onchange="mapAutoFogToggle(this.checked)"]').isChecked(),false);
  await dm.evaluate(()=>mapAutoFogToggle(true));
  await dm.evaluate(()=>{mapFogAll(false);mapMove(currentMap().tokens.find(t=>t.id==='auto-pc'),13,10)});
  const revealed=await dm.evaluate(()=>mapFog(currentMap()));
  assert.equal(revealed.length,18,'Path from x10 to x13 with radius 1 should cover 6 by 3');
  const snapshot=await dm.evaluate(()=>livePlayerSnapshot());
  assert(!JSON.stringify(snapshot).includes('Hidden Monarch'),'DM-only NPC leaked into Player Display');
  assert.equal(snapshot.scene.tokens.filter(t=>t.name==='Vismund Cygnus').length,1);
  const newTab=context.waitForEvent('page');
  await dm.getByRole('button',{name:/Open Player Display/}).first().click();
  const player=await newTab;player.on('pageerror',e=>errors.push(e.message));await player.waitForLoadState('load');
  await until(()=>player.locator('#status').getAttribute('data-online').then(x=>x==='true'));
  const countBefore=await player.locator('.fog .revealed').count();
  await dm.evaluate(()=>mapMove(currentMap().tokens.find(t=>t.id==='auto-pc'),16,10));
  await until(()=>player.locator('.fog .revealed').count().then(x=>x>countBefore));
  assert.equal(await player.locator('.label').filter({hasText:'Hidden Monarch'}).count(),0);
  await dm.evaluate(()=>{tabletopEnter();mapFogAll(false)});
  assert.equal(await dm.locator('.tabletop-shell input[onchange="mapAutoFogToggle(this.checked)"]').count(),1);
  assert.equal(await dm.evaluate(()=>mapFog(currentMap()).length),0);
  await dm.evaluate(()=>mapMove(currentMap().tokens.find(t=>t.id==='auto-pc'),18,10));
  await until(()=>player.locator('.fog .revealed').count().then(x=>x===15));
  assert.equal(await dm.locator('.tabletop-shell').count(),1);
  // Existing maps do not inherit revealed terrain when moving to another scene.
  await dm.evaluate(()=>{mapState().scenes.push({id:'auto-fog-other',name:'Another Map',cols:20,rows:14,playerShared:true,theme:'blank',revealed:[],tokens:[]});mapSwitch('auto-fog-other')});
  assert.equal(await dm.evaluate(()=>mapFog(currentMap()).length),0);
  assert.deepEqual(errors,[]);
  console.log('PASS: PC path fog, manual toggle, NPC isolation, scene isolation, fullscreen DM mode, live player propagation and secret filtering');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});

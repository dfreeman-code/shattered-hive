const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let n=0;n<60;n++){try{await new Promise((ok,bad)=>http.get('http://127.0.0.1:8787/',r=>{r.resume();r.statusCode===200?ok():bad(Error('HTTP'))}).on('error',bad));return}catch{await new Promise(r=>setTimeout(r,200))}}throw Error('server not available')}
async function until(fn,{timeout=8000,interval=150}={}){const end=Date.now()+timeout;let error;while(Date.now()<end){try{if(await fn())return}catch(e){error=e}await new Promise(r=>setTimeout(r,interval))}throw error||Error('Wait condition timed out')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8787','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const dm=await context.newPage();const errors=[];
  dm.on('pageerror',e=>errors.push('DM: '+e.message));
  dm.on('dialog',d=>d.accept());
  await dm.goto('http://127.0.0.1:8787/',{waitUntil:'load'});
  await dm.evaluate(()=>{
   db.campaign.dmNotes='SECRET VESPER PLOT: NEVER TRANSMIT';
   db.npcs.push({id:'live-secret-npc',name:'Hidden Queen',secret:'SECRET DM ONLY NPC INFO'});
   db.pcs.push({id:'live-safe-pc',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard',tokenColor:'Ruby',tokenRing:'Gold',tokenSymbol:'★',notes:'SECRET CHARACTER BACKSTORY'});
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const m=currentMap();m.playerShared=true;m.name='Home Hive Live';m.revealed=[0,1,8*30+9,8*30+10];
   m.tokens=[
    {id:'live-visible-pc',kind:'pc',ref:'live-safe-pc',x:9,y:8},
    {id:'live-hidden-pc',kind:'pc',ref:'live-safe-pc',x:18,y:17},
    {id:'live-secret-npc-token',kind:'npc',ref:'live-secret-npc',name:'Hidden Queen',x:10,y:8,showToPlayers:false},
    {id:'live-visible-monster',kind:'monster',name:'Garden Mite',x:10,y:8,showToPlayers:true}
   ];
   goto('maps');
  });
  assert.equal(await dm.getByRole('button',{name:/Open Player Display/}).count(),2,'DM should show live launch in maps and tabletop');
  const snapshot=await dm.evaluate(()=>livePlayerSnapshot());
  const serialized=JSON.stringify(snapshot);
  for(const secret of ['SECRET VESPER PLOT','SECRET DM ONLY','SECRET CHARACTER BACKSTORY','Hidden Queen','live-hidden-pc']){
   assert(!serialized.includes(secret),'Secret leaked in transmitted payload: '+secret);
  }
  assert.equal(snapshot.scene.tokens.length,2,'Projection should contain revealed PC and visible monster only');
  assert.equal(snapshot.scene.image,'assets/maps/home_hive_player_gridless.png?v=2');
  const dbBefore=await dm.evaluate(()=>JSON.stringify(db));
  const opened=context.waitForEvent('page');
  await dm.getByRole('button',{name:/Open Player Display/}).first().click();
  const player=await opened;player.on('pageerror',e=>errors.push('Player: '+e.message));
  await player.waitForLoadState('load');
  await until(()=>player.locator('#status').getAttribute('data-online').then(s=>s==='true'));
  assert.equal(await player.locator('#live-board').count(),1);
  assert.equal(await player.locator('.token').count(),2);
  assert.equal(await player.locator('nav').count(),0);
  assert.equal(await player.locator('script[src]').count(),0);
  assert.equal(await player.locator('#live-board .art img').getAttribute('src'),'assets/maps/home_hive_player_gridless.png?v=2');
  assert.equal(await player.evaluate(()=>typeof window.db),'undefined','Player loaded DM campaign globals');
  assert.equal(await dm.evaluate(()=>JSON.stringify(db)),dbBefore,'Opening player display modified campaign');
  await dm.evaluate(()=>{
   const t=currentMap().tokens.find(t=>t.id==='live-visible-pc');
   mapMove(t,10,8);
  });
  await until(()=>player.locator('.token').first().evaluate(el=>Math.abs(parseFloat(el.style.left)-(10.5/30*100))<0.2));
  await dm.evaluate(()=>{currentMap().revealed=[];save();render()});
  await until(()=>player.locator('.token').count().then(n=>n===0));
  await dm.evaluate(()=>{currentMap().revealed=[8*30+10];save();render()});
  await until(()=>player.locator('.token').count().then(n=>n===2));
  await dm.evaluate(()=>{
   mapState().scenes.push({id:'live-other-test',name:'Mushroom Market',cols:20,rows:14,theme:'village',playerShared:true,revealed:[0],tokens:[]});
   mapSwitch('live-other-test');
  });
  await until(()=>player.locator('#footer').innerText().then(v=>v.includes('Mushroom Market')));
  assert.equal(await player.locator('.token').count(),0);
  const art=await player.locator('#live-board').evaluate(el=>({cols:el.style.getPropertyValue('--cols'),rows:el.style.getPropertyValue('--rows')}));
  assert.deepEqual(art,{cols:'20',rows:'14'});
  await dm.evaluate(()=>{currentMap().playerShared=false;save();render()});
  await until(()=>player.locator('#live-board').count().then(n=>n===0));
  assert((await player.locator('.placeholder').innerText()).includes('The DM has not shared'));
  await player.reload();
  await until(()=>player.locator('#status').getAttribute('data-online').then(s=>s==='true'),{timeout:11000});
  assert.equal(await player.locator('#live-board').count(),0,'Reload exposed unshared scene');
  await dm.evaluate(()=>{tabletopEnter()});
  assert.equal(await dm.locator('.tabletop-shell').count(),1);
  assert.equal(await dm.getByRole('button',{name:/Open Player Display/}).count(),1);
  await player.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: two live tabs, filtered player-only payload, fog and movement, map switch, unshare blanking, reconnect, DM tabletop and no data mutation on open');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

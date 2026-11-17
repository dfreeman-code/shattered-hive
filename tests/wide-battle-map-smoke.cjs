const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<50;i++){try{await new Promise((ok,bad)=>http.get('http://127.0.0.1:8789/',r=>{r.resume();r.statusCode===200?ok():bad(Error('server'))}).on('error',bad));return}catch{await new Promise(r=>setTimeout(r,200))}}throw Error('Server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8789','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1536,height:900}});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8789/',{waitUntil:'load'});
  await page.evaluate(()=>{
   db.pcs.push({id:'wide-map-hero',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard',tokenColor:'Ruby',tokenRing:'Gold',tokenSymbol:'★'});
   const m=mapState();m.active='evergarden-home-hive';m.viewMode='dm';m.fogTool='off';
   currentMap().tokens.push({id:'wide-map-tok',kind:'pc',ref:'wide-map-hero',name:'Vismund Cygnus',x:8,y:12});
   currentMap().tokens.push({id:'wide-map-npc',kind:'npc',name:'Beetle Friend',x:11,y:12});
   goto('maps');
  });
  await page.selectOption('#map-mini-token-size','large');
  const collect=()=>page.evaluate(()=>{
   const board=document.querySelector('#map-board'),token=document.querySelector('[data-token="wide-map-tok"]'),npc=document.querySelector('[data-token="wide-map-npc"]');
   const r=board.getBoundingClientRect(),tr=token.getBoundingClientRect(),nr=npc.getBoundingClientRect();
   return {w:r.width,h:r.height,ratio:r.width/r.height,tokenWidth:tr.width,npcWidth:nr.width,x:currentMap().tokens.find(t=>t.id==='wide-map-tok').x,y:currentMap().tokens.find(t=>t.id==='wide-map-tok').y,cols:mapCols(currentMap()),rows:mapRows(currentMap()),data:JSON.stringify(db)};
  });
  const before=await collect();
  assert.equal(await page.locator('.map-layout.is-wide').count(),0);
  await page.locator('.map-wide-toggle').click();
  assert.equal(await page.locator('.map-layout.is-wide').count(),1);
  const after=await collect();
  assert(after.w>before.w+150,'Expanded board must actually be wider on desktop');
  assert(Math.abs(after.ratio-before.ratio)<0.015,'Board proportions distorted');
  assert.equal(after.cols,before.cols);assert.equal(after.rows,before.rows);
  assert.equal(after.x,before.x);assert.equal(after.y,before.y);
  assert.equal(after.data,before.data,'Wide toggle mutated campaign JSON');
  assert(after.tokenWidth<=52+2,'Large hero token should be capped near 52px in wide mode');
  assert(after.tokenWidth<before.tokenWidth*1.25,'Hero token ballooned with map');
  const sidebar=page.locator('.map-sidebar');const rect=await sidebar.boundingBox(),board=await page.locator('#map-board').boundingBox();
  assert(rect.y>=board.y+board.height-1,'DM controls should move below map in wide mode');
  assert.equal(await page.locator('[data-token="wide-map-npc"]').count(),1);
  await page.evaluate(()=>{mapMove(currentMap().tokens.find(t=>t.id==='wide-map-tok'),10,15)});
  const moved=await collect();assert.equal(moved.x,10);assert.equal(moved.y,15);
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.locator('.map-player-stage.is-wide').count(),1);
  assert.equal(await page.locator('.map-dm-marker').count(),0,'DM marker leaked to Player View');
  assert.equal(await page.locator('[data-token="wide-map-tok"]').count(),1);
  await page.reload();await page.evaluate(()=>goto('maps'));
  assert.equal(await page.locator('.map-layout.is-wide').count(),1,'Wide preference did not persist');
  await page.locator('.map-wide-toggle').click();
  assert.equal(await page.locator('.map-layout.is-wide').count(),0,'Could not return to standard');
  await page.setViewportSize({width:690,height:820});
  await page.locator('.map-wide-toggle').click();
  const small=await page.locator('#map-board').evaluate(el=>{const b=el.getBoundingClientRect();return b.width/b.height});
  assert(Math.abs(small-1)<0.04,'Mobile grid ratio changed');
  assert.deepEqual(errors,[]);
  console.log('PASS: true larger map, original ratio, PC size cap, unchanged data, controls below, player safety, movement, persistence, mobile');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});
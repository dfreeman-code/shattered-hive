const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<50;i++){try{await new Promise((resolve,reject)=>http.get('http://127.0.0.1:8790/',r=>{r.resume();r.statusCode===200?resolve():reject(Error('HTTP '+r.statusCode))}).on('error',reject));return}catch{await new Promise(r=>setTimeout(r,200))}}throw Error('Local browser server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8790','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await page.goto('http://127.0.0.1:8790/',{waitUntil:'load'});
  await page.evaluate(()=>{
   db.pcs.push({id:'tabletop-hero',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard',level:1,status:'Active',tokenColor:'Ruby',tokenRing:'Gold',tokenSymbol:'★'});
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const m=currentMap();m.tokens.push({id:'tabletop-pc',kind:'pc',ref:'tabletop-hero',name:'Vismund Cygnus',x:8,y:11});
   m.tokens.push({id:'tabletop-secret',kind:'npc',name:'Secret NPC',x:13,y:15,showToPlayers:false});
   goto('maps');
  });
  assert.equal(await page.locator('.tabletop-shell').count(),0);
  const original=await page.evaluate(()=>JSON.stringify(db));
  await page.getByRole('button',{name:'Full-screen tabletop'}).first().click();
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  assert.equal(await page.locator('.tabletop-map-stage #map-board').count(),1);
  const dimensions=await page.locator('.tabletop-map-stage #map-board').evaluate(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height,top:r.top,ratio:r.width/r.height,cols:Number(el.style.getPropertyValue('--map-cols')),rows:Number(el.style.getPropertyValue('--map-rows'))}});
  assert(Math.abs(dimensions.ratio-1)<0.025,'Square board distorted in tabletop');
  assert(dimensions.top>=0&&dimensions.top+dimensions.h<=901,'Board must fit available viewport height');
  assert(dimensions.w>=400,'Tabletop board too small on desktop');
  assert.equal(await page.locator('[data-token="tabletop-pc"]').count(),1);
  assert.equal(await page.locator('[data-token="tabletop-secret"]').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),original,'Entering tabletop modified campaign data');
  await page.locator('[data-token="tabletop-pc"]').click();
  await page.keyboard.press('ArrowRight');
  let pos=await page.evaluate(()=>currentMap().tokens.find(x=>x.id==='tabletop-pc').x);
  assert.equal(pos,9,'Keyboard movement did not work in tabletop');
  await page.getByRole('button',{name:'Player View'}).last().click();
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  assert.equal(await page.locator('[data-token="tabletop-pc"]').count(),1);
  assert.equal(await page.locator('[data-token="tabletop-secret"]').count(),0,'Hidden NPC exposed in Player View');
  assert.equal(await page.locator('.map-dm-marker-layer').count(),0,'DM marker layer exposed in Player View');
  assert.equal(await page.locator('.tabletop-toolbar #map-mini-token-size').count(),1);
  await page.selectOption('#map-mini-token-size','large');
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tabletop-shell').count(),0,'Escape did not exit tabletop');
  assert.equal(await page.evaluate(()=>tabletopMode),false);
  await page.getByRole('button',{name:'Full-screen tabletop'}).first().click();
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  await page.getByRole('button',{name:'Exit tabletop'}).click();
  assert.equal(await page.locator('.tabletop-shell').count(),0,'Exit button failed');
  assert.deepEqual(errors,[],'JavaScript errors');
  console.log('PASS: immersive tabletop, map proportions, token movement, player-safe markers, sizes, Escape/Exit and unchanged campaign data on enter');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(err=>{console.error(err);process.exitCode=1});
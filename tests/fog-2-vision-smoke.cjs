const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<60;i++){try{await new Promise((yes,no)=>http.get('http://127.0.0.1:8797/',r=>{r.resume();r.statusCode===200?yes():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('Local server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8797','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8797/',{waitUntil:'load'});
  const results=await page.evaluate(()=>{
   db.pcs.push({id:'vision-pc',name:'Fog Scout'});
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const m=currentMap();m.playerShared=true;m.cols=30;m.rows=30;m.tokens=[
    {id:'vpc',kind:'pc',ref:'vision-pc',name:'Fog Scout',x:4,y:4},
    {id:'enemy',kind:'monster',name:'Secret Mite',x:7,y:4,showToPlayers:true}
   ];m.revealed=[];m.fogWalls=[];
   const oldEnabled=mapVisionEnabled(m),legacy=mapVisibleFrom(m,4,4).size;
   mapMove(m.tokens[0],5,4);
   const oldReveal=mapFog(m).length;
   mapVisionToggle(true);mapFogAll(false);
   // A wall at (6,4) can be seen, but conceals (7,4).
   m.fogWalls=[4*30+6];
   mapMove(m.tokens[0],6,4);
   const now=mapCurrentVisible(m),memory=mapFog(m).slice(),packet=livePlayerSnapshot();
   const behindWall=!mapVisionRay(m,5,4,7,4,new Set(m.fogWalls));
   const wallVisible=mapVisionRay(m,5,4,6,4,new Set(m.fogWalls));
   const hasMonster=packet.scene.tokens.some(t=>t.name==='Secret Mite');
   mapMove(m.tokens[0],8,4);
   const remembered=mapFog(m).includes(4*30+4);
   const oldPlace=mapCurrentVisible(m).has(4*30+4);
   const memoryPaint=mapFogTiles(m).includes('fog-memory');
   const wallSaved=m.fogWalls.includes(4*30+6);
   mapVisionToggle(false);
   const legacyCurrent=mapCurrentVisible(m).size===mapFog(m).length;
   return {oldEnabled,legacy,oldReveal,behindWall,wallVisible,hasMonster,remembered,oldPlace,memoryPaint,wallSaved,legacyCurrent};
  });
  assert.equal(results.oldEnabled,false,'Legacy maps must remain in original mode');
  assert.equal(results.legacy,9);
  assert.equal(results.oldReveal,12,'Legacy auto fog reveal changed');
  assert.equal(results.behindWall,true);
  assert.equal(results.wallVisible,true);
  assert.equal(results.hasMonster,false,'Player-safe snapshot leaked monster outside sight');
  assert.equal(results.remembered,true);
  assert.equal(results.oldPlace,false,'Old terrain should not remain currently visible');
  assert.equal(results.memoryPaint,true);
  assert.equal(results.wallSaved,true);
  assert.equal(results.legacyCurrent,true);
  assert.deepEqual(errors,[],'Browser errors');
  console.log('PASS: opt-in, legacy compatibility, wall ray, exploration memory, player-safe creature filtering');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(err=>{console.error(err);process.exitCode=1});

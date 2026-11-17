const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<60;i++){try{await new Promise((yes,no)=>http.get('http://127.0.0.1:8798/',r=>{r.resume();r.statusCode===200?yes():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('Local server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8798','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8798/',{waitUntil:'load'});
  const result=await page.evaluate(()=>{
   db.pcs.push({id:'lighting-scout',name:'Lighting Scout'});
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const m=currentMap();m.playerShared=true;m.cols=30;m.rows=30;m.revealed=[];m.fogWalls=[];
   m.tokens=[{id:'scout',kind:'pc',ref:'lighting-scout',name:'Lighting Scout',x:5,y:5},{id:'mite',kind:'monster',name:'Secret Mite',x:8,y:5,showToPlayers:true}];
   mapVisionToggle(true);
   const legacyLit=mapLightingEnabled(m);
   const bright=mapCurrentVisible(m).size;
   mapLightingToggle(true);mapAmbientSet('dark');
   const dark=mapCurrentVisible(m).size;
   const secretHidden=!livePlayerSnapshot().scene.tokens.some(t=>t.name==='Secret Mite');
   ms.selected='scout';mapTokenVisionSet('darkvisionSquares',8);
   const darkvision=mapCurrentVisible(m).size;
   const secretVisible=livePlayerSnapshot().scene.tokens.some(t=>t.name==='Secret Mite');
   mapTokenVisionSet('darkvisionSquares',0);mapTokenVisionSet('lightSquares',4);
   const torch=mapCurrentVisible(m).size;
   m.fogWalls=[5*30+6];
   const blocked=!mapCurrentVisible(m).has(5*30+8);
   mapLightingToggle(false);
   const restored=!mapLightingEnabled(m)&&mapCurrentVisible(m).size>0&&!mapCurrentVisible(m).has(5*30+8);
   return {legacyLit,bright,dark,darkvision,torch,blocked,restored,secretHidden,secretVisible,
    saved:m.fogLighting2===false,ambient:m.fogAmbient,darkvisionSetting:m.tokens[0].darkvisionSquares,lightSetting:m.tokens[0].lightSquares};
  });
  assert.equal(result.legacyLit,false);
  assert(result.bright>result.dark);
  assert.equal(result.dark,0,'Unlit character with no Darkvision should not reveal terrain');
  assert(result.darkvision>result.bright,'Darkvision should increase sight in darkness');
  assert(result.torch>0,'Light should reveal surroundings in darkness');
  assert.equal(result.secretHidden,true);
  assert.equal(result.secretVisible,true);
  assert.equal(result.blocked,true,'Vision blocker should remain effective with light');
  assert.equal(result.restored,true,'Disabling lighting must restore Phase 1 sight');
  assert.equal(result.saved,true);
  assert.equal(result.ambient,'dark');
  assert.equal(result.darkvisionSetting,0);
  assert.equal(result.lightSetting,4);
  assert.deepEqual(errors,[]);
  console.log('PASS: opt-in lighting, ambient darkness, explicit Darkvision, carried light, wall blockers, live display privacy, rollback');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

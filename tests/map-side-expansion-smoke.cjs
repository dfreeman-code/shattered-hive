const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<60;i++){try{await new Promise((yes,no)=>http.get('http://127.0.0.1:8795/',r=>{r.resume();r.statusCode===200?yes():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('Server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8795','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1400,height:900}});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8795/',{waitUntil:'load'});
  const v=await page.evaluate(()=>{
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const a=currentMap();a.cols=30;a.rows=30;a.playerShared=true;
   a.tokens=[{id:'tester-pc',kind:'pc',name:'Test PC',x:8,y:12},{id:'tester-npc',kind:'npc',name:'Private NPC',x:12,y:12,showToPlayers:false}];
   a.dmMarkers=[{id:'private-mark',type:'S',title:'Secret',x:3,y:7}];
   a.revealed=[12*30+8,5*30+2];a.fogWalls=[12*30+9];
   const b={id:'legacy-small',name:'Small map',tokens:[{x:7,y:4,kind:'pc'}],revealed:[4*20+7],cols:20,rows:14};
   const noFog={id:'missing-fog',name:'Default fog map',tokens:[],cols:20,rows:14};
   ms.archivedScenes.push(b,noFog);
   const before=JSON.stringify(db.pcs);
   const m=mapSideExpansion(a),m2=mapSideExpansion(a),small=mapSideExpansion(b),defaultFog=mapSideExpansion(noFog);
   a.panoramicArtEnabled=false; // Verify the legacy centered-art fallback remains intact.
   const center=mapArtCenter(a),packet=livePlayerSnapshot();
   const correct={cols:a.cols,rows:a.rows,token:a.tokens[0].x,secret:a.dmMarkers[0].x,
    fog:a.revealed.includes(12*46+16)&&a.revealed.includes(5*46+10),
    wall:a.fogWalls.includes(12*46+17),sideFogHidden:!a.revealed.includes(0),
    samePc:before===JSON.stringify(db.pcs),noDouble:m&&!m2,small,smallCols:b.cols,
    smallToken:b.tokens[0].x,smallFog:b.revealed[0]===4*30+12,
    defaultFog,defaultCenter:noFog.revealed.length===20*14,
    center,packetCenter:packet.scene.artCenter,packetCols:packet.scene.cols,
    secretNotInSnapshot:!packet.scene.tokens.some(t=>t.name==='Private NPC')};
   ms.wideSidesEnabled=true;
   mapState(); // Already migrated, must not expand twice.
   correct.stable=a.tokens[0].x===16;
   return correct;
  });
  assert.equal(v.cols,46);assert.equal(v.rows,30);assert.equal(v.token,16);assert.equal(v.secret,11);
  assert(v.fog&&v.wall&&v.sideFogHidden);assert(v.samePc&&v.noDouble&&v.stable);
  assert(v.small&&v.smallCols===30&&v.smallToken===12&&v.smallFog);
  assert(v.defaultFog&&v.defaultCenter);
  assert(Math.abs(v.center.left-8/46*100)<0.01);assert(Math.abs(v.center.width-30/46*100)<0.01);
  assert.equal(v.packetCols,46);assert.deepEqual(v.packetCenter,v.center);assert(v.secretNotInSnapshot);
  await page.evaluate(()=>goto('maps'));
  const board=await page.locator('#map-board').evaluate(el=>{const b=el.getBoundingClientRect();return {ratio:b.width/b.height,art:!!el.querySelector('.map-art-center')}});
  assert(Math.abs(board.ratio-46/30)<0.025);assert(board.art);
  assert.deepEqual(errors,[]);
  console.log('PASS: 25% symmetric expansion; coordinates, fog, walls, guide markers, artwork, live player snapshot, archived maps, idempotence');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

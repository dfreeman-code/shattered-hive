const {chromium}=require('playwright'),{spawn}=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
async function ready(){for(let i=0;i<80;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8831/',r=>{r.resume();r.statusCode===200?ok():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('Server not ready')}
(async()=>{const server=spawn('python3',['-m','http.server','8831','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
try{
 await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1600,height:1000}}),dm=await ctx.newPage(),errors=[];
 dm.on('pageerror',e=>errors.push(e.message));dm.on('dialog',d=>d.accept());await dm.goto('http://127.0.0.1:8831/',{waitUntil:'load'});
 const base=await dm.evaluate(()=>{const ms=mapState();return {sceneCount:ms.scenes.length,archivedCount:ms.archivedScenes.length,original:JSON.stringify(ms),hasNew:!!ms.approvedTopDownHomeHiveV1}});assert(!base.hasNew,'Activation must never run automatically');
 const pure=await dm.evaluate(()=>{
  const ms={scenes:[
   {id:'evergarden-home-hive',name:'Previous Home Hive',cols:92,rows:80,tokens:[{id:'pc',kind:'pc',x:17,y:22}],revealed:[17],fogWalls:[28],dmMarkers:[{id:'secret',title:'DM SECRET',x:5,y:9}],storyLocations:[{id:'custom',name:'Private Shop',dmNotes:'UNSHARED'}]},
   {id:'caper-tree-base',name:'Old Christmas',cols:30,rows:40,tokens:[],revealed:[],playerShared:false}
  ],archivedScenes:[{id:'history',name:'Previously Archived',tokens:[{id:'t',x:5,y:7}]},{id:'caper-tree-base',name:'Archived With Collision',tokens:[{id:'c',x:3,y:9}]}],active:'evergarden-home-hive'};
  const original=JSON.stringify(ms.scenes),oldArchived=JSON.stringify(ms.archivedScenes),first=mapArchiveActivateApproved(ms),second=mapArchiveActivateApproved(ms);
  const created=ms.scenes[0],cloneArchived=ms.archivedScenes.find(x=>x.id==='evergarden-home-hive');
  return {first,second,newLength:ms.scenes.length,archivedCount:ms.archivedScenes.length,created,cloneArchived,oldArchived,original,ids:ms.archivedScenes.map(m=>m.id)};
 });
 assert(pure.first&&!pure.second);assert.equal(pure.newLength,1);assert.equal(pure.archivedCount,4);
 assert.equal(new Set(pure.ids).size,4,'No archived scene ID collision');
 assert.equal(pure.created.id,'home-hive-orthographic-v1');assert.equal(pure.created.cols,40);assert.equal(pure.created.rows,60);
 assert.equal(pure.created.storyLocations.length,12);assert.equal(pure.created.revealed.length,2400);assert.equal(pure.created.playerShared,true);
 assert.equal(JSON.stringify(pure.cloneArchived),JSON.stringify(JSON.parse(pure.original)[0]));assert.equal(JSON.parse(pure.oldArchived).length,2,'Original archive contents retained');
 assert.equal(await dm.evaluate(()=>JSON.stringify(mapState())),base.original,'Pure simulated migration must not mutate live data');
 const controls=await dm.evaluate(()=>{goto('maps');return {panel:document.querySelector('.map-approved-archive')?.innerText||'',html:mapApprovedArchiveControls(mapState())}});
 assert(controls.panel.includes('Archive current maps'));assert(controls.html.includes('Restore'));
 // Test activation guard without the asset: no live data may change.
 const assetResp=await dm.request.get('http://127.0.0.1:8831/assets/maps/home-hive-approved-top-down.webp');
 if(assetResp.status()===404){await dm.evaluate(()=>mapArchiveStartApproved());assert.equal(await dm.evaluate(()=>JSON.stringify(mapState())),base.original)}
 // Render new map in synthetic live state, never saved.
 const projection=await dm.evaluate(()=>{
  const ms=mapState(),backup=structuredClone(ms),sample=mapApprovedHomeHivePreset();
  sample.tokens=[{id:'hero',kind:'pc',name:'Hero',x:19,y:25},{id:'hidden',kind:'npc',name:'PRIVATE NPC',x:19,y:28,showToPlayers:false}];
  ms.scenes=[sample];ms.active=sample.id;ms.viewMode='dm';goto('maps');
  const packet=livePlayerSnapshot(),markup=document.querySelector('#map-board .map-custom-image')?.getAttribute('src');
  db.maps=backup;return {packet,markup};
 });
 assert.equal(projection.markup,'assets/maps/home-hive-approved-top-down.webp');
 assert.equal(projection.packet.scene.image,projection.markup);assert.equal(projection.packet.scene.cols,40);assert.equal(projection.packet.scene.rows,60);
 assert.equal(projection.packet.scene.tokens.length,1);assert(!JSON.stringify(projection.packet).includes('PRIVATE NPC'));
 const tv=await ctx.newPage();tv.on('pageerror',e=>errors.push(e.message));await tv.goto('http://127.0.0.1:8831/player-display.html',{waitUntil:'load'});
 await tv.evaluate(p=>playerRender(p),projection.packet);
 assert.equal(await tv.locator('#live-board .art img').last().getAttribute('src'),projection.markup);
 assert.equal(await tv.locator('#live-board .fog div').count(),2400);
 assert.equal(await tv.locator('#live-board .token').count(),1);
 await tv.getByRole('button',{name:'TV Mode'}).click();assert.equal(await tv.locator('body.tv-fill').count(),1);
 await tv.getByRole('button',{name:'Fit whole map'}).click();assert.equal(await tv.locator('body.tv-fit').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS: controlled archive, collision preservation, idempotency, no startup mutation, 40x60 portrait Home Hive, location markers, TV safe WebP, fog/token protection');
}finally{if(browser)await browser.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});

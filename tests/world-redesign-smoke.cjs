const {chromium}=require('playwright');const {spawn}=require('node:child_process');const http=require('node:http');const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<80;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8801/',r=>{r.resume();r.statusCode===200?ok():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8801','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1600,height:1000}}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',e=>e.accept('New Future Workshop'));
  await page.goto('http://127.0.0.1:8801/',{waitUntil:'load'});
  const inventory=await page.evaluate(()=>({scenes:Object.keys(SH_WORLD_ATLAS),total:Object.values(SH_WORLD_ATLAS).reduce((n,x)=>n+x.places.length,0),supported:typeof mapWorldArt,keys:Object.keys(SH_WORLD_SCENE_ASSETS)}));
  assert.equal(inventory.scenes.length,12);assert.equal(inventory.total,99);assert.equal(inventory.supported,'function');
  for(const slug of inventory.scenes){
   const response=await page.request.get('http://127.0.0.1:8801/assets/maps/world-redesign/'+slug+'.svg');
   assert.equal(response.status(),200,'Missing map art '+slug);
   const body=await response.text();
   const syntax=await page.evaluate(str=>new DOMParser().parseFromString(str,'image/svg+xml').querySelector('parsererror')?.textContent||'',body);
   assert.equal(syntax,'','Invalid SVG for '+slug);
   assert(body.includes('role="img"')&&body.includes('viewBox='),'Non-semantic map image '+slug);
   assert(!/Hollow King|Unbroken Crown|SECRET|Vesper's true/i.test(body),'Spoiler in public map '+slug);
  }
  const checks=await page.evaluate(()=>{
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';const m=currentMap();m.playerShared=true;
   m.dmMarkers=[{id:'secret-vestige',type:'S',title:'HIDDEN VESPER TRUTH',notes:'PRIVATE SPOILER',x:7,y:8}];
   m.tokens=[{id:'hero',kind:'pc',name:'A hero',x:6,y:8},{id:'hidden-monster',kind:'npc',name:'PRIVATE MONSTER',x:8,y:8,showToPlayers:false}];
   m.revealed=[8*mapCols(m)+6];
   const original=JSON.stringify(db),snapshot=livePlayerSnapshot();
   goto('maps');
   return {original,snapshot,image:mapWorldArt(m),locs:mapWorldPlaces(m),savedStoryLocations:m.storyLocations===undefined};
  });
  assert.equal(checks.image,'assets/maps/world-redesign/home-hive.svg');
  assert.equal(checks.locs.length,11);
  assert.equal(checks.savedStoryLocations,true,'Viewing art must not add data to campaign');
  assert.equal(checks.snapshot.scene.image,checks.image);
  assert.equal(checks.snapshot.scene.territory,null);
  assert.equal(checks.snapshot.scene.sideArt,'');
  assert.equal(checks.snapshot.scene.artCenter,null);
  assert(!JSON.stringify(checks.snapshot).includes('PRIVATE SPOILER'));
  assert(!JSON.stringify(checks.snapshot).includes('HIDDEN VESPER TRUTH'));
  assert(!JSON.stringify(checks.snapshot).includes('PRIVATE MONSTER'));
  assert.equal(await page.locator('#map-board img.map-world-art').getAttribute('src'),checks.image);
  assert.equal(await page.locator('.map-world-pin').count(),11);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),checks.original);
  await page.evaluate(()=>mapWorldJump('maker-workshop'));
  assert.equal(await page.evaluate(()=>mapInspectZoom),2.5);
  await page.evaluate(()=>mapWorldSelect('market-row'));
  const before=await page.evaluate(()=>mapWorldPlaces(currentMap()).find(p=>p.id==='market-row').name);
  assert.equal(before,'Market Row');
  await page.evaluate(()=>mapWorldUpdate('description','New merchant quarter'));
  const saved=await page.evaluate(()=>({stored:Array.isArray(currentMap().storyLocations),size:currentMap().storyLocations?.length,desc:currentMap().storyLocations.find(p=>p.id==='market-row').description,pc:currentMap().tokens.find(x=>x.id==='hero').x}));
  assert(saved.stored);assert.equal(saved.size,11);assert.equal(saved.desc,'New merchant quarter');assert.equal(saved.pc,6);
  await page.evaluate(()=>mapWorldAdd());
  assert.equal(await page.evaluate(()=>mapWorldPlaces(currentMap()).length),12);
  await page.evaluate(()=>mapWorldUpdate('type','workshop'));
  assert.equal(await page.evaluate(()=>mapWorldPlaces(currentMap()).at(-1).type),'workshop');
  await page.evaluate(()=>mapWorldToggle(false));
  assert.equal(await page.locator('#map-board img.map-world-art').count(),0,'Old art toggle did not restore legacy');
  await page.evaluate(()=>mapWorldToggle(true));
  assert.equal(await page.locator('#map-board img.map-world-art').count(),1);
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.locator('.map-world-controls,.map-world-pin,.map-dm-marker').count(),0);
  assert.equal(await page.locator('#map-board img.map-world-art').count(),1);
  assert(!((await page.locator('#app').innerText()).includes('New merchant quarter')),'DM location notes leaked');
  const tv=await ctx.newPage();await tv.goto('http://127.0.0.1:8801/player-display.html',{waitUntil:'load'});
  const packet=await page.evaluate(()=>livePlayerSnapshot());
  await tv.evaluate(p=>playerRender(p),packet);
  assert.equal(await tv.locator('#live-board .art img').getAttribute('src'),checks.image);
  assert.equal(await tv.locator('#live-board .territory-core').count(),0);
  assert(!((await tv.locator('body').innerText()).includes('PRIVATE SPOILER')));
  assert.equal(await tv.locator('#live-board .token').count(),1);
  const testExpanded=await page.evaluate(()=>{
   const scene=structuredClone(EVERGARDEN_SCENES[0]);scene.tokens=[{id:'pc',kind:'pc',x:3,y:4}];scene.revealed=[4*30+3];
   mapSideExpansion(scene);mapTerritoryExpand(scene);
   return {dims:[mapCols(scene),mapRows(scene)],token:scene.tokens[0],art:mapCustomBackground(scene,'player'),cells:scene.revealed.length,core:mapTerritoryCore(scene)};
  });
  assert.deepEqual(testExpanded.dims,[92,60]);assert.equal(testExpanded.token.x,34);assert.equal(testExpanded.token.y,19);assert(testExpanded.art.includes('map-world-art'));
  assert.equal(testExpanded.cells,1);
  assert.deepEqual(errors,[]);
  console.log('PASS: 12 complete SVG atlas maps, 99 editable story locations, non-mutating defaults, DM-only notes, TV privacy, restore old art, zoom and 92x60 compatibility');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});

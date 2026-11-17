const {chromium}=require('playwright'),{spawn}=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
async function ready(){for(let i=0;i<80;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8791/',r=>{r.resume();r.statusCode===200?ok():no(Error('http'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('Server not ready')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8791','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1500,height:950}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:8791/',{waitUntil:'load'});
  const result=await page.evaluate(()=>{
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const a=currentMap();a.cols=46;a.rows=30;a.wideSidesV1={originalCols:30,sideCols:8};a.playerShared=true;
   a.tokens=[{id:'territory-pc',kind:'pc',name:'Our Hero',x:12,y:7},{id:'territory-secret',kind:'npc',name:'Secret Monster',x:16,y:9,showToPlayers:false}];
   a.dmMarkers=[{id:'secret-location',type:'S',title:'Vesper Secret',notes:'DM secret',x:20,y:10}];
   a.revealed=[7*46+12,10*46+20];a.fogWalls=[9*46+16];
   const legacy={id:'legacy-terr',name:'Legacy map',cols:20,rows:14,tokens:[{id:'t',x:3,y:4}],revealed:[4*20+3],dmMarkers:[]};
   const uninitialized={id:'unset-terr',name:'Fog defaults',cols:20,rows:14,tokens:[]};
   ms.archivedScenes.push(legacy,uninitialized);
   const before=JSON.stringify(db.pcs),mapBackup=JSON.stringify(a);
   const first=mapTerritoryExpand(a),second=mapTerritoryExpand(a),small=mapTerritoryExpand(legacy),empty=mapTerritoryExpand(uninitialized);
   const t=mapTerritoryCore(a),art=mapArtCenter(a),packet=livePlayerSnapshot();
   const data={first,second,small,empty,cols:a.cols,rows:a.rows,pc:a.tokens[0],npc:a.tokens[1],marker:a.dmMarkers[0],fog:a.revealed,wall:a.fogWalls,legacy,uninitializedRevealed:uninitialized.revealed.length,
      t,art,packet,pcsIntact:before===JSON.stringify(db.pcs),oldMap:JSON.parse(mapBackup)};
   goto('maps');return data;
  });
  assert(result.first&&!result.second&&result.small&&result.empty);
  assert.equal(result.cols,92);assert.equal(result.rows,60);
  assert.equal(result.pc.x,35);assert.equal(result.pc.y,22);
  assert.equal(result.marker.x,43);assert.equal(result.marker.y,25);
  assert(result.fog.includes(22*92+35));assert(result.fog.includes(25*92+43));
  assert(result.wall.includes(24*92+39));assert(!result.fog.includes(0),'New wilderness must be hidden');
  assert.equal(result.legacy.cols,40);assert.equal(result.legacy.rows,28);assert.equal(result.legacy.tokens[0].x,13);assert.equal(result.legacy.tokens[0].y,11);
  assert.equal(result.uninitializedRevealed,20*14,'Legacy no-fog map should reveal only original region');
  assert(result.pcsIntact);
  assert(Math.abs(result.t.left-25)<.01&&Math.abs(result.t.top-25)<.01);
  assert.equal(result.art.width,30/46*100);
  assert.equal(result.packet.scene.cols,92);assert.equal(result.packet.scene.rows,60);
  assert.deepEqual(result.packet.scene.territory,result.t);
  assert(!JSON.stringify(result.packet).includes('Vesper Secret'));
  assert(!JSON.stringify(result.packet).includes('Secret Monster'));
  const board=page.locator('#map-board');
  assert.equal(await board.locator('.map-territory-surround').count(),1);
  assert.equal(await board.locator('.map-territory-core .map-side-illustration').count(),1);
  const dimensions=await board.evaluate(el=>{const r=el.getBoundingClientRect();return {ratio:r.width/r.height,fog:el.querySelectorAll('[data-fog-cell]').length}});
  assert(Math.abs(dimensions.ratio-92/60)<.02);assert.equal(dimensions.fog,5520);
  await page.evaluate(()=>{mapInspectSetZoom(3);mapState().selected='territory-pc';mapMove(currentMap().tokens.find(t=>t.id==='territory-pc'),37,22)});
  assert.equal(await page.evaluate(()=>currentMap().tokens.find(t=>t.id==='territory-pc').x),37);
  assert.equal(await page.evaluate(()=>mapInspectZoom),3);
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.locator('[data-dm-marker="secret-location"]').count(),0);
  assert.equal(await page.locator('[data-token="territory-secret"]').count(),0);
  const viewer=await context.newPage();
  await viewer.goto('http://127.0.0.1:8791/player-display.html',{waitUntil:'load'});
  await viewer.evaluate(packet=>playerRender(packet),result.packet);
  const core=viewer.locator('#live-board .territory-core');
  assert.equal(await core.count(),1);assert.equal(await core.locator('img').count(),2);
  assert.equal(await viewer.locator('#live-board .fog>div').count(),5520);
  assert.equal(await viewer.locator('#live-board .token').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: 92x60/40x28 expansion, remapped fog/walls/markers/tokens, old image alignment, player-safe live display, zoom and no double-expansion');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

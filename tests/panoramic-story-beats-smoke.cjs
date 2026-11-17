const {chromium}=require('playwright');const {spawn}=require('node:child_process');const http=require('node:http');const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<70;i++){try{await new Promise((yes,no)=>http.get('http://127.0.0.1:8793/',res=>{res.resume();res.statusCode===200?yes():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(ok=>setTimeout(ok,150))}}throw Error('Server unavailable')}
(async()=>{const server=spawn('python3',['-m','http.server','8793','--bind','127.0.0.1'],{stdio:'ignore'});let browser;try{
 await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1440,height:900}});const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:8793/',{waitUntil:'load'});
 const keys=['home-hive','great-christmas-caper','frosted-root-tunnels','spider-silk-crossing','mushroom-market','forgotten-garden-shed','caper-tree-base','caper-gift-maze','caper-tinsel-crossing','caper-starlight-shrine','caper-frozen-berry','caper-glass-doors','theme-village','theme-christmas','theme-puddle','theme-tunnel','theme-ornament','theme-log','theme-blank'];
 for(const key of keys){const res=await page.request.get('http://127.0.0.1:8793/assets/maps/panoramic/'+key+'.svg');assert.equal(res.status(),200,key);const body=await res.text();const err=await page.evaluate(src=>new DOMParser().parseFromString(src,'image/svg+xml').querySelector('parsererror')?.textContent||'',body);assert.equal(err,'','Malformed panorama '+key)}
 const check=await page.evaluate(()=>{
  const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';const m=currentMap();m.playerShared=true;
  if(!mapArtCenter(m))mapSideExpansion(m);
  const old=JSON.stringify({pcs:db.pcs,npcs:db.npcs,tokens:m.tokens,markers:m.dmMarkers,revealed:m.revealed});
  const image=mapPanoramaAsset(m),snapshot=livePlayerSnapshot();
  goto('maps');
  return {image,cols:mapCols(m),rows:mapRows(m),snapshot,unchanged:JSON.stringify({pcs:db.pcs,npcs:db.npcs,tokens:m.tokens,markers:m.dmMarkers,revealed:m.revealed})===old};
 });
 assert.equal(check.cols,46);assert.equal(check.rows,30);assert(check.unchanged);
 assert.equal(check.image,'assets/maps/panoramic/home-hive.svg');assert.equal(check.snapshot.scene.image,check.image);
 assert.equal(check.snapshot.scene.sideArt,'');assert.equal(check.snapshot.scene.artCenter,null);
 assert.equal(await page.locator('#map-board img.map-custom-image').getAttribute('src'),check.image);
 assert.equal(await page.locator('#map-board .map-art-center').count(),0);
 await page.evaluate(()=>mapPanoramaToggle(false));
 assert.equal(await page.locator('#map-board .map-art-center').count(),1,'Undo should restore original art');
 await page.evaluate(()=>mapPanoramaToggle(true));
 const player=await context.newPage();await player.goto('http://127.0.0.1:8793/player-display.html',{waitUntil:'load'});
 const permitted=await player.evaluate(image=>safeAsset(image),check.image);assert.equal(permitted,check.image);
 const pre=await page.evaluate(()=>{
  const m=currentMap();const ms=mapState();ms.viewMode='dm';const num=dmMarkerList(m).length;
  const source=JSON.stringify({version:1,campaign:'vesper',beats:[{id:'test-handoff-beat-1',mapId:m.id,type:'C',title:'Pending clue',notes:'DM-only cue',x:18,y:12,scriptScene:1,scriptField:'clues'}]});
  const result=mapStoryBeatValidate(source);
  const rejected=mapStoryBeatValidate(JSON.stringify({version:1,campaign:'vesper',beats:[{id:'bad',mapId:m.id,type:'S',title:'Secret',x:1000,y:0}]}));
  return {num,source,planned:result.planned.length,rejected:rejected.error,snapshot:JSON.stringify(livePlayerSnapshot())};
 });
 assert.equal(pre.planned,1);assert(pre.rejected.includes('outside'));
 assert(!pre.snapshot.includes('Pending clue')); // No preview can reveal DM notes
 const input=page.locator('#story-beat-json');
 await input.fill(pre.source);
 await page.getByRole('button',{name:'Preview beats'}).click();
 assert.equal(await page.getByText('1 new markers ready; 0 already imported (will be skipped).').count(),1);
 assert.equal(await page.evaluate(()=>dmMarkerList(currentMap()).length),pre.num,'Preview should not mutate map');
 await page.getByRole('button',{name:'Import DM markers'}).click();
 assert.equal(await page.evaluate(()=>dmMarkerList(currentMap()).length),pre.num+1);
 const after=await page.evaluate(()=>{
 const m=currentMap(),b=dmMarkerList(m).find(x=>x.id==='story-beat-test-handoff-beat-1');
 return {b,snapshot:JSON.stringify(livePlayerSnapshot()),existing:mapStoryBeatValidate(JSON.stringify({version:1,campaign:'vesper',beats:[{id:'test-handoff-beat-1',mapId:m.id,type:'C',title:'A changed title',x:18,y:12}]})).duplicates.length};
 });
 assert.equal(after.b.title,'Pending clue');assert.equal(after.b.scriptScene,1);assert.equal(after.b.scriptField,'clues');assert.equal(after.existing,1);assert(!after.snapshot.includes('Pending clue'));
 await page.evaluate(()=>mapSetView('player'));
 assert.equal(await page.locator('[data-dm-marker="story-beat-test-handoff-beat-1"]').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: 19 complete panoramic maps, original restore, safe player art, story marker import preview/validation/idempotence/privacy');
 }finally{if(browser)await browser.close();server.kill()}})().catch(err=>{console.error(err);process.exitCode=1});

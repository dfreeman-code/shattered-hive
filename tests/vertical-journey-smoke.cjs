const {chromium}=require('playwright'),{spawn}=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
async function ready(){for(let i=0;i<75;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8821/',r=>{r.resume();r.statusCode===200?ok():no(Error('http'))}).on('error',no));return}catch{await new Promise(resolve=>setTimeout(resolve,150))}}throw Error('local server unavailable')}
(async()=>{const server=spawn('python3',['-m','http.server','8821','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
try{
 await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1920,height:1080}});const dm=await ctx.newPage(),errors=[];
 dm.on('pageerror',e=>errors.push('DM '+e.message));dm.on('dialog',d=>d.accept());await dm.goto('http://127.0.0.1:8821/',{waitUntil:'load'});
 const slugs=await dm.evaluate(()=>Object.keys(SH_WORLD_ATLAS));assert.equal(slugs.length,12);
 for(const slug of slugs){
  const res=await dm.request.get('http://127.0.0.1:8821/assets/maps/world-redesign/'+slug+'-tall.svg');assert.equal(res.status(),200,'missing '+slug);
  const svg=await res.text(),info=await dm.evaluate(text=>{const doc=new DOMParser().parseFromString(text,'image/svg+xml');return {error:doc.querySelector('parsererror')?.textContent||'',nested:doc.querySelectorAll('svg').length,viewBox:doc.documentElement.getAttribute('viewBox'),hasNewDistricts:!!doc.querySelector('#vertical-districts')}},svg);
  assert.equal(info.error,'','invalid SVG '+slug);assert.equal(info.viewBox,'0 0 1380 1200');assert(info.nested>=2);assert(info.hasNewDistricts);
 }
 const expanded=await dm.evaluate(()=>{
  const m=structuredClone(EVERGARDEN_SCENES[0]);mapSideExpansion(m);mapTerritoryExpand(m);
  m.tokens=[{id:'hero',kind:'pc',name:'Test Hero',x:41,y:24},{id:'private',kind:'npc',name:'SECRET VESPER',x:42,y:24,showToPlayers:false}];
  m.dmMarkers=[{id:'clue',type:'S',title:'PRIVATE STORY',x:40,y:25}];
  m.fogWalls=[23*92+37];m.revealed=[24*92+41];
  m.storyLocations=[...mapWorldPlaces(m),{id:'custom-plot',name:'Personal Shop',type:'plot',x:60,y:70,dmNotes:'NEVER SEND',playerVisible:false}];
  const old=JSON.stringify(m),originalPlaces=m.storyLocations.length;
  const preview=mapVerticalPlan(m),first=mapVerticalExpand(m),second=mapVerticalExpand(m);
  return {preview,first,second,cols:mapCols(m),rows:mapRows(m),token:m.tokens[0],hidden:m.tokens[1],marker:m.dmMarkers[0],walls:m.fogWalls,revealed:m.revealed,territory:m.territoryV1,art:mapWorldArt(m),location:m.storyLocations.find(x=>x.id==='custom-plot'),defaultLocation:m.storyLocations.find(x=>x.id==='market-row'),total:m.storyLocations.length,originalPlaces,legacy:mapCustomBackground({...m,worldRedesignEnabled:false},'player'),m,old};
 });
 assert.equal(expanded.preview.oldRows,60);assert.equal(expanded.preview.newRows,80);assert.equal(expanded.preview.top,10);
 assert.equal(expanded.cols,92);assert.equal(expanded.rows,80);assert(expanded.first&&!expanded.second);
 assert.equal(expanded.token.y,34);assert.equal(expanded.marker.y,35);assert.equal(expanded.walls[0],33*92+37);assert.equal(expanded.revealed[0],34*92+41);
 assert.equal(expanded.territory.top,25);
 assert.equal(expanded.location.y,(.7*60+10)/80*100);assert.equal(expanded.defaultLocation.y,(.43*60+10)/80*100);
 assert.equal(expanded.total,expanded.originalPlaces+2);assert.equal(expanded.art,'assets/maps/world-redesign/home-hive-tall.svg');
 assert(expanded.legacy.includes('map-territory-core'),'fallback must preserve core placement');
 const invalid=await dm.evaluate(()=>{const m=structuredClone(EVERGARDEN_SCENES[0]);m.rows=90;return {preview:mapVerticalPlan(m),changed:mapVerticalExpand(m),rows:m.rows}});
 assert.equal(invalid.preview,null);assert.equal(invalid.changed,false);assert.equal(invalid.rows,90);
 const intact=await dm.evaluate(()=>{const ms=mapState();const m=currentMap();return {unchanged:m.verticalJourneyV1===undefined,view:ms.viewMode}});assert(intact.unchanged,'No automatic migration on load');
 const preview=await dm.evaluate(scene=>{
  const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
  const i=ms.scenes.findIndex(m=>m.id==='evergarden-home-hive');ms.scenes[i]=scene;
  ms.scenes[i].playerShared=true;
  goto('maps');
  return livePlayerSnapshot();
 },expanded.m);
 assert.equal(preview.scene.rows,80);assert.equal(preview.scene.cols,92);
 assert.equal(preview.scene.image,'assets/maps/world-redesign/home-hive-tall.svg');
 assert.equal(preview.scene.tokens.length,1);assert(!JSON.stringify(preview).includes('SECRET VESPER'));assert(!JSON.stringify(preview).includes('NEVER SEND'));assert(!JSON.stringify(preview).includes('PRIVATE STORY'));
 assert.equal(await dm.locator('#map-board img.map-world-art').getAttribute('src'),preview.scene.image);
 assert.equal(await dm.locator('[data-fog-cell]').count(),7360);
 assert.equal(await dm.locator('.map-world-pin').count(),expanded.total);
 await dm.evaluate(()=>mapWorldJump('custom-plot'));
 assert((await dm.evaluate(()=>mapInspectZoom))>=2);
 await dm.evaluate(()=>mapSetView('player'));
 assert.equal(await dm.locator('.map-world-pin,.map-world-controls,.map-dm-marker-layer').count(),0);
 const tv=await ctx.newPage();tv.on('pageerror',e=>errors.push('TV '+e.message));await tv.goto('http://127.0.0.1:8821/player-display.html',{waitUntil:'load'});await tv.evaluate(x=>playerRender(x),preview);
 assert.equal(await tv.locator('#live-board .art img').first().getAttribute('src'),preview.scene.image);
 assert.equal(await tv.locator('#live-board .fog div').count(),7360);
 await tv.getByRole('button',{name:'TV Mode'}).click();assert.equal(await tv.locator('body.tv-fill').count(),1);assert.equal(await tv.locator('.map-ambient span').count(),24);
 await tv.getByRole('button',{name:'Fit whole map'}).click();assert.equal(await tv.locator('body.tv-fit').count(),1);
 assert.deepEqual(errors,[]);
 console.log('PASS: 12 tall story maps, 92x80 migration, fog/walls/tokens/markers/locations, archived compatibility, fallback, TV and privacy');
}finally{if(browser)await browser.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});

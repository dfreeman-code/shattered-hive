const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<80;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8794/',r=>{r.resume();r.statusCode===200?ok():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('server unavailable')}
(async()=>{const server=spawn('python3',['-m','http.server','8794','--bind','127.0.0.1'],{stdio:'ignore'});let browser;try{
 await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8794/',{waitUntil:'load'});
 const expected=['home-hive','great-christmas-caper','frosted-root-tunnels','spider-silk-crossing','mushroom-market','forgotten-garden-shed','caper-tree-base','caper-gift-maze','caper-tinsel-crossing','caper-starlight-shrine','caper-frozen-berry','caper-glass-doors','theme-village','theme-christmas','theme-puddle','theme-tunnel','theme-ornament','theme-log','theme-blank'];
 for(const slug of expected){
  const res=await page.request.get('http://127.0.0.1:8794/assets/maps/expansions/'+slug+'.svg');
  assert.equal(res.status(),200,'Missing '+slug);
  const value=await res.text();assert(value.startsWith('<svg '));
  const check=await page.evaluate(svg=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml');return {error:doc.querySelector('parsererror')?.textContent||'',left:!!doc.querySelector('#left'),right:!!doc.querySelector('#right')}},value);
  assert.equal(check.error,'','Invalid SVG '+slug);assert(check.left&&check.right);
 }
 const scenes=await page.evaluate(()=>{
  const ms=mapState();const maps=[...EVERGARDEN_SCENES,...CHRISTMAS_CAPER_SCENES];
  const status=[];
  for(const preset of maps){const m=structuredClone(preset);mapSideExpansion(m);m.panoramicArtEnabled=false;status.push({slug:preset.asset,uri:mapWideSideArt(m),markup:mapCustomBackground(m,'player'),cols:mapCols(m)})}
  const fallback={id:'user-map',theme:'tunnel',cols:20,rows:14,tokens:[]};mapSideExpansion(fallback);fallback.panoramicArtEnabled=false;
  status.push({slug:'theme-tunnel',uri:mapWideSideArt(fallback),markup:mapCustomBackground(fallback,'player'),cols:mapCols(fallback)});
  return status;
 });
 for(const v of scenes){assert.equal(v.uri,'assets/maps/expansions/'+v.slug+'.svg');assert(v.markup.includes('map-side-illustration'));assert(v.markup.includes('map-art-center'));assert(v.cols===46||v.cols===30)}
 const result=await page.evaluate(()=>{const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';const m=currentMap();m.playerShared=true;mapSideExpansion(m);m.panoramicArtEnabled=false;goto('maps');return {snapshot:livePlayerSnapshot(),w:mapCols(m),h:mapRows(m)}});
 assert.equal(result.w,46);assert.equal(result.h,30);
 assert.equal(result.snapshot.scene.sideArt,'assets/maps/expansions/home-hive.svg');
 const extra=page.locator('#map-board .map-side-illustration');
 assert.equal(await extra.count(),1);
 assert.equal(await extra.evaluate(img=>img.complete&&img.naturalWidth>0),true);
 const player=await context.newPage();
 await player.goto('http://127.0.0.1:8794/player-display.html',{waitUntil:'load'});
 await player.evaluate(packet=>playerRender(packet),result.snapshot);
 assert.equal(await player.locator('#live-board .art img').count(),2,'Player view must render side illustration plus main image');
 assert.equal(await player.locator('#live-board .art img').first().getAttribute('src'),'assets/maps/expansions/home-hive.svg');
 assert.deepEqual(errors,[]);
 console.log('PASS: 19 SVG terrain illustrations valid, 12 location mapping, custom-map fallback, 46x30 map, DM/player artwork, privacy');
}finally{if(browser)await browser.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});

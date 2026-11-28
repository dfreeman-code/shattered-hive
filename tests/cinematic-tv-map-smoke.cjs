const {chromium}=require('playwright'),{spawn}=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
async function ready(){for(let i=0;i<70;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8811/',r=>{r.resume();r.statusCode===200?ok():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('server unavailable')}
(async()=>{const server=spawn('python3',['-m','http.server','8811','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
try{await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});const ctx=await browser.newContext({viewport:{width:1920,height:1080}}),tv=await ctx.newPage(),errors=[];tv.on('pageerror',e=>errors.push(e.message));await tv.goto('http://127.0.0.1:8811/player-display.html');
const p={version:1,scene:{name:'Home Hive',cols:60,rows:60,theme:'village',image:'assets/maps/world-redesign/home-hive.svg',grid:true,tokenSize:'large',revealed:[8*60+10],tokens:[{id:'a',kind:'pc',name:'Bug Hero',x:10,y:8,bg:'#443322',ring:'#ffffff',symbol:'★'}],artCenter:null,sideArt:'',territory:null,visibleNow:null}};
await tv.evaluate(data=>playerRender(data),p);
await tv.getByRole('button',{name:'TV Mode'}).click();assert.equal(await tv.locator('body.tv-fill').count(),1);
const dims=await tv.locator('#live-board').evaluate(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));assert(dims.w>=1918,'Square TV board must fill full 16:9 TV width, actual '+dims.w);assert(dims.h>=1918,'Full-bleed square board may extend past screen height');
assert.equal(await tv.locator('.map-ambient .mote,.map-ambient .glint').count(),24);
assert.equal(await tv.locator('#live-board .fog div').count(),3600);
await tv.locator('#tv-controls-toggle').click();await tv.getByRole('button',{name:'Fit whole map'}).click();const fit=await tv.locator('#live-board').evaluate(e=>e.getBoundingClientRect());assert(fit.width<=1082&&fit.height<=1082,'Fit must show entire square board on TV');
await tv.locator('#tv-controls-toggle').click();await tv.getByRole('button',{name:'Fill TV'}).click();assert((await tv.locator('#live-board').evaluate(e=>e.getBoundingClientRect().width))>=1918);
await tv.locator('#tv-controls-toggle').click();await tv.getByRole('button',{name:'Effects On'}).click();assert.equal(await tv.locator('body.ambient-off').count(),1);
const before=await tv.locator('.token').first().getAttribute('style');
await tv.evaluate(data=>playerRender(data),p);assert.equal(await tv.locator('body.ambient-off').count(),1);assert.equal(await tv.locator('.token').first().getAttribute('style'),before);
await tv.keyboard.press('a');assert.equal(await tv.locator('body.ambient-off').count(),0);
await tv.keyboard.press('f');assert.equal(await tv.locator('body.tv-fit').count(),1);
await tv.keyboard.press('Escape');assert.equal(await tv.locator('body.tv-mode').count(),0);
const legacy=JSON.parse(JSON.stringify(p));legacy.scene.image='assets/maps/home_hive_player_gridless.png?v=2';await tv.evaluate(data=>playerRender(data),legacy);
assert.equal(await tv.locator('.map-ambient span').count(),0,'Effects limited to redesigned art');
for(const slug of ['home-hive','great-christmas-caper','frosted-root-tunnels','spider-silk-crossing','mushroom-market','forgotten-garden-shed','caper-tree-base','caper-gift-maze','caper-tinsel-crossing','caper-starlight-shrine','caper-frozen-berry','caper-glass-doors']){const res=await tv.request.get('http://127.0.0.1:8811/assets/maps/world-redesign/'+slug+'.svg');assert.equal(res.status(),200);const data=await res.text();assert(data.includes('id="ambient-world-detail"'));const err=await tv.evaluate(text=>new DOMParser().parseFromString(text,'image/svg+xml').querySelector('parsererror')?.textContent||'',data);assert.equal(err,'','invalid '+slug)}
await tv.setViewportSize({width:1280,height:720});await tv.getByRole('button',{name:'TV Mode'}).click();await tv.locator('#tv-controls-toggle').click();await tv.getByRole('button',{name:'Fill TV'}).click();assert((await tv.locator('#live-board').evaluate(e=>e.getBoundingClientRect().width))>=1278);
assert.deepEqual(errors,[]);console.log('PASS: TV fill/fit at 1080p+720p, keyboard shortcuts, ambient toggle, fog and token alignment, 12 enriched public SVG maps, fallback');
}finally{if(browser)await browser.close();server.kill()}})().catch(e=>{console.error(e);process.exitCode=1});

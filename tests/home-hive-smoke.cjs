const {chromium}=require('playwright');
(async()=>{
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage();
const fails=[];
page.on('pageerror',e=>fails.push('Page error: '+e.message));
page.on('dialog',d=>d.accept());
const assert=(c,msg)=>{if(!c)throw Error(msg)};
try {
 await page.goto('http://127.0.0.1:8000/',{waitUntil:'load'});
 await page.evaluate(()=>goto('maps'));
 await page.waitForSelector('#map-board');
 let data=await page.evaluate(()=>({scenes:mapState().scenes.map(m=>m.id),active:mapState().active,archived:mapState().archivedScenes.length,cols:mapCols(currentMap()),rows:mapRows(currentMap()),player:mapAssetUrl(currentMap(),'player'),dm:mapAssetUrl(currentMap(),'dm')}));
 assert(data.scenes.length===1&&data.active==='evergarden-home-hive','Only official Home Hive should be active');
 assert(data.archived>=6,'Old scenes should be preserved in archive');
 assert(data.cols===30&&data.rows===30,'Home Hive grid must be 30x30');
 const checkImage=async(url)=>{const r=await page.request.get('http://127.0.0.1:8000/'+url);assert(r.ok()&&/image\/png/.test(r.headers()['content-type']),url+' image missing');};
 await checkImage(data.player);await checkImage(data.dm);
 await page.evaluate(()=>mapSetView('player'));
 let src=await page.locator('.map-custom-image').getAttribute('src');
 assert(src===data.player,'Player view exposes wrong artwork');
 await page.evaluate(()=>mapSetView('dm'));
 src=await page.locator('.map-custom-image').getAttribute('src');
 assert(src===data.dm,'DM view exposes wrong artwork');

// Regression: previously stored custom image must not override official Home Hive player/DM art.
 await page.evaluate(()=>{
   currentMap().imageData='data:image/png;base64,aGVsbG8=';
   save();render();
 });
 await page.evaluate(()=>mapSetView('player'));
 assert(await page.locator('.map-custom-image').getAttribute('src')===data.player,'Existing custom image overrides Home Hive player image');
 assert((await page.locator('.map-view-indicator').innerText()).includes('PLAYER VIEW'),'Player label missing');
 await page.evaluate(()=>mapSetView('dm'));
 assert(await page.locator('.map-custom-image').getAttribute('src')===data.dm,'Existing custom image overrides Home Hive DM image');
 assert((await page.locator('.map-view-indicator').innerText()).includes('DM VIEW'),'DM label missing');
 assert(await page.evaluate(()=>currentMap().imageData==='data:image/png;base64,aGVsbG8='),'Existing custom image data was deleted');
 await page.evaluate(()=>{currentMap().imageData=undefined;save();render()});
 await page.evaluate(()=>{mapAddCustom=mapAddCustom; const m=currentMap();m.tokens.push({id:'test-monster',kind:'monster',name:'Test Mite',x:4,y:5});mapState().selected='test-monster';save();render()});
 assert(await page.locator('[data-token="test-monster"]').count()===1,'Token not displayed');
 await page.reload();await page.evaluate(()=>goto('maps'));
 assert(await page.locator('[data-token="test-monster"]').count()===1,'Token not persisted');
 await page.evaluate(()=>{mapMove(currentMap().tokens.find(t=>t.id==='test-monster'),9,10)});
 assert(await page.evaluate(()=>currentMap().tokens.find(t=>t.id==='test-monster').x===9),'Token move failed');
 await page.evaluate(()=>{mapState().selected='test-monster';mapRemoveToken()});
 assert(await page.locator('[data-token="test-monster"]').count()===0,'Remove token failed');
 await page.evaluate(()=>{mapFogAll(false)});
 assert(await page.evaluate(()=>currentMap().revealed.length===0),'Fog hide failed');
 await page.evaluate(()=>{mapFogAll(true)});
 assert(await page.evaluate(()=>currentMap().revealed.length===900),'Fog reveal did not cover 900 cells');
 // Create a custom scene, verify refresh and retention of the Home Hive.
 await page.evaluate(()=>{mapState().scenes.push({id:'test-custom',name:'Test Custom',theme:'blank',tokens:[]});save()});
 await page.reload();
 assert(await page.evaluate(()=>mapState().scenes.some(x=>x.id==='test-custom')),'Custom scenes disappeared');
 await page.evaluate(()=>{goto('dashboard');goto('pcs');goto('npcs');goto('quests');goto('maps')});
 assert(fails.length===0,JSON.stringify(fails));
 console.log('PASS: scene migration, archived maps, 30x30 grid, PNGs, DM/player, token placement, movement, removal, persistence, fog, custom maps and navigation');
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

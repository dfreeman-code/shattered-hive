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
 assert(data.scenes.length===5&&data.scenes.includes('evergarden-home-hive')&&data.active==='evergarden-home-hive','Home Hive and four Christmas maps should exist, with Home Hive active');
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

 assert((await page.locator('.map-view-settings').count())===1,'Map view controls missing beside map');
 assert((await page.locator('.map-share-label input[type="checkbox"]').count())===1,'Share checkbox missing from right sidebar');
 assert((await page.locator('.map-dm-key').count())===1,'DM marker key missing');
 // The actual image pixels must be visibly distinct, not merely different filenames.
 const distinct=await page.evaluate(async()=>{
   const imageData=async(url)=>{
     const i=new Image();i.src=url;await i.decode();
     const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;
     const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(i,0,0);
     return {width:i.naturalWidth,height:i.naturalHeight,pixels:ctx.getImageData(0,0,c.width,c.height).data};
   };
   const a=await imageData(mapAssetUrl(currentMap(),'dm'));
   const b=await imageData(mapAssetUrl(currentMap(),'player'));
   let changed=0;
   for(let y=0;y<Math.min(a.height,b.height);y+=8)for(let x=0;x<Math.min(a.width,b.width);x+=8){
     const j=(y*a.width+x)*4;
     if(Math.abs(a.pixels[j]-b.pixels[j])+Math.abs(a.pixels[j+1]-b.pixels[j+1])+Math.abs(a.pixels[j+2]-b.pixels[j+2])>70)changed++;
   }
   return {changed,width:a.width,height:a.height};
 });
 assert(distinct.width===1200&&distinct.height===1200,'Map image resolution changed');
 assert(distinct.changed>80,'DM and player image pixels are unexpectedly identical');


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
 // Verify all eight official Christmas PNGs load as real images, not fallback SVGs.
 for(const sceneId of ['caper-tree-base','caper-gift-maze','caper-tinsel-crossing','caper-starlight-shrine']){
   for(const mode of ['dm','player']){
     await page.evaluate(({sceneId,mode})=>{const ms=mapState();ms.active=sceneId;ms.viewMode=mode;render()},{sceneId,mode});
     const info=await page.locator('#map-board .map-custom-image').evaluate(async img=>{
       if(!img.complete)await new Promise((resolve,reject)=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',reject,{once:true})});
       return {src:img.getAttribute('src'),width:img.naturalWidth,height:img.naturalHeight};
     });
     assert(info.src==='assets/maps/'+sceneId+'-'+(mode==='dm'?'dm':'player')+'.png',sceneId+' '+mode+' did not select the correct PNG');
     assert(info.width===1200&&info.height===1200,sceneId+' '+mode+' PNG missing or incorrect size');
     assert(await page.evaluate(()=>mapCols(currentMap())===30&&mapRows(currentMap())===30),sceneId+' lost 30x30 grid');
   }
 }
 await page.evaluate(()=>{mapState().active='evergarden-home-hive';mapState().viewMode='dm';save();render()});

 // Character-linked PC token style regression.
 await page.evaluate(()=>{
   db.pcs.push({id:'test-hero-appearance',name:'Vismund Test Hero',species:'Spiderkin',class:'Wizard',status:'Active'});
   save();render();
   const roster=document.querySelector('#map-roster');
   roster.value='pc:test-hero-appearance';
   mapAddRecord();
 });
 let pc=await page.evaluate(()=>currentMap().tokens.find(t=>t.ref==='test-hero-appearance'));
 assert(!!pc,'PC token creation failed');
 const oldPosition={x:pc.x,y:pc.y};
 let token=page.locator('[data-token="'+pc.id+'"]');
 assert(await token.count()===1,'PC token not present on map');
 await page.evaluate(()=>{
   edit('pcs','test-hero-appearance');
   const form=document.getElementById('editForm');
   form.querySelector('[name="tokenColor"]').value='Ruby';
   form.querySelector('[name="tokenSymbol"]').value='🕷';
   form.querySelector('[name="tokenRing"]').value='Gold';
   form.querySelector('[name="tokenNameplate"]').value='Hide';
   form.requestSubmit();
 });
 assert(await page.evaluate(()=>db.pcs.find(x=>x.id==='test-hero-appearance').tokenColor==='Ruby'),'PC token style not saved with character');
 await page.evaluate(()=>goto('maps'));
 token=page.locator('[data-token="'+pc.id+'"]');
 assert((await token.getAttribute('style')).includes('#ac394a'),'PC token color did not follow saved record');
 assert((await token.getAttribute('style')).includes('#f1cb71'),'PC token ring did not follow saved record');
 assert((await token.locator('.token-symbol').innerText()).includes('🕷'),'PC token symbol did not update');
 assert(await token.locator('.token-text').count()===0,'PC name label should be hidden');
 assert(await page.evaluate((id)=>{const t=currentMap().tokens.find(x=>x.id===id);return t.x===2&&t.y===2},pc.id)===true,'Existing PC token position changed unexpectedly');
 await page.reload();
 await page.evaluate(()=>goto('maps'));
 token=page.locator('[data-token="'+pc.id+'"]');
 assert((await token.getAttribute('style')).includes('#ac394a'),'PC appearance not persisted after refresh');
 assert((await token.locator('.token-symbol').innerText()).includes('🕷'),'PC symbol not persisted');
 await page.evaluate(()=>mapSetView('player'));
 assert(await page.locator('[data-token="'+pc.id+'"]').count()===1,'PC style missing in player view');
 await page.evaluate(()=>mapSetView('dm'));
 // Other token types must retain legacy appearance.
 await page.evaluate(()=>{currentMap().tokens.push({id:'test-neutral-npc',kind:'npc',name:'Guard',x:6,y:7});save();render()});
 assert(!(await page.locator('[data-token="test-neutral-npc"]').getAttribute('style')).includes('background-color'),'NPC appearance unintentionally changed');

 // Christmas Caper scene catalog and Story Runner cross-link tests.
 await page.evaluate(()=>{mapState();goto('runner')});
 const christmas=await page.evaluate(()=>mapState().scenes.filter(m=>m.id.startsWith('caper-')).map(m=>m.id));
 assert(christmas.length===4,'Four Christmas Caper map locations were not seeded');
 assert(new Set(christmas).size===4,'Duplicate Christmas scene IDs');
 assert(await page.locator('#ar-scene-map').count()===1,'Adventure Runner scene map selector missing');
 await page.evaluate(()=>{adventureRunnerGo(5)});
 assert(await page.locator('#ar-scene-map').inputValue()==='caper-gift-maze','Gift maze staging suggestion missing');
 await page.selectOption('#ar-scene-map','caper-tinsel-crossing');
 assert(await page.evaluate(()=>db.christmasSceneMaps['a1-scene-06']==='caper-tinsel-crossing'),'Scene-specific map override not persisted');
 await page.reload();
 await page.evaluate(()=>goto('runner'));
 await page.evaluate(()=>adventureRunnerGo(5));
 assert(await page.locator('#ar-scene-map').inputValue()==='caper-tinsel-crossing','Scene map assignment lost on refresh');
 await page.getByRole('button',{name:'Open battle map'}).click();
 assert(await page.evaluate(()=>mapState().active==='caper-tinsel-crossing'),'Map open did not select assigned scene');
 assert(await page.evaluate(()=>mapState().viewMode==='dm'),'Map open must use DM mode');
 assert(await page.evaluate(()=>mapCols(currentMap())===30&&mapRows(currentMap())===30),'Christmas map is not 30x30');
 await page.evaluate(()=>goto('runner'));
 assert(await page.evaluate(()=>adventureRunnerDraft().adventureId==='vesper-adventure-1'),'Vesper Adventure Runner data changed unexpectedly');

 // Create a custom scene, verify refresh and retention of the Home Hive.
 await page.evaluate(()=>{mapState().scenes.push({id:'test-custom',name:'Test Custom',theme:'blank',tokens:[]});save()});
 await page.reload();
 assert(await page.evaluate(()=>mapState().scenes.some(x=>x.id==='test-custom')),'Custom scenes disappeared');
 await page.evaluate(()=>{goto('dashboard');goto('pcs');goto('npcs');goto('quests');goto('maps')});
 assert(fails.length===0,JSON.stringify(fails));
 console.log('PASS: scene migration, archived maps, 30x30 grid, PNGs, DM/player, token placement, movement, removal, persistence, fog, custom maps and navigation');
} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});

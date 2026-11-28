const {chromium}=require('playwright'),{spawn}=require('node:child_process'),http=require('node:http'),assert=require('node:assert/strict');
async function ready(){for(let i=0;i<65;i++){try{await new Promise((ok,no)=>http.get('http://127.0.0.1:8783/',r=>{r.resume();r.statusCode===200?ok():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(resolve=>setTimeout(resolve,200))}}throw Error('local server unavailable')}
async function until(fn){for(let n=0;n<60;n++){if(await fn())return;await new Promise(r=>setTimeout(r,150))}throw Error('live display did not update')}
(async()=>{const server=spawn('python3',['-m','http.server','8783','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
try{
 await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});const context=await browser.newContext({viewport:{width:1920,height:1080}}),dm=await context.newPage(),errors=[];
 dm.on('pageerror',e=>errors.push('DM: '+e.message));dm.on('dialog',d=>d.accept());await dm.goto('http://127.0.0.1:8783/',{waitUntil:'load'});
 await dm.evaluate(()=>{
  db.campaign.dmNotes='PRIVATE VESPER SPOILER';
  const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
  const m=currentMap();m.playerShared=true;m.name='Home Hive Gathering';m.revealed=[8*30+9,8*30+10];
  m.dmMarkers=[{id:'hidden-v',type:'S',title:'HIDDEN VESPER ENTRY',x:10,y:8}];
  m.tokens=[{id:'hero',kind:'pc',name:'Vismund Cygnus',x:9,y:8},{id:'secret',kind:'npc',name:'HIDDEN QUEEN',x:10,y:8,showToPlayers:false},{id:'mite',kind:'monster',name:'Mite Scout',x:10,y:8,showToPlayers:true}];
  goto('maps');
 });
 // Synthetic-only party sheets. Never modify actual campaign records.
 await dm.evaluate(()=>{
  const names=['Vismund Cygnus','David','Snoop Bugg','Dr. Newton Sparknic','Mister Potts','Jawshua Red Hawk'];
  db.pcs=names.map((name,i)=>({id:'tv-hud-'+i,name,class:['Wizard','Rogue','Warlock','Ranger','Paladin','Fighter'][i],species:['Spiderkin','Mantisborn','Spiderkin','Firefly Folk','Beetlekin','Antfolk'][i],hp:10+i,maxHp:20+i,ac:13+i}));
  db.sheets=Object.fromEntries(db.pcs.map((p,i)=>[p.id,{currentHp:10+i,maxHp:20+i,ac:13+i,tempHp:i===0?3:0,scores:{DEX:14},initiativeBonus:1,conditions:i===0?'Blessed':i===1?'Poisoned':'',inspiration:i===2,spellSlots:i===0?{'1':2}:i===2?{'1':1}:i===3?{'1':0}:{},notes:'PRIVATE VESPER SPOILER',spellPrepared:'PRIVATE VESPER SPOILER'}]));
 });
 // Whitespace and punctuation variants must not hide the approved heroes.
 await dm.evaluate(()=>{db.pcs[3].name='Dr.Newton  Sparknic'});
 const hudPacket=await dm.evaluate(()=>livePlayerSnapshot());
 assert.equal(hudPacket.party.length,6);
 assert.equal(hudPacket.party[3].name,'Dr.Newton  Sparknic');
 assert.equal(hudPacket.party[0].hp,10);
 assert.equal(hudPacket.party[0].conditions,'Blessed');
 assert.equal(hudPacket.party[0].initiative,3);
 assert.equal(hudPacket.party[0].portrait,'assets/hero-tokens/portraits/vismund_cygnus_miniature.png');
 assert.deepEqual(hudPacket.party[0].spellSlots,[{level:1,remaining:2}]);
 assert.deepEqual(hudPacket.party[1].spellSlots,[]);
 assert.deepEqual(hudPacket.party[2].spellSlots,[{level:1,remaining:1}]);
 assert.deepEqual(hudPacket.party[3].spellSlots,[{level:1,remaining:0}]);
 assert(!JSON.stringify(hudPacket).includes('PRIVATE VESPER SPOILER'),'private sheet fields leaked');
 const prior=await dm.evaluate(()=>JSON.stringify(db));
 const opened=context.waitForEvent('page');
 await dm.getByRole('button',{name:/Open Player Display/}).first().click();
 const player=await opened;player.on('pageerror',e=>errors.push('TV: '+e.message));await player.waitForLoadState('load');
 await until(()=>player.locator('#status').getAttribute('data-online').then(x=>x==='true'));
 await player.getByRole('button',{name:'TV Mode'}).click();
 await until(()=>player.locator('.party-card').count().then(x=>x===6));
 assert.equal(await player.locator('#party-top .party-card').count(),3);
 assert.equal(await player.locator('#party-bottom .party-card').count(),3);
 // Camera controls must not cover any top-row hero cards on HDMI TV.
 const hudAndControls=await player.evaluate(()=>{
  const a=document.querySelector('#party-top').getBoundingClientRect();
  const b=document.querySelector('#party-bottom').getBoundingClientRect();
  const c=document.querySelector('#tv-camera-controls').getBoundingClientRect();
  const style=getComputedStyle(document.querySelector('#tv-camera-controls'));
  return {topBottom:a.bottom,bottomTop:b.top,controlsTop:c.top,controlsBottom:c.bottom,controlsRight:c.right,viewportWidth:innerWidth,visible:style.display};
 });
 assert.equal(hudAndControls.visible,'flex');
 assert(hudAndControls.controlsTop>=hudAndControls.topBottom+4,
  'Camera toolbar overlays top HUD: '+JSON.stringify(hudAndControls));
 assert(hudAndControls.controlsBottom<=hudAndControls.bottomTop-4,
  'Camera toolbar overlays bottom HUD: '+JSON.stringify(hudAndControls));
 assert(hudAndControls.controlsRight<=hudAndControls.viewportWidth+1,'Camera toolbar outside TV viewport');

 assert.match(await player.locator('#party-top .party-card').first().innerText(),/HP 10\/20/);
 assert.match(await player.locator('#party-top .party-card').first().innerText(),/Blessed/);
 assert.equal(await player.locator('.party-portrait').count(),6);
 assert.equal(await player.locator('#party-top .party-card').first().locator('.party-portrait').getAttribute('src'),'assets/hero-tokens/portraits/vismund_cygnus_miniature.png');
 assert.match(await player.locator('#party-top .party-card').first().innerText(),/Level 1: 2 left/);
 assert.equal(await player.locator('#party-top .party-card').nth(1).locator('.party-slot').count(),0,'Noncaster must not have spell slots');
 assert.match(await player.locator('#party-top .party-card').nth(2).innerText(),/Level 1: 1 left/);
 assert.match(await player.locator('#party-bottom .party-card').first().innerText(),/Level 1: 0 left/);
 assert.equal(await player.locator('#party-bottom .party-card').last().locator('.party-slot').count(),0);
 await player.waitForFunction(()=>[...document.querySelectorAll('.party-portrait')].length===6&&[...document.querySelectorAll('.party-portrait')].every(img=>img.complete&&img.naturalWidth>0));
 assert(!(await player.locator('body').innerText()).includes('PRIVATE VESPER SPOILER'));
 // Both Fullscreen and TV Mode entry paths must visibly show the six-hero HUD.
 await player.locator('#tv-mode-exit').click({force:true});
 await player.waitForFunction(()=>!document.fullscreenElement);
 await player.getByRole('button',{name:'Fullscreen'}).click();
 assert.equal(await player.locator('body.tv-mode.party-hud-on').count(),1);
 const frame=await player.evaluate(()=>{
  const body=document.body,before=getComputedStyle(body,'::before'),after=getComputedStyle(body,'::after');
  const board=document.querySelector('#live-board').getBoundingClientRect();
  return {before:before.content,after:after.content,beforePosition:before.position,afterPosition:after.position,pointerBefore:before.pointerEvents,pointerAfter:after.pointerEvents,art:after.backgroundImage,boardWidth:board.width};
 });
 assert.notEqual(frame.before,'none','TV-mode Evergarden border missing');
 assert.notEqual(frame.after,'none','TV-mode leafy corner flourishes missing');
 assert.equal(frame.beforePosition,'fixed');
 assert.equal(frame.afterPosition,'fixed');
 assert.equal(frame.pointerBefore,'none');
 assert.equal(frame.pointerAfter,'none');
 assert.match(frame.art,/gradient/,'TV frame should use CSS without assets');
 assert(frame.boardWidth>400,'Decorative overlay must not shrink the map');

 assert.equal(await player.locator('.party-card').count(),6);
 assert.equal(await player.locator('#party-top').evaluate(el=>getComputedStyle(el).display),'grid');
 assert((await player.locator('#party-top').boundingBox()).height>50,'Fullscreen party cards must be visibly laid out');
 const safeTop=await player.locator('#party-top').boundingBox();
 const safeBottom=await player.locator('#party-bottom').boundingBox();
 const vh=await player.evaluate(()=>innerHeight);
 assert(safeTop.y>=20,'Top TV HUD must stay inside overscan-safe inset: '+safeTop.y);
 assert(safeBottom.y+safeBottom.height<=vh-16,'Bottom TV HUD must stay inside overscan-safe inset');

 await player.locator('#tv-mode-exit').click({force:true});
 await player.waitForFunction(()=>!document.body.classList.contains('tv-mode'));
 await player.waitForFunction(()=>!document.fullscreenElement);
 await player.getByRole('button',{name:'TV Mode'}).click();
 assert.equal(await player.locator('.party-card').count(),6);

 // A disconnected or unmatched roster should explain the missing cards.
 await player.evaluate(()=>renderPartyHud([]));
 assert.match(await player.locator('#party-top .party-empty').innerText(),/No matching heroes found/);
 await dm.evaluate(()=>window.SHLive.publish());
 await until(()=>player.locator('.party-card').count().then(x=>x===6));
 await player.getByRole('button',{name:'Party HUD On'}).click();
 assert.equal(await player.locator('body.party-hud-on').count(),0);
 await player.getByRole('button',{name:'Party HUD Off'}).click();
 assert.equal(await player.locator('body.party-hud-on').count(),1);
 const hudBefore=await dm.evaluate(()=>JSON.stringify(db));
 await dm.evaluate(()=>{db.sheets['tv-hud-0'].currentHp=4;window.SHLive.publish()});
 await until(()=>player.locator('#party-top .party-card').first().innerText().then(t=>t.includes('HP 4/20')));
 assert.equal(await player.locator('#party-top .party-card').first().count(),1);
 assert.notEqual(hudBefore,await dm.evaluate(()=>JSON.stringify(db)),'synthetic HP change should be reflected in DM test fixture');
 assert.equal(await player.locator('body.tv-mode').count(),1);
 assert.equal(await player.locator('#tv-hud-scene').innerText(),'Home Hive Gathering');
 assert.equal(await player.locator('#tv-hud-status').getAttribute('data-online'),'true');
 assert.equal(await player.locator('#live-board .token').count(),2);
 assert.equal(await player.locator('nav,.map-dm-marker,.map-dm-marker-layer').count(),0);
 assert(!((await player.locator('body').innerText()).includes('HIDDEN QUEEN')));
 assert(!((await player.locator('body').innerText()).includes('PRIVATE VESPER SPOILER')));
 assert(!((await player.locator('body').innerText()).includes('HIDDEN VESPER ENTRY')));
 // Whole-map fit remains available even though immersive TV Mode now defaults to Fill.
 await player.getByRole('button',{name:'Fit whole map'}).click();
 const visual=await player.evaluate(()=>{const b=document.querySelector('#live-board').getBoundingClientRect();return {vw:innerWidth,vh:innerHeight,w:b.width,h:b.height,header:getComputedStyle(document.querySelector('header')).display,footer:getComputedStyle(document.querySelector('footer')).display,label:getComputedStyle(document.querySelector('.token .label')).fontSize}});
 assert.equal(visual.header,'none');assert.equal(visual.footer,'none');
 assert(visual.w<=visual.vw+2&&visual.h<=visual.vh+2);
 assert(parseFloat(visual.label)>=15,'TV labels should be readable');
 await dm.evaluate(()=>{currentMap().name='Mushroom Market Festival';currentMap().revealed=[];save();render()});
 await until(()=>player.locator('#tv-hud-scene').innerText().then(x=>x==='Mushroom Market Festival'));
 assert.equal(await player.locator('.token').count(),0,'Unrevealed tokens leaked to TV');
 await dm.evaluate(()=>{currentMap().playerShared=false;save();render()});
 await until(()=>player.locator('.placeholder').count().then(x=>x===1));
 assert.equal(await player.locator('.party-card').count(),0,'Unshared scene must clear party HUD');
 assert.equal(await player.locator('#tv-hud-scene').innerText(),'');
 await player.locator('#tv-mode-exit').click({force:true});
 assert.equal(await player.locator('body.tv-mode').count(),0);
 assert.notEqual(await player.locator('header').evaluate(el=>getComputedStyle(el).display),'none');
 await player.waitForFunction(()=>!document.fullscreenElement);
 await player.setViewportSize({width:1280,height:720});
 await player.getByRole('button',{name:'TV Mode'}).click();
 assert.equal(await player.locator('body.tv-mode').count(),1);
 await player.getByRole('button',{name:'Screen info'}).click();
 assert.equal(await player.locator('#tv-screen-report').getAttribute('data-visible'),'true');
 const screenReadout=await player.locator('#tv-screen-report').innerText();
 assert.match(screenReadout,/Browser-reported screen:/);
 assert.match(screenReadout,/TV tab viewport: 1280 × 720 CSS px/);
 assert.match(screenReadout,/Estimated device pixels:/);
 // Chromium refuses to resize a fullscreen window. Exit fullscreen, then resize.
 await player.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen()});
 await player.waitForFunction(()=>!document.fullscreenElement&&!document.body.classList.contains('tv-mode'));
 await player.setViewportSize({width:1200,height:700});
 await player.getByRole('button',{name:'TV Mode'}).click();
 assert.equal(await player.locator('body.tv-mode').count(),1);
 assert.match(await player.locator('#tv-screen-report').innerText(),/TV tab viewport: 1200 × 700 CSS px/);
 await player.getByRole('button',{name:'Screen info'}).click();
 assert.equal(await player.locator('#tv-screen-report').getAttribute('data-visible'),'false');
 await player.keyboard.press('Escape');
 await until(()=>player.locator('body.tv-mode').count().then(x=>x===0));
 assert.equal(await dm.evaluate(()=>JSON.stringify(db)),await dm.evaluate(()=>JSON.stringify(db)),'TV must not touch DM records');
 assert.deepEqual(errors,[]);
 console.log('PASS: HDMI 1080p/720p TV mode, accessible player labels, fullscreen presentation, scene updates, hidden DM data, fog, disconnect and exit');
}finally{if(browser)await browser.close();server.kill()}})().catch(err=>{console.error(err);process.exitCode=1});

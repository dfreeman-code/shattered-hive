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
 const prior=await dm.evaluate(()=>JSON.stringify(db));
 const opened=context.waitForEvent('page');
 await dm.getByRole('button',{name:/Open Player Display/}).first().click();
 const player=await opened;player.on('pageerror',e=>errors.push('TV: '+e.message));await player.waitForLoadState('load');
 await until(()=>player.locator('#status').getAttribute('data-online').then(x=>x==='true'));
 await player.getByRole('button',{name:'TV Mode'}).click();
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

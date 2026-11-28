const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<50;i++){try{await new Promise((resolve,reject)=>http.get('http://127.0.0.1:8790/',r=>{r.resume();r.statusCode===200?resolve():reject(Error('HTTP '+r.statusCode))}).on('error',reject));return}catch{await new Promise(r=>setTimeout(r,200))}}throw Error('Local browser server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8790','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>d.accept().catch(()=>{}));
  await page.goto('http://127.0.0.1:8790/',{waitUntil:'load'});
  await page.evaluate(()=>{
   const heroes=[['Vismund Cygnus','Spiderkin','Wizard'],['David','Mantisborn','Rogue'],['Snoop Bugg','Spiderkin','Warlock'],['Dr. Newton Sparknic','Firefly Folk','Ranger'],['Mister Potts','Beetlekin','Paladin'],['Jawshua Red Hawk','Antfolk','Fighter']];
   db.sheets||={};
   heroes.forEach(([name,species,cls],i)=>{
    const id=i===0?'tabletop-hero':'fullscreen-hud-'+i;
    db.pcs.push({id,name,species,class:cls,level:1,status:'Active',tokenColor:'Ruby',tokenRing:'Gold',tokenSymbol:'★'});
    db.sheets[id]={currentHp:8+i,maxHp:12+i,ac:11+i,scores:{DEX:14},tempHp:i===0?2:0,initiativeBonus:1,conditions:i===0?'Blessed':'',spellSlots:i===0?{'1':2}:i===2?{'1':1}:i===3?{'1':0}:{},notes:'PRIVATE VESPER SPOILER'};
   });
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';
   const m=currentMap();m.tokens.push({id:'tabletop-pc',kind:'pc',ref:'tabletop-hero',name:'Vismund Cygnus',x:8,y:11});
   m.tokens.push({id:'tabletop-secret',kind:'npc',name:'Secret NPC',x:13,y:15,showToPlayers:false});
   goto('maps');
  });
  assert.equal(await page.locator('.tabletop-shell').count(),0);
  const original=await page.evaluate(()=>JSON.stringify(db));
  await page.getByRole('button',{name:'Full-screen tabletop'}).first().click();
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  assert.equal(await page.locator('.tabletop-map-stage #map-board').count(),1);
  const ornaments=await page.locator('.tabletop-shell').evaluate(el=>{
   const before=getComputedStyle(el,'::before'),after=getComputedStyle(el,'::after');
   const shell=el.getBoundingClientRect();
   return {before:before.content,after:after.content,pointerBefore:before.pointerEvents,pointerAfter:after.pointerEvents,bg:after.backgroundImage,shellWidth:shell.width,shellHeight:shell.height};
  });
  assert.notEqual(ornaments.before,'none','Fullscreen storybook border missing');
  assert.notEqual(ornaments.after,'none','Fullscreen corner decorations missing');
  assert.equal(ornaments.pointerBefore,'none');
  assert.equal(ornaments.pointerAfter,'none');
  assert.match(ornaments.bg,/gradient/,'Corner leaves should be CSS-only');
  assert(ornaments.shellWidth>=1439&&ornaments.shellHeight>=899,'Ornaments must not shrink the fullscreen shell');

  assert.equal(await page.locator('.tabletop-party-top .tabletop-hero-card').count(),3);
  assert.equal(await page.locator('.tabletop-party-bottom .tabletop-hero-card').count(),3);
  assert.equal(await page.locator('.tabletop-hero-portrait').count(),6);
  assert.equal(await page.locator('.tabletop-party-top').evaluate(el=>getComputedStyle(el).display),'grid');
  assert.equal(await page.locator('.tabletop-party-bottom').evaluate(el=>getComputedStyle(el).display),'grid');
  const hudRect=await page.locator('.tabletop-party-top').boundingBox();
  assert(hudRect&&hudRect.height>40&&hudRect.y>=0,'Full-screen Tabletop HUD must be visibly on screen');
  assert(hudRect.y>=10,'Full-screen tabletop top HUD must have an overscan-safe margin');
  const bottomRect=await page.locator('.tabletop-party-bottom').boundingBox();
  assert(bottomRect&&bottomRect.height>40&&bottomRect.y+bottomRect.height<=901,'Lower HUD must be visible');
  assert(bottomRect.y+bottomRect.height<=890,'Bottom tabletop HUD must stay inside the safe area');

  assert.match(await page.locator('.tabletop-party-top .tabletop-hero-card').first().innerText(),/HP 8\/12/);
  assert.match(await page.locator('.tabletop-party-top .tabletop-hero-card').first().innerText(),/Lv1: 2 left/);
  assert.equal(await page.locator('.tabletop-party-top .tabletop-hero-card').nth(1).locator('.tabletop-hero-slot').count(),0);
  assert.match(await page.locator('.tabletop-party-bottom .tabletop-hero-card').first().innerText(),/Lv1: 0 left/);
  assert(!(await page.locator('.tabletop-shell').innerText()).includes('PRIVATE VESPER SPOILER'));
  await page.getByRole('button',{name:'Hide party HUD'}).click();
  assert.equal(await page.locator('.tabletop-shell.tabletop-party-hidden').count(),1);
  assert.equal(await page.locator('.tabletop-party-top').evaluate(el=>getComputedStyle(el).display),'none');
  await page.getByRole('button',{name:'Show party HUD'}).click();
  assert.equal(await page.locator('.tabletop-shell.tabletop-party-hidden').count(),0);
  assert.equal(await page.locator('.tabletop-party-top .tabletop-hero-card').count(),3);

  const dimensions=await page.locator('.tabletop-map-stage #map-board').evaluate(el=>{const r=el.getBoundingClientRect();return {w:r.width,h:r.height,top:r.top,ratio:r.width/r.height,cols:Number(el.style.getPropertyValue('--map-cols')),rows:Number(el.style.getPropertyValue('--map-rows'))}});
  assert(Math.abs(dimensions.ratio-1)<0.025,'Square board distorted in tabletop');
  assert(dimensions.top>=0&&dimensions.top+dimensions.h<=901,'Board must fit available viewport height: '+JSON.stringify(dimensions));
  assert(dimensions.w>=400,'Tabletop board too small on desktop');
  assert.equal(await page.locator('[data-token="tabletop-pc"]').count(),1);
  assert.equal(await page.locator('[data-token="tabletop-secret"]').count(),1);
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),original,'Showing and toggling party HUD in tabletop modified campaign data');
  await page.locator('[data-token="tabletop-pc"]').click();
  await page.keyboard.press('ArrowRight');
  let pos=await page.evaluate(()=>currentMap().tokens.find(x=>x.id==='tabletop-pc').x);
  assert.equal(pos,9,'Keyboard movement did not work in tabletop');
  await page.getByRole('button',{name:'Player View'}).last().click();
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  assert.equal(await page.locator('[data-token="tabletop-pc"]').count(),1);
  assert.equal(await page.locator('[data-token="tabletop-secret"]').count(),0,'Hidden NPC exposed in Player View');
  assert.equal(await page.locator('.map-dm-marker-layer').count(),0,'DM marker layer exposed in Player View');
  assert.equal(await page.locator('.tabletop-party-top .tabletop-hero-card').count(),3,'Player View must retain party cards');
  assert(!(await page.locator('.tabletop-shell').innerText()).includes('PRIVATE VESPER SPOILER'));
  assert.equal(await page.locator('.tabletop-toolbar #map-mini-token-size').count(),1);
  await page.selectOption('#map-mini-token-size','large');
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.tabletop-shell').count(),0,'Escape did not exit tabletop');
  assert.equal(await page.evaluate(()=>tabletopMode),false);
  // Native fullscreen exit can finish asynchronously after the Escape handler.
  await page.waitForFunction(()=>!document.fullscreenElement);
  await page.getByRole('button',{name:'Full-screen tabletop'}).first().click();
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  await page.getByRole('button',{name:'Exit tabletop'}).click();
  assert.equal(await page.locator('.tabletop-shell').count(),0,'Exit button failed');
  assert.deepEqual(errors,[],'JavaScript errors');
  console.log('PASS: immersive tabletop, map proportions, token movement, player-safe markers, sizes, Escape/Exit and unchanged campaign data on enter');
 }finally{if(browser)await browser.close();server.kill();}
})().catch(err=>{console.error(err);process.exitCode=1});
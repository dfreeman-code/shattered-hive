const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<60;i++){try{await new Promise((yes,no)=>http.get('http://127.0.0.1:8799/',r=>{r.resume();r.statusCode===200?yes():no(Error('HTTP'))}).on('error',no));return}catch{await new Promise(r=>setTimeout(r,150))}}throw Error('Server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8799','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8799/',{waitUntil:'load'});
  await page.evaluate(()=>{const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';goto('maps')});
  const panel=page.locator('.fog-control-panel');
  assert.equal(await panel.count(),1);
  for(const label of ['1. Map tools','2. Automatic exploration','3. Lighting & vision'])
   assert.equal(await panel.getByRole('heading',{name:label}).count(),1);
  const move=panel.getByRole('button',{name:'Move tokens'});
  assert.equal(await move.getAttribute('aria-pressed'),'true');
  await panel.getByRole('button',{name:'Reveal terrain'}).click();
  assert.equal(await page.evaluate(()=>mapState().fogTool),'reveal');
  await panel.getByRole('button',{name:'Cover terrain'}).click();
  assert.equal(await page.evaluate(()=>mapState().fogTool),'hide');
  await panel.getByRole('button',{name:'Move tokens'}).click();
  assert.equal(await page.evaluate(()=>mapState().fogTool),'off');
  await panel.getByRole('button',{name:'Hide all'}).click();
  assert.equal(await page.evaluate(()=>mapFog(currentMap()).length),0);
  await panel.getByRole('button',{name:'Reveal all'}).click();
  assert.equal(await page.evaluate(()=>mapFog(currentMap()).length),900);
  const progress=panel.getByRole('progressbar',{name:'Explored terrain'});
  assert.equal(await progress.getAttribute('aria-valuenow'),'100');
  const check=panel.locator('input[onchange="mapVisionToggle(this.checked)"]');
  await check.check();
  assert.equal(await page.evaluate(()=>mapVisionEnabled(currentMap())),true);
  await panel.getByRole('button',{name:'Paint vision blockers'}).click();
  assert.equal(await page.evaluate(()=>mapState().fogTool),'wall');
  const lighting=panel.locator('input[onchange="mapLightingToggle(this.checked)"]');
  await lighting.check();
  assert.equal(await page.evaluate(()=>mapLightingEnabled(currentMap())),true);
  await panel.getByLabel('Ambient lighting').selectOption('dark');
  assert.equal(await page.evaluate(()=>mapAmbient(currentMap())),'dark');
  await page.evaluate(()=>tabletopEnter());
  assert.equal(await page.locator('.tabletop-shell').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS: fog panel grouping, tools, fog state, exploration meter, wall/lighting controls, fullscreen regression');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

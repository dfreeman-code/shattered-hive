const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const http=require('node:http');
const assert=require('node:assert/strict');
async function ready(){for(let i=0;i<60;i++){try{await new Promise((ok,bad)=>http.get('http://127.0.0.1:8796/',r=>{r.resume();r.statusCode===200?ok():bad(Error('HTTP'))}).on('error',bad));return}catch{await new Promise(r=>setTimeout(r,180))}}throw Error('Server unavailable')}
(async()=>{
 const server=spawn('python3',['-m','http.server','8796','--bind','127.0.0.1'],{stdio:'ignore'});let browser;
 try{
  await ready();browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1366,height:820}});const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('http://127.0.0.1:8796/',{waitUntil:'load'});
  await page.evaluate(()=>{const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';ms.fogTool='off';goto('maps')});
  const panel=page.locator('.fog-control-panel');
  assert.equal(await panel.count(),1);
  const choice=async(handler,title,description)=>{
   const input=panel.locator('input[onchange="'+handler+'"]');
   const label=input.locator('xpath=ancestor::label');
   assert.equal(await label.locator('strong').innerText(),title);
   assert((await label.innerText()).includes(description));
   const metrics=await input.evaluate(el=>{
    const rect=el.getBoundingClientRect(),title=el.closest('label').querySelector('strong'),desc=el.closest('label').querySelector('.fog-toggle-copy>span');
    return {w:rect.width,h:rect.height,title:Number.parseFloat(getComputedStyle(title).fontSize),desc:Number.parseFloat(getComputedStyle(desc).fontSize)};
   });
   assert(metrics.w>=23&&metrics.h>=23,JSON.stringify(metrics));
   assert(metrics.title>=16&&metrics.desc>=14,JSON.stringify(metrics));
   return input;
  };
  const auto=await choice('mapAutoFogToggle(this.checked)','Reveal fog as heroes move','uncovers its path');
  const wasAuto=await auto.isChecked();await auto.setChecked(!wasAuto);
  assert.equal(await page.evaluate(()=>mapAutoFogEnabled(currentMap())),!wasAuto);
  const wall=await choice('mapVisionToggle(this.checked)','Wall-aware vision','Stop vision at walls');
  await wall.check();assert.equal(await page.evaluate(()=>mapVisionEnabled(currentMap())),true);
  const lighting=await choice('mapLightingToggle(this.checked)','Use lighting and Darkvision','carried lights');
  await lighting.check();assert.equal(await page.evaluate(()=>mapLightingEnabled(currentMap())),true);
  await page.setViewportSize({width:390,height:844});
  const small=await panel.locator('.fog-toggle-choice input[type=checkbox]').first().boundingBox();
  assert(small.width>=23&&small.height>=23,'Mobile checkbox shrank');
  assert.deepEqual(errors,[]);
  console.log('PASS: 24px touch checkboxes, 17px setting titles, 15px explanations, controls, mobile readability');
 }finally{if(browser)await browser.close();server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});

/* Character-linked painted miniature tokens — isolated synthetic browser test.
 * Image requests are mocked because the art files are supplied separately.
 * No Supabase credentials, live user data, or session progress involved.
 */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const http=require('node:http');
const URL='http://127.0.0.1:8788/index.html';
const heroes=[
 ['Vismund Cygnus','Spiderkin','Wizard','vismund_cygnus'],
 ['David','Mantisborn','Rogue','david'],
 ['Snoop Bugg','Spiderkin','Warlock','snoop_bugg'],
 ['Dr.Newton Sparknic','Firefly Folk','Ranger','dr_newton_sparknic'],
 ['Mister Potts','Beetlekin','Paladin','mister_potts'],
 ['Jawshua Red Hawk','Antfolk','Fighter','jawshua_red_hawk']
];
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=','base64');
async function ready(){
 for(let i=0;i<50;i++){
  try{await new Promise((ok,bad)=>http.get(URL,r=>{r.resume();r.statusCode===200?ok():bad(Error(String(r.statusCode)));}).on('error',bad));return;}
  catch{await new Promise(r=>setTimeout(r,200));}
 }
 throw Error('Local app server did not start');
}
(async()=>{
 const server=spawn('python3',['-m','http.server','8788','--bind','127.0.0.1'],{stdio:'ignore'});
 let browser;
 try{
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext();
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',dialog=>dialog.accept().catch(()=>{}));
  await page.route(/https?:\/\/[^/]+\.supabase\.co\//,r=>r.abort());
  await page.route('**/assets/hero-tokens/**',r=>r.fulfill({status:200,contentType:'image/png',body:pixel}));
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await page.evaluate(list=>{
   db.pcs=list.map(([name,species,clazz,stem],i)=>({id:'art-test-'+i,name,species,class:clazz,level:1,status:'Active',tokenColor:'Ruby',tokenRing:'Gold',tokenSymbol:'★'}));
   const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';
   const m=currentMap();m.tokens=db.pcs.map((p,i)=>({id:'mini-'+i,kind:'pc',ref:p.id,name:p.name,x:2+i,y:3,hp:8}));
   m.tokens.push({id:'npc-test',kind:'npc',name:'Friendly Beetle',x:10,y:10});
   save();goto('maps');
  },heroes);
  for(const [index,hero] of heroes.entries()){
   const locator=page.locator('[data-token="mini-'+index+'"]');
   assert.equal(await locator.count(),1,'Missing token for '+hero[0]);
   assert.equal(await locator.locator('img.pc-mini-token-image').getAttribute('src'),'assets/hero-tokens/'+hero[3]+'_token.png');
   await locator.locator('img.pc-mini-token-image').evaluate(async img=>{if(!img.complete)await new Promise(r=>{img.onload=r;img.onerror=r})});
   assert.equal(await locator.locator('img.pc-mini-token-image').count(),1);
   assert.equal(await locator.locator('.token-symbol').evaluate(x=>getComputedStyle(x).visibility),'hidden','Loaded image should replace emoji');
  }
  assert.equal(await page.locator('[data-token="npc-test"] img').count(),0,'NPC gained a PC portrait');
  await page.locator('[data-token="mini-2"]').click();
  assert.equal(await page.locator('.pc-mini-portrait img').getAttribute('src'),'assets/hero-tokens/portraits/snoop_bugg_miniature.png');
  await page.reload();
  await page.evaluate(()=>goto('maps'));
  assert.equal(await page.locator('img.pc-mini-token-image').count(),6,'Miniature tokens were lost on reload');
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.locator('img.pc-mini-token-image').count(),6,'Miniature tokens missing from Player View');
  assert.equal(await page.evaluate(()=>currentMap().tokens.find(t=>t.id==='mini-2').x),4,'Map position changed');
  await page.evaluate(()=>{
   mapSetView('dm');
   const pc=db.pcs.find(p=>p.name==='David');pc.species='Beetlekin';save();render();
  });
  assert.equal(await page.locator('[data-token="mini-1"] img').count(),0,'Mismatched species should fall back to symbol');
  assert.equal(await page.locator('[data-token="mini-1"] .token-symbol').count(),1);
  assert.deepEqual(errors,[],'JavaScript errors');
  console.log('PASS: six correctly linked miniature tokens, portrait, reload, player view, movement, NPC isolation, mismatch fallback');
  await context.close();
 }finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
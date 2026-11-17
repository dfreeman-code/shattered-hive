const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const failures=[];
 page.on('pageerror',e=>failures.push(e.message));
 page.on('dialog',d=>d.accept());
 try{
  await page.goto('http://127.0.0.1:8000/',{waitUntil:'load'});
  await page.evaluate(()=>{
   db.pcs.push({id:'display-test-hero',name:'Vismund Cygnus',species:'Spiderkin',class:'Wizard',level:1,status:'Active',tokenColor:'Ruby',tokenRing:'Gold',tokenSymbol:'🕷'});
   const ms=mapState();ms.viewMode='dm';ms.active='evergarden-home-hive';
   currentMap().tokens.push({id:'display-mini',kind:'pc',ref:'display-test-hero',name:'Vismund Cygnus',x:9,y:12,hp:8});
   currentMap().tokens.push({id:'display-monster',kind:'monster',name:'Mite',x:14,y:15});
   render();
  });
  assert.equal(await page.locator('#map-mini-token-size').inputValue(),'standard');
  const before=await page.evaluate(()=>({position:currentMap().tokens.find(t=>t.id==='display-mini'),data:JSON.stringify(db)}));
  assert.equal(await page.locator('#map-board').evaluate(el=>el.style.getPropertyValue('--mini-pc-token-width')),'5%');
  assert.equal(await page.locator('.pc-mini-portrait a').count(),0,'Portrait should not show without selection');
  await page.selectOption('#map-mini-token-size','large');
  assert.equal(await page.locator('#map-board').evaluate(el=>el.style.getPropertyValue('--mini-pc-token-width')),'6.5%');
  assert.equal(await page.locator('[data-token="display-mini"]').evaluate(el=>getComputedStyle(el).width.endsWith('px')),true);
  assert.equal(await page.locator('[data-token="display-monster"]').evaluate(el=>el.style.width),'','Monster inline style changed');
  assert.equal(await page.evaluate(()=>JSON.stringify(db)),before.data,'Sizing mutated campaign data');
  await page.evaluate(()=>{mapState().selected='display-mini';render()});
  const link=page.locator('.pc-mini-portrait a');
  assert.equal(await link.count(),1);
  assert.equal(await link.getAttribute('href'),'assets/hero-tokens/portraits/vismund_cygnus_miniature.png');
  assert.equal(await link.getAttribute('target'),'_blank');
  await page.evaluate(()=>mapSetView('player'));
  assert.equal(await page.locator('#map-mini-token-size').inputValue(),'large');
  assert.equal(await page.locator('#map-board').evaluate(el=>el.style.getPropertyValue('--mini-pc-token-width')),'6.5%');
  await page.reload();
  await page.evaluate(()=>goto('maps'));
  assert.equal(await page.locator('#map-mini-token-size').inputValue(),'large','Local size preference lost after refresh');
  await page.selectOption('#map-mini-token-size','compact');
  assert.equal(await page.locator('#map-board').evaluate(el=>el.style.getPropertyValue('--mini-pc-token-width')),'4%');
  assert.deepEqual(failures,[]);
  console.log('PASS: miniature token sizes in both views, persistence, preview link, no campaign mutations');
 }finally{await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1});
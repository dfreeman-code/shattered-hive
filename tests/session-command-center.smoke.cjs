/* Live Session Command Center safe Chromium test.
   Never connects to the user's production cloud account. */
const { chromium } = require('playwright');
const assert=require('node:assert/strict');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
(async()=>{
 const browser=await chromium.launch({headless:true});
 const contexts=[];
 const errors=[];
 async function open(width,height=900){
   const context=await browser.newContext({viewport:{width,height},acceptDownloads:true});
   contexts.push(context);
   const page=await context.newPage();
   page.on('pageerror',err=>errors.push(String(err)));
   await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/,route=>route.abort());
   await page.goto(base,{waitUntil:'domcontentloaded'});
   return page;
 }
 try{
   const p=await open(1440);
   const snapshot=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
   const before=await snapshot();
   await p.getByRole('button',{name:/Session Command Center/}).click();
   await p.getByRole('heading',{name:/Session Command Center/}).waitFor();
   assert.ok((await p.locator('.cc-layout').count())===1);
   const nav=await snapshot();
   assert.deepEqual(nav.pcs,before.pcs,'Navigation cannot rewrite Player Characters');
   assert.deepEqual(nav.quests,before.quests,'Navigation cannot activate pending quests');
   assert.deepEqual(nav.sessions,before.sessions,'Navigation cannot mark sessions Played');
   console.log('PASS command center opens without changing PCs, quests or sessions');
   // New UI-only player board must not expose DM scratchpad or campaign secrets.
   await p.getByRole('button',{name:'Player-safe board'}).click();
   const safe=p.locator('#cc-player-board');
   await safe.waitFor({state:'visible'});
   assert.equal(await safe.getByRole('heading',{name:/The Heroes/}).count(),1);
   const text=await safe.innerText();
   assert.ok(!text.includes('Test note: protect Vesper mystery'));
   assert.ok(!text.includes('SECRET:'));
   assert.ok(await p.locator('.shell').evaluate(el=>getComputedStyle(el).display==='none'));
   await safe.getByRole('button',{name:'Close player board'}).click();
   assert.equal(await safe.count(),0);
   console.log('PASS player-safe presentation board hides DM details and exits cleanly');
   assert.ok(await p.getByRole('button',{name:'Open Battle Map'}).count());
   assert.ok(await p.getByRole('button',{name:'Full Combat Tracker'}).count());
   console.log('PASS map and combat navigation available');
   await p.locator('#cc-notes').fill('Test note: protect Vesper mystery');
   await p.locator('#cc-notes').blur();
   await p.waitForFunction(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')||'{}').sessionCommandNotes==='Test note: protect Vesper mystery');
   console.log('PASS scratchpad saved in existing campaign JSON');
   await p.reload({waitUntil:'domcontentloaded'});
   await p.getByRole('button',{name:/Session Command Center/}).click();
   assert.equal(await p.locator('#cc-notes').inputValue(),'Test note: protect Vesper mystery');
   console.log('PASS notes survive reload');
   const appData=await snapshot();
   assert.deepEqual(appData.pcs,before.pcs);
   assert.deepEqual(appData.quests,before.quests);
   assert.deepEqual(appData.sessions,before.sessions);
   console.log('PASS notes preserve character and story records');
   const planned=appData.sessions.find(x=>x.status==='Planned');
   if(planned){
     await p.locator('#cc-session').selectOption(planned.id);
     await p.waitForFunction(id=>JSON.parse(localStorage.getItem('shattered-hive-v1')||'{}').sessionCommandSessionId===id,planned.id);
     assert.equal((await snapshot()).sessions.find(x=>x.id===planned.id).status,'Planned');
     console.log('PASS selecting session does not mark it Played');
   }
   // Add a disposable participant in isolated browser storage to test shared combat turn logic.
   await p.evaluate(()=>{
     const db=JSON.parse(localStorage.getItem('shattered-hive-v1'));
     db.combat={name:'Mock Encounter',round:1,turn:0,active:false,
       participants:[{id:'test-a',name:'Glim',kind:'PC',init:12,hp:10,maxHp:10,ac:13,conditions:[]},
                     {id:'test-b',name:'Spore',kind:'Enemy',init:8,hp:8,maxHp:8,ac:12,conditions:[]}],history:[]};
     localStorage.setItem('shattered-hive-v1',JSON.stringify(db));
   });
   await p.reload({waitUntil:'domcontentloaded'});
   await p.getByRole('button',{name:/Session Command Center/}).click();
   await p.getByRole('button',{name:'Next turn →'}).click();
   let combat=(await snapshot()).combat;
   assert.equal(combat.active,true);
   assert.equal(combat.turn,0);
   assert.equal(combat.history[0].text,'Turn: Glim (round 1)');
   await p.getByRole('button',{name:'Next turn →'}).click();
   combat=(await snapshot()).combat;
   assert.equal(combat.turn,1);
   assert.equal(combat.history[0].text,'Turn: Spore (round 1)');
   console.log('PASS turn controls operate original combat state and history');
   // Test one-click damage/healing preserves original HP clamp and combat audit log.
   await p.getByRole('button',{name:'Damage Glim 1 HP'}).click();
   let adjusted=(await snapshot()).combat;
   assert.equal(adjusted.participants[0].hp,9);
   assert.ok(adjusted.history[0].text.includes('damage'));
   await p.getByRole('button',{name:'Heal Glim 1 HP'}).click();
   adjusted=(await snapshot()).combat;
   assert.equal(adjusted.participants[0].hp,10);
   assert.deepEqual((await snapshot()).pcs,before.pcs);
   console.log('PASS one-click combat HP actions log changes without updating character sheets');
   await p.getByRole('button',{name:'Full Combat Tracker'}).click();
   assert.ok((await p.locator('#app').innerText()).includes('Spore'));
   console.log('PASS full combat tracker shows same encounter');
   // Guaranteed fixture test: disposable hero with a secret and an unshared map.
   const fixture=await open(1280);
   await fixture.evaluate(()=>{
      const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
      data.pcs=[{id:'test-hero-fixture',name:'Pip',species:'Beetlekin',class:'Paladin',
        level:2,ac:15,hp:11,maxHp:15,status:'Active',secret:'SECRET: never show this'}];
      if(!data.maps||!Array.isArray(data.maps.scenes))throw Error('Maps not initialized');
      const scene=data.maps.scenes.find(x=>x.id===data.maps.active);
      if(!scene)throw Error('Map not available');
      scene.name='Unshared Secret DM Map';
      scene.playerShared=false;
      localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
   });
   await fixture.reload({waitUntil:'domcontentloaded'});
   await fixture.getByRole('button',{name:/Session Command Center/}).click();
   await fixture.getByRole('button',{name:'Quick view'}).click();
   const quick=fixture.locator('#cc-quick-hero');
   assert.ok(await quick.getByText('Pip',{exact:true}).count());
   assert.ok((await quick.innerText()).includes('11 / 15'));
   assert.ok(!(await quick.innerText()).includes('SECRET:'));
   await quick.getByRole('button',{name:'Close'}).click();
   assert.equal(await quick.count(),0);
   const checkHero=await fixture.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')).pcs[0]);
   assert.equal(checkHero.secret,'SECRET: never show this');
   console.log('PASS disposable hero quick view is accurate and never reveals secrets or writes changes');
   await fixture.getByRole('button',{name:'Player-safe board'}).click();
   const playerBoard=await fixture.locator('#cc-player-board').innerText();
   assert.ok(playerBoard.includes('Pip'));
   assert.ok(!playerBoard.includes('Unshared Secret DM Map'));
   assert.ok(!playerBoard.includes('SECRET:'));
   await fixture.getByRole('button',{name:'Close player board'}).click();
   console.log('PASS unshared map name and character secrets are excluded from player board');
   const mobile=await open(390,844);
   await mobile.getByRole('button',{name:/Session Command Center/}).click();
   const m=await mobile.evaluate(()=>{
      let e=document.querySelector('.cc-layout');const r=e.getBoundingClientRect();
      return {viewport:window.innerWidth,right:r.right,left:r.left,columns:getComputedStyle(e).gridTemplateColumns};
   });
   assert.ok(m.left>=-1&&m.right<=m.viewport+2,JSON.stringify(m));
   const mobileButton=mobile.getByRole('button',{name:'Player-safe board'});
   await mobileButton.click();
   assert.ok(await mobile.locator('#cc-player-board').isVisible());
   await mobile.getByRole('button',{name:'Close player board'}).click();
   console.log('PASS player board works on mobile viewport');

   console.log('PASS command center fits mobile 390px viewport');
   assert.deepEqual(errors,[]);
   console.log('PASS no uncaught browser errors');
   console.log('SESSION COMMAND CENTER SMOKE PASSED');
 }catch(err){console.error('SESSION COMMAND CENTER SMOKE FAILED:',err.stack||err);process.exitCode=1}
 finally{for(let c of contexts)await c.close();await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});

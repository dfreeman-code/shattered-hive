/* Phase 6 — integrated, unplayed DM rehearsal in a disposable browser profile.
 * All characters and story text are synthetic. Never uses live cloud credentials.
 */
'use strict';
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const base=process.env.BASE_URL||'http://127.0.0.1:8765/';
const names=['QA Beetlekin Paladin','QA Antfolk Fighter','QA Mantisborn Rogue','QA Mothkin Bard','QA Spiderkin Wizard','QA Firefly Ranger'];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900},acceptDownloads:true});
 const page=await context.newPage();
 const results=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept().catch(()=>{}));
 await context.route(/https?:\/\/[^/]+\.supabase\.co\//,route=>route.abort());
 async function check(name,fn){try{await fn();results.push({name,status:'PASS'});console.log('PASS',name)}
 catch(e){results.push({name,status:'FAIL',message:String(e.stack||e)});console.error('FAIL',name,e.stack||e)}}
 try{
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await check('Initialize exactly six synthetic heroes and unplayed adventure',async()=>{
   await page.evaluate(names=>{
    const data=JSON.parse(localStorage.getItem('shattered-hive-v1'));
    data.pcs=names.map((name,i)=>({id:'phase6-'+i,name,species:['Beetlekin','Antfolk','Mantisborn','Mothkin','Spiderkin','Firefly Folk'][i],
      class:['Paladin','Fighter','Rogue','Bard','Wizard','Ranger'][i],level:1,status:'Active',hp:12,ac:14,secret:'PHASE6 DM SECRET '+i}));
    data.adventureScriptDraft={adventureId:'vesper-adventure-1',scenes:{}};
    ADVENTURE_ONE_SCENES.forEach((_,i)=>{
     const fields={};ADVENTURE_FIELDS.forEach(f=>fields[f]='PHASE6 PREVIEW SCENE '+(i+1)+' '+f);
     data.adventureScriptDraft.scenes[adventureSceneId(i)]=fields;
    });
    localStorage.setItem('shattered-hive-v1',JSON.stringify(data));
   },names);
   await page.reload({waitUntil:'domcontentloaded'});
   assert.equal(await page.evaluate(()=>db.pcs.length),6);
   assert.equal(await page.evaluate(()=>db.campaign.session),0);
   assert.equal(await page.evaluate(()=>db.sessions.find(x=>x.id==='vesper-session-1')?.status),'Planned');
   assert.ok(await page.evaluate(()=>db.decisions.every(x=>x.status==='Not decided')));
  });
  const protectedState=()=>page.evaluate(()=>JSON.stringify({
   pcs:db.pcs,npcs:db.npcs,quests:db.quests,sessions:db.sessions,
   decisions:db.decisions,encounters:db.encounters,campaign:db.campaign,
   script:db.adventureScriptDraft,storyArchive:db.storyArchives
  }));
  const initial=await protectedState();
  await check('Command Center displays all six PCs and hides DM secrets on player board',async()=>{
   await page.evaluate(()=>goto('command'));
   const all=await page.locator('#app').innerText();
   names.forEach(n=>assert.ok(all.includes(n),'Missing hero '+n));
   await page.locator('#cc-notes').fill('PHASE6 DM PRIVATE: no choices made');
   await page.locator('#cc-notes').blur();
   await page.getByRole('button',{name:'Player-safe board'}).click();
   const board=await page.locator('#cc-player-board').innerText();
   names.forEach(n=>assert.ok(board.includes(n)));
   assert.ok(!board.includes('PHASE6 DM PRIVATE'));
   assert.ok(!board.includes('PHASE6 DM SECRET'));
   await page.getByRole('button',{name:'Close player board'}).click();
  });
  await check('Runner previews introductions, all ten scenes and their linked maps',async()=>{
   await page.evaluate(()=>goto('runner'));
   await page.getByRole('button',{name:'Open Hero Introductions'}).click();
   assert.equal(await page.locator('.ar-scene').count(),7);
   await page.getByRole('button',{name:'Continue to original Scene 1'}).first().click();
   const used=new Set();
   for(let i=0;i<10;i++){
    await page.evaluate(i=>adventureRunnerGo(i),i);
    assert.equal(await page.locator('.ar-field textarea').count(),9);
    assert.match(await page.locator('#ar-readAloud').inputValue(),new RegExp('PHASE6 PREVIEW SCENE '+(i+1)));
    const map=await page.evaluate(i=>adventureRunnerMapId(i),i);
    if(!map)continue;
    await page.getByRole('button',{name:'Open battle map'}).click();
    assert.equal(await page.evaluate(()=>page),'maps');
    assert.equal(await page.evaluate(()=>mapState().active),map);
    used.add(map);
    await page.getByRole('group',{name:'DM session shortcuts'}).getByRole('button',{name:'← Adventure Runner'}).click();
    assert.equal(await page.evaluate(()=>adventurePreviewIndex),i);
   }
   assert.ok(used.size>=4);
  });
  await check('Fog and player projection hide private tokens and unrevealed terrain',async()=>{
   await page.evaluate(()=>{
    goto('maps');
    const ms=mapState();ms.active='evergarden-home-hive';ms.viewMode='dm';
    const m=currentMap();m.playerShared=true;
    m.revealed=[4*mapCols(m)+4];m.fogVision2=false;
    m.tokens=[
     {id:'visible-pc',kind:'pc',ref:'phase6-0',x:4,y:4},
     {id:'hidden-pc',kind:'pc',ref:'phase6-1',x:8,y:8},
     {id:'secret-npc',kind:'npc',name:'PHASE6 SECRET NPC',x:4,y:4,showToPlayers:false},
     {id:'visible-monster',kind:'monster',name:'QA Garden Mite',x:4,y:4,showToPlayers:true}
    ];
    save();render();
   });
   const snap=await page.evaluate(()=>livePlayerSnapshot());
   assert.equal(snap.scene.tokens.length,2);
   const payload=JSON.stringify(snap);
   assert.ok(!payload.includes('PHASE6 SECRET'));
   assert.ok(!payload.includes('hidden-pc'));
   const display=context.waitForEvent('page');
   await page.getByRole('button',{name:/Open Player Display/}).first().click();
   const player=await display;
   player.on('pageerror',e=>errors.push('player: '+e.message));
   await player.waitForLoadState('load');
   await player.locator('#live-board').waitFor({state:'visible',timeout:12000});
   assert.equal(await player.locator('.token').count(),2);
   await page.evaluate(()=>{
    const m=currentMap();
    mapMove(m.tokens.find(t=>t.id==='visible-pc'),5,4);
   });
   await page.waitForFunction(()=>currentMap().tokens.find(t=>t.id==='visible-pc').x===5);
   await page.evaluate(()=>{currentMap().revealed=[];save();render()});
   await player.locator('.token').first().waitFor({state:'detached',timeout:12000});
   assert.equal(await player.locator('.token').count(),0);
   await page.evaluate(()=>{currentMap().playerShared=false;save();render()});
   await player.locator('.placeholder').waitFor({state:'visible',timeout:12000});
   assert.equal(await player.locator('#live-board').count(),0);
   await player.close();
  });
  await check('Combat rehearsal updates turn history without completing an encounter',async()=>{
   await page.evaluate(()=>{goto('combat');combatAddPreset('mite');combatNext()});
   assert.ok(await page.evaluate(()=>combatState().participants.length>0));
   assert.ok(await page.evaluate(()=>combatState().history.length>0));
   assert.ok(await page.evaluate(()=>db.encounters.every(x=>x.status!=='Completed')));
  });
  await check('Refresh preserves fog, tokens, note and combat but never starts the campaign',async()=>{
   const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
   assert.equal(before.maps.scenes.find(x=>x.id==='evergarden-home-hive').revealed.length,0);
   await page.reload({waitUntil:'domcontentloaded'});
   const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
   assert.deepEqual(after,before);
   assert.match(after.sessionCommandNotes,/PHASE6 DM PRIVATE/);
   assert.equal(after.campaign.session,0);
   assert.equal(after.sessions.find(x=>x.id==='vesper-session-1').status,'Planned');
   assert.ok(after.decisions.every(x=>x.status==='Not decided'));
   assert.equal(await protectedState(),initial,'The scripted preview must not mutate protected campaign records');
  });
  await check('No uncaught errors or successful cloud requests',async()=>{
   assert.deepEqual(errors,[]);
   assert.equal(await page.evaluate(()=>window.SHCloud?.isLinked?.()),false);
  });
 }finally{
  fs.writeFileSync('phase6-dm-session-results.json',JSON.stringify({synthetic:true,results,passed:results.filter(x=>x.status==='PASS').length,failed:results.filter(x=>x.status==='FAIL').length},null,2));
  await context.close();await browser.close();
 }
 if(results.some(x=>x.status==='FAIL'))process.exitCode=1;
})().catch(e=>{console.error(e.stack||e);process.exitCode=1});

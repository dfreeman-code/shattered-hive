/* Cloud Sync 2.0 browser smoke test (uses mocked Supabase only).
   Run: node tests/cloud-sync-v2.smoke.cjs
   Pre-req: npm install --no-save playwright && npx playwright install chromium
   Set BASE_URL for a locally served checkout; never point at the live family account.
*/
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async () => {
  const base = process.env.BASE_URL || 'http://127.0.0.1:8765/';
  let revision = 0;
  let payload = null;
  const history = [];
  const failures = [];
  const screenshot = process.env.SMOKE_SCREENSHOT || '/tmp/shattered-hive-cloud-sync-v2.png';
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({acceptDownloads:true, viewport:{width:1440,height:900}});
  const page = await context.newPage();
  page.on('pageerror',error => failures.push(String(error)));
  const respond = (route, body) => route.fulfill({
    status:200, contentType:'application/json; charset=utf-8',
    headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(body)
  });
  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async route => {
    const request = route.request();
    const u = new URL(request.url());
    if (u.pathname === '/rest/v1/shattered_hive_cloud_saves') {
      const includePayload = (u.searchParams.get('select') || '').includes('payload');
      return respond(route, revision ? [{
        revision, updated_at:new Date().toISOString(),
        ...(includePayload?{payload}: {})
      }] : []);
    }
    if (u.pathname === '/rest/v1/shattered_hive_save_history') {
      const select = u.searchParams.get('select') || '';
      let rows = history.slice().reverse();
      const target = u.searchParams.get('revision');
      if (target?.startsWith('eq.')) rows = rows.filter(x => x.revision===Number(target.slice(3)));
      return respond(route, rows.map(x => select.includes('payload') ?
        {revision:x.revision,payload:x.payload} :
        {revision:x.revision,created_at:x.created_at,pc_count:x.pc_count,
          npc_count:x.npc_count,map_count:x.map_count}));
    }
    if (u.pathname === '/rest/v1/rpc/shattered_hive_store') {
      const d = request.postDataJSON();
      if (Number(d.expected_revision)!==revision) return respond(route,null);
      revision++;
      payload = structuredClone(d.document);
      const snapshot = {
        revision, payload:structuredClone(payload),created_at:new Date().toISOString(),
        pc_count:payload.pcs.length,npc_count:payload.npcs.length,map_count:0
      };
      history.push(snapshot);
      return respond(route,revision);
    }
    if (u.pathname.startsWith('/auth/v1/')) {
      return respond(route,{access_token:'smoke-token',refresh_token:'smoke-refresh',
        expires_in:3600,user:{id:'smoke-user',email:'smoke@example.org'}});
    }
    throw new Error('Unexpected cloud endpoint '+u.pathname);
  });
  // Seed a disposable, already authenticated session BEFORE application boot.
  await context.addInitScript(() => {
    try {
      if (!location.hostname.includes('127.0.0.1')) return;
      localStorage.setItem('shattered-hive-cloud-session-v1', JSON.stringify({
        access_token:'smoke-token',refresh_token:'smoke-refresh',
        expires_at:Math.floor(Date.now()/1000)+3600,
        user:{id:'smoke-user',email:'smoke@example.org'}
      }));
    } catch (_) {}
  });
  const check = (name,condition) => {
    assert.ok(condition,name); console.log('PASS '+name);
  };
  try {
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const indicator = page.locator('#cloud-header-status');
    await indicator.waitFor({state:'visible',timeout:20000});
    check('Cloud status is visible',await indicator.count()===1);
    await indicator.click();
    const panel=page.locator('#cloud-sync-panel');
    await panel.waitFor({state:'visible',timeout:10000});
    check('Header opens synchronization settings',await panel.count()===1);
    await page.getByRole('button',{name:'Upload this browser to cloud (first time)'}).waitFor();
    page.once('dialog',d=>d.accept());
    const backupPromise=page.waitForEvent('download');
    await page.getByRole('button',{name:'Upload this browser to cloud (first time)'}).click();
    const backup=await backupPromise;
    check('First upload exports local JSON backup',backup.suggestedFilename().endsWith('.json'));
    await page.getByText('Cloud up to date.',{exact:false}).first().waitFor({timeout:15000});
    check('First cloud upload completes',revision===1&&!!payload&&Array.isArray(payload.pcs));
    await page.getByRole('button',{name:'Load recovery history'}).click();
    await page.getByText('Revision 1',{exact:false}).first().waitFor({timeout:15000});
    check('Recovery history displays the uploaded revision',await panel.getByText('Revision 1',{exact:false}).count()>0);
    await page.waitForFunction(() => document.querySelector('#cloud-header-status')?.textContent === 'Cloud: synced');
    // On the mock server simulate another device adding a newer revision,
    // then verify this browser fetches the new snapshot safely.
    const updated=structuredClone(payload);
    updated.pcs.push({id:'smoke-hero',name:'Smoke Hero',species:'Beetlekin',class:'Paladin'});
    revision++;
    payload=updated;
    history.push({revision,payload:structuredClone(payload),created_at:new Date().toISOString(),
      pc_count:payload.pcs.length,npc_count:payload.npcs.length,map_count:0});
    await page.getByRole('button',{name:'Check for cloud updates'}).click();
    await page.waitForFunction(() => {
      const d=JSON.parse(localStorage.getItem('shattered-hive-v1') || 'null');
      return d?.pcs?.some(x=>x.name==='Smoke Hero');
    },null,{timeout:15000});
    const localState=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
    check('New remote character arrives locally',localState?.pcs?.some(x=>x.name==='Smoke Hero'));
    // Campaign replacement re-renders the view, which may leave Settings.
    // Return to Settings before loading recovery history.
    await page.locator('#cloud-header-status').click();
    await page.locator('#cloud-sync-panel').waitFor({state:'visible'});
    await page.getByRole('button',{name:'Load recovery history'}).click();
    await page.getByText('Revision 2',{exact:false}).first().waitFor({timeout:15000});
    await page.waitForFunction(() => document.querySelector('#cloud-header-status')?.textContent === 'Cloud: synced');
    // Restore older revision, verify another JSON backup is offered and
    // the restore is written as a NEW revision.
    page.once('dialog',d=>d.accept());
    const restoreBackup=page.waitForEvent('download');
    const row=panel.locator('.cloud-history-item').filter({hasText:'Revision 1'});
    await row.getByRole('button',{name:'Restore'}).click();
    const downloaded=await restoreBackup;
    check('Restore exports current local JSON backup',downloaded.suggestedFilename().endsWith('.json'));
    // Restoring the campaign can also re-render the view away from Settings.
    // Verify the persisted cloud revision and actual restored campaign instead.
    await page.waitForFunction(() => {
      const meta=JSON.parse(localStorage.getItem('shattered-hive-cloud-sync-meta-v1') || 'null');
      const save=JSON.parse(localStorage.getItem('shattered-hive-v1') || 'null');
      return meta?.revision===3 && !save?.pcs?.some(x=>x.name==='Smoke Hero');
    },null,{timeout:15000});
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('shattered-hive-v1')));
    check('Restoration creates a fresh revision',revision===3);
    check('Restoration recovers old characters',!restored.pcs.some(x=>x.name==='Smoke Hero'));
    await page.screenshot({path:screenshot,fullPage:true});
    check('No uncaught page errors',failures.length===0);
    console.log('SMOKE TEST PASSED: browser checks completed using disposable Supabase responses.');
  } catch (e) {
    console.error('SMOKE TEST FAILED',e.stack||e);
    console.error('Current app status:',await page.locator('#cloud-sync-status').allTextContents().catch(()=>[]));
    if (failures.length) console.error('Page errors:',failures);
    await page.screenshot({path:screenshot,fullPage:true}).catch(()=>{});
    process.exitCode=1;
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});

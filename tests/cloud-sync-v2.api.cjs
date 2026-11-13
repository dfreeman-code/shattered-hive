/* Cloud Sync 2.0 safe, anonymous READ-ONLY test against real Supabase.
   No login, no campaign payloads, no writes, no credentials.
   Expected: real PostgREST endpoint reachable but private rows inaccessible.
*/
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
async function main(){
 const sandbox={window:{}};
 vm.runInNewContext(fs.readFileSync('assets/cloud-config.js','utf8'),sandbox,{timeout:1000});
 const cfg=sandbox.window.SH_CLOUD_CONFIG;
 assert.match(cfg.url,/^https:\/\/[a-z0-9-]+\.supabase\.co$/);
 assert.match(cfg.anonKey,/^sb_publishable_/);
 for(const table of ['shattered_hive_save_history','shattered_hive_cloud_saves']){
  const endpoint=cfg.url+'/rest/v1/'+table+'?select=revision&limit=1';
  const res=await fetch(endpoint,{headers:{apikey:cfg.anonKey,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  assert.equal(res.status,200,table+' expected to be reachable with public client key');
  const rows=await res.json();
  assert.ok(Array.isArray(rows)&&rows.length===0,table+' must not expose private rows to an anonymous visitor');
  console.log('PASS Real Supabase anonymous PostgREST '+table+' returns zero private rows');
 }
}
main().catch(e=>{console.error('FAIL read-only PostgREST:',e.stack||e);process.exitCode=1});

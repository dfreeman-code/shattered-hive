import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';
const origin='https://dfreeman-code.github.io';
const env={OPENAI_API_KEY:'test-key',DM_ACCESS_TOKEN:'super-private-test-token',OPENAI_MODEL:'gpt-6-luna'};
const url='https://example.workers.dev/chat';
function req({method='POST',originHeader=origin,authorization='Bearer '+env.DM_ACCESS_TOKEN,body={prompt:'What is next?',context:{campaign:{name:'The Shattered Hive'}}},contentType='application/json'}={}){
 return new Request(url,{method,headers:{Origin:originHeader,Authorization:authorization,'Content-Type':contentType},body:method==='POST'?JSON.stringify(body):undefined});
}
test('rejects non-campaign origin',async()=>{const r=await worker.fetch(req({originHeader:'https://other-site.example'}),env);assert.equal(r.status,403)});
test('rejects missing or invalid access token before AI request',async()=>{const r=await worker.fetch(req({authorization:'Bearer invalid'}),env);assert.equal(r.status,401)});
test('requires JSON and valid prompt',async()=>{
 assert.equal((await worker.fetch(req({contentType:'text/plain'}),env)).status,415);
 assert.equal((await worker.fetch(req({body:{prompt:'',context:{}}}),env)).status,400);
});
test('blocks large campaign context',async()=>{const r=await worker.fetch(req({body:{prompt:'Help',context:{notes:'x'.repeat(38000)}}}),env);assert.equal(r.status,413)});
test('valid assisted request calls Responses API and returns read-only answer',async()=>{
 const previous=globalThis.fetch;let sent;
 globalThis.fetch=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'Canon: Vesper. Proposal: inspect the roots.'}]}]}),{status:200,headers:{'content-type':'application/json'}})};
 try{
  const response=await worker.fetch(req(),env);
  assert.equal(response.status,200);
  const answer=await response.json();
  assert.match(answer.answer,/Vesper/);
  assert.equal(answer.writes,false);
  assert.equal(sent.store,false);
  assert.equal(sent.model,'gpt-6-luna');
  assert.equal(sent.max_output_tokens,1200);
 }finally{globalThis.fetch=previous}
});
test('preflight is allowed only from trusted origin',async()=>{
 const response=await worker.fetch(new Request(url,{method:'OPTIONS',headers:{Origin:origin}}),env);
 assert.equal(response.status,204);
 assert.equal(response.headers.get('access-control-allow-origin'),origin);
});

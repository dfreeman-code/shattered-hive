/* Assisted Dungeon Master - Phase 1. Read-only; no API calls, no campaign writes. */
'use strict';
const DM_ACTIONS=Object.freeze([
 ['Prepare Next Session','Prepare the next planned session. Use established Vesper canon, player characters, unresolved clues and planned quests. Separate canon, options, checks, and spoilers. Do not claim that a session has occurred.'],
 ['Review Campaign Story','Review King Vesper, the six lights, the Heartroot, continuity conflicts, unresolved threads and the order of reveals. Separate established facts from ideas.'],
 ['Generate NPC Dialogue','Suggest three distinct lines of dialogue for a relevant NPC, consistent with what that NPC knows. Mark every line as proposed and keep hidden secrets DM-only.'],
 ['Suggest Encounter','Suggest a thematic 2024 D&D 5e encounter appropriate to known party levels. Flag any missing party statistics and homebrew assumptions.'],
 ['Analyze Player Decisions','Identify actual confirmed choices and their recorded consequences. Treat Not decided prompts as hypothetical, never as events that occurred.'],
 ['Generate Session Recap','Summarize only sessions explicitly marked played or completed, and recorded confirmed decisions. If no session has occurred, say so.']
]);
const dmSessionDrafts=[];
const dmChat=[];
let dmWorkerUrl='';
let dmAccessToken='';
let dmBusy=false; // Deliberately ephemeral: no changes to campaign save format.
function dmArray(k){return Array.isArray(db[k])?db[k]:[]}
function dmConfirmed(d){return d&&['Decided','Revisited'].includes(d.status)}
function dmPlayed(s){return s&&['Played','Completed'].includes(s.status)}
function dmSnapshot(){
 // Clone selected, current records. Exclude storyArchives, maps and other huge image data.
 const keys=['pcs','npcs','quests','sessions','decisions','locations','factions','relationships','encounters','events','notes'];
 const data={campaign:clone(db.campaign||{}),canon:'King Vesper, the Hollow King; the six lights and shattered Heartroot. Canon must be verified against current campaign records.',status:'Pre-campaign unless played session records establish otherwise',records:{}};
 for(const k of keys)data.records[k]=clone(dmArray(k));
 data.records.decisions=data.records.decisions.map(x=>({...x,classification:dmConfirmed(x)?'Confirmed player choice':'Unplayed prompt / unconfirmed'}));
 data.records.sessions=data.records.sessions.map(x=>({...x,classification:dmPlayed(x)?'Played session':'Planned / not confirmed played'}));
 return data;
}
function dmSummary(){
 return {heroes:dmArray('pcs').length,npcs:dmArray('npcs').length,quests:dmArray('quests').length,confirmed:dmArray('decisions').filter(dmConfirmed).length,prompts:dmArray('decisions').filter(x=>!dmConfirmed(x)).length,played:dmArray('sessions').filter(dmPlayed).length,archives:Array.isArray(db.storyArchives)?db.storyArchives.length:0};
}
function dmPage(){
 const c=dmSummary();
 return `<div class="headrow"><div><h2>✧ AI Dungeon Master</h2><p class="muted">Assisted mode · You decide what becomes campaign canon.</p></div><button class="btn secondary" type="button" onclick="goto('settings')">Export campaign backup</button></div>
 <div class="dm-status" role="status"><b>Assisted DM — private AI connection.</b><span>Only Ask AI sends your DM-only campaign context to the configured private Worker. AI responses cannot edit records.</span></div>
 <div class="dm-layout">
  <section class="card dm-panel" aria-label="DM assistant workspace">
   <h3>Private AI connection</h3>
   <div class="field"><label for="dmWorkerUrl">Worker HTTPS URL</label><input id="dmWorkerUrl" type="url" autocomplete="off" spellcheck="false" placeholder="https://your-worker.workers.dev" value="${esc(dmWorkerUrl)}"></div>
   <div class="field"><label for="dmAccessToken">DM access token (not an OpenAI API key)</label><input id="dmAccessToken" type="password" autocomplete="off" placeholder="Worker access token" value="${esc(dmAccessToken)}"></div>
   <p class="dm-small">Connection settings live in this tab's memory. Deploy the private Worker and add server-side secrets before asking the AI.</p>
   <h3>Prepare a DM request</h3><p class="dm-small">Choose a quick action or write your own. Ask AI sends your DM-only context only when clicked.</p>
   <div class="dm-quick" aria-label="Quick actions">${DM_ACTIONS.map(([label],i)=>`<button type="button" onclick="dmQuick(${i})">${esc(label)}</button>`).join('')}</div>
   <label for="dmPrompt">Your DM request</label><textarea id="dmPrompt" class="dm-compose" maxlength="6000" placeholder="What should we prepare for the next session?"></textarea>
   <div class="actions" style="justify-content:flex-start;margin-top:10px">
    <button id="dmAsk" class="btn" type="button" onclick="dmAsk()">Ask AI</button>
    <button class="btn secondary" type="button" onclick="dmCopyRequest()">Copy request + DM context</button>
    <button class="btn secondary" type="button" onclick="dmSaveDraft()">Keep draft this session</button>
   </div>
   <p class="dm-small">Copying includes DM-only secrets and confirmed player choices. Paste only into a private conversation you trust. Nothing is sent automatically.</p>
   <h3 style="margin-top:22px">AI conversation — this tab only</h3><p class="dm-small">Responses are proposals, never approved campaign changes. Review each suggestion and enter accepted updates through the existing editor screens.</p>
   <div id="dmChat" class="dm-history" aria-live="polite">${dmChatMarkup()}</div><p id="dmAiError" class="dm-small" role="alert"></p>
   <button class="btn secondary small" type="button" onclick="dmClearChat()">Clear chat</button>
   <h3 style="margin-top:22px">Session-only drafts</h3>
   <div id="dmHistory" class="dm-history">${dmDraftMarkup()}</div>
  </section>
  <aside class="dm-panel">
   <section class="card"><h3>Active campaign context</h3>
    <p><b>${esc(db.campaign?.name||'The Shattered Hive')}</b></p>
    <p><span class="dm-tag good">Vesper storyline</span><span class="dm-tag warn">DM-only</span><span class="dm-tag">Archive excluded</span></p>
    <p class="dm-small">${esc(db.campaign?.date||'Date unknown')} · ${esc(db.campaign?.location||'Location unknown')}</p>
    <div class="dm-counts">
     <div class="dm-count"><b>${c.heroes}</b><small>Heroes</small></div>
     <div class="dm-count"><b>${c.npcs}</b><small>NPCs</small></div>
     <div class="dm-count"><b>${c.confirmed}</b><small>Confirmed choices</small></div>
     <div class="dm-count"><b>${c.played}</b><small>Played sessions</small></div>
    </div>
    <p class="dm-small">${c.prompts} undecided prompts · ${c.archives} archived story collections kept separate.</p>
    <details><summary>Context categories</summary><p class="dm-small">Campaign profile, characters, NPCs, quests, sessions, decisions, locations, factions, relationships, encounters, events, notes. Map images and legacy archives are excluded.</p></details>
   </section>
   <section class="card section"><h3>Approval-first rules</h3><p>Responses are suggestions, not canon. No record changes happen here. An eventual backend will require explicit review before saving changes.</p><p class="dm-small">Your campaign currently lives in this browser; exporting a backup remains important.</p></section>
  </aside>
 </div>`;
}
function dmQuick(i){const action=DM_ACTIONS[i];if(!action)return;const el=document.getElementById('dmPrompt');if(el){el.value=action[1];el.focus()}}
function dmDraftMarkup(){return dmSessionDrafts.length?dmSessionDrafts.map((x,i)=>`<article><small>Draft ${i+1} · Not submitted to AI</small><pre>${esc(x)}</pre></article>`).join(''):'<p class="dm-small">No drafts saved this session. Drafts disappear when this page reloads.</p>'}
function dmSaveDraft(){const el=document.getElementById('dmPrompt');const q=el?.value.trim();if(!q){toast('Write a request first');return}dmSessionDrafts.push(q);document.getElementById('dmHistory').innerHTML=dmDraftMarkup();toast('Draft kept in this tab only')}
function dmRequestPayload(){const q=document.getElementById('dmPrompt')?.value.trim();if(!q)return null;return 'THE SHATTERED HIVE — PRIVATE DM CONTEXT\nRole: Assisted Dungeon Master. Never rewrite established canon or claim planned decisions happened. Separate facts, interpretations and proposals. No changes may be committed without DM approval. The campaign may not have begun.\n\nCAMPAIGN CONTEXT (DM-ONLY; excludes archived legacy stories):\n'+JSON.stringify(dmSnapshot(),null,2)+'\n\nREQUEST:\n'+q}
async function dmCopyRequest(){const payload=dmRequestPayload();if(!payload){toast('Write a request first');return}try{await navigator.clipboard.writeText(payload);toast('DM request and context copied')}catch(e){toast('Clipboard unavailable. Check browser permissions and use HTTPS.')} }

function dmChatMarkup(){return dmChat.length?dmChat.map(x=>`<article><b>${x.role==='assistant'?'AI suggestion — unapproved':'DM request'}</b><pre>${esc(x.text)}</pre></article>`).join(''):'<p class="dm-small">No AI messages yet. Nothing has been sent.</p>'}
function dmRenderChat(){const target=document.getElementById('dmChat');if(target){target.innerHTML=dmChatMarkup();target.scrollTop=target.scrollHeight}}
function dmClearChat(){dmChat.length=0;dmRenderChat();toast('Chat cleared for this tab')}
async function dmAsk(){
 if(dmBusy)return;
 const prompt=document.getElementById('dmPrompt')?.value.trim();
 const rawUrl=document.getElementById('dmWorkerUrl')?.value.trim();
 const token=document.getElementById('dmAccessToken')?.value.trim();
 if(!prompt){toast('Write a DM request first');return}
 let url;
 try{url=new URL(rawUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Invalid URL')}
 catch{toast('Enter your deployed Worker HTTPS URL');return}
 if(!token){toast('Enter your private DM access token');return}
 dmWorkerUrl=url.origin;dmAccessToken=token;
 dmBusy=true;
 const button=document.getElementById('dmAsk');
 if(button){button.disabled=true;button.textContent='Asking AI…'}
 const prior=dmChat.slice(-6).map(x=>({role:x.role,text:x.text}));
 try{
  const response=await fetch(url.origin+'/chat',{method:'POST',mode:'cors',
   headers:{'content-type':'application/json','authorization':'Bearer '+token},
   body:JSON.stringify({prompt,context:dmSnapshot(),history:prior}),
   signal:AbortSignal.timeout(35000)});
  let data;try{data=await response.json()}catch{throw Error('Invalid response from Worker')}
  if(!response.ok)throw Error(data.error||'AI request failed');
  if(typeof data.answer!=='string'||!data.answer.trim()||data.writes!==false)throw Error('Unexpected AI response');
  dmChat.push({role:'user',text:prompt},{role:'assistant',text:data.answer});
  dmRenderChat();const error=document.getElementById('dmAiError');if(error)error.textContent='';toast('AI suggestion received — no data changed');
 }catch(e){toast('AI connection failed');const status=document.getElementById('dmAiError');if(status)status.textContent='Request failed: '+String(e.message||e).slice(0,200)}
 finally{dmBusy=false;if(button){button.disabled=false;button.textContent='Ask AI'}}
}

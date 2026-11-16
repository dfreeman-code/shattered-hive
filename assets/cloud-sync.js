/* Optional private cloud sync for Campaign Chronicle. No library/framework dependency. */
(function () {
  'use strict';
  var CONFIG = window.SH_CLOUD_CONFIG || {};
  var URL_BASE = String(CONFIG.url || '').replace(/\/+$/, '');
  var API_KEY = String(CONFIG.anonKey || '');
  var SESSION_KEY = 'shattered-hive-cloud-session-v1';
  var META_KEY = 'shattered-hive-cloud-sync-meta-v1';
  var PENDING_KEY = 'shattered-hive-cloud-pending-v2-1';
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL_BASE) &&
    (API_KEY.startsWith('sb_publishable_') || API_KEY.startsWith('eyJ'));
  var bridge = null, session = null, revision = 0, linked = false;
  var busy = false, blocked = false, timer = null, changedWhileBusy = false;
  var refreshPromise = null, recoveryPreview = null;
  var status = configured ? 'Cloud sign-in is optional; browser saves continue working.' :
    'Cloud sync setup is not complete. Local browser saves still work.';
  var remoteAvailable = false;
  var historyRows = [], historyLoaded = false, lastSyncedAt = null;
  function getLocal() { return bridge.getData(); }
  function fingerprintText(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16) + ':' + s.length;
  }
  function fingerprint(value) { return fingerprintText(JSON.stringify(value)); }
  // PostgreSQL JSONB reorders object keys; array ordering is still significant.
  // Compare exact document content, not an insertion-order-dependent hash.
  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') {
      var sorted = {};
      Object.keys(value).sort().forEach(function(key){sorted[key]=canonical(value[key]);});
      return sorted;
    }
    return value;
  }
  function sameContent(a,b) { return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b)); }
  function meta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (_) { return null; }
  }
  function setMeta() {
    localStorage.setItem(META_KEY, JSON.stringify({
      userId: session.user.id, revision: revision, fingerprint: fingerprint(getLocal()),
      lastSyncedAt: lastSyncedAt || new Date().toISOString()
    }));
    clearPending();
  }

  // Keep only small provenance metadata: the campaign itself is already durable in
  // shattered-hive-v1. Never duplicate multi-megabyte campaign JSON in localStorage.
  function pending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); }
    catch (_) { return null; }
  }
  function markPending() {
    if (!bridge) return;
    var m = meta(), p = pending(), localHash = fingerprint(getLocal());
    if (m && m.fingerprint === localHash) { clearPending(); return; }
    var v = {fingerprint:localHash, since:p && p.since || new Date().toISOString()};
    try { localStorage.setItem(PENDING_KEY,JSON.stringify(v)); } catch (_) {}
  }
  function clearPending() { try { localStorage.removeItem(PENDING_KEY); } catch (_) {} }
  function hasUnconfirmedEdits() {
    if (!bridge) return false;
    var m = meta(), p = pending(), hash = fingerprint(getLocal());
    return !!((m && m.fingerprint !== hash) || (p && p.fingerprint === hash));
  }
  function lastConfirmedAt() {
    var m = meta(); return lastSyncedAt || (m && m.lastSyncedAt) || null;
  }
  // Explicit, deterministic 3-way merge. Recursively merges distinct fields
  // and arrays of records with unique stable IDs. Conflicts fail closed.
  function equal(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
  function isRecord(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  function recordArray(v) {
    return Array.isArray(v) && v.every(function(x){return isRecord(x) && typeof x.id === 'string' && x.id.length>0;})
      && new Set(v.map(function(x){return x.id;})).size === v.length;
  }
  function merge3(base,local,remote,path,conflicts) {
    if (equal(local,remote)) return local;
    if (equal(local,base)) return remote;
    if (equal(remote,base)) return local;
    if (isRecord(base) && isRecord(local) && isRecord(remote)) {
      var keys = Array.from(new Set(Object.keys(base).concat(Object.keys(local),Object.keys(remote))));
      var result = {};
      keys.forEach(function(k){
        var b=Object.prototype.hasOwnProperty.call(base,k),
            l=Object.prototype.hasOwnProperty.call(local,k),
            r=Object.prototype.hasOwnProperty.call(remote,k);
        var label=path+'.'+k;
        if (!b) {
          if (l && !r) result[k]=local[k];
          else if (!l && r) result[k]=remote[k];
          else if (l && r) { if(equal(local[k],remote[k]))result[k]=local[k]; else conflicts.push(label); }
        } else if (!l && !r) {
          // both removed
        } else if (!l) {
          if (!equal(remote[k],base[k])) conflicts.push(label);
        } else if (!r) {
          if (!equal(local[k],base[k])) conflicts.push(label);
        } else result[k]=merge3(base[k],local[k],remote[k],label,conflicts);
      });
      return result;
    }
    if (recordArray(base) && recordArray(local) && recordArray(remote)) {
      var bm=new Map(base.map(function(x){return [x.id,x];}));
      var lm=new Map(local.map(function(x){return [x.id,x];}));
      var rm=new Map(remote.map(function(x){return [x.id,x];}));
      var ordered=Array.from(new Set(remote.map(function(x){return x.id;}).concat(local.map(function(x){return x.id;}))));
      var output=[];
      ordered.forEach(function(id){
        var b=bm.has(id),l=lm.has(id),r=rm.has(id),label=path+'['+id+']';
        if (!b) {
          if(l && !r)output.push(lm.get(id));
          else if(!l && r)output.push(rm.get(id));
          else if(l && r) { if(equal(lm.get(id),rm.get(id)))output.push(lm.get(id));else conflicts.push(label); }
        } else if(!l && !r){
          // both deleted
        } else if(!l) {
          if(!equal(rm.get(id),bm.get(id)))conflicts.push(label);
        } else if(!r) {
          if(!equal(lm.get(id),bm.get(id)))conflicts.push(label);
        } else output.push(merge3(bm.get(id),lm.get(id),rm.get(id),label,conflicts));
      });
      return output;
    }
    conflicts.push(path);
    return remote; // never written when any conflict exists
  }
  function describeChanges(base,next) {
    var keys=Array.from(new Set(Object.keys(base).concat(Object.keys(next))));
    return keys.filter(function(k){return !equal(base[k],next[k]);});
  }
  async function loadBaseRevision(wanted) {
    var rows=await request('/rest/v1/shattered_hive_save_history?select=revision,payload&revision=eq.'+
      encodeURIComponent(wanted)+'&limit=1','GET',undefined,true);
    return Array.isArray(rows) && rows[0] ? rows[0].payload : null;
  }
  async function previewRecovery() {
    if (busy || !session || !remoteAvailable) return;
    recoveryPreview=null;
    busy=true;renderStatus();
    try {
      var saved=meta(), localHash=fingerprint(getLocal());
      if(!saved || saved.userId!==session.user.id || !Number.isSafeInteger(Number(saved.revision)) ||
        Number(saved.revision)<1) return notify('No verified sync baseline for this browser. Export JSON and reconcile manually; cloud untouched.');
      var remote=await readCloud(); validateDocument(remote.payload);
      var base=await loadBaseRevision(Number(saved.revision));
      if(!base) return notify('Original cloud revision is no longer in recovery history. Export JSON and reconcile manually; cloud untouched.');
      var conflicts=[], merged=merge3(base,getLocal(),remote.payload,'campaign',conflicts);
      if(conflicts.length) return notify('Recovery needs manual review: conflicting edits in '+
        conflicts.slice(0,5).join(', ')+(conflicts.length>5?' and '+(conflicts.length-5)+' more':'')+
        '. Export JSON. No data changed.');
      validateDocument(merged);
      var modified=describeChanges(remote.payload,merged),remoteChanged=describeChanges(base,remote.payload);
      recoveryPreview={merged:merged,revision:Number(remote.revision),updatedAt:remote.updated_at,
        localHash:localHash,changes:modified,remoteChanges:remoteChanged};
      notify('Recovery preview ready. Local sections to preserve: '+
        (modified.join(', ')||'none')+'. Cloud sections updated elsewhere: '+
        (remoteChanged.join(', ')||'none')+'. Review and confirm before applying.');
    } catch(e){ recoveryPreview=null;notify('Recovery preview failed: '+e.message+'. Local data untouched.'); }
    finally{busy=false;renderStatus();}
  }
  async function applyRecovery() {
    if(busy||!session||!recoveryPreview)return;
    var p=recoveryPreview;
    if(fingerprint(getLocal())!==p.localHash) {
      recoveryPreview=null;return notify('Local edits changed since preview. Run preview again; nothing overwritten.');
    }
    if(!confirm('Merge reviewed changes with current cloud revision '+p.revision+
      '? A JSON backup will download first. This replaces this browser with the merged version AFTER the cloud write is confirmed.'))return;
    // Abort before writing if the backup cannot be produced.
    try { bridge.exportBackup(); }catch(e){return notify('Backup export failed; recovery cancelled: '+e.message);}
    busy=true;renderStatus();
    try{
      // Re-fetch remote and baseline immediately before the compare-and-swap write.
      var current=await readCloud();
      if(!current || Number(current.revision)!==p.revision) {
        recoveryPreview=null;return notify('Cloud changed since recovery preview; no data overwritten. Preview again.');
      }
      if(fingerprint(getLocal())!==p.localHash) {
        recoveryPreview=null;return notify('Local edits changed; recovery cancelled.');
      }
      var result=await request('/rest/v1/rpc/shattered_hive_store','POST',
        {expected_revision:p.revision,document:p.merged},true);
      if(result==null || !Number.isSafeInteger(Number(result))) {
        recoveryPreview=null;linked=false;blocked=true;
        return notify('Cloud version conflict. No data overwritten; preview again.');
      }
      revision=Number(result);remoteAvailable=true;historyLoaded=false;
      // An in-flight local change must not be silently discarded.
      if(fingerprint(getLocal())!==p.localHash || changedWhileBusy) {
        recoveryPreview=null;linked=false;blocked=true;markPending();
        return notify('Merged cloud successfully, but newer local edits need review. Export JSON and preview recovery again.');
      }
      linked=false;blocked=true;
      bridge.replaceData(p.merged);
      lastSyncedAt=new Date().toISOString();
      setMeta();linked=true;blocked=false;recoveryPreview=null;
      syncSuccess(lastSyncedAt);
      notify('Recovery merged safely into cloud revision '+revision+'. Automatic sync resumed.');
    } catch(e) {
      linked=false;blocked=true;recoveryPreview=null;markPending();
      notify('Recovery write could not be confirmed: '+e.message+'. Keep JSON backup and verify cloud revision before retrying.');
    } finally {busy=false;changedWhileBusy=false;renderStatus();}
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  function renderStatus() {
    var el = document.getElementById('cloud-sync-status');
    if (el) el.textContent = status;
    var parent = document.getElementById('cloud-sync-panel');
    if (parent) parent.outerHTML = settingsHtml();
    var indicator = document.getElementById('cloud-header-status');
    var pendingEdits=hasUnconfirmedEdits();
    if (indicator) {
      var attention = blocked || pendingEdits || /failed|conflict|error|unsynchronized|not confirmed|blocked/i.test(status);
      var label = !configured ? 'Cloud: not configured' :
        !session ? 'Cloud: signed out' : busy ? 'Cloud: syncing' :
        attention ? (pendingEdits?'Cloud: unsynced edits':'Cloud: attention needed') :
        (timer || status.indexOf('waiting to sync') !== -1) ? 'Cloud: pending' :
        linked ? 'Cloud: synced' :
        'Cloud: connection needed';
      indicator.textContent = label;
      indicator.title = status + (pendingEdits?' Browser changes are not confirmed online. Export a backup.':'') + (lastConfirmedAt() ? ' Last successful sync: ' + new Date(lastConfirmedAt()).toLocaleString() : '');
      indicator.setAttribute('aria-label', indicator.title);
      indicator.dataset.state = !configured || !session ? 'offline' : attention ? 'warning' :
        (timer || status.indexOf('waiting to sync') !== -1) ? 'pending' : linked ? 'ok' : 'pending';
    }
  }
  function syncSuccess(at) { lastSyncedAt = at || new Date().toISOString(); renderStatus(); }
  function notify(msg) { status = msg; renderStatus(); }
  function apiHeaders(authorized) {
    var h = {'apikey':API_KEY, 'Content-Type':'application/json'};
    if (authorized && session) h.Authorization = 'Bearer ' + session.access_token;
    return h;
  }
  async function request(path, method, data, authorized) {
    if (!configured) throw Error('Cloud project is not configured.');
    if (authorized) await ensureSession();
    var r = await fetch(URL_BASE + path, {
      method: method || 'GET', headers: apiHeaders(authorized),
      body: data === undefined ? undefined : JSON.stringify(data),
      cache: 'no-store'
    });
    var body = await r.text(), value;
    try { value = body ? JSON.parse(body) : null; } catch (_) { value = body; }
    if (!r.ok) throw Error((value && (value.msg || value.message || value.error_description || value.error)) || 'Cloud request failed (' + r.status + ')');
    return value;
  }
  function remember(v) {
    if (!v || !v.access_token || !v.refresh_token) throw Error('Login did not return a session.');
    session = {
      access_token: v.access_token, refresh_token: v.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + Number(v.expires_in || 3600),
      user: v.user || (session && session.user) || null
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  async function ensureSession() {
    if(!session)throw Error('Sign in first.');
    if(session.expires_at>Date.now()/1000+300 && session.user)return;
    if(refreshPromise)return refreshPromise;
    // One refresh operation per browser window prevents rotating the same token twice.
    refreshPromise=(async function(){
      var old=session;
      try {
        var r=await fetch(URL_BASE+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',headers:apiHeaders(false),
          body:JSON.stringify({refresh_token:old.refresh_token}),cache:'no-store'
        });
        var v=await r.json();
        if(!r.ok)throw Error('Cloud session expired. Please sign out and use a new sign-in link.');
        if(session!==old)return; // another sign-in occurred while request was in flight
        remember(v);
        if(!session.user){
          var u=await fetch(URL_BASE+'/auth/v1/user',{headers:apiHeaders(true),cache:'no-store'});
          if(!u.ok)throw Error('Could not verify signed-in account.');
          session.user=await u.json();localStorage.setItem(SESSION_KEY,JSON.stringify(session));
        }
      }catch(e){
        blocked=true;linked=false;markPending();
        notify('Cloud authentication needs attention. Browser data kept locally. '+e.message);
        throw e;
      }
    })();
    try{return await refreshPromise;}finally{refreshPromise=null;}
  }
  async function sendLink() {
    if (!configured) return notify('Configure the cloud project first.');
    var email = (document.getElementById('cloud-email')?.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return notify('Enter a valid email address.');
    try {
      var redirect = location.origin + location.pathname;
      await request('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect),
        'POST', {email:email, create_user:true}, false);
      notify('Check your email, and open the sign-in link in this browser. If it opens elsewhere, sign in there.');
    } catch (e) { notify('Sign-in email failed: ' + e.message); }
  }
  async function readCloud() {
    var rows = await request('/rest/v1/shattered_hive_cloud_saves?select=revision,payload,updated_at&limit=1',
      'GET', undefined, true);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }
  async function readCloudVersion() {
    var rows = await request('/rest/v1/shattered_hive_cloud_saves?select=revision,updated_at&limit=1',
      'GET', undefined, true);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }
  function validateDocument(d) {
    if (!d || typeof d !== 'object' || Array.isArray(d) ||
      !d.campaign || !Array.isArray(d.pcs) || !Array.isArray(d.npcs) || !Array.isArray(d.quests)) {
      throw Error('Cloud record is not a valid Campaign Chronicle save.');
    }
  }
  async function connect() {
    if (!session) return;
    var uploadStartupChanges = false;
    busy = true; linked = false; blocked = true;
    try {
      await ensureSession();
      var remote = await readCloud(), saved = meta();
      remoteAvailable = !!remote;
      revision = remote ? Number(remote.revision) : 0;
      if (!remote) {
        blocked = false;
        notify('Signed in. No cloud save exists yet. On your HOME computer, export a backup, then choose Upload this browser to cloud.');
      } else {
        validateDocument(remote.payload);
        var localHash = fingerprint(getLocal());
        if (saved && saved.userId === session.user.id && saved.fingerprint === localHash) {
          if (saved.revision === revision) {
            linked = true; blocked = false;
            lastSyncedAt=remote.updated_at;
            setMeta();syncSuccess(remote.updated_at);
            notify('Synced. This browser has the latest cloud campaign.');
          } else {
            bridge.replaceData(remote.payload);
            lastSyncedAt=remote.updated_at;
            setMeta();
            linked = true; blocked = false;
            syncSuccess(remote.updated_at);
            notify('Updated this browser with newer cloud campaign data.');
          }
        } else if (sameContent(getLocal(),remote.payload)) {
          // An old/stale fingerprint can differ even though browser and cloud
          // contain exactly the same document. Re-establish trusted metadata.
          linked=true;blocked=false;lastSyncedAt=remote.updated_at;
          setMeta();syncSuccess(remote.updated_at);
          notify('Synced. Browser and cloud content match; stale sync warning cleared.');
        } else if (typeof bridge.getExpectedStartupPreparation === 'function' &&
                   // Do not silently merge a newer cloud revision with unconfirmed edits.
                   (!saved || saved.userId === session.user.id) &&
                   sameContent(getLocal(),bridge.getExpectedStartupPreparation(remote.payload))) {
          // Local campaign is EXACTLY the authenticated current cloud version
          // plus the app's known one-time Christmas preparation records.
          // Never auto-upload arbitrary offline changes; CAS still protects races.
          linked=true;blocked=false;uploadStartupChanges=true;
          markPending();
          notify('Verified startup preparation is the only local difference. Synchronizing safely…');
        } else if (saved && saved.userId === session.user.id && saved.revision === revision &&
                   typeof bridge.getStartupSerializedData === 'function' &&
                   saved.fingerprint === fingerprintText(bridge.getStartupSerializedData())) {
          // The on-disk document was exactly the last confirmed cloud revision.
          // Only startup preparation/normalization changed it before connect().
          // With no newer remote revision, preserve those edits via the normal
          // CAS upload. Genuine offline edits never satisfy the baseline check.
          linked = true; blocked = false;
          uploadStartupChanges = true;
          markPending();
          notify('Startup preparation changed this browser after the last confirmed save. Synchronizing safely…');
        } else {
          // Never overwrite an unrecognized local save, even if the cloud is newer.
          markPending();
          notify('Cloud campaign found with unconfirmed local differences. Export JSON, then use Preview safe recovery. Never download cloud blindly.');
        }
      }
    } catch (e) { notify('Cloud connection error: ' + e.message); }
    finally {
      busy = false;
      if (uploadStartupChanges && linked && !blocked) queueSave();
      else renderStatus();
    }
  }
  async function upload(first) {
    if (busy || !session) return;
    if (!first && (!linked || blocked)) return notify('Resolve the cloud version before uploading.');
    if (first) {
      if (remoteAvailable) return notify('A cloud save already exists. Download it first; this browser cannot replace it blindly.');
      if (!confirm('Are you on your HOME computer with the original characters? Export a JSON backup before first upload. Upload this browser campaign to your private cloud account?')) return;
      bridge.exportBackup();
    }
    busy = true;
    var snapshot = JSON.parse(JSON.stringify(getLocal()));
    try {
      validateDocument(snapshot);
      var result = await request('/rest/v1/rpc/shattered_hive_store','POST',
        {expected_revision:revision, document:snapshot},true);
      if (result == null || !Number.isFinite(Number(result))) {
        blocked = true; linked = false;
        return notify('SYNC CONFLICT: another computer has newer data. Export this browser backup, then download the cloud version. Nothing was overwritten.');
      }
      revision = Number(result);
      remoteAvailable = true; linked = true; blocked = false; historyLoaded = false;
      syncSuccess(new Date().toISOString());
      // Keep the hash of exactly the revision uploaded. A new edit during the request must be sent next.
      var snapshotHash = fingerprint(snapshot);
      lastSyncedAt=new Date().toISOString();
      localStorage.setItem(META_KEY,JSON.stringify({userId:session.user.id,revision:revision,fingerprint:snapshotHash,lastSyncedAt:lastSyncedAt}));
      if(fingerprint(getLocal())===snapshotHash)clearPending();
      if (fingerprint(getLocal()) !== snapshotHash || changedWhileBusy) {
        changedWhileBusy = false;
        notify('Saved online; sending more recent edits...');
        queueSave();
      } else notify('Cloud up to date. Changes on this browser will sync automatically.');
    } catch (e) { markPending();notify('Cloud upload failed (local save retained): ' + e.message); }
    finally { busy = false; renderStatus(); if(changedWhileBusy && linked && !blocked){changedWhileBusy=false;queueSave();} }
  }
  async function download() {
    if (busy || !session) return;
    if (!confirm('Download the cloud campaign to THIS browser? Current browser data will be exported as a JSON backup first, then replaced.')) return;
    var localBeforeDownload = fingerprint(getLocal());
    busy = true;
    try {
      var remote = await readCloud();
      if (!remote) return notify('No cloud save found. Upload from your home computer first.');
      validateDocument(remote.payload);
      if (fingerprint(getLocal()) !== localBeforeDownload || changedWhileBusy)
        return notify('Local changes happened during download. Nothing replaced; retry after the edits finish syncing.');
      bridge.exportBackup();
      linked = false; blocked = true;
      revision = Number(remote.revision); remoteAvailable = true;
      bridge.replaceData(remote.payload);
      lastSyncedAt=remote.updated_at;
      setMeta();
      linked = true; blocked = false;
      syncSuccess(remote.updated_at);
      notify('Cloud campaign downloaded. This browser is now linked for automatic syncing.');
    } catch (e) { notify('Could not download cloud campaign: ' + e.message); }
    finally {
      busy = false;
      if(changedWhileBusy && linked && !blocked){changedWhileBusy=false;queueSave();}
      else changedWhileBusy=false;
      renderStatus();
    }
  }
  async function refresh() {
    if (busy || !session || timer) return;
    busy = true;
    try {
      var remote = await readCloudVersion();
      if (!remote) return notify('No cloud save yet. Upload from your home computer.');
      var previous = meta(), localHash = fingerprint(getLocal());
      if (!previous || previous.userId !== session.user.id || previous.fingerprint !== localHash) {
        if (linked && !blocked && previous && previous.userId === session.user.id &&
            Number(remote.revision) === revision) {
          changedWhileBusy = true;
          return notify('Local edits are pending; cloud has not changed. Uploading those edits next.');
        }
        linked = false; blocked = true;
        return notify('This browser has unsynchronized changes and the cloud may have changed. Export a backup before resolving the conflict.');
      }
      if (Number(remote.revision) !== revision) {
        // Fetch the larger payload only after discovering a newer revision.
        remote = await readCloud();
        validateDocument(remote.payload);
        if (changedWhileBusy || fingerprint(getLocal()) !== localHash) {
          linked = false; blocked = true;
          return notify('Local edits arrived while retrieving a newer cloud campaign. Nothing was replaced. Export a JSON backup and resolve the conflict.');
        }
        linked = false; blocked = true;
        revision = Number(remote.revision);
        bridge.replaceData(remote.payload);
        lastSyncedAt=remote.updated_at;
        setMeta();
      }
      linked = true; blocked = false; revision = Number(remote.revision);
      syncSuccess(remote.updated_at);
      notify('Cloud checked: this browser is up to date.');
    } catch (e) { notify('Cloud refresh failed: ' + e.message); }
    finally {
      busy = false;
      if (changedWhileBusy && linked && !blocked) { changedWhileBusy = false; queueSave(); }
      else changedWhileBusy = false;
      renderStatus();
    }
  }
  function queueSave() {
    markPending();recoveryPreview=null;
    if (!session || !linked || blocked){renderStatus();return;}
    status = 'Changes saved locally; waiting to sync…';
    if (busy) { changedWhileBusy = true; renderStatus(); return; }
    clearTimeout(timer);
    timer = setTimeout(function () { timer=null; if (!busy && linked && !blocked) upload(false); }, 1200);
    renderStatus();
  }
  function signOut() {
    if(busy)return notify('Finish the current sync operation before signing out.');
    clearTimeout(timer);
    session = null; linked = false; blocked = false; revision = 0; remoteAvailable = false;
    historyRows = []; historyLoaded = false; lastSyncedAt = null;
    localStorage.removeItem(SESSION_KEY);
    markPending();notify('Signed out of cloud sync. Browser saves continue normally.');
  }

  async function loadHistory() {
    if (busy || !session || !remoteAvailable) return;
    busy = true; renderStatus();
    try {
      var rows = await request('/rest/v1/shattered_hive_save_history?select=revision,created_at,pc_count,npc_count,map_count&order=revision.desc&limit=30',
        'GET', undefined, true);
      if (!Array.isArray(rows)) throw Error('Invalid cloud history response.');
      historyRows = rows.filter(function(r) {return Number.isSafeInteger(Number(r.revision));});
      historyLoaded = true;
      notify('Recovery history loaded. Restoring creates a NEW cloud revision; previous versions remain available until they age out.');
    } catch(e) {
      notify('Recovery history unavailable: ' + e.message);
    } finally {
      busy = false;
      if (changedWhileBusy && linked && !blocked) { changedWhileBusy = false; queueSave(); }
      else changedWhileBusy = false;
      renderStatus();
    }
  }
  async function restoreRevision(wanted) {
    wanted = Number(wanted);
    if (busy || !session || !remoteAvailable || !Number.isSafeInteger(wanted) || wanted < 1) return;
    if (!historyLoaded || !historyRows.some(function(row) {return Number(row.revision) === wanted;}))
      return notify('Load recovery history and select an available revision.');
    if (!linked || blocked) return notify('Sync is not linked. Resolve/download the latest cloud campaign before restoring history.');
    var currentMeta = meta();
    if (!currentMeta || currentMeta.userId !== session.user.id ||
        currentMeta.revision !== revision || currentMeta.fingerprint !== fingerprint(getLocal()))
      return notify('Unsynced local changes detected. Export JSON backup and resolve syncing before restoring.');
    if (!confirm('Restore cloud revision ' + wanted + '? This replaces THIS browser campaign and creates a NEW cloud revision. A current JSON backup will download first.')) return;
    busy = true; renderStatus();
    try {
      // Always verify the latest revision immediately before a restoration.
      var latest = await readCloud();
      if (!latest || Number(latest.revision) !== revision) {
        linked = false; blocked = true;
        return notify('A different device has updated the campaign. Your data was not changed. Download the latest cloud campaign before restoring.');
      }
      var rows = await request('/rest/v1/shattered_hive_save_history?select=revision,payload&revision=eq.' + wanted + '&limit=1',
        'GET', undefined, true);
      var snapshot = Array.isArray(rows) && rows[0] ? rows[0].payload : null;
      validateDocument(snapshot);
      // Export BEFORE the first remote or local mutation. If export fails, abort.
      if (changedWhileBusy || fingerprint(getLocal()) !== currentMeta.fingerprint)
        return notify('Local edits were made during recovery. Nothing restored; retry after saving.');
      bridge.exportBackup();
      var result = await request('/rest/v1/rpc/shattered_hive_store','POST',
        {expected_revision:revision,document:snapshot},true);
      if (result == null || !Number.isSafeInteger(Number(result))) {
        linked = false; blocked = true;
        return notify('Restore blocked by newer cloud edits. No data was overwritten; download the latest campaign before retrying.');
      }
      linked = false; blocked = true; // prevent replaceData/save() from queueing an extra write
      revision = Number(result);
      if (changedWhileBusy || fingerprint(getLocal()) !== currentMeta.fingerprint)
        return notify('Cloud restore succeeded, but this browser changed during the operation. Local data was kept. Export your local JSON and download the restored cloud revision to reconcile.');
      bridge.replaceData(snapshot);
      setMeta();
      linked = true; blocked = false; historyLoaded = false;
      syncSuccess(new Date().toISOString());
      notify('Revision ' + wanted + ' restored as NEW revision ' + revision + '. The previous campaign is in recovery history.');
    } catch(e) {
      // A server may have committed before a network error; never assume restoration succeeded.
      linked = false; blocked = true;
      notify('Restore could not be confirmed: ' + e.message + '. Your local browser save remains available; check cloud status.');
    } finally { busy = false; changedWhileBusy = false; renderStatus(); }
  }
  function settingsHtml() {
    if (!configured) return '<div id="cloud-sync-panel"><p>Cloud sync has not been configured yet. Your browser data remains available. See the GitHub CLOUD_SYNC_SETUP.md instructions.</p></div>';
    var account = session && session.user ? escapeHtml(session.user.email || 'Signed-in user') : '';
    var unsynced=hasUnconfirmedEdits();
    var warning=unsynced?'<p role="alert" style="border:2px solid #ad5142;border-radius:8px;padding:12px"><b>Unsynced browser changes.</b> Your newest campaign data is not confirmed in the cloud. Export JSON before closing, signing out or using another device.</p>':'';
    var last=lastConfirmedAt();
    var stamp=last?'<p class="muted"><b>Last confirmed cloud save:</b> '+escapeHtml(new Date(last).toLocaleString())+'</p>':'<p class="muted">No confirmed cloud save time for this browser.</p>';
    var backup='<button type="button" class="btn small secondary" onclick="SHCloud.exportLocalBackup()">Export browser backup</button> ';
    var buttons = '<button class="btn small secondary" type="button" onclick="SHCloud.refresh()">Check for cloud updates</button> ' +
      '<button class="btn small secondary" type="button" onclick="SHCloud.signOut()">Sign out</button>';
    if (!session) buttons = '<label for="cloud-email">Email address</label>' +
      '<input id="cloud-email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Cloud sign-in email">' +
      '<button class="btn small" type="button" style="margin-top:8px" onclick="SHCloud.sendLink()">Email me a sign-in link</button>';
    else if (!remoteAvailable) buttons = '<p><b>' + account + '</b></p>' +
      '<button class="btn small" type="button" onclick="SHCloud.uploadFirst()">Upload this browser to cloud (first time)</button> ' + buttons;
    else buttons = '<p><b>' + account + '</b> · Cloud revision ' + revision + '</p>' +
      (!linked ? '<button type="button" class="btn small" onclick="SHCloud.previewRecovery()">Preview safe recovery</button> <button type="button" class="btn small secondary" onclick="SHCloud.download()">Download cloud (replaces browser)</button> ' : '<button class="btn small" type="button" onclick="SHCloud.uploadPending()">Sync changes now</button> ') + buttons;
    if(recoveryPreview)buttons+='<p><b>Preview:</b> '+escapeHtml(recoveryPreview.changes.join(', ')||'No local changes to add')+'</p><button class="btn small" type="button" onclick="SHCloud.applyRecovery()">Confirm reviewed recovery</button>';
    var historyMarkup = session && remoteAvailable ?
      '<div class="cloud-history"><h4>Recovery history</h4><p class="muted">Latest 30 cloud saves (older versions expire). Each restore exports a backup and creates a new revision.</p>' +
      '<button type="button" class="btn small secondary" onclick="SHCloud.loadHistory()">Load recovery history</button>' +
      (historyLoaded ? '<div class="cloud-history-list">' + historyRows.map(function(row) {
        var v = Number(row.revision);
        return '<div class="cloud-history-item"><span><b>Revision ' + v + '</b> · ' +
          escapeHtml(new Date(row.created_at).toLocaleString()) + '<small> · ' +
          Number(row.pc_count || 0) + ' PCs, ' + Number(row.npc_count || 0) + ' NPCs, ' +
          Number(row.map_count || 0) + ' maps</small></span>' +
          '<button type="button" class="btn small secondary" ' + (!linked || blocked ? 'disabled ' : '') +
          'onclick="SHCloud.restoreRevision(' + v + ')">Restore</button></div>';
      }).join('') + '</div>' : '') + '</div>' : '';
    return '<div id="cloud-sync-panel">' + warning + stamp + backup + buttons + '<p id="cloud-sync-status" class="muted" role="status" aria-live="polite">' +
      escapeHtml(status) + '</p>' +

      '<p class="muted">Every device must use the same email account. Cloud data is private to that account. Local JSON backups remain recommended.</p>' +
      historyMarkup + '</div>';
  }
  async function boot(appBridge) {
    bridge = appBridge;
    if (!configured) return;
    try {
      // Magic-link implicit-flow tokens are in the fragment; strip tokens from browser history immediately.
      var fragment = new URLSearchParams(location.hash.replace(/^#/, ''));
      if (fragment.has('access_token') && fragment.has('refresh_token')) {
        remember({
          access_token:fragment.get('access_token'), refresh_token:fragment.get('refresh_token'),
          expires_in:Number(fragment.get('expires_in') || 3600)
        });
        history.replaceState(null, document.title, location.pathname + location.search);
      } else {
        var stored = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (stored && stored.access_token && stored.refresh_token) session = stored;
      }
      lastSyncedAt=lastConfirmedAt();
      if (session) await connect();
      renderStatus();
    } catch (e) { notify('Cloud initialization failed (local data safe): ' + e.message); }
  }
  // Renew auth even when syncing is blocked; pending local edits remain protected.
  setInterval(function(){
    if(!session || document.visibilityState!=='visible')return;
    if(!refreshPromise && session.expires_at<=Date.now()/1000+300)
      ensureSession().catch(function(){/* status already explains sign-in recovery */});
    if(linked&&!busy&&!timer&&!blocked)refresh();
  },60000);
  function suspendForReplacement(){
    if(!session || !linked)return;
    clearTimeout(timer);timer=null;linked=false;blocked=true;
    notify('Campaign replaced locally. Cloud auto-sync is paused to protect your previous cloud save. Download your cloud save or manually replace it after reviewing both backups.');
  }
  window.SHCloud = {
    boot:boot, settingsHtml:settingsHtml, sendLink:sendLink, loadHistory:loadHistory, restoreRevision:restoreRevision,
    suspendForReplacement:suspendForReplacement,
    uploadFirst:function(){upload(true);}, uploadPending:function(){if(timer){clearTimeout(timer);timer=null;}upload(false);}, download:download, refresh:refresh,
    signOut:signOut, queueSave:queueSave,
    previewRecovery:previewRecovery,applyRecovery:applyRecovery,
    exportLocalBackup:function(){if(bridge)bridge.exportBackup();},
    isLinked:function(){return !!linked && !blocked;}
  };
})();

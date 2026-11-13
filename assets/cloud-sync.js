/* Optional private cloud sync for Campaign Chronicle. No library/framework dependency. */
(function () {
  'use strict';
  var CONFIG = window.SH_CLOUD_CONFIG || {};
  var URL_BASE = String(CONFIG.url || '').replace(/\/+$/, '');
  var API_KEY = String(CONFIG.anonKey || '');
  var SESSION_KEY = 'shattered-hive-cloud-session-v1';
  var META_KEY = 'shattered-hive-cloud-sync-meta-v1';
  var configured = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(URL_BASE) &&
    (API_KEY.startsWith('sb_publishable_') || API_KEY.startsWith('eyJ'));
  var bridge = null, session = null, revision = 0, linked = false;
  var busy = false, blocked = false, timer = null, changedWhileBusy = false;
  var status = configured ? 'Cloud sign-in is optional; browser saves continue working.' :
    'Cloud sync setup is not complete. Local browser saves still work.';
  var remoteAvailable = false;
  var historyRows = [], historyLoaded = false, lastSyncedAt = null;
  function getLocal() { return bridge.getData(); }
  function fingerprint(value) {
    var s = JSON.stringify(value), h = 2166136261;
    for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16) + ':' + s.length;
  }
  function meta() {
    try { return JSON.parse(localStorage.getItem(META_KEY) || 'null'); } catch (_) { return null; }
  }
  function setMeta() {
    localStorage.setItem(META_KEY, JSON.stringify({
      userId: session.user.id, revision: revision, fingerprint: fingerprint(getLocal())
    }));
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
    if (indicator) {
      var attention = blocked || /failed|conflict|error|unsynchronized|not confirmed|blocked/i.test(status);
      var label = !configured ? 'Cloud: not configured' :
        !session ? 'Cloud: signed out' : busy ? 'Cloud: syncing' :
        attention ? 'Cloud: attention needed' :
        (timer || status.indexOf('waiting to sync') !== -1) ? 'Cloud: pending' :
        linked ? 'Cloud: synced' :
        'Cloud: connection needed';
      indicator.textContent = label;
      indicator.title = status + (lastSyncedAt ? ' Last successful sync: ' + new Date(lastSyncedAt).toLocaleString() : '');
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
    if (!session) throw Error('Sign in first.');
    if (session.expires_at > Date.now()/1000 + 90 && session.user) return;
    var r = await fetch(URL_BASE + '/auth/v1/token?grant_type=refresh_token', {
      method:'POST', headers: apiHeaders(false),
      body:JSON.stringify({refresh_token: session.refresh_token}), cache:'no-store'
    });
    var v = await r.json();
    if (!r.ok) { blocked = true; linked = false; throw Error('Cloud session expired. Please sign in again.'); }
    remember(v);
    if (!session.user) {
      var u = await fetch(URL_BASE + '/auth/v1/user', {headers:apiHeaders(true),cache:'no-store'});
      if (!u.ok) throw Error('Could not verify signed-in account.');
      session.user = await u.json();
      localStorage.setItem(SESSION_KEY,JSON.stringify(session));
    }
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
            syncSuccess(remote.updated_at);
            notify('Synced. This browser has the latest cloud campaign.');
          } else {
            bridge.replaceData(remote.payload);
            setMeta();
            linked = true; blocked = false;
            syncSuccess(remote.updated_at);
            notify('Updated this browser with newer cloud campaign data.');
          }
        } else {
          // Never overwrite an unrecognized local save, even if the cloud is newer.
          notify('Cloud campaign found. Export a local backup first, then choose Download cloud to this browser. Local data has NOT been overwritten.');
        }
      }
    } catch (e) { notify('Cloud connection error: ' + e.message); }
    finally { busy = false; renderStatus(); }
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
      localStorage.setItem(META_KEY,JSON.stringify({userId:session.user.id,revision:revision,fingerprint:snapshotHash}));
      if (fingerprint(getLocal()) !== snapshotHash || changedWhileBusy) {
        changedWhileBusy = false;
        notify('Saved online; sending more recent edits...');
        queueSave();
      } else notify('Cloud up to date. Changes on this browser will sync automatically.');
    } catch (e) { notify('Cloud upload failed (local save retained): ' + e.message); }
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
    if (!session || !linked || blocked) return;
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
    notify('Signed out of cloud sync. Browser saves continue normally.');
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
    var buttons = '<button class="btn small secondary" type="button" onclick="SHCloud.refresh()">Check for cloud updates</button> ' +
      '<button class="btn small secondary" type="button" onclick="SHCloud.signOut()">Sign out</button>';
    if (!session) buttons = '<label for="cloud-email">Email address</label>' +
      '<input id="cloud-email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Cloud sign-in email">' +
      '<button class="btn small" type="button" style="margin-top:8px" onclick="SHCloud.sendLink()">Email me a sign-in link</button>';
    else if (!remoteAvailable) buttons = '<p><b>' + account + '</b></p>' +
      '<button class="btn small" type="button" onclick="SHCloud.uploadFirst()">Upload this browser to cloud (first time)</button> ' + buttons;
    else buttons = '<p><b>' + account + '</b> · Cloud revision ' + revision + '</p>' +
      (!linked ? '<button class="btn small" type="button" onclick="SHCloud.download()">Download cloud to this browser</button> ' : '<button class="btn small" type="button" onclick="SHCloud.uploadPending()">Sync changes now</button> ') + buttons;
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
    return '<div id="cloud-sync-panel">' + buttons + '<p id="cloud-sync-status" class="muted" role="status" aria-live="polite">' +
      escapeHtml(status) + '</p>' +
      (lastSyncedAt ? '<p class="muted"><b>Last confirmed cloud save:</b> ' + escapeHtml(new Date(lastSyncedAt).toLocaleString()) + '</p>' : '') +
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
      if (session) await connect();
      renderStatus();
    } catch (e) { notify('Cloud initialization failed (local data safe): ' + e.message); }
  }
  setInterval(function(){if(session && linked && !busy && !timer && !blocked && document.visibilityState === 'visible')refresh();},60000);
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
    isLinked:function(){return !!linked && !blocked;}
  };
})();

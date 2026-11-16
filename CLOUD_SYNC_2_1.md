# Cloud Sync 2.1 — recovery and data protection

This is an additive change to `assets/cloud-sync.js` only. No database migration, no changes to characters, Vesper story, quests, maps, Adventure Runner or existing `shattered_hive_store(expected_revision, document)` CAS RPC.

### Changes

- **Session renewal:** while the app is visible, renew the authenticated session when it is within five minutes of expiry, including when cloud sync is not linked. Simultaneous refresh requests within one browser window share a single refresh promise. On failure, keep all local data, require sign-out/new sign-in link, and show warning.
- **Durable unsynced warning:** a small, browser-local pending marker tracks a mismatched last-confirmed local fingerprint; the full campaign is never duplicated in browser storage. The marker survives reloads and sign-outs. A pending banner, persistent latest confirmed cloud save timestamp, and **Export browser backup** control appear in cloud settings. Browser header reads **Cloud: unsynced edits** when relevant. A save made while cloud is blocked still updates the warning.
- **Reviewed recovery:** **Preview safe recovery** obtains the authenticated current remote payload and historic cloud payload at the locally recorded last-confirmed revision; a deterministic three-way merge accepts unambiguous changes to independent object fields or uniquely-ID'd array records. Conflicting edits and missing baseline stop without changes. **Confirm reviewed recovery** requires an explicit confirmation, exports browser JSON first, rechecks current remote revision and local fingerprint, and writes using existing revision-checked RPC. After confirmed success, updates this browser to the merged document and resumes sync.
- **Protection:** no blind overwrite, no implicit conflict merge, no new secrets or network calls outside existing Supabase origin. Unsynced work is not guaranteed to survive a browser storage wipe; keep exported JSON backups.

### Important known limitations

- Three-way recovery needs the last confirmed revision to still be in the existing bounded 30-save history. Missing history or incompatible edits require manual JSON review.
- Arrays without stable unique IDs, simultaneous modifications to one field, and delete/edit conflicts fail closed. This is intentional.
- Token renewal may still fail if a device was offline past provider refresh-token validity; sign-in must be renewed. Cloud Sync 2.1 makes this visible and protects the local save.
- No automatic cross-device merge without explicit human review.

### Tests

`tests/cloud-sync-2-1.smoke.cjs` tests all scenarios against mock Supabase in disposable Chromium profiles; the workflow NEVER accesses real Supabase or production campaigns. Existing Cloud Sync 2.0, Session Command Center, Player Decisions, Assisted DM and Adventure Runner regressions also run on PR.

### Release

Open feature branch -> draft PR -> run automated checks -> manual smoke test with exported JSON -> user-approved merge.

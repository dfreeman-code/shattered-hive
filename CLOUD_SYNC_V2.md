# Cloud Sync 2.0 — Recovery and Sync Status

Cloud Sync 2.0 extends existing optional Supabase synchronization. It does not change the \`shattered-hive-v1\` browser storage key, the JSON export format, or game content.

## Added
- **Header status**: Cloud: signed out, syncing, pending, synced, or attention needed. Click the indicator to open Settings.
- **Last confirmed cloud save** under Settings → Private cloud synchronization. Times are displayed in the browser's local timezone.
- **Recovery history**: authenticated user can load the most recent **30 successfully committed cloud revisions**, with time and PC/NPC/map counts.
- **Restore**: an explicit confirmation first exports the browser's current campaign as JSON, reads the selected historical revision, verifies the cloud hasn't changed since the browser last synchronized, writes the historical document as a **new revision** (preserving the current latest snapshot), and then updates the browser. Concurrent edits block local overwrite.
- **Lighter status polling**: every 60 seconds while the page is visible, check revision/timestamp only; download the full JSON only if a newer revision exists.

## Database setup
Migration: \`supabase/cloud-sync-v2.sql\`

Applied to the existing \`shattered-hive\` project. It creates \`public.shattered_hive_save_history\` with owner-only RLS SELECT access; direct writes from clients are denied. The existing owner-checked compare-and-swap RPC now snapshots accepted revisions in the same database transaction and deletes snapshots beyond the newest 30. A baseline copy of the current cloud revision was seeded during migration.

The cloud save table and original RPC name/signature are unchanged. **Older revisions from before this migration cannot be recovered unless you already exported them as JSON backups.**

## Release verification

1. On both computers, **Export backup** first. Do not clear browser storage.
2. Open the app (feature branch preview or after merging); check the header status and Settings display.
3. On one device edit a harmless PC note, save, and confirm the status goes from pending to synced.
4. On the second device click **Check for cloud updates** and confirm the note arrived. Repeat the opposite direction.
5. In Settings click **Load recovery history**. Confirm the new revision appears with character counts.
6. Test restore only with a disposable test campaign or after exporting backups on **both devices**. Restoring intentionally changes the cloud campaign for all connected devices. Do **not** test restoration on your main family campaign until you are comfortable with recovery.
7. On a stale second browser, confirm that stale writes are blocked, not silently merged.
8. Verify maps, tokens, fog, PC/NPC editor, import/export, and homebrew records still work.

### Known limitations
- This keeps **30 save revisions**, not 30 days of history. Frequent edits may age out older checkpoints quickly. Keep periodic offline JSON backups.
- It does not merge independent offline edits. Conflicts require manual review and deliberate download or restore.
- Version history is private per Supabase Auth user, and cannot be shared with a separate player account without designing explicit permissions.
- Database history consumes additional project storage and remains subject to Supabase plan limits.
- Simulated integration tests passed. Real-browser two-device visual interaction and live restore have **not** been executed; do not treat these as verified until testing after release.

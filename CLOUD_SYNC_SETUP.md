# Private cloud synchronization — setup

The Shattered Hive Campaign Chronicle is a static GitHub Pages app. The optional cloud sync uses **your own Supabase project**. The project has **not** been created or configured automatically. Until setup is complete, the original browser-local data and JSON backup/import continue to work normally.

## 1. Safeguard the original characters first

On the HOME computer, open Campaign Chronicle → **Export backup**. Keep that JSON file somewhere safe. Confirm the missing characters are visible there before doing anything else.

Do **not** use Import on your other computer to overwrite the home save. Never run Reset to troubleshoot synchronization.

## 2. Supabase project status

The project **shattered-hive** (`tlfijoztmohqtqrmtmub`) has already been created, the database migration applied, and the public client configuration connected on this feature branch. You do NOT need to create a second Supabase project or rerun the schema SQL manually.

## 2a. Project configuration reference

1. Open your existing project at https://supabase.com/dashboard/project/tlfijoztmohqtqrmtmub; do not create a duplicate.
2. The database has already been created, with owner-isolated SELECT and an authenticated revision-checked write function. Do not rerun migration SQL.
3. In **Authentication → Providers**, enable email authentication; use the default email magic-link flow.
4. In **Authentication → URL Configuration**, use:
   - **Site URL**: \`https://dfreeman-code.github.io/shattered-hive/\`
   - **Redirect URLs**: add \`https://dfreeman-code.github.io/shattered-hive/\` (exactly).
5. The project URL and public publishable key are already configured on the GitHub feature branch. The remaining step is setting the **Site URL and Redirect URL** under Authentication → URL Configuration in the Supabase Dashboard.

**Never add a database password, Supabase secret key, or service_role key to the repository.**

## 3. Configure the GitHub app

The public-only project settings have **already been filled in** in [assets/cloud-config.js](assets/cloud-config.js). They should not need to be changed unless you intentionally switch Supabase projects. For reference, the expected shape is:

\`\`\`js
window.SH_CLOUD_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_PUBLISHABLE_KEY"
};
\`\`\`

Only a publishable public key was committed to the feature branch. No service role, database password or secret API key was committed. The feature is **not live** until the PR is merged and the email redirect URL is configured.

## 4. First sync — HOME computer only

1. Open the published Campaign Chronicle on the HOME computer; verify all characters and export a JSON backup.
2. Go to **Settings → Private cloud synchronization**.
3. Enter your email and click **Email me a sign-in link**.
4. Open the link in the **same browser and device** that has your home campaign. (Using an email app that opens a different browser could instead sign in that other browser.)
5. Once signed in, choose **Upload this browser to cloud (first time)** and confirm. A backup download is triggered before upload.
6. Wait for the status **Cloud up to date**. Do not proceed until this confirms success.

## 5. Second computer

1. Open the same published website on the other computer.
2. Go to Settings and sign in using **the same email account**.
3. Click **Download cloud to this browser**. A JSON backup of that computer's local data is downloaded first.
4. Verify your HOME-created Player Characters appear.
5. Edits are uploaded automatically after a short pause. The other device checks for new cloud revisions while open and active (approximately every 60 seconds); reloading also checks.

## Important behavior and safety

- Existing data remains stored under \`shattered-hive-v1\` as before.
- The cloud row is **private to the signed-in email account** (Supabase user ID). Each email has its own distinct cloud campaign.
- Local browser saves and JSON exports remain supported with or without cloud connectivity.
- The FIRST upload is manual to prevent an empty computer from overwriting the home campaign.
- A stale revision upload is refused. On conflict, **export the local backup** and download the newer cloud save. This is NOT an automatic merge of concurrent edits.
- Whole-campaign Import and Reset pause automatic synchronization to protect the existing online version. Resolve deliberately before resuming.
- Cloud documents over **6 MB** (for example many large custom Base64 map images) cannot be uploaded; reduce those assets or continue using local backups. Existing version-controlled Evergarden images are stored by URL and do not bloat campaign saves.
- Avoid editing on multiple devices while offline. There is no offline reconciliation/automatic merge.
- Supabase email sign-in stores a refresh token in the browser's localStorage. Protect your devices and browser account; sign out on shared computers.
- GitHub Pages public visibility does **not** make private campaign data public; Supabase row-level access restrictions control the database. A separate DM/player identity system is **not** implemented.

## Verification before production

1. In two separate browsers, create two test users with different emails; verify that User B cannot read User A's campaign (RLS).
2. Use a test campaign in Browser A and verify first upload, Browser B download under same email, edit, remote refresh, page reload persistence and JSON backups.
3. Try a stale write from A after editing on B; confirm the revision check rejects it without overwriting B.
4. Verify the public website runs normally without cloud configuration; character creation, maps, music, import/export, and other modules continue to use browser saves.

Project setup, schema, RLS, permissions, and public config were verified via the connected Supabase project. Email delivery, redirect flow, and actual two-computer data sync have **not** been tested; complete those tests before merging into production. One expected Supabase advisor warning may appear for the security-definer save function: this authenticated-only endpoint is deliberately used to protect compare-and-swap writes, verifies auth.uid(), and cannot accept an arbitrary owner ID.

# Private cloud synchronization — setup

The Shattered Hive Campaign Chronicle is a static GitHub Pages app. The optional cloud sync uses **your own Supabase project**. The project has **not** been created or configured automatically. Until setup is complete, the original browser-local data and JSON backup/import continue to work normally.

## 1. Safeguard the original characters first

On the HOME computer, open Campaign Chronicle → **Export backup**. Keep that JSON file somewhere safe. Confirm the missing characters are visible there before doing anything else.

Do **not** use Import on your other computer to overwrite the home save. Never run Reset to troubleshoot synchronization.

## 2. Create a Supabase project

1. Sign up or log in at https://supabase.com/dashboard and create a new project that you control.
2. Go to **SQL Editor** and run the repository file [supabase/cloud-sync.sql](supabase/cloud-sync.sql). It creates an owner-isolated table and a revision-checked save function.
3. In **Authentication → Providers**, enable email authentication; use the default email magic-link flow.
4. In **Authentication → URL Configuration**, use:
   - **Site URL**: \`https://dfreeman-code.github.io/shattered-hive/\`
   - **Redirect URLs**: add \`https://dfreeman-code.github.io/shattered-hive/\` (exactly).
5. In the Supabase Dashboard's **Connect** / project API settings, copy the **Project URL** and **publishable key** (or legacy **anon public key**). These are the only values meant to go into the public website.

**Never add a database password, Supabase secret key, or service_role key to the repository.**

## 3. Configure the GitHub app

In [assets/cloud-config.js](assets/cloud-config.js), replace the empty strings:

\`\`\`js
window.SH_CLOUD_CONFIG = {
  url: "https://YOUR_PROJECT_REF.supabase.co",
  anonKey: "YOUR_PUBLISHABLE_KEY"
};
\`\`\`

Only use the public key. Commit the configuration change to your repository **after the feature pull request has merged**. Publishing these public values is normal: access control comes from Supabase Auth and database row-level authorization, not hiding a public API key.

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

Database connection and email delivery cannot be validated until a Supabase project is configured. The repository alone does not enable real-time cloud synchronization.

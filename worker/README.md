# Shattered Hive AI Dungeon Master — Phase 2 backend

This Worker is a **private, read-only AI proxy**. The existing GitHub Pages frontend continues hosting the campaign app. No campaign writes happen on the backend or via the model.

## Requirements
- Cloudflare account with Workers access
- OpenAI API account with billing / API access (separate from ChatGPT subscription)
- Node.js / npm; run commands from this `worker/` folder
- Use a private browser session for DM-only campaign information

## Deploy
1. Run `npx wrangler login`.
2. Run `npx wrangler secret put OPENAI_API_KEY` and paste your API key when prompted. **Never commit your key.**
3. Run `npx wrangler secret put DM_ACCESS_TOKEN` and paste a strong random secret (at least 32 unpredictable characters). This is **not** the OpenAI API key. It protects this private backend.
4. Run `npx wrangler deploy` and copy the deployed Worker HTTPS URL.
5. Open the campaign app's **AI Dungeon Master** page. Enter the Worker URL and your DM access token. These are kept in memory only and cleared when you reload.
6. Test a question. Campaign context is sent from the current browser only after you press **Ask AI**.

**Important:** Wrangler secrets must be added to the deployed Worker; if `secret put` requires an existing deployment, deploy once before adding secrets, then redeploy. Keep the Worker URL private, enforce Cloudflare rate limiting / budget controls, and rotate `DM_ACCESS_TOKEN` if exposed. A shared secret is suitable only for a single private DM, not multiuser identity management. The backend is billed per usage; set spending limits. CORS is constrained to the campaign domain but **CORS is not authentication** — the bearer token is required.

## Security & behavior
- Server-side OpenAI API key, not visible in the GitHub Pages app.
- Bearer access token checked server-side before AI requests.
- Request and context size caps, history cap, and output cap to limit costs.
- Only the campaign site's origin can call this Worker from a browser.
- `store:false` is set for the OpenAI Responses API. Cloudflare and OpenAI handling remains subject to their respective service policies.
- Response text is displayed as untrusted text, never interpreted as HTML.
- AI cannot write to `db`, localStorage, maps, NPCs or story data. DM reviews suggestions and manually edits records using existing app screens.
- Existing JSON backup/import and active Vesper story are unchanged.
- Backend errors do not overwrite drafts or campaign records.

## Test
Run `node --test tests/worker.test.mjs` from the repository root. The tests use mocked AI responses; they do not require any API key.

## Not in this phase
Multi-user login, token rotation UI, automatic campaign modifications, and live server-side storage. These require an additional reviewed release.

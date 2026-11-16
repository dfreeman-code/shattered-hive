# The Great Christmas Caper — Content Readiness Audit

**Scope:** the default `main` branch source and seed records, inspected 2026-11-15. This is **not** an audit of the family's authenticated private Supabase campaign or local browser storage. The user's cloud copy may contain approved scripts and modified scene assignments unavailable in repository source.

**Campaign state:** Pre-campaign. Nothing in this checklist authorizes marking a session Played, deciding a player choice, revealing a clue in advance, or updating campaign state.

## Findings

- **Software structure is present:** 10 canonical Vesper Adventure 1 scenes, with the same 9 script fields per scene; draft editing, read-only tabletop view, map navigation, and private DM references are implemented.
- **Repository-default full scripts are not present:** `ADVENTURE_RUNNER.md` explicitly says the finalized narration, dialogue, checks, and branches have not been copied from the story-writing chat. In `index.html`, `adventureRunnerDraft()` returns an empty scene collection if the current campaign has no imported draft. Thus **0 of 90 script fields are populated by default**, **not** proof that the real synced campaign is blank.
- **Prepared encounters:** four homebrew *draft* records: Hungry Snow-Tuft Mites, Frozen Berry Crossing, Three Glass Doors, and Hollowroot Guardian. These are optional encounters or puzzles and are **not** finalized balance approvals for the actual six heroes.
- **Ambience:** three *search cue* records: Hearthhollow Starfall Eve, Frozen Berry Mischief, Hollowroot Guardian. Their music `url` fields are blank; no playable/licensed Spotify links are supplied.
- **Maps:** six Christmas Caper scene maps have DM and player images in repository assets (tree base, gift maze, tinsel crossing, shrine, frozen berry, glass doors). Nine of ten scenes have default map suggestions; Scene 1 has none. Not all available map assets are used by the current default scene suggestions; Tinsel & Bell Crossing is available but not suggested.
- **Choices/consequences:** the player decision tracker stores outcomes independently. No fictional choices should be recorded until the family actually plays.

## Scene-by-scene default coverage

Every row below requires **all nine approved script sections** to be reviewed: read-aloud, DM instructions, NPC dialogue, checks/consequences, encounter/combat, clues/continuity, branches/choices, music/ambience, rewards/exit. Status "Unverified in private campaign" is intentional.

| # | Scene | Default linked map | Seeded encounter guidance | Approved script in repo default |
|---|---|---|---|---|
| 1 | Welcome to Hearthhollow | None assigned | Narrative arrival | Not bundled |
| 2 | The Christmas Caper | Tree Base | Hungry Snow-Tuft Mites (optional) | Not bundled |
| 3 | The Giant’s Footprint | Tree Base | Hungry Snow-Tuft Mites (optional) | Not bundled |
| 4 | Battle of the Frozen Berry | Frozen Berry Clearing | Frozen Berry Crossing | Not bundled |
| 5 | Three-Glass-Door Mystery | Three Glass Doors | Three Glass Doors puzzle | Not bundled |
| 6 | Thief Who Tried to Save Christmas | Gift Pile Maze | Narrative scene, no preset combat required | Not bundled |
| 7 | Hollowroot Guardian | Starlight Root Shrine | Optional guardian set piece | Not bundled |
| 8 | First Memory of the Shattering | Starlight Root Shrine | Narrative/revelation scene | Not bundled |
| 9 | A Christmas Worth Saving | Tree Base | Narrative resolution; player-dependent | Not bundled |
| 10 | Last Light of Christmas | Starlight Root Shrine | Ending/reward; player-dependent | Not bundled |

## Before family session 1 — DM approval checklist

- [ ] **Safely export a local JSON backup** of the real signed-in campaign before changing script data. **Do not commit the personal backup, Supabase credentials, or character records to a public repository.**
- [ ] On the authenticated campaign, open Adventure Runner and check the existing **script-section counts** for all 10 scenes. Verify that the saved cloud data has the approved writing; do not assume repository-default blanks imply cloud blanks.
- [ ] For each scene, approve the nine script sections and ensure a DM can read/run it without inventing clues, checks, voices, and consequences midgame.
- [ ] Preserve Vesper/Six Lights/Heartroot/Shattering canon and the children’s agency. Every important player choice needs at least two valid outcomes and a graceful recovery from failed checks.
- [ ] Confirm transition and fail-forward paths for the Frozen Berry, Three Doors, and Guardian so six level-1 heroes cannot be trapped by one failed roll.
- [ ] Confirm all 6 real heroes appear in the Command Center; review actual HP, abilities, conditions, and encounter difficulty. Seeded homebrew monster numbers are unapproved drafts.
- [ ] Review NPC motivations, dialogue, spoiler handling, and when Vesper clues may be revealed; avoid leaking DM secrets on any player-visible screen.
- [ ] Review map pairing scene by scene, especially Scene 1's unassigned map and whether Tinsel & Bell Crossing should be used. Test player-safe fog and token visibility before presenting.
- [ ] Choose actual music or ambience playlists manually; the seed records are text prompts, not playable Spotify links.
- [ ] Decide approved reward delivery and session-ending hooks for scenes 9–10; never assume which decision the party will choose.
- [ ] Repeat the isolated automated dress rehearsal and manually test the *real signed-in campaign* with its final script, maps and 6 characters without marking anything Played.

## Release boundary

This audit contains no gameplay events or approved prose, and does not modify the game. The separate isolated dress-rehearsal PR #31 was **still open/draft when this audit was prepared**, despite a user report that it had been merged; verify its GitHub status before relying on it being part of `main`.

**Readiness conclusion:** the test infrastructure and encounter/map scaffolding are established, but **final DM narrative content readiness cannot be certified from the repository alone**. Inspect the authenticated app’s existing scripts or a user-approved private export and perform a per-scene content QA before running the one-shot.

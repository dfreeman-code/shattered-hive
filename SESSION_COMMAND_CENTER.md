# Live Session Command Center (Phase 1)

This is a DM-only *overview* of the existing Campaign Chronicle records. No new server, authentication, or database migrations are needed.

## Added
- New **Live Gameplay → Session Command Center** navigation item.
- Party at a glance: species, class, level, HP, AC. During combat, HP comes from **the existing combat tracker** (not written back to character sheets).
- Initiative: round, active turn, list of participants, conditions, and existing Previous/Next controls. Both buttons invoke the existing combat logic and write to the same log.
- Current battle map summary and link to the established playable map.
- Reference session picker (read-only relative to session record), existing preparation reminders and summary.
- Active quest objectives only; planned/locked adventures are not treated as events.
- DM-only scratchpad at `db.sessionCommandNotes`, saved using the existing localStorage + Cloud Sync 2.0 mechanism. Saved with JSON exports.
- Links to the existing Assisted DM, decision tracker, and music.

## Protections
- Existing `shattered-hive-v1` localStorage key and cloud campaign JSON wrapper unchanged.
- No automatic HP syncing across character sheets and combat (legacy behavior protected).
- No new player-facing mode; the view contains potentially private notes and **must not be shown to players**.
- No campaign starts, advances, or records fictional player choices automatically.
- No change to character creation, maps, combat rules, story, quests, cloud sync, or recovery functions.
- All new text interpolated into HTML is escaped.

## Browser tests
Run `node tests/session-command-center.smoke.cjs` against a locally served repository with Playwright installed, or use the new GitHub Actions workflow. The checks operate on local disposable data, without signing in to your actual Supabase campaign.

## Expected workflow
1. Open the Command Center after the PR is merged.
2. Confirm your heroes, current map, and scheduled session appear.
3. Add a short DM scratchpad note. Leave the text field to save it.
4. Refresh and confirm it remains visible.
5. During an encounter use Next/Previous turn; open Combat Tracker to see the same participant order.
6. Export a backup and confirm campaign data remains accessible.

**Note:** This is Phase 1: a safe consolidated control surface. Interactive map tiles, in-place editable conditions, or direct sheet/initiative HP unification are deliberately future phases requiring additional compatibility testing.
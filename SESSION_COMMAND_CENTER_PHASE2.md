# Live Session Command Center — Phase 2

## Changes
- Larger previous/next-turn buttons for use at the table.
- One-click combat damage (-1, -5) and healing (+1) buttons on each combatant. All use existing `combatDamage` and combat history functions; combat HP remains separate from character sheets.
- Read-only Quick View for heroes, showing public character details and HP/AC without opening the full editable, secret-bearing character record.
- **Player-safe board**: an opaque fullscreen presentation overlay containing only the campaign title, non-retired heroes (names, species, class, level), and the selected map's **name only if marked player-shared**. It never renders private NPCs, DM scratchpad, character secrets, encounter HP, hidden map content, or quest details. Closing the board returns to the DM screen without modifying data.

## Important player safety warning
The board is a **local presentation aid, not authentication or a security boundary**. Do not hand the DM browser/session to players or share its link as a player login. The hidden DOM may remain available to someone with browser dev tools; player permissions require actual access control.

## Compatibility
- Existing `shattered-hive-v1` localStorage, cloud sync, history, maps, sessions, quest status, DM tools, story records, and combat tracker logic untouched.
- No database migrations; no campaign data changes needed.
- New display controls are transient DOM overlays, never saved to campaign.
- All displayed record values pass through existing `esc()`.
- No campaign session is started by opening this interface.

## Tests
`tests/session-command-center.smoke.cjs` verifies desktop/mobile layout, player board redaction, quick hero read-only behavior, per-combatant damage/healing and log, character-record preservation, existing command center flows, and no uncaught page errors. All tests use disposable browser state and do not touch the production account.

## Manual post-merge checks
1. Export JSON backup from the live app.
2. In Command Center, open and close Player-safe board; ensure no secrets appear.
3. Open Quick view for one hero; ensure it shows the correct HP and AC.
4. Verify Next/Previous turn and HP buttons only during an actual combat; don't start a real encounter merely for testing.
5. Confirm all 3 PCs, NPCs, maps, and cloud sync remain intact.

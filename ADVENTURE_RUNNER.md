# Vesper Adventure Runner — Phase 1 (DM draft)

## Canon source and limits

Story source: the separate Shattered Hive Vesper writing chat. This branch intentionally includes **only the ten verified scene titles** from the Adventure 1 revised outline:

1. Welcome to Hearthhollow
2. The Christmas Caper
3. The Giant’s Footprint
4. Battle of the Frozen Berry
5. Three-Glass-Door Mystery
6. Thief Who Tried to Save Christmas
7. Hollowroot Guardian
8. First Memory of the Shattering
9. A Christmas Worth Saving
10. Last Light of Christmas

The full final read-aloud, NPC dialogue, checks and alternate branches have NOT been copied from that chat. Do not substitute invented text. The interface displays empty placeholders until approved script text is imported or saved.

## Using the runner

- Open **Live Gameplay → Adventure Runner**.
- Choose a scene. Navigation is a preview only: it never changes session statuses, quests, maps, combat, or player decisions.
- Fill in approved scene text in fields for read-aloud, instructions, NPC dialogue, checks, encounters, clues, branches, cues and rewards. Click **Save scene draft** before changing scenes.
- Export a JSON template with the scene titles and current DM draft using **Export script JSON**.
- Add the final text in that JSON file and import it using **Import approved script JSON**. Import validates Adventure ID, all 10 IDs and exact titles; ignores blank imported fields rather than erasing a saved scene, and requires confirmation before modifying a draft.
- All saved scripts stay in the existing `db.adventureScriptDraft` field, inside `shattered-hive-v1` JSON backups and Cloud Sync 2.0.

## Safety and limitations

- Private DM view only; never give the DM app browser/session to kids.
- No new schema, separate server, or hard-coded story claims about player actions.
- Existing Vesper canon, King Vesper, Six Lights, Heartroot, The Shattering, Sixfold Accord, active NPCs, heroes, map engine, DM decisions, combat, quests and session history remain unchanged.
- No automatic 'Played' or 'Completed' actions. The campaign has not started.
- This is a **scene-based script preparation / navigation tool**, not the final production Adventure Runner. Map/encounter links and session activity logging are future planned integrations, after scripts are approved.

## Tests

`tests/adventure-runner.smoke.cjs` validates the 10-scene order, no unapproved text, safe scene browsing, persistence, export/import, rejection of incorrect canon, unchanged PCs/NPCs/quests/sessions/decisions/maps, and mobile layout, in isolated browser profiles.

# Final two Christmas Caper maps — upload before merge

This branch extends the approved six-map Christmas Caper collection by adding the final two locations:

| New map | Adventure Runner | ID |
|---|---|---|
| The Frozen Berry Clearing | Scene 4 — Battle of the Frozen Berry | `caper-frozen-berry` |
| The Three Glass Doors | Scene 5 — Three-Glass-Door Mystery | `caper-glass-doors` |

These locations use existing interactive **DM-only E/C/T/S map markers**, characters, tokens, grid, and fog of war. The new marker arrays start empty so no unapproved narrative facts are inserted; add markers using the right-hand DM marker editor and transcribe only approved adventure details. The DM PNGs contain *visual planning labels*, but are not live linked markers until added with the marker editor.

## Required artwork

Download and extract `Christmas_Caper_Final_Two_Map_Assets.zip` from the ChatGPT conversation.

Upload these **four exact filenames** into `assets/maps/` of **feature/christmas-caper-final-two-maps**:

- `caper-frozen-berry-player.png`
- `caper-frozen-berry-dm.png`
- `caper-glass-doors-player.png`
- `caper-glass-doors-dm.png`

Artwork is square **1200×1200**, the existing `30×30` map grid corresponds to 40 pixels per square. Files must not be renamed. Do not merge until they have been uploaded and the Home Hive browser smoke test passes all four image-load checks.

## Preservation

An additive one-time `christmasFinalTwoMapsSeeded` guard registers the new map objects. It leaves all existing scenes, archived maps, tokens, character records, story drafts, cloud settings, and player decisions in place. If Scenes 4 or 5 were explicitly assigned a different map earlier, that saved override is respected.

Neither new scene is shared in Player View by default. To present one to the party later, explicitly use the existing sharing controls; the campaign has not started.

# Shattered Hive — Story Chat to Map Handoff (v1)

Use this contract when the **separate Vesper story-development chat** has approved a new clue, encounter, secret, or terrain event and wants to add DM-only markers to the campaign app. This is a manual handoff: the story chat produces JSON, the Dungeon Master previews and explicitly imports it in **Maps → Story chat → map markers**. No chat can silently modify campaign data.

## Instructions to paste into the story chat
"Using our established King Vesper / Hollow King canon, return a JSON object matching Shattered Hive story-beats v1. Include ONLY the DM marker placements we explicitly approved in the story, not invented outcomes. Keep all current heroes, quests and adventure completion unchanged. Use the exact mapId list and zero-based coordinates below. Choose E (Encounter), C (Clue), T (Terrain), or S (Secret). Include scriptScene (0 to 9) and scriptField when the beat links to the Great Christmas Caper Adventure Runner. Never add spoilers to player-facing art; these are private DM markers. Return JSON only."

## JSON shape (example format; not a canonical encounter)
```json
{
  "version": 1,
  "campaign": "vesper",
  "beats": [
    {
      "id": "example-pending-clue-01",
      "mapId": "caper-tree-base",
      "type": "C",
      "title": "Example clue location",
      "notes": "Replace with the approved story script before importing.",
      "x": 18,
      "y": 12,
      "scriptScene": 1,
      "scriptField": "clues"
    }
  ]
}
```
**Do not import the placeholder example.** Story beats require approved scene text.

## Maps and canonical IDs

| Map | mapId |
|---|---|
| Home Hive | `evergarden-home-hive` |
| Great Christmas Caper (legacy overview) | `evergarden-christmas-caper` |
| Frosted Root Tunnels | `evergarden-frosted-roots` |
| Spider Silk Crossing | `evergarden-spider-crossing` |
| Mushroom Market | `evergarden-mushroom-market` |
| Forgotten Garden Shed | `evergarden-garden-shed` |
| Enchanted Christmas Tree — Tree Base | `caper-tree-base` |
| Great Gift Pile Maze | `caper-gift-maze` |
| Tinsel & Bell Crossing | `caper-tinsel-crossing` |
| Starlight Root Shrine | `caper-starlight-shrine` |
| Frozen Berry Clearing | `caper-frozen-berry` |
| Three Glass Doors | `caper-glass-doors` |

Expanded main maps are **46 columns × 30 rows**. x is 0–45, y is 0–29. Older maps may be 30 × 14 after expansion. Coordinates in the JSON refer to the **current displayed map grid** (0-based, not the 1-based labels shown in the DM controls).

### Types and fields
`type` must be E, C, T or S. Optional `scriptScene` is 0–9 for the ten Christmas Caper scenes and `scriptField` may be one of `readAloud`, `dmNotes`, `npcDialogue`, `checks`, `encounters`, `clues`, `choices`, `music`, or `rewards`.

Every `id` must be unique, lowercase letters/numbers/hyphens. Import stores it as `story-beat-<id>` to avoid collisions with the existing approved guide markers. Re-importing an existing ID skips it without overwriting the DM's edits. Validation rejects unknown maps, out-of-bounds positions, invalid types/fields, and malformed input; the entire batch is rejected if any entry is invalid.

## Safety and usage
- Export a JSON campaign backup before importing story changes.
- Preview first; then explicitly confirm import. Import **adds DM-only markers**. It does **not** place player-visible monster tokens, reveal fog, start combat, update session progress, or decide player outcomes.
- All story decisions (Pip, snow-tuft mites, Luma, Hollowroot Guardian, Mayor Maribel) remain undecided until actual play.
- Select a new marker in DM View to see its notes and linked original Adventure Runner script; then drag or set coordinates if needed.
- The panoramic terrain maps are artwork backgrounds. Fog, tokens, DM guide markers, player-display redaction, and cloud sync still use the established grid and map record.

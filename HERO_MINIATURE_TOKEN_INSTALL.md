# The Shattered Hive — six miniature-style PC tokens

This feature links the **existing** six PC records to painted miniature assets without adding PCs, changing positions, modifying stats, or uploading data to Supabase.

## Asset upload required before merging

Download and extract `Shattered_Hive_GitHub_Token_Assets.zip` supplied in this ChatGPT conversation. It contains exactly:

```
assets/hero-tokens/
  vismund_cygnus_token.png
  david_token.png
  snoop_bugg_token.png
  dr_newton_sparknic_token.png
  mister_potts_token.png
  jawshua_red_hawk_token.png
  portraits/
    vismund_cygnus_miniature.png
    david_miniature.png
    snoop_bugg_miniature.png
    dr_newton_sparknic_miniature.png
    mister_potts_miniature.png
    jawshua_red_hawk_miniature.png
```

Upload these on **branch `feature/character-miniature-image-tokens`**, not `main`:
- Go to `assets/` on the feature branch in GitHub.
- Use **Add file → Upload files**.
- Drag the extracted **hero-tokens folder** (not ZIP) into the upload area, so GitHub preserves its `portraits/` subfolder. Check all **12** image paths in the diff before committing.

**Do not merge if any PNG is absent.** The new app will fall back to its existing colored-symbol PC tokens if the images are missing or do not load.

## Matching and behavior

Image mapping requires exact intended character name, species, and class (spaces normalized). It does not mutate any existing PC record:

| Character | Species | Class |
|---|---|---|
| Vismund Cygnus | Spiderkin | Wizard |
| David | Mantisborn | Rogue |
| Snoop Bugg | Spiderkin | Warlock |
| Dr. Newton Sparknic | Firefly Folk | Ranger |
| Mister Potts | Beetlekin | Paladin |
| Jawshua Red Hawk | Antfolk | Fighter |

Map tokens continue to use existing PC record IDs, positions, colors, rings, and nameplate settings. NPCs and monsters are not affected. The sidebar preview uses the corresponding larger portrait. Both Player View and DM View show the same player-owned miniature tokens; private DM map markers remain hidden in Player View.

## QA

The feature branch has a separate **Miniature PC token browser test** using synthetic character records and mocked PNG loads. That validates mapping, fallback, persistence, Player View and NPC isolation, but does **not** validate the actual artwork files.

**After asset upload:** verify six `512 × 512` battle PNGs and six `768 × 864` portraits by opening the 12 raw URLs on the branch. Then rerun browser tests and verify each hero visually in both map modes.

Never commit a full campaign JSON export, Supabase credentials, or character secrets to this public repository.

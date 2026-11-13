# The Great Christmas Caper — official map set

Adventure 1 of **The Shattered Hive**, continuing the King Vesper / Six Lights story.

## Official map names

1. The Enchanted Christmas Tree — Tree Base (`caper-tree-base`)
2. The Great Gift Pile Maze (`caper-gift-maze`)
3. Tinsel & Bell Crossing (`caper-tinsel-crossing`)
4. The Starlight Root Shrine (`caper-starlight-shrine`)

## Artwork required before merging PR

Upload all eight generated PNGs from `Christmas_Caper_Campaign_Chronicle_Assets.zip` directly into `assets/maps/` in the `feature/christmas-caper-official-maps` branch.

The file names must be exactly:

- caper-tree-base-player.png
- caper-tree-base-dm.png
- caper-gift-maze-player.png
- caper-gift-maze-dm.png
- caper-tinsel-crossing-player.png
- caper-tinsel-crossing-dm.png
- caper-starlight-shrine-player.png
- caper-starlight-shrine-dm.png

Each image is 1200×1200 with a 30×30 in-app overlay (40 pixels per mechanical 5-foot grid square). The player image has no markers. The DM image uses **provisional** S/C/T/E markers, not canonical story revelations.

If an image is missing, the app currently falls back to a legacy Christmas Caper SVG. Do **not** merge until the actual new PNGs are installed and reviewed.

## Adventure Runner

A map selector appears beside each of the ten existing scenes. Defaults are **suggested staging only**; you can override each map for the scene without altering any script section, PC token, player decision, or session history. Clicking **Open battle map** opens the chosen scene in DM mode. The party's adventure has not started.

## Safety checks

- Existing Home Hive remains intact
- Existing map scenes and fog / token data are not deleted
- Newly created Christmas Caper maps have `playerShared:false` by default
- DM maps are not part of Player View selection until explicitly shared
- Test navigation, map identity, image loading, DM/player switch, PC tokens and refresh before merging

# Official Home Hive map installation

This branch stages the Home Hive as the only visible default map. It does NOT delete older scene data; old scenes, fog and tokens are saved in `db.maps.archivedScenes` in the existing browser localStorage record `shattered-hive-v1`.

## Required image assets before merging
Upload these exact PNG files to `assets/maps/` on THIS branch:
- `home_hive_player_gridless.png`
- `home_hive_dm_annotated.png`

Optional archival / print files:
- `home_hive_player_gridded.png`
- `home_hive_manifest.json`

The application draws its own 30×30 grid over the gridless player image. The user-visible player view never uses the DM annotated image. The fallback image is the repository's existing vector map, in case the PNG files are temporarily missing.

## Testing
1. Export a Settings backup from the LIVE application before merging.
2. Confirm assets load on the branch (test image URLs).
3. Merge the PR, wait for GitHub Pages deployment, then hard refresh.
4. Open Battle Maps. Verify Home Hive is the default and the only initial preset.
5. Switch DM / player, toggle grid, check 30×30 square alignment.
6. Create and drag a token, refresh and verify persistence, remove it.
7. Confirm PCs, NPCs, quests and notes remain intact.
8. Previously used maps remain in the local backup under `maps.archivedScenes`. If restoring old maps is desired later, a UI can be added without data loss.

## Limitations
Existing localStorage is per browser and not shared across devices. Map images alone do not provide collaboration. For technical usability, check foreground artwork and precise terrain manually before assigning difficult terrain or line-of-sight restrictions.

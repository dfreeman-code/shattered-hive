# Hero miniature portraits

Upload six corrected 768×864 PNG portraits to this directory on the `feature/character-miniature-image-tokens` branch:

- `vismund_cygnus_miniature.png`
- `david_miniature.png`
- `snoop_bugg_miniature.png`
- `dr_newton_sparknic_miniature.png`
- `mister_potts_miniature.png`
- `jawshua_red_hawk_miniature.png`

The player token feature references these exact relative paths. The corrected package supplied in ChatGPT contains the complete folder layout.

Do not merge PR #53 until `tests/miniature-assets-check.cjs` passes with all 12 PNG files.

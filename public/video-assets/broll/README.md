# TokenRadar Video B-roll

This folder holds optional local media layers for Remotion videos.

Generate a starter manifest with:

```bash
npm run video:assets -- --max 6
```

Required environment variables:

- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`

Generate local Blender motion loops with:

```bash
npm run video:blender -- --preset all
```

Blender generation is local and optional. It requires Blender on PATH or `BLENDER_BIN`
set to the Blender executable. Useful presets:

- `radar_grid`
- `terminal_scan`
- `liquidity_depth`
- `orbital_map`

The generated `manifest.json` is read by `scripts/post-video-daily.ts`. If the manifest is missing or empty, the daily video pipeline falls back to the existing generated motion backgrounds.

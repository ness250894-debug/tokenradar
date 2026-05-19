# TokenRadar Video B-roll

This folder holds optional local media layers for Remotion videos.

Generate a starter manifest with:

```bash
npm run video:assets -- --max 6
```

The default stock search intentionally prioritizes human market-context footage
for short-form platforms: people checking phones, hands using finance apps,
traders at laptops, and desk setups with charts. Use these clips as the primary
story layer, then let Remotion place TokenRadar data and risk-check overlays on
top.

Useful manual search queries when curating assets:

- `person checking phone finance`
- `trader looking at laptop charts`
- `person desk financial charts`
- `hands using phone trading`
- `office worker market chart laptop`

Tag manually added clips with the specific context they show, for example
`human`, `person`, `phone`, `hands`, `laptop`, `desk`, `monitor`, `chart`, and
`market`. The selector uses those tags to put phone/hands clips in the hook and
laptop/desk/chart clips in the evidence section.

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

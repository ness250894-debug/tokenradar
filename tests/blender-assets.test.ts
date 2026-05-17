import { describe, expect, it } from "vitest";
import {
  buildBlenderAssetPlan,
  createBlenderScenePython,
  mergeBlenderAssetsIntoManifest,
} from "../src/lib/blender-assets";

describe("Blender asset generation helpers", () => {
  it("builds deterministic vertical loop asset metadata for selected presets", () => {
    const plan = buildBlenderAssetPlan({
      presets: ["radar_grid", "liquidity_depth"],
      fps: 30,
      seconds: 8,
      width: 1080,
      height: 1920,
    });

    expect(plan.map((asset) => asset.id)).toEqual([
      "blender-radar-grid",
      "blender-liquidity-depth",
    ]);
    expect(plan[0].filename).toBe("blender-radar-grid.mp4");
    expect(plan[0].manifestAsset).toMatchObject({
      kind: "video",
      source: "local",
      src: "broll/blender-radar-grid.mp4",
      provider: "generated",
      orientation: "vertical",
      role: "background",
      fit: "cover",
      opacity: 0.24,
    });
    expect(plan[0].manifestAsset.tags).toEqual(
      expect.arrayContaining(["blender", "generated", "market", "radar_grid"]),
    );
  });

  it("generates a headless Blender Python scene with render settings and output path", () => {
    const script = createBlenderScenePython({
      preset: "terminal_scan",
      outputPath: "D:/tokenradar/public/video-assets/broll/blender-terminal-scan.mp4",
      width: 1080,
      height: 1920,
      fps: 30,
      seconds: 8,
    });

    expect(script).toContain("PRESET = \"terminal_scan\"");
    expect(script).toContain("scene.render.resolution_x = 1080");
    expect(script).toContain("scene.render.resolution_y = 1920");
    expect(script).toContain("scene.frame_end = 240");
    expect(script).toContain("scene.render.image_settings.file_format = \"FFMPEG\"");
    expect(script).toContain("blender-terminal-scan.mp4");
  });

  it("upserts generated Blender assets into an existing manifest", () => {
    const plan = buildBlenderAssetPlan({
      presets: ["radar_grid"],
      fps: 30,
      seconds: 8,
      width: 1080,
      height: 1920,
    });

    const manifest = mergeBlenderAssetsIntoManifest({
      updatedAt: "2026-05-16T00:00:00.000Z",
      assets: [
        {
          id: "pexels-123",
          kind: "video",
          source: "local",
          src: "broll/pexels-123.mp4",
          provider: "pexels",
        },
        {
          id: "blender-radar-grid",
          kind: "video",
          source: "local",
          src: "broll/old-radar.mp4",
          provider: "generated",
        },
      ],
    }, plan, "2026-05-17T00:00:00.000Z");

    expect(manifest.updatedAt).toBe("2026-05-17T00:00:00.000Z");
    expect(manifest.assets.map((asset) => asset.id)).toEqual(["pexels-123", "blender-radar-grid"]);
    expect(manifest.assets[1].src).toBe("broll/blender-radar-grid.mp4");
    expect(manifest.assets[1].tags).toContain("radar_grid");
  });
});

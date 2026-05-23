import { describe, expect, it } from "vitest";
import {
  buildStockAssetQueries,
  normalizeVideoAssetManifest,
  resolveVideoAssetRenderSource,
  selectVideoAssetShotList,
  selectVideoAssetLayers,
  type VideoAssetLayer,
  type VideoAssetManifest,
  type VideoAssetUsageRecord,
} from "../src/lib/video-assets";
import type { VideoVisualRecipe } from "../src/lib/video-recipes";

const recipe: VideoVisualRecipe = {
  key: "test:split_report:signal_radar:terminal_scan:cyan_depth:slide_cut:fast_reveal",
  sceneOrder: ["hook", "reveal", "context", "metrics", "verdict"],
  layoutPack: "split_report",
  chartPack: "signal_radar",
  motionPack: "slide_cut",
  backgroundSystem: "terminal_scan",
  colorTheme: "cyan_depth",
  pacingProfile: "fast_reveal",
};

describe("video asset pipeline", () => {
  it("builds generic stock queries that do not depend on obscure token names", () => {
    const queries = buildStockAssetQueries({
      tokenName: "MimboGameGroup",
      symbol: "MGG",
      selectionReason: "daily breakout volume spike",
      videoFormatKey: "volume_spike_check",
      visualRecipe: recipe,
    });

    expect(queries[0]).toBe("person checking phone finance");
    expect(queries).toContain("vertical crypto trading chart");
    expect(queries).toContain("financial market data dashboard");
    expect(queries.join(" ").toLowerCase()).not.toContain("mimbogamegroup");
    expect(queries.join(" ").toLowerCase()).not.toContain("mgg");
  });

  it("prioritizes human phone, laptop, and desk footage in stock search queries", () => {
    const queries = buildStockAssetQueries({
      tokenName: "Solana",
      symbol: "SOL",
      selectionReason: "daily video market data risk check",
      videoFormatKey: "risk_alert",
      visualRecipe: recipe,
    });

    expect(queries.slice(0, 5)).toEqual(expect.arrayContaining([
      "person checking phone finance",
      "trader looking at laptop charts",
      "person desk financial charts",
    ]));
    expect(queries.join(" ")).toMatch(/\b(?:human|person|phone|laptop|desk|hands|trader)\b/);
  });

  it("normalizes a mixed manifest and drops unsafe or unsupported asset entries", () => {
    const manifest: VideoAssetManifest = {
      assets: [
        {
          id: "local-video",
          kind: "video",
          source: "local",
          src: "broll/trading-floor.mp4",
          orientation: "vertical",
          tags: ["market", "volume"],
        },
        {
          id: "remote-image",
          kind: "image",
          source: "remote",
          src: "https://images.example.com/chart.jpg",
          orientation: "square",
        },
        {
          id: "bad-local-path",
          kind: "image",
          source: "local",
          src: "../secret.png",
        },
        {
          id: "bad-protocol",
          kind: "video",
          source: "remote",
          src: "ftp://example.com/video.mp4",
        },
      ],
    };

    const normalized = normalizeVideoAssetManifest(manifest);

    expect(normalized.assets.map((asset) => asset.id)).toEqual(["local-video", "remote-image"]);
    expect(normalized.assets[0]).toMatchObject({
      fit: "cover",
      role: "background",
      opacity: 0.22,
    });
  });

  it("selects deterministic platform layers and prefers vertical video backgrounds", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "wide-image",
          kind: "image",
          source: "local",
          src: "broll/wide-market.jpg",
          orientation: "horizontal",
          tags: ["market"],
        },
        {
          id: "vertical-video",
          kind: "video",
          source: "local",
          src: "broll/vertical-chart.mp4",
          orientation: "vertical",
          tags: ["market", "chart"],
        },
        {
          id: "animated-signal",
          kind: "animated",
          source: "local",
          src: "broll/signal-loop.webp",
          orientation: "vertical",
          tags: ["signal"],
        },
      ],
    });

    const first = selectVideoAssetLayers({
      manifest,
      platform: "tiktok",
      visualRecipe: recipe,
      videoFormatKey: "volume_spike_check",
      seedParts: ["2026-05-17", "tiktok", "mog-coin"],
    });
    const second = selectVideoAssetLayers({
      manifest,
      platform: "tiktok",
      visualRecipe: recipe,
      videoFormatKey: "volume_spike_check",
      seedParts: ["2026-05-17", "tiktok", "mog-coin"],
    });

    expect(second).toEqual(first);
    expect(first[0].id).toBe("vertical-video");
    expect(first.map((asset) => asset.id)).toContain("animated-signal");
    expect(first).toHaveLength(2);
  });

  it("builds a primary media stage with one seeded full-screen asset", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "pexels-a",
          kind: "video",
          source: "local",
          src: "broll/pexels-a.mp4",
          provider: "pexels",
          orientation: "vertical",
          tags: ["market", "stock"],
        },
        {
          id: "pexels-b",
          kind: "video",
          source: "local",
          src: "broll/pexels-b.mp4",
          provider: "pexels",
          orientation: "vertical",
          tags: ["market", "stock"],
        },
        {
          id: "blender-radar",
          kind: "video",
          source: "local",
          src: "broll/blender-radar.mp4",
          provider: "generated",
          orientation: "vertical",
          tags: ["blender", "generated", "radar_grid"],
        },
      ],
    });

    const firstSeed = selectVideoAssetLayers({
      manifest,
      platform: "youtube",
      visualRecipe: recipe,
      videoFormatKey: "breakout_watch",
      seedParts: ["ada"],
      stageMode: "primary",
    });

    expect(firstSeed).toHaveLength(1);
    expect(firstSeed[0].role).toBe("background");
    expect(firstSeed[0].opacity).toBe(1);
    expect(["pexels", "generated"]).toContain(firstSeed[0].provider);
  });

  it("prefers human stock clips over generated loops for the primary media stage", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "human-phone",
          kind: "video",
          source: "local",
          src: "broll/human-phone.mp4",
          provider: "pexels",
          orientation: "vertical",
          tags: ["human", "person", "phone", "market", "stock"],
        },
        {
          id: "abstract-chart",
          kind: "video",
          source: "local",
          src: "broll/abstract-chart.mp4",
          provider: "pixabay",
          orientation: "vertical",
          tags: ["market", "chart", "stock"],
        },
        {
          id: "blender-radar",
          kind: "video",
          source: "local",
          src: "broll/blender-radar.mp4",
          provider: "generated",
          orientation: "vertical",
          tags: ["blender", "generated", "radar_grid"],
        },
      ],
    });

    const selectedIds = ["ada", "xrp", "sol", "eth", "btc", "doge"].map((seed) =>
      selectVideoAssetLayers({
        manifest,
        platform: "tiktok",
        visualRecipe: recipe,
        videoFormatKey: "breakout_watch",
        seedParts: [seed],
        stageMode: "primary",
      })[0]?.id,
    );

    expect(new Set(selectedIds)).toEqual(new Set(["human-phone"]));
  });

  it("falls back to a generated loop as primary media when no stock clip exists", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "blender-only",
          kind: "video",
          source: "local",
          src: "broll/blender-only.mp4",
          provider: "generated",
          orientation: "vertical",
          tags: ["blender", "generated", "market"],
        },
      ],
    });

    const selected = selectVideoAssetLayers({
      manifest,
      platform: "instagram",
      seedParts: ["2026-05-17", "instagram", "eth"],
      stageMode: "primary",
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]).toMatchObject({
      id: "blender-only",
      opacity: 1,
      saturation: 1.08,
    } satisfies Partial<VideoAssetLayer>);
  });

  it("resolves local render sources through Remotion staticFile and leaves remote URLs intact", () => {
    expect(
      resolveVideoAssetRenderSource(
        {
          id: "local-video",
          kind: "video",
          source: "local",
          src: "broll/vertical-chart.mp4",
        },
        (src) => `/static/${src}`,
      ),
    ).toBe("/static/broll/vertical-chart.mp4");

    expect(
      resolveVideoAssetRenderSource(
        {
          id: "remote-image",
          kind: "image",
          source: "remote",
          src: "https://images.example.com/chart.jpg",
        },
        (src) => `/static/${src}`,
      ),
    ).toBe("https://images.example.com/chart.jpg");
  });

  it("builds a three-clip primary shot list while respecting recent asset cooldown", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "recent-phone",
          kind: "video",
          source: "local",
          src: "broll/recent-phone.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["phone", "market"],
        },
        {
          id: "fresh-chart",
          kind: "video",
          source: "local",
          src: "broll/fresh-chart.mp4",
          provider: "pixabay",
          orientation: "vertical",
          role: "background",
          durationSeconds: 16,
          tags: ["chart", "market"],
        },
        {
          id: "fresh-desk",
          kind: "video",
          source: "local",
          src: "broll/fresh-desk.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 22,
          tags: ["business", "market"],
        },
        {
          id: "blender-radar",
          kind: "video",
          source: "local",
          src: "broll/blender-radar.mp4",
          provider: "generated",
          orientation: "vertical",
          role: "background",
          durationSeconds: 30,
          tags: ["blender", "generated", "signal"],
        },
      ],
    });
    const usageRecords: VideoAssetUsageRecord[] = [
      {
        assetId: "recent-phone",
        platform: "youtube",
        usedAt: "2026-05-16T00:00:00.000Z",
        segmentId: "hook",
      },
    ];

    const shotList = selectVideoAssetShotList({
      manifest,
      platform: "youtube",
      seedParts: ["2026-05-17", "youtube", "eth"],
      usageRecords,
      now: new Date("2026-05-17T12:00:00.000Z"),
      cooldownDays: 14,
    });

    expect(shotList.fallbackLevel).toBe("fresh");
    expect(shotList.segments.map((segment) => [segment.segmentId, segment.fromSeconds, segment.toSeconds])).toEqual([
      ["hook", 0, 8],
      ["evidence", 8, 20],
      ["closing", 20, 30],
    ]);
    expect(shotList.segments.map((segment) => segment.asset.id)).not.toContain("recent-phone");
    expect(new Set(shotList.segments.map((segment) => segment.asset.id)).size).toBe(3);
  });

  it("expands the primary shot list across a TikTok-native For You render", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "human-phone",
          kind: "video",
          source: "local",
          src: "broll/human-phone.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["human", "person", "phone", "hands", "market"],
        },
        {
          id: "desk-laptop",
          kind: "video",
          source: "local",
          src: "broll/desk-laptop.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["human", "desk", "laptop", "chart", "market"],
        },
        {
          id: "data-dashboard",
          kind: "video",
          source: "local",
          src: "broll/data-dashboard.mp4",
          provider: "pixabay",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["data", "dashboard", "chart", "market"],
        },
        {
          id: "risk-screen",
          kind: "video",
          source: "local",
          src: "broll/risk-screen.mp4",
          provider: "pixabay",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["risk", "warning", "market"],
        },
        {
          id: "network-map",
          kind: "video",
          source: "local",
          src: "broll/network-map.mp4",
          provider: "generated",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["network", "radar_grid", "generated"],
        },
        {
          id: "closing-chart",
          kind: "video",
          source: "local",
          src: "broll/closing-chart.mp4",
          provider: "manual",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["chart", "market"],
        },
      ],
    });

    const shotList = selectVideoAssetShotList({
      manifest,
      platform: "tiktok",
      seedParts: ["2026-05-22", "tiktok", "solana"],
      now: new Date("2026-05-22T12:00:00.000Z"),
      durationSeconds: 42,
    });

    expect(shotList.segments.map((segment) => segment.segmentId)).toEqual([
      "hook",
      "evidence",
      "context",
      "risk",
      "closing",
    ]);
    expect(shotList.segments[0].fromSeconds).toBe(0);
    expect(shotList.segments.at(-1)?.toSeconds).toBe(42);
    expect(new Set(shotList.segments.map((segment) => segment.asset.id)).size).toBeGreaterThanOrEqual(5);
  });

  it("uses human phone footage for the hook segment when available", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "abstract-chart",
          kind: "video",
          source: "local",
          src: "broll/abstract-chart.mp4",
          provider: "pixabay",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["chart", "market", "stock"],
        },
        {
          id: "human-phone",
          kind: "video",
          source: "local",
          src: "broll/human-phone.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["human", "person", "phone", "hands", "market", "stock"],
        },
        {
          id: "desk-laptop",
          kind: "video",
          source: "local",
          src: "broll/desk-laptop.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 18,
          tags: ["human", "desk", "laptop", "chart", "market", "stock"],
        },
      ],
    });

    const shotList = selectVideoAssetShotList({
      manifest,
      platform: "tiktok",
      seedParts: ["2026-05-19", "tiktok", "sol"],
      now: new Date("2026-05-19T12:00:00.000Z"),
    });

    expect(shotList.segments[0]).toMatchObject({
      segmentId: "hook",
      asset: { id: "human-phone" },
    });
  });

  it("relaxes cooldown instead of returning an empty shot list when every asset was used recently", () => {
    const manifest = normalizeVideoAssetManifest({
      assets: [
        {
          id: "stock-a",
          kind: "video",
          source: "local",
          src: "broll/stock-a.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 20,
          tags: ["market"],
        },
        {
          id: "stock-b",
          kind: "video",
          source: "local",
          src: "broll/stock-b.mp4",
          provider: "pixabay",
          orientation: "vertical",
          role: "background",
          durationSeconds: 20,
          tags: ["chart"],
        },
      ],
    });
    const usageRecords: VideoAssetUsageRecord[] = [
      { assetId: "stock-a", usedAt: "2026-05-16T00:00:00.000Z", segmentId: "hook" },
      { assetId: "stock-b", usedAt: "2026-05-15T00:00:00.000Z", segmentId: "evidence" },
    ];

    const shotList = selectVideoAssetShotList({
      manifest,
      platform: "instagram",
      seedParts: ["2026-05-17", "instagram", "eth"],
      usageRecords,
      now: new Date("2026-05-17T12:00:00.000Z"),
      cooldownDays: 14,
    });

    expect(shotList.fallbackLevel).toBe("relaxed-cooldown");
    expect(shotList.segments.length).toBeGreaterThanOrEqual(2);
    expect(shotList.warnings).toContain("asset-cooldown-relaxed");
  });

  it("returns a generated-only fallback signal when no usable media assets exist", () => {
    const shotList = selectVideoAssetShotList({
      manifest: { assets: [] },
      platform: "tiktok",
      seedParts: ["2026-05-17", "tiktok", "eth"],
      now: new Date("2026-05-17T12:00:00.000Z"),
    });

    expect(shotList).toMatchObject({
      fallbackLevel: "generated-only",
      segments: [],
      warnings: ["no-usable-video-assets"],
    });
  });
});

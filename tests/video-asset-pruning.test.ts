import { describe, expect, it } from "vitest";
import {
  buildUnreferencedR2VideoAssetKeys,
  buildVideoAssetPrunePlan,
} from "../src/lib/video-asset-pruning";
import type { VideoAssetManifest } from "../src/lib/video-assets";

const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);
const SHA_C = "c".repeat(64);
const SHA_D = "d".repeat(64);

describe("video asset pruning", () => {
  it("removes missing local assets before applying the storage budget", () => {
    const manifest: VideoAssetManifest = {
      assets: [
        {
          id: "missing-stock",
          kind: "video",
          source: "local",
          src: "broll/missing-stock.mp4",
          provider: "pexels",
          downloadedAt: "2026-04-01T00:00:00.000Z",
          fileSizeBytes: 900,
          sha256: SHA_A,
        },
        {
          id: "old-stock",
          kind: "video",
          source: "local",
          src: "broll/old-stock.mp4",
          provider: "pixabay",
          downloadedAt: "2026-04-10T00:00:00.000Z",
          fileSizeBytes: 1_200,
          sha256: SHA_B,
        },
        {
          id: "new-stock",
          kind: "video",
          source: "local",
          src: "broll/new-stock.mp4",
          provider: "pexels",
          downloadedAt: "2026-05-01T00:00:00.000Z",
          fileSizeBytes: 1_000,
          sha256: SHA_C,
        },
        {
          id: "blender-loop",
          kind: "video",
          source: "local",
          src: "broll/blender-loop.mp4",
          provider: "generated",
          downloadedAt: "2026-04-01T00:00:00.000Z",
          fileSizeBytes: 1_000,
          sha256: SHA_D,
        },
      ],
    };

    const plan = buildVideoAssetPrunePlan({
      manifest,
      targetBytes: 2_200,
      minAssets: 2,
      localAssets: {
        "missing-stock": { exists: false },
        "old-stock": { exists: true, sha256: SHA_B },
        "new-stock": { exists: true, sha256: SHA_C },
        "blender-loop": { exists: true, sha256: SHA_D },
      },
    });

    expect(plan.prunedAssets.map((entry) => [entry.asset.id, entry.reason])).toEqual([
      ["missing-stock", "missing-local-file"],
      ["old-stock", "storage-budget"],
    ]);
    expect(plan.retainedManifest.assets.map((asset) => asset.id)).toEqual(["new-stock", "blender-loop"]);
    expect(plan.bytesBefore).toBe(4_100);
    expect(plan.bytesAfter).toBe(2_000);
  });

  it("keeps generated assets ahead of older stock clips when reducing storage", () => {
    const manifest: VideoAssetManifest = {
      assets: [
        {
          id: "old-stock",
          kind: "video",
          source: "local",
          src: "broll/old-stock.mp4",
          provider: "pexels",
          downloadedAt: "2026-03-01T00:00:00.000Z",
          fileSizeBytes: 1_500,
          sha256: SHA_A,
        },
        {
          id: "new-stock",
          kind: "video",
          source: "local",
          src: "broll/new-stock.mp4",
          provider: "pixabay",
          downloadedAt: "2026-05-01T00:00:00.000Z",
          fileSizeBytes: 1_500,
          sha256: SHA_B,
        },
        {
          id: "old-generated",
          kind: "video",
          source: "local",
          src: "broll/old-generated.mp4",
          provider: "generated",
          downloadedAt: "2026-02-01T00:00:00.000Z",
          fileSizeBytes: 1_500,
          sha256: SHA_C,
        },
      ],
    };

    const plan = buildVideoAssetPrunePlan({
      manifest,
      targetBytes: 3_000,
      minAssets: 2,
      localAssets: {
        "old-stock": { exists: true, sha256: SHA_A },
        "new-stock": { exists: true, sha256: SHA_B },
        "old-generated": { exists: true, sha256: SHA_C },
      },
    });

    expect(plan.prunedAssets.map((entry) => entry.asset.id)).toEqual(["old-stock"]);
    expect(plan.retainedManifest.assets.map((asset) => asset.id)).toEqual(["new-stock", "old-generated"]);
    expect(plan.budgetState).toBe("within-target");
  });

  it("identifies stale R2 media objects without deleting manifests", () => {
    const keys = buildUnreferencedR2VideoAssetKeys(
      {
        assets: [
          {
            id: "kept",
            kind: "video",
            source: "local",
            src: "broll/kept.mp4",
          },
        ],
      },
      [
        "video-assets/broll/kept.mp4",
        "video-assets/broll/stale.mp4",
        "video-assets/broll/stale.webp",
        "video-assets/broll/manifest.json",
        "video-assets/broll/manifests/2026-05-18T00-00-00.json",
        "video-assets/other/file.mp4",
      ],
    );

    expect(keys).toEqual(["video-assets/broll/stale.mp4", "video-assets/broll/stale.webp"]);
  });
});

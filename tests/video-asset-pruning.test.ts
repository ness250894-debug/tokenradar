import { describe, expect, it } from "vitest";
import {
  assessR2VideoAssetDeletionSafety,
  buildUnreferencedR2VideoAssetKeys,
  buildVideoAssetPrunePlan,
  validateVideoAssetHydrationGuard,
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

  it("accepts only a fresh full hydration guard from the expected run", () => {
    const nowMs = Date.parse("2026-08-23T12:00:00.000Z");
    const guard = {
      version: 1,
      mode: "full",
      runId: "gha-123-1",
      hydratedAt: "2026-08-23T11:55:00.000Z",
      manifestSha256: SHA_A,
      assetCount: 10,
    };

    expect(validateVideoAssetHydrationGuard(guard, {
      expectedRunId: "gha-123-1",
      maxAgeMs: 10 * 60 * 1000,
      nowMs,
    })).toEqual({ safe: true });
    expect(validateVideoAssetHydrationGuard(guard, {
      expectedRunId: "gha-456-1",
      maxAgeMs: 10 * 60 * 1000,
      nowMs,
    })).toEqual({ safe: false, reason: "the hydration guard belongs to a different run" });
    expect(validateVideoAssetHydrationGuard(guard, {
      expectedRunId: "gha-123-1",
      maxAgeMs: 4 * 60 * 1000,
      nowMs,
    })).toEqual({ safe: false, reason: "the hydration guard is stale" });
  });

  it("blocks R2 deletion when either the count or ratio boundary is exceeded", () => {
    expect(assessR2VideoAssetDeletionSafety({
      candidateCount: 2,
      totalMediaCount: 10,
      maxDeleteCount: 2,
      maxDeleteRatio: 0.25,
    })).toEqual({ safe: true });

    expect(assessR2VideoAssetDeletionSafety({
      candidateCount: 3,
      totalMediaCount: 20,
      maxDeleteCount: 2,
      maxDeleteRatio: 0.25,
    })).toEqual({ safe: false, reason: "3 candidates exceed the deletion limit of 2" });

    expect(assessR2VideoAssetDeletionSafety({
      candidateCount: 1,
      totalMediaCount: 3,
      maxDeleteCount: 2,
      maxDeleteRatio: 0.25,
    })).toEqual({ safe: false, reason: "1/3 candidates exceed the deletion ratio limit of 0.25" });
  });
});

import { describe, expect, it } from "vitest";
import {
  buildR2VideoAssetKey,
  validateVideoAssetManifestForPublish,
} from "../src/lib/video-asset-r2";

describe("video asset R2 sync contract", () => {
  it("maps safe local b-roll sources to immutable R2 b-roll keys", () => {
    expect(buildR2VideoAssetKey("broll/pexels-34453413.mp4")).toBe("video-assets/broll/pexels-34453413.mp4");
    expect(() => buildR2VideoAssetKey("../secret.mp4")).toThrow(/Unsafe video asset source/);
  });

  it("rejects a manifest publish when required metadata is missing", () => {
    const result = validateVideoAssetManifestForPublish({
      assets: [
        {
          id: "pexels-a",
          kind: "video",
          source: "local",
          src: "broll/pexels-a.mp4",
          provider: "pexels",
          orientation: "vertical",
          role: "background",
          durationSeconds: 12,
          width: 1080,
          height: 1920,
          fileSizeBytes: 1_000_000,
          tags: ["market"],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("pexels-a: missing sourcePageUrl");
    expect(result.errors).toContain("pexels-a: missing attribution");
    expect(result.errors).toContain("pexels-a: missing sha256");
  });
});

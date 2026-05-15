import { describe, expect, it } from "vitest";
import {
  VIDEO_FORMATS,
  formatVideoFormatPromptLine,
  getVideoFormat,
  selectVideoFormat,
  selectVideoFormatsForSlots,
} from "../src/lib/video-formats";

describe("video formats", () => {
  it("defines enough formats for a 14-day cooldown at 3 video posts per week", () => {
    expect(VIDEO_FORMATS).toHaveLength(15);
    expect(new Set(VIDEO_FORMATS.map((format) => format.key)).size).toBe(VIDEO_FORMATS.length);
  });

  it("does not select a recently used format when eligible formats remain", () => {
    const used = new Set(VIDEO_FORMATS.slice(0, 14).map((format) => format.key));
    const selected = selectVideoFormat({
      usedFormatKeys: used,
      seedParts: ["2026-05-15", "avalanche-2", "shorts"],
    });

    expect(selected.key).toBe(VIDEO_FORMATS[14].key);
  });

  it("falls back to a valid format when the cooldown pool is exhausted", () => {
    const used = new Set(VIDEO_FORMATS.map((format) => format.key));
    const selected = selectVideoFormat({
      usedFormatKeys: used,
      seedParts: ["2026-05-15", "avalanche-2", "shorts"],
    });

    expect(VIDEO_FORMATS.map((format) => format.key)).toContain(selected.key);
  });

  it("assigns unique formats across the short-form platform package", () => {
    const platforms = ["youtube", "instagram", "threads", "tiktok"] as const;
    const selections = selectVideoFormatsForSlots(platforms, {
      getUsedFormatKeys: (platform) => platform === "youtube"
        ? [VIDEO_FORMATS[0].key, VIDEO_FORMATS[1].key]
        : [],
      getSeedParts: (platform) => ["2026-05-15", platform, "avalanche-2", "newly published article"],
    });
    const keys = platforms.map((platform) => selections.get(platform)?.key);

    expect(keys).toHaveLength(platforms.length);
    expect(keys.every(Boolean)).toBe(true);
    expect(new Set(keys).size).toBe(platforms.length);
    expect(selections.get("youtube")?.key).not.toBe(VIDEO_FORMATS[0].key);
    expect(selections.get("youtube")?.key).not.toBe(VIDEO_FORMATS[1].key);
  });

  it("returns prompt-ready format context", () => {
    const format = getVideoFormat("risk_alert");
    const line = formatVideoFormatPromptLine(format);

    expect(line).toContain("Risk Alert");
    expect(line.length).toBeGreaterThan(80);
  });
});

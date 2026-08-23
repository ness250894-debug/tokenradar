import { describe, expect, it } from "vitest";
import {
  PUBLISHABLE_VIDEO_FORMAT_KEYS,
  VIDEO_FORMATS,
  formatVideoFormatPromptLine,
  getVideoFormat,
  selectVideoFormat,
  selectVideoFormatsForSlots,
} from "../src/lib/video-formats";

describe("video formats", () => {
  it("keeps a unique design catalog and an explicit grounded publishing subset", () => {
    expect(VIDEO_FORMATS).toHaveLength(15);
    expect(new Set(VIDEO_FORMATS.map((format) => format.key)).size).toBe(VIDEO_FORMATS.length);
    expect(PUBLISHABLE_VIDEO_FORMAT_KEYS.length).toBeGreaterThanOrEqual(7);
    expect(PUBLISHABLE_VIDEO_FORMAT_KEYS.every((key) => VIDEO_FORMATS.some((format) => format.key === key))).toBe(true);
  });

  it("does not select a recently used format when eligible formats remain", () => {
    const used = new Set(PUBLISHABLE_VIDEO_FORMAT_KEYS.slice(0, -1));
    const selected = selectVideoFormat({
      usedFormatKeys: used,
      seedParts: ["2026-05-15", "avalanche-2", "shorts"],
    });

    expect(selected.key).toBe(PUBLISHABLE_VIDEO_FORMAT_KEYS.at(-1));
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

    expect(line).toContain("Risk Score Snapshot");
    expect(line.length).toBeGreaterThan(80);
  });

  it("keeps video-facing format copy away from trade-signal language", () => {
    const riskyPattern = /\b(?:buy|strong buy|sell|hold|signal|entry|take-profit|target|moon|100x|price prediction)\b/i;

    for (const format of VIDEO_FORMATS) {
      const videoFacingCopy = [
        format.label,
        format.angle,
        format.hookInstruction,
        format.captionInstruction,
        format.openingEyebrow,
        format.hookSubline,
        format.revealLabel,
        format.metricsTitle,
        format.contextTitle,
        format.contextLead,
        format.summaryTitle,
        format.summaryLead,
        format.verdictKicker,
        format.signalLabel,
      ].join(" ");

      expect(videoFacingCopy, format.key).not.toMatch(riskyPattern);
    }
  });
});

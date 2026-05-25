import { describe, expect, it } from "vitest";

import {
  STANDARD_VIDEO_DURATION_SECONDS,
  TIKTOK_FOR_YOU_DURATION_SECONDS,
  getVideoRenderProfile,
} from "../src/lib/video-render-profile";

describe("video render profiles", () => {
  it("keeps non-TikTok short-form renders at the standard duration", () => {
    const profile = getVideoRenderProfile("youtube");

    expect(profile.compositionId).toBe("TopGainerUpdate");
    expect(profile.durationSeconds).toBe(STANDARD_VIDEO_DURATION_SECONDS);
    expect(profile.durationInFrames).toBe(900);
    expect(profile.forYouOptimized).toBe(false);
  });

  it("uses a distinct For You render profile for TikTok uploads", () => {
    const profile = getVideoRenderProfile("tiktok");

    expect(profile.compositionId).toBe("TopGainerUpdateTikTok");
    expect(profile.durationSeconds).toBe(TIKTOK_FOR_YOU_DURATION_SECONDS);
    expect(profile.durationInFrames).toBe(630);
    expect(profile.forYouOptimized).toBe(true);
    expect(profile.minDurationSeconds).toBe(19);
    expect(profile.maxDurationSeconds).toBe(23);
  });
});

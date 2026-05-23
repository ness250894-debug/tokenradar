import type { VideoPlatform } from "./video-production-controls";

export type VideoRenderCompositionId = "TopGainerUpdate" | "TopGainerUpdateTikTok";

export interface VideoRenderProfile {
  platform: VideoPlatform;
  compositionId: VideoRenderCompositionId;
  fps: number;
  width: number;
  height: number;
  durationSeconds: number;
  durationInFrames: number;
  minDurationSeconds: number;
  maxDurationSeconds: number;
  forYouOptimized: boolean;
}

export const VIDEO_FPS = 30;
export const STANDARD_VIDEO_DURATION_SECONDS = 30;
// TikTok's recommendation problem here is not monetization eligibility. Use a
// distinct native-feeling render long enough for a real story, but short enough
// to avoid adding dead air that can hurt completion rate.
export const TIKTOK_FOR_YOU_DURATION_SECONDS = 42;

const STANDARD_VIDEO_PROFILE = {
  compositionId: "TopGainerUpdate",
  fps: VIDEO_FPS,
  width: 1080,
  height: 1920,
  durationSeconds: STANDARD_VIDEO_DURATION_SECONDS,
  durationInFrames: STANDARD_VIDEO_DURATION_SECONDS * VIDEO_FPS,
  minDurationSeconds: 29,
  maxDurationSeconds: 31,
  forYouOptimized: false,
} as const;

const TIKTOK_FOR_YOU_VIDEO_PROFILE = {
  compositionId: "TopGainerUpdateTikTok",
  fps: VIDEO_FPS,
  width: 1080,
  height: 1920,
  durationSeconds: TIKTOK_FOR_YOU_DURATION_SECONDS,
  durationInFrames: TIKTOK_FOR_YOU_DURATION_SECONDS * VIDEO_FPS,
  minDurationSeconds: 40,
  maxDurationSeconds: 44,
  forYouOptimized: true,
} as const;

export function getVideoRenderProfile(platform: VideoPlatform): VideoRenderProfile {
  if (platform === "tiktok") {
    return {
      platform,
      ...TIKTOK_FOR_YOU_VIDEO_PROFILE,
    };
  }

  return {
    platform,
    ...STANDARD_VIDEO_PROFILE,
  };
}

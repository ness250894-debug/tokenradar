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
// One evidence-led point, one risk check, and one CTA fit comfortably in 20s.
export const STANDARD_VIDEO_DURATION_SECONDS = 20;
// Keep the dormant TikTok creative shorter and creator-native for manual tests.
export const TIKTOK_FOR_YOU_DURATION_SECONDS = 18;

const STANDARD_VIDEO_PROFILE = {
  compositionId: "TopGainerUpdate",
  fps: VIDEO_FPS,
  width: 1080,
  height: 1920,
  durationSeconds: STANDARD_VIDEO_DURATION_SECONDS,
  durationInFrames: STANDARD_VIDEO_DURATION_SECONDS * VIDEO_FPS,
  minDurationSeconds: 19,
  maxDurationSeconds: 21,
  forYouOptimized: false,
} as const;

const TIKTOK_FOR_YOU_VIDEO_PROFILE = {
  compositionId: "TopGainerUpdateTikTok",
  fps: VIDEO_FPS,
  width: 1080,
  height: 1920,
  durationSeconds: TIKTOK_FOR_YOU_DURATION_SECONDS,
  durationInFrames: TIKTOK_FOR_YOU_DURATION_SECONDS * VIDEO_FPS,
  minDurationSeconds: 17,
  maxDurationSeconds: 19,
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

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
// TikTok's #1 algorithm signal is completion rate. 21 seconds is the sweet spot
// for data-driven crypto content: long enough for a 3-beat story, short enough
// that viewers consistently watch to the end.
export const TIKTOK_FOR_YOU_DURATION_SECONDS = 21;

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
  minDurationSeconds: 19,
  maxDurationSeconds: 23,
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

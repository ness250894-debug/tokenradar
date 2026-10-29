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
// Fallback durations when voiceover duration is unspecified
export const STANDARD_VIDEO_DURATION_SECONDS = 20;
export const TIKTOK_FOR_YOU_DURATION_SECONDS = 18;

// Dynamic render duration boundaries to prevent dead air while staying within short-form limits
export const MIN_DYNAMIC_VIDEO_DURATION_SECONDS = 12;
export const MAX_DYNAMIC_VIDEO_DURATION_SECONDS = 21;
export const DYNAMIC_OUTRO_BUFFER_SECONDS = 1.0;

export interface VideoRenderProfileOptions {
  voiceoverDurationSeconds?: number;
}

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

export function getVideoRenderProfile(
  platform: VideoPlatform,
  options: VideoRenderProfileOptions = {},
): VideoRenderProfile {
  const baseProfile = platform === "tiktok" ? TIKTOK_FOR_YOU_VIDEO_PROFILE : STANDARD_VIDEO_PROFILE;

  if (
    typeof options.voiceoverDurationSeconds === "number" &&
    Number.isFinite(options.voiceoverDurationSeconds) &&
    options.voiceoverDurationSeconds > 0
  ) {
    const rawTarget = Math.round(options.voiceoverDurationSeconds + DYNAMIC_OUTRO_BUFFER_SECONDS);
    const dynamicSeconds = Math.max(
      MIN_DYNAMIC_VIDEO_DURATION_SECONDS,
      Math.min(MAX_DYNAMIC_VIDEO_DURATION_SECONDS, rawTarget),
    );

    return {
      platform,
      ...baseProfile,
      durationSeconds: dynamicSeconds,
      durationInFrames: dynamicSeconds * VIDEO_FPS,
      minDurationSeconds: Math.max(MIN_DYNAMIC_VIDEO_DURATION_SECONDS, dynamicSeconds - 1),
      maxDurationSeconds: Math.min(MAX_DYNAMIC_VIDEO_DURATION_SECONDS, dynamicSeconds + 1),
    };
  }

  return {
    platform,
    ...baseProfile,
  };
}

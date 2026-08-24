import { describe, expect, it } from "vitest";

import {
  ensureTikTokResearchContextNote,
  parseVideoDailyCliOptions,
  resolveSharedVideoRenderPlatform,
  resolveVideoDailyPlatformFlags,
  resolveVideoDailyPlatformPlan,
  selectAutomatedVideoArchetype,
  shouldAttemptVideoPlatformPublish,
  type VideoDailyCredentialState,
} from "../scripts/post-video-daily";

const noCredentials: VideoDailyCredentialState = {
  hasYouTubeCredentials: false,
  hasInstagramCredentials: false,
  hasThreadsCredentials: false,
  hasTikTokApiCredentialsConfigured: false,
  tiktokCredentialMode: "sandbox",
  hasTikTokReportCredentials: false,
};

describe("post-video-daily CLI planning", () => {
  it("defaults the documented no-argument command to the production YouTube route", () => {
    expect(parseVideoDailyCliOptions([]).targetPlatform).toBe("youtube");
  });

  it("parses dry-run route and output options without executing the poster", () => {
    expect(parseVideoDailyCliOptions([
      "--platform",
      "shorts",
      "--dry-run",
      "--force",
      "--output-dir",
      "tmp/video",
      "--link-reply",
    ])).toEqual({
      dryRun: true,
      force: true,
      includeLinkReply: true,
      outputDirArg: "tmp/video",
      keepOutput: true,
      targetPlatform: "shorts",
    });
  });

  it("rejects unknown platform routes before any rendering or posting work", () => {
    expect(() => parseVideoDailyCliOptions(["--platform", "linkedin"])).toThrow("Invalid --platform value");
  });

  it("keeps the paused TikTok route out of broad short-form publishing", () => {
    expect(resolveVideoDailyPlatformFlags("shorts")).toEqual({
      runTelegram: false,
      runX: false,
      runYouTube: true,
      runInstagram: true,
      runThreads: true,
      runTikTok: false,
    });
  });

  it("limits the scheduled video route to Instagram and YouTube", () => {
    expect(resolveVideoDailyPlatformFlags("instagram-youtube")).toEqual({
      runTelegram: false,
      runX: false,
      runYouTube: true,
      runInstagram: true,
      runThreads: false,
      runTikTok: false,
    });

    const plan = resolveVideoDailyPlatformPlan("instagram-youtube", true, noCredentials);
    expect(plan.requestedPlatforms).toEqual(["youtube", "instagram"]);
  });

  it("keeps dry-run short-form planning publishable without live credentials", () => {
    const plan = resolveVideoDailyPlatformPlan("shorts", true, noCredentials);

    expect(plan.requestedPlatforms).toEqual(["youtube", "instagram", "threads"]);
    expect(plan.skippedByMissingCredentials).toEqual([]);
    expect(plan.shouldRunTikTokManual).toBe(false);
  });

  it("never selects an unverified poll-result recap for scheduled video", () => {
    const platforms = ["telegram", "x", "youtube", "instagram", "threads", "tiktok"] as const;
    for (const platform of platforms) {
      for (let day = 1; day <= 31; day += 1) {
        const dateKey = `2026-08-${String(day).padStart(2, "0")}`;
        expect(selectAutomatedVideoArchetype({
          platform,
          seedParts: [dateKey, "scheduled-video"],
          date: new Date(`${dateKey}T00:00:00.000Z`),
        }).key).not.toBe("poll_result_recap");
      }
    }
  });

  it("requires the explicit TikTok route even when all platforms are requested", () => {
    expect(resolveVideoDailyPlatformFlags("all").runTikTok).toBe(false);
    expect(resolveVideoDailyPlatformFlags("tiktok").runTikTok).toBe(true);
  });

  it("uses TikTok direct publishing only for production API credentials", () => {
    const plan = resolveVideoDailyPlatformPlan("tiktok", false, {
      ...noCredentials,
      hasTikTokApiCredentialsConfigured: true,
      tiktokCredentialMode: "production",
    });

    expect(plan.requestedPlatforms).toEqual(["tiktok"]);
    expect(plan.shouldRunTikTokDirect).toBe(true);
    expect(plan.shouldRunTikTokInbox).toBe(false);
    expect(plan.shouldRunTikTokManual).toBe(false);
  });

  it("lets TikTok own the shared render when it is part of a short-form run", () => {
    expect(resolveSharedVideoRenderPlatform(["youtube", "instagram", "threads", "tiktok"])).toBe("tiktok");
    expect(resolveSharedVideoRenderPlatform(["instagram", "threads", "tiktok"])).toBe("tiktok");
    expect(resolveSharedVideoRenderPlatform(["youtube", "instagram", "threads"])).toBe("youtube");
  });

  it("adds TikTok context copy without reintroducing trade-signal wording", () => {
    const caption = ensureTikTokResearchContextNote("Avalanche is back on radar.\n\n#AVAX #Crypto #TokenRadar");

    expect(caption).toContain("Educational market context.");
    expect(caption).toContain("Confirm liquidity, risk, and invalidation.");
    expect(caption).not.toMatch(/\b(?:signal|strong buy|entry|target|price prediction)\b/i);
  });

  it("retries only non-terminal platform trackers after a mixed-result run", () => {
    expect(shouldAttemptVideoPlatformPublish({
      status: "published",
      videoId: "youtube-1",
    })).toBe(false);
    expect(shouldAttemptVideoPlatformPublish({
      status: "failed",
    })).toBe(true);
    expect(shouldAttemptVideoPlatformPublish(undefined)).toBe(true);
    expect(shouldAttemptVideoPlatformPublish({ publishId: "inbox-operation" }, "tiktok")).toBe(true);
  });
});

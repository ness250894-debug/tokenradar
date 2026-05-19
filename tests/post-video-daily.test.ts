import { describe, expect, it } from "vitest";

import {
  ensureTikTokResearchContextNote,
  parseVideoDailyCliOptions,
  resolveVideoDailyPlatformFlags,
  resolveVideoDailyPlatformPlan,
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

  it("expands shorts into every short-form video destination", () => {
    expect(resolveVideoDailyPlatformFlags("shorts")).toEqual({
      runTelegram: false,
      runX: false,
      runYouTube: true,
      runInstagram: true,
      runThreads: true,
      runTikTok: true,
    });
  });

  it("keeps dry-run short-form planning publishable without live credentials", () => {
    const plan = resolveVideoDailyPlatformPlan("shorts", true, noCredentials);

    expect(plan.requestedPlatforms).toEqual(["youtube", "instagram", "threads", "tiktok"]);
    expect(plan.skippedByMissingCredentials).toEqual([]);
    expect(plan.shouldRunTikTokManual).toBe(true);
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

  it("adds TikTok context copy without reintroducing trade-signal wording", () => {
    const caption = ensureTikTokResearchContextNote("Avalanche is back on radar.\n\n#AVAX #Crypto #TokenRadar");

    expect(caption).toContain("Educational market context.");
    expect(caption).toContain("Confirm liquidity, risk, and invalidation.");
    expect(caption).not.toMatch(/\b(?:signal|strong buy|entry|target|price prediction)\b/i);
  });
});

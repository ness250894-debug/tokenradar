import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/coingecko", () => ({
  fetchTokensByRank: vi.fn(async () => []),
  fetchTrendingCoins: vi.fn(async () => []),
}));

import { VIDEO_CANDIDATE_MAX_RANK } from "../src/lib/config";
import type { TokenData } from "../scripts/lib/token-selection";
import {
  ensureTikTokResearchContextNote,
  getVideoCooldownTokens,
  parseVideoDailyCliOptions,
  resolveSharedVideoRenderPlatform,
  resolveVideoDailyPlatformFlags,
  resolveVideoDailyPlatformPlan,
  resolveVideoTokenCooldowns,
  selectAutomatedVideoArchetype,
  selectVideoTargetToken,
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

const tempDirs: string[] = [];

function makeTempDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-video-daily-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "metrics"), { recursive: true });
  return dir;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

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

describe("post-video-daily token starvation & mid-cap breakout selection", () => {
  it("expands video candidate window to ranks 1..200 within a single CoinGecko page", () => {
    expect(VIDEO_CANDIDATE_MAX_RANK).toBe(200);
  });

  it("ignores failed-only video trackers while honoring confirmed and legacy video cooldowns", () => {
    const dataDir = makeTempDataDir();
    const now = new Date("2026-08-24T18:00:00.000Z");

    writeJson(path.join(dataDir, "posted_video", "2026-08-22", "daily-video.json"), {
      tokenId: "published-token",
      platforms: {
        youtube: {
          postedAt: "2026-08-22T18:57:00.000Z",
          status: "published",
          videoId: "yt-123",
        },
      },
    });
    writeJson(path.join(dataDir, "posted_video", "2026-08-23", "daily-video.json"), {
      tokenId: "failed-only-token",
      platforms: {
        youtube: {
          postedAt: "2026-08-23T18:57:00.000Z",
          status: "failed",
        },
      },
    });
    writeJson(path.join(dataDir, "posted_video", "2026-08-20", "daily-video.json"), {
      tokenId: "legacy-token",
    });

    const cooldown = getVideoCooldownTokens(dataDir, 7, now);
    expect(cooldown).toEqual(new Set(["published-token", "legacy-token"]));
  });

  it("scopes video cooldowns so text notes and 5-token movers carousels do not starve YouTube/Instagram videos", () => {
    const dataDir = makeTempDataDir();
    const now = new Date("2026-08-24T18:00:00.000Z");

    writeJson(path.join(dataDir, "posted", "2026-08-24", "daily-telegram-movers.json"), {
      postedAt: "2026-08-24T09:00:00.000Z",
      movers: ["kaspa", "render-token", "pendle", "bittensor", "sui"],
    });
    writeJson(path.join(dataDir, "posted", "2026-08-23", "daily-instagram-movers.json"), {
      postedAt: "2026-08-23T18:29:00.000Z",
      movers: ["injective-protocol", "celestia", "sei-network", "jupiter-exchange-solana", "fetch-ai"],
    });
    writeJson(path.join(dataDir, "posted", "2026-08-24", "solana-x.json"), {
      postedAt: "2026-08-24T14:00:00.000Z",
      platform: "x",
    });
    writeJson(path.join(dataDir, "posted_video", "2026-08-21", "daily-video.json"), {
      tokenId: "avalanche-2",
      platforms: {
        youtube: { postedAt: "2026-08-21T18:57:00.000Z", status: "published", videoId: "yt-avax" },
      },
    });
    writeJson(path.join(dataDir, "posted_video", "2026-08-13", "daily-video.json"), {
      tokenId: "chainlink",
      platforms: {
        instagram: { postedAt: "2026-08-13T18:47:00.000Z", status: "published", postId: "ig-link" },
      },
    });

    const youtubeCooldowns = resolveVideoTokenCooldowns(dataDir, ["youtube", "instagram"], {
      now,
      excludeDateKey: "2026-08-24",
    });

    expect(youtubeCooldowns.todayPosted).toEqual(new Set(["avalanche-2"]));
    expect(youtubeCooldowns.trendingCooldown).toEqual(new Set(["avalanche-2"]));
    expect(youtubeCooldowns.recentlyPosted).toEqual(new Set(["avalanche-2", "chainlink"]));

    const xCooldowns = resolveVideoTokenCooldowns(dataDir, ["x"], {
      now,
      excludeDateKey: "2026-08-24",
    });
    expect(xCooldowns.todayPosted).toEqual(new Set(["avalanche-2", "solana"]));
    expect(xCooldowns.recentlyPosted).toEqual(new Set(["avalanche-2", "chainlink", "solana"]));
  });

  it("prioritizes active mid-cap breakouts (#51-#200) and widens gracefully when all active movers are cooled down", async () => {
    const dataDir = makeTempDataDir();
    const metricsDir = path.join(dataDir, "metrics");

    const sleepyMegaCap: TokenData = {
      id: "sleepy-megacap",
      symbol: "SLPY",
      name: "Sleepy MegaCap",
      rank: 12,
      market: {
        price: 100,
        priceChange24h: 0.4,
        marketCap: 20_000_000_000,
        marketCapRank: 12,
        volume24h: 180_000_000,
      },
    };
    const midCapBreakout: TokenData = {
      id: "midcap-runner",
      symbol: "MRUN",
      name: "MidCap Runner",
      rank: 144,
      market: {
        price: 2.4,
        priceChange24h: 18.6,
        marketCap: 380_000_000,
        marketCapRank: 144,
        volume24h: 92_000_000,
      },
    };

    const registry = [
      { id: sleepyMegaCap.id, name: sleepyMegaCap.name, symbol: sleepyMegaCap.symbol },
      { id: midCapBreakout.id, name: midCapBreakout.name, symbol: midCapBreakout.symbol },
    ];

    const firstPick = await selectVideoTargetToken({
      candidateTokens: [sleepyMegaCap, midCapBreakout],
      cooldowns: {
        todayPosted: new Set(),
        recentlyPosted: new Set(),
        trendingCooldown: new Set(),
      },
      metricsDir,
      allTokensRegistry: registry,
      onWebsiteIds: new Set(),
      selectionPlatform: "all",
    });

    expect(firstPick).toMatchObject({
      reason: "top-gainer",
      token: { id: "midcap-runner" },
    });

    const fallbackPick = await selectVideoTargetToken({
      candidateTokens: [sleepyMegaCap, midCapBreakout],
      cooldowns: {
        todayPosted: new Set(["midcap-runner"]),
        recentlyPosted: new Set(["midcap-runner"]),
        trendingCooldown: new Set(["midcap-runner"]),
      },
      metricsDir,
      allTokensRegistry: registry,
      onWebsiteIds: new Set(),
      selectionPlatform: "all",
    });

    expect(fallbackPick).toMatchObject({
      reason: "spotlight",
      token: { id: "sleepy-megacap" },
    });
  });
});

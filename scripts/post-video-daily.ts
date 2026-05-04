/**
 * Telegram, X, and YouTube video auto-poster for the daily breakout token.
 *
 * Usage:
 *   npx tsx scripts/post-video-daily.ts
 *   npx tsx scripts/post-video-daily.ts --platform x --dry-run
 *   npx tsx scripts/post-video-daily.ts --force
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { logError } from "../src/lib/reporter";
import {
  generateTweet,
  generateTokenSummary,
  generateYoutubeMetadata,
} from "../src/lib/gemini";
import { uploadToYouTubeShorts } from "../src/lib/youtube";
import { sendTelegramVideo } from "../src/lib/telegram";
import { postTweetWithMedia, postTweet } from "../src/lib/x-client";
import { SOCIAL_PLATFORM_LIMITS, getTelegramFooter } from "../src/lib/config";
import { formatErrorForLog, safeReadJson, loadEnv } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import {
  type MetricData,
  type TokenData,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

type PlatformName = "telegram" | "x" | "youtube";

interface PlatformTracker {
  postedAt: string;
  messageId?: number;
  tweetId?: string;
  replyId?: string;
  videoId?: string;
}

interface VideoTracker {
  postedAt: string;
  tokenId: string;
  tokenName: string;
  reason: string;
  platform: string;
  platforms: Partial<Record<PlatformName, PlatformTracker>>;
}

function cleanupFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function getVideoCooldownTokens(dataDir: string, days: number): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return posted;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const dateDirs = fs.readdirSync(parentDir).filter((d) => {
    const fullPath = path.join(parentDir, d);
    return fs.statSync(fullPath).isDirectory() && !isNaN(new Date(d).getTime());
  });

  for (const dateDir of dateDirs) {
    if (new Date(dateDir) >= cutoff) {
      const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
      if (fs.existsSync(trackerFile)) {
        try {
          const tracker = JSON.parse(fs.readFileSync(trackerFile, "utf-8"));
          if (tracker.tokenId) posted.add(tracker.tokenId);
        } catch (_e) { /* ignore */ }
      }
    }
  }

  return posted;
}

function getRequestedPlatforms(
  runTelegram: boolean,
  runX: boolean,
  runYouTube: boolean,
): PlatformName[] {
  const requested: PlatformName[] = [];
  if (runTelegram) requested.push("telegram");
  if (runX) requested.push("x");
  if (runYouTube) requested.push("youtube");
  return requested;
}

function isTrackerComplete(tracker: VideoTracker | null, requestedPlatforms: PlatformName[]): boolean {
  if (!tracker) return false;
  return requestedPlatforms.every((platform) => !!tracker.platforms?.[platform]);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  const platformIdx = args.indexOf("--platform");
  const targetPlatform =
    platformIdx !== -1 && platformIdx + 1 < args.length ? args[platformIdx + 1] : "all";
  if (!["all", "telegram", "x", "youtube"].includes(targetPlatform)) {
    console.error("  Invalid --platform value. Expected one of: all, telegram, x, youtube.");
    process.exit(1);
  }

  console.log("==========================================");
  console.log("  TokenRadar Daily Video Breakout");
  console.log("==========================================");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  console.log();

  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted_video", today);
  const trackerFile = path.join(postedDir, "daily-video.json");
  if (!fs.existsSync(postedDir)) fs.mkdirSync(postedDir, { recursive: true });

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";
  const runYouTube = targetPlatform === "all" || targetPlatform === "youtube";
  const hasYouTubeCredentials = Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  );
  const shouldRunYouTube = runYouTube && hasYouTubeCredentials;
  const requestedPlatforms = getRequestedPlatforms(runTelegram, runX, shouldRunYouTube);

  const existingTracker =
    !force && fs.existsSync(trackerFile)
      ? safeReadJson<VideoTracker | null>(trackerFile, null)
      : null;

  if (!dryRun && isTrackerComplete(existingTracker, requestedPlatforms)) {
    console.log(
      `  Daily video already published for requested platforms (${requestedPlatforms.join(", ")}) at ${existingTracker?.postedAt}. Exiting.`,
    );
    return;
  }

  if (!dryRun) {
    if (runTelegram && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
      console.error("  Missing Telegram credentials.");
      process.exit(1);
    }
    if (
      runX &&
      (!process.env.X_OAUTH2_CLIENT_ID ||
        !process.env.X_OAUTH2_CLIENT_SECRET ||
        !process.env.X_OAUTH2_REFRESH_TOKEN)
    ) {
      console.error("  Missing X OAuth 2.0 credentials.");
      process.exit(1);
    }
    if (runYouTube && !hasYouTubeCredentials) {
      console.error("  Missing YouTube credentials.");
      if (targetPlatform === "youtube") process.exit(1);
      console.warn("  Continuing without YouTube because the requested target includes other platforms.");
    }
  }

  console.log("Step 1: Loading candidate tokens...");
  const metricsDir = path.join(DATA_DIR, "metrics");
  const {
    candidates: candidateTokens,
    allRegistry: allTokensRegistry,
    onWebsiteIds,
  } = await loadCandidateTokens(DATA_DIR, 1, 50);

  if (candidateTokens.length === 0) {
    console.error("  No tokens found.");
    process.exit(1);
  }

  const todayPosted = force ? new Set<string>() : getTodayPostedTokens(DATA_DIR, today);
  const recentlyPosted = force ? new Set<string>() : getRecentlyPostedTokens(DATA_DIR);
  
  if (!force) {
    const videoCooldown = getVideoCooldownTokens(DATA_DIR, 7);
    for (const id of videoCooldown) {
      todayPosted.add(id);
    }
  }

  const selectionPlatform = runX ? "x" : runTelegram ? "telegram" : "all";

  console.log();
  console.log(`Step 2: Selecting top breakout token... (Force: ${force})`);

  let targetToken: TokenData | undefined;
  let reason = existingTracker?.reason || "spotlight";
  let trendingContext: string | undefined;

  if (existingTracker?.tokenId) {
    targetToken = candidateTokens.find((candidate) => candidate.id === existingTracker.tokenId);
    if (!targetToken) {
      console.error(`  Tracked video token ${existingTracker.tokenId} is no longer available in the candidate set.`);
      process.exit(1);
    }
    console.log(`  Resuming prior daily video token: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);
  } else {
    const selection = await selectToken(
      candidateTokens,
      todayPosted,
      recentlyPosted,
      metricsDir,
      allTokensRegistry,
      onWebsiteIds,
      selectionPlatform,
      force,
    );

    if (!selection) {
      console.error("  Could not select a target token.");
      process.exit(1);
    }

    targetToken = selection.token;
    reason = selection.reason;
    trendingContext = selection.trendingContext;
  }

  if (!targetToken) {
    console.error("  Could not determine a target token.");
    process.exit(1);
  }

  console.log(`  Selected: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);

  let targetMetric: MetricData | undefined;
  const metricsFile = path.join(metricsDir, `${targetToken.id}.json`);
  if (fs.existsSync(metricsFile)) {
    targetMetric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
  }

  const context = {
    ...targetMetric,
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    marketCap: targetToken.market.marketCap,
    trendingContext,
    timeOfDay: getTimeOfDay(),
    tone: getRandomTone(),
    selectionReason: reason,
  };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

  console.log();
  console.log("Step 3: Rendering video with Remotion...");
  const outPath = path.join(process.cwd(), "out.mp4");

  const videoProps = {
    tokenName: targetToken.name,
    symbol: targetToken.symbol.toUpperCase(),
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    riskScore: targetMetric?.riskScore || 5.0,
    marketCap: targetToken.market.marketCap,
  };

  try {
    const propsFile = path.join(process.cwd(), "remotion-props.json");
    fs.writeFileSync(propsFile, JSON.stringify(videoProps));

    try {
      execSync(
        "npx remotion render src/video/index.tsx TopGainerUpdate out.mp4 --props=remotion-props.json",
        { stdio: "inherit" },
      );
    } finally {
      cleanupFile(propsFile);
    }

    console.log("  Video rendered successfully to out.mp4");
  } catch (error) {
    console.error(`  Video rendering failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }

  const videoBuffer = fs.readFileSync(outPath);

  try {
    let tgMessage = "";
    let xMessage = "";
    let xReplyMessage = "";
    let ytMetadata = { title: "", description: "" };

    if (runTelegram) {
      const footer = getTelegramFooter(targetToken.symbol);
      const tgMaxChars = SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT - footer.length - 20;
      const aiSummary = await generateTokenSummary(
        targetToken.name,
        targetToken.symbol,
        targetToken.description || "",
        context,
        tgMaxChars
      );
      tgMessage = aiSummary; // No longer stripping since we rely on strict prompt length
    }

    if (runX) {
      const xMaxChars = 260;
      xMessage = await generateTweet(targetToken.name, targetToken.symbol, context, xMaxChars);
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      xReplyMessage = isOnWebsite
        ? `Read our full deep-dive data report on $${targetToken.symbol.toUpperCase()} here:\n\n${siteUrl}/${targetToken.id}`
        : `Newly discovered alpha. Discover 300+ tracked and upcoming tokens on our live dashboard here:\n\n${siteUrl}`;
    }

    if (shouldRunYouTube) {
      ytMetadata = await generateYoutubeMetadata(targetToken.name, targetToken.symbol, context);
    }

    if (dryRun) {
      console.log();
      console.log("=== DRY RUN MODE ===");
      if (runTelegram) {
        console.log();
        console.log("--- TELEGRAM CAPTION ---");
        console.log(tgMessage);
      }
      if (runX) {
        console.log();
        console.log("--- X MAIN TWEET (with out.mp4) ---");
        console.log(xMessage);
      }
      if (shouldRunYouTube) {
        console.log();
        console.log("--- YOUTUBE SHORTS ---");
        console.log(`TITLE: ${ytMetadata.title}`);
        console.log(`DESC:\n${ytMetadata.description}`);
      }
      return;
    }

    const trackerState: VideoTracker = {
      postedAt: existingTracker?.postedAt || new Date().toISOString(),
      tokenId: targetToken.id,
      tokenName: targetToken.name,
      reason,
      platform: targetPlatform,
      platforms: { ...(existingTracker?.platforms || {}) },
    };

    const publishTasks: Array<Promise<{ platform: PlatformName; tracker: PlatformTracker | null }>> = [];

    if (runTelegram && !trackerState.platforms.telegram) {
      publishTasks.push(
        (async () => {
          try {
            const tgFooter = getTelegramFooter(targetToken.symbol);
            let caption = tgMessage.trim() + "\n" + tgFooter.trim();
            if (caption.length > SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT) {
              const footerWithPadding = "\n" + tgFooter.trim();
              const maxBody = SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT - footerWithPadding.length - 3;
              caption = tgMessage.substring(0, maxBody) + "..." + footerWithPadding;
            }

            const msgId = await sendTelegramVideo(videoBuffer, caption, channelId as string);
            console.log(`Posted video to Telegram (Message ID: ${msgId})`);
            return {
              platform: "telegram" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                messageId: msgId,
              },
            };
          } catch (error) {
            await logError("post-video-daily-telegram", error, false);
            console.error(`Telegram video post failed: ${formatErrorForLog(error)}`);
            return { platform: "telegram" as const, tracker: null };
          }
        })(),
      );
    }

    if (runX && !trackerState.platforms.x) {
      publishTasks.push(
        (async () => {
          try {
            const tweetId = await postTweetWithMedia(xMessage, videoBuffer, "video/mp4");
            console.log(`Posted tweet with video to X (Tweet ID: ${tweetId})`);

            let replyId: string | undefined;
            try {
              replyId = await postTweet(xReplyMessage, tweetId);
              console.log(`Posted reply to X (Reply ID: ${replyId})`);
            } catch (replyError) {
              await logError("post-video-daily-x-reply", replyError, false);
              console.warn(`Main video tweet succeeded, but the follow-up reply failed: ${formatErrorForLog(replyError)}`);
            }

            return {
              platform: "x" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                tweetId,
                replyId,
              },
            };
          } catch (error) {
            await logError("post-video-daily-x", error, false);
            console.error(`X video post failed: ${formatErrorForLog(error)}`);
            return { platform: "x" as const, tracker: null };
          }
        })(),
      );
    }

    if (shouldRunYouTube && !trackerState.platforms.youtube) {
      publishTasks.push(
        (async () => {
          try {
            const publishAt = new Date();
            publishAt.setMinutes(publishAt.getMinutes() + 15);
            
            console.log(`Starting YouTube upload (scheduled for ${publishAt.toISOString()})...`);
            const videoId = await uploadToYouTubeShorts(
              outPath,
              ytMetadata.title,
              ytMetadata.description,
              "private",
              publishAt
            );
            console.log(`Posted video to YouTube Shorts (Video ID: ${videoId})`);
            return {
              platform: "youtube" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                videoId,
              },
            };
          } catch (error) {
            await logError("post-video-daily-youtube", error, false);
            console.error(`YouTube video post failed: ${formatErrorForLog(error)}`);
            return { platform: "youtube" as const, tracker: null };
          }
        })(),
      );
    }

    const results = await Promise.all(publishTasks);
    for (const result of results) {
      if (result.tracker) {
        trackerState.platforms[result.platform] = result.tracker;
      }
    }

    const remainingPlatforms = requestedPlatforms.filter((platform) => !trackerState.platforms[platform]);
    if (remainingPlatforms.length > 0) {
      trackerState.postedAt = new Date().toISOString();
      fs.writeFileSync(trackerFile, JSON.stringify(trackerState, null, 2));
      throw new Error(`Failed to publish daily video to: ${remainingPlatforms.join(", ")}`);
    }

    trackerState.postedAt = new Date().toISOString();
    fs.writeFileSync(trackerFile, JSON.stringify(trackerState, null, 2));
  } finally {
    cleanupFile(outPath);
  }
}

main().catch(async (error) => {
  await logError("post-video-daily", error);
  process.exit(1);
});

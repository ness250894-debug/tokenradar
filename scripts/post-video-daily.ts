/**
 * Multi-platform video auto-poster for the daily breakout token.
 * Supports: Telegram, X, YouTube, Instagram, Threads, and TikTok API upload/manual reporting.
 *
 * Usage:
 *   npx tsx scripts/post-video-daily.ts
 *   npx tsx scripts/post-video-daily.ts --platform x --dry-run
 *   npx tsx scripts/post-video-daily.ts --platform instagram --dry-run
 *   npx tsx scripts/post-video-daily.ts --platform tiktok --dry-run
 *   npx tsx scripts/post-video-daily.ts --force
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

import { logError } from "../src/lib/reporter";
import {
  generateUnifiedCaptions,
  type PlatformTarget,
} from "../src/lib/gemini";
import { uploadToYouTubeShorts } from "../src/lib/youtube";
import { buildTelegramMediaCaption, sendTelegramVideo } from "../src/lib/telegram";
import { diversifyXPostText, postTweetWithMedia, postTweet } from "../src/lib/x-client";
import { SOCIAL, SOCIAL_PLATFORM_LIMITS, VIDEO_COOLDOWN_DAYS, getTelegramFooter } from "../src/lib/config";
import { formatErrorForLog, safeReadJson, loadEnv } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import { generateHookText } from "../src/lib/social-content-generator";
import { publishVideo as publishMetaVideo, hasMetaCredentials, type TextEntity } from "../src/lib/meta-client";
import { cleanPrefix, deleteObjects, uploadVideo as uploadToR2, hasR2Credentials } from "../src/lib/r2-client";
import {
  hasTikTokManualReportCredentials,
  sendTikTokInboxUploadReport,
  sendTikTokManualPostReport,
} from "../src/lib/tiktok-manual";
import {
  getTikTokCredentialMode,
  hasTikTokApiCredentials,
  normalizeTikTokCaption,
  publishVideoDirectlyToTikTok,
  uploadVideoToTikTokInbox,
} from "../src/lib/tiktok-client";
import { getRandomTrack } from "../src/lib/audio-config";
import {
  type MetricData,
  type TokenData,
  cleanupExpiredCooldownFolders,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";
import { getRecentPlatformTexts } from "./lib/social-history";

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

type PlatformName = "telegram" | "x" | "youtube" | "instagram" | "threads" | "tiktok";
type PlatformRoute = PlatformName | "all" | "shorts";

interface PlatformTracker {
  postedAt: string;
  messageId?: number;
  tweetId?: string;
  replyId?: string;
  xText?: string;
  videoId?: string;
  postId?: string;
  caption?: string;
  reportVideoMessageId?: number;
  reportSummaryMessageId?: number;
  reportCaptionMessageIds?: number[];
  publishId?: string;
  tiktokStatus?: string;
  tiktokFailReason?: string;
  tiktokCaption?: string;
  tiktokPrivacyLevel?: string;
  tiktokCreatorUsername?: string;
  deliveryMode?: "content-posting-api-direct" | "content-posting-api-inbox" | "direct" | "telegram-report-manual";
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

function getRemotionCliPath(): string {
  return path.join(
    process.cwd(),
    "node_modules",
    "@remotion",
    "cli",
    "remotion-cli.js",
  );
}

function getVideoCooldownTokens(dataDir: string, days: number): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return posted;

  const cutoff = new Date();
  cutoff.setUTCHours(0, 0, 0, 0);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((d) => {
    const fullPath = path.join(parentDir, d);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(d);
  });

  for (const dateDir of dateDirs) {
    if (dateDir >= cutoffKey) {
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
  runInstagram: boolean,
  runThreads: boolean,
  runTikTok: boolean,
): PlatformName[] {
  const requested: PlatformName[] = [];
  if (runTelegram) requested.push("telegram");
  if (runX) requested.push("x");
  if (runYouTube) requested.push("youtube");
  if (runInstagram) requested.push("instagram");
  if (runThreads) requested.push("threads");
  if (runTikTok) requested.push("tiktok");
  return requested;
}

function isTrackerComplete(tracker: VideoTracker | null, requestedPlatforms: PlatformName[]): boolean {
  if (!tracker) return false;
  return requestedPlatforms.every((platform) => !!tracker.platforms?.[platform]);
}

function extractInstagramContent(caption: string | undefined): { caption: string; hashtags: string[] } {
  const safeCaption = (caption || "").trim();
  const hashtags = (safeCaption.match(/#[a-zA-Z0-9_]+/g) || []).map((tag) => tag.slice(1));
  return { caption: safeCaption, hashtags };
}

function sanitizeThreadsTopicTag(topicTag: string | undefined): string {
  let sanitized = (topicTag || "crypto")
    .replace(/[#.&]/g, "")
    .replace(/\s+/g, "")
    .trim();

  if (!sanitized) sanitized = "crypto";
  if (sanitized.length > SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH) {
    sanitized = sanitized.substring(0, SOCIAL_PLATFORM_LIMITS.THREADS.TOPIC_TAG_MAX_LENGTH);
  }

  return sanitized;
}

function buildThreadsContent(
  caption: string | undefined,
  topicTag: string | undefined,
  spoilerText: string | undefined,
  tokenName: string,
): { caption: string; topicTag: string; spoilerText: string; spoilerOffset: number; spoilerLength: number } {
  const maxChars = SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT;
  let safeSpoilerText = (spoilerText || tokenName).trim();
  if (!safeSpoilerText) safeSpoilerText = tokenName;

  let safeCaption = (caption || `This setup is moving fast. Watch the data behind ${tokenName}.`).trim();
  if (!safeCaption.includes(safeSpoilerText)) {
    const suffix = ` ${safeSpoilerText}`;
    const bodyBudget = maxChars - suffix.length;
    safeCaption = bodyBudget > 0
      ? `${safeCaption.substring(0, bodyBudget).trim()}${suffix}`.trim()
      : safeSpoilerText.substring(0, maxChars);
  }

  if (safeCaption.length > maxChars) {
    safeCaption = `${safeCaption.substring(0, maxChars - 3).trim()}...`;
  }

  if (!safeCaption.includes(safeSpoilerText)) {
    safeCaption = safeSpoilerText.length <= maxChars
      ? safeSpoilerText
      : safeSpoilerText.substring(0, maxChars);
  }

  const spoilerIndex = safeCaption.indexOf(safeSpoilerText);
  const textEncoder = new TextEncoder();
  const spoilerOffset = spoilerIndex >= 0
    ? textEncoder.encode(safeCaption.substring(0, spoilerIndex)).length
    : 0;
  const spoilerLength = spoilerIndex >= 0 ? textEncoder.encode(safeSpoilerText).length : 0;

  return {
    caption: safeCaption,
    topicTag: sanitizeThreadsTopicTag(topicTag),
    spoilerText: safeSpoilerText,
    spoilerOffset,
    spoilerLength,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const includeLinkReply = args.includes("--link-reply");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  const platformIdx = args.indexOf("--platform");
  const targetPlatform =
    (platformIdx !== -1 && platformIdx + 1 < args.length ? args[platformIdx + 1] : "all") as PlatformRoute;
  if (!["all", "shorts", "telegram", "x", "youtube", "instagram", "threads", "tiktok"].includes(targetPlatform)) {
    console.error("  Invalid --platform value. Expected one of: all, shorts, telegram, x, youtube, instagram, threads, tiktok.");
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
  cleanupExpiredCooldownFolders(DATA_DIR);
  if (!fs.existsSync(postedDir)) fs.mkdirSync(postedDir, { recursive: true });

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";
  const runYouTube = targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "youtube";
  const runInstagram = targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "instagram";
  const runThreads = targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "threads";
  const runTikTok = targetPlatform === "all" || targetPlatform === "shorts" || targetPlatform === "tiktok";
  const hasYouTubeCredentials = Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  );
  const shouldRunYouTube = runYouTube && hasYouTubeCredentials;
  const shouldRunInstagram = runInstagram && hasMetaCredentials("instagram") && hasR2Credentials();
  const shouldRunThreads = runThreads && hasMetaCredentials("threads") && hasR2Credentials();
  const hasTikTokApiCredentialsConfigured = hasTikTokApiCredentials();
  const tiktokCredentialMode = runTikTok && hasTikTokApiCredentialsConfigured ? getTikTokCredentialMode() : "sandbox";
  const hasTikTokReportCredentials = hasTikTokManualReportCredentials();
  const shouldRunTikTokDirect = runTikTok && hasTikTokApiCredentialsConfigured && tiktokCredentialMode === "production";
  const shouldRunTikTokInbox = runTikTok && hasTikTokApiCredentialsConfigured && tiktokCredentialMode === "sandbox";
  const shouldRunTikTokManual = runTikTok && !hasTikTokApiCredentialsConfigured && (dryRun || hasTikTokReportCredentials);
  const shouldRunTikTok = shouldRunTikTokDirect || shouldRunTikTokInbox || shouldRunTikTokManual;
  const requestedPlatforms = getRequestedPlatforms(
    runTelegram,
    runX,
    shouldRunYouTube,
    shouldRunInstagram,
    shouldRunThreads,
    shouldRunTikTok,
  );

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
    if (runInstagram && !shouldRunInstagram) {
      console.warn("  Missing Instagram or R2 credentials. Skipping Instagram.");
      if (targetPlatform === "instagram") process.exit(1);
    }
    if (runThreads && !shouldRunThreads) {
      console.warn("  Missing Threads or R2 credentials. Skipping Threads.");
      if (targetPlatform === "threads") process.exit(1);
    }
    if (runTikTok && !hasTikTokApiCredentialsConfigured && !hasTikTokReportCredentials) {
      console.warn("  Missing TikTok API credentials and Telegram reporting credentials. Skipping TikTok.");
      if (targetPlatform === "tiktok") process.exit(1);
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
    const videoCooldown = getVideoCooldownTokens(DATA_DIR, VIDEO_COOLDOWN_DAYS);
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

  console.log();
  console.log("Step 3: Rendering video with Remotion...");
  const outPath = path.join(process.cwd(), "out.mp4");
  const threadsOutPath = path.join(process.cwd(), "out-threads.mp4");

  const audioTrack = getRandomTrack();
  console.log(`  Audio: ${audioTrack.file} (start: ${audioTrack.startSeconds}s)`);

  const hookText = await generateHookText(targetToken.name, targetToken.symbol, context);
  
  const { getVerdict } = await import("../src/video/styles");
  const verdict = getVerdict(targetMetric?.riskScore || 5.0, targetToken.market.priceChange24h);

  const videoProps = {
    tokenName: targetToken.name,
    symbol: targetToken.symbol.toUpperCase(),
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    riskScore: targetMetric?.riskScore || 5.0,
    riskLevel: targetMetric?.riskLevel,
    marketCap: targetToken.market.marketCap,
    marketCapRank: targetToken.market.marketCapRank,
    volume24h: targetToken.market.volume24h,
    growthPotentialIndex: targetMetric?.growthPotentialIndex,
    audioFile: audioTrack.file,
    audioStartSeconds: audioTrack.startSeconds,
    hookText,
    contextText: context.trendingContext || "Strong social sentiment and increasing volume are driving this breakout.",
    verdict,
  };

  try {
    const propsFile = path.join(process.cwd(), "remotion-props.json");
    fs.writeFileSync(propsFile, JSON.stringify(videoProps));

    try {
      execFileSync(
        process.execPath,
        [
          getRemotionCliPath(),
          "render",
          "src/video/index.tsx",
          "TopGainerUpdate",
          outPath,
          "--props=remotion-props.json",
        ],
        { stdio: "inherit" },
      );
    } finally {
      cleanupFile(propsFile);
    }

    console.log("  Video rendered successfully to out.mp4");

    // Re-encode variant for Threads (binary-different via CRF 19, ~10 seconds)
    if (shouldRunThreads) {
      console.log("  Re-encoding variant for Threads (CRF 19)...");
      try {
        execFileSync(
          "ffmpeg",
          [
            "-y",
            "-i",
            outPath,
            "-c:v",
            "libx264",
            "-crf",
            "19",
            "-preset",
            "veryfast",
            "-c:a",
            "copy",
            threadsOutPath,
          ],
          { stdio: "pipe" },
        );
        console.log("  Threads variant rendered to out-threads.mp4");
      } catch (ffmpegError) {
        console.warn(`  ffmpeg re-encode failed: ${formatErrorForLog(ffmpegError)}`);
        console.warn("  Falling back to using the same video file for Threads.");
        // Copy primary video as fallback
        fs.copyFileSync(outPath, threadsOutPath);
      }
    }
  } catch (error) {
    console.error(`  Video rendering failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }

  const videoBuffer = fs.readFileSync(outPath);

  // ── R2 Upload for Meta platforms ──
  let igVideoUrl = "";
  let threadsVideoUrl = "";
  let igVideoKey = "";
  let threadsVideoKey = "";

  if (shouldRunInstagram || shouldRunThreads) {
    console.log();
    console.log("Step 3b: Staging videos to R2 for Meta APIs...");
    try {
      const videoPrefix = `video/${today}/`;
      await cleanPrefix(videoPrefix);
      if (shouldRunInstagram) {
        igVideoKey = `${videoPrefix}instagram.mp4`;
        igVideoUrl = await uploadToR2(outPath, igVideoKey);
      }
      if (shouldRunThreads && fs.existsSync(threadsOutPath)) {
        threadsVideoKey = `${videoPrefix}threads.mp4`;
        threadsVideoUrl = await uploadToR2(threadsOutPath, threadsVideoKey);
      }
    } catch (r2Error) {
      console.error(`  R2 staging failed: ${formatErrorForLog(r2Error)}`);
      console.warn("  Continuing without Meta platforms.");
      igVideoUrl = "";
      threadsVideoUrl = "";
      igVideoKey = "";
      threadsVideoKey = "";
    }
  }

  try {
    let tgMessage = "";
    let xMessage = "";
    let xReplyMessage = "";
    let ytMetadata = { title: "", description: "" };
    let igContent = { caption: "", hashtags: [] as string[] };
    let threadsContent = { caption: "", topicTag: "crypto", spoilerText: "", spoilerOffset: 0, spoilerLength: 0 };
    let tiktokCaption = "";

    console.log();
    console.log("Step 4: Generating platform captions...");

    const captionPlatforms: PlatformTarget[] = [];
    const captionOptions: {
      telegramMaxChars?: number;
      xMaxChars?: number;
      instagramMaxChars?: number;
      threadsMaxChars?: number;
      tiktokMaxChars?: number;
    } = {};

    if (runTelegram) {
      captionOptions.telegramMaxChars = SOCIAL_PLATFORM_LIMITS.TELEGRAM.VIDEO_AI_SUMMARY_CHARS;
      captionPlatforms.push("telegram");
    }

    if (runX) {
      captionOptions.xMaxChars = 260;
      captionPlatforms.push("x");
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      xReplyMessage = includeLinkReply
        ? isOnWebsite
          ? `Read the $${targetToken.symbol.toUpperCase()} deep-dive and find all TokenRadar links here:\n\n${SOCIAL.ecosystemUrl}`
          : `Discover 300+ tracked and upcoming tokens through TokenRadar links:\n\n${SOCIAL.ecosystemUrl}`
        : "";
    }

    if (shouldRunYouTube) {
      captionPlatforms.push("youtube");
    }

    if (shouldRunInstagram && igVideoUrl) {
      captionOptions.instagramMaxChars = SOCIAL_PLATFORM_LIMITS.INSTAGRAM.CAPTION_LIMIT;
      captionPlatforms.push("instagram");
    }

    if (shouldRunThreads && threadsVideoUrl) {
      captionOptions.threadsMaxChars = SOCIAL_PLATFORM_LIMITS.THREADS.TEXT_LIMIT;
      captionPlatforms.push("threads");
    }

    if (shouldRunTikTok) {
      captionOptions.tiktokMaxChars = SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT;
      captionPlatforms.push("tiktok");
    }

    if (captionPlatforms.length > 0) {
      const captions = await generateUnifiedCaptions(
        targetToken.name,
        targetToken.symbol,
        targetToken.description || "",
        context,
        captionPlatforms,
        captionOptions,
      );

      if (runTelegram) tgMessage = captions.telegramSummary || "";
      if (runX) xMessage = captions.xTweet || "";
      if (shouldRunYouTube) {
        ytMetadata = {
          title: captions.youtubeTitle || "",
          description: captions.youtubeDescription || "",
        };
      }
      if (shouldRunInstagram && igVideoUrl) {
        igContent = extractInstagramContent(captions.instagramCaption);
      }
      if (shouldRunThreads && threadsVideoUrl) {
        threadsContent = buildThreadsContent(
          captions.threadsCaption,
          captions.threadsTopicTag,
          captions.threadsSpoilerText,
          targetToken.name,
        );
      }
      if (shouldRunTikTok) {
        tiktokCaption = captions.tiktokCaption || "";
      }
    }

    if (runX && xMessage) {
      const recentXTexts = getRecentPlatformTexts(DATA_DIR, "x", 14);
      const diversified = diversifyXPostText(
        xMessage,
        recentXTexts,
        `${today}:${targetToken.id}:${reason}:video`,
        captionOptions.xMaxChars ?? 260,
      );
      if (diversified !== xMessage) {
        console.log("Adjusted X video copy to avoid repeating recent post structure.");
        xMessage = diversified;
      }
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
      if (shouldRunInstagram) {
        console.log();
        console.log("--- INSTAGRAM REEL ---");
        console.log(`R2 URL: ${igVideoUrl}`);
        console.log(`CAPTION (${igContent.caption.length} chars):`);
        console.log(igContent.caption);
        console.log(`HASHTAGS: ${igContent.hashtags.join(", ")}`);
      }
      if (shouldRunThreads) {
        console.log();
        console.log("--- THREADS POST ---");
        console.log(`R2 URL: ${threadsVideoUrl}`);
        console.log(`CAPTION (${threadsContent.caption.length} chars):`);
        console.log(threadsContent.caption);
        console.log(`TOPIC: ${threadsContent.topicTag}`);
        console.log(`SPOILER: "${threadsContent.spoilerText}" (offset: ${threadsContent.spoilerOffset}, length: ${threadsContent.spoilerLength})`);
      }
      if (shouldRunTikTok) {
        console.log();
        console.log(
          shouldRunTikTokDirect
            ? "--- TIKTOK DIRECT POST ---"
            : shouldRunTikTokInbox
              ? "--- TIKTOK API UPLOAD ---"
              : "--- TIKTOK MANUAL REPORT ---",
        );
        console.log(`CAPTION (${tiktokCaption.length}/${SOCIAL_PLATFORM_LIMITS.TIKTOK.CAPTION_LIMIT} chars):`);
        console.log(tiktokCaption);
        if (shouldRunTikTokDirect) {
          console.log("DELIVERY: TikTok Content Posting API direct post with video.publish scope.");
          console.log("NOTE: The caption is sent to TikTok as post_info.title.");
        } else if (shouldRunTikTokInbox) {
          console.log("DELIVERY: TikTok Content Posting API inbox upload with video.upload scope.");
          console.log(
            hasTikTokReportCredentials
              ? "NOTE: TikTok upload-to-inbox receives the MP4; the copy-ready caption is sent to the Telegram reporting chat."
              : "NOTE: TikTok upload-to-inbox receives the MP4; missing Telegram reporting credentials, so the caption is stored in the tracker only.",
          );
        } else {
          console.log("DELIVERY: Telegram reporting dialog with video attachment and copy-ready caption.");
        }
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
            const caption = buildTelegramMediaCaption(tgMessage, tgFooter, {
              maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
              bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.VIDEO_AI_SUMMARY_CHARS,
            });

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
            if (xReplyMessage) {
              try {
                replyId = await postTweet(xReplyMessage, tweetId);
                console.log(`Posted reply to X (Reply ID: ${replyId})`);
              } catch (replyError) {
                await logError("post-video-daily-x-reply", replyError, false);
                console.warn(`Main video tweet succeeded, but the follow-up reply failed: ${formatErrorForLog(replyError)}`);
              }
            }

            return {
              platform: "x" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                tweetId,
                replyId,
                xText: xMessage,
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

    // ── Instagram Reel ──
    if (shouldRunInstagram && igVideoUrl && !trackerState.platforms.instagram) {
      publishTasks.push(
        (async () => {
          try {
            const result = await publishMetaVideo("instagram", igVideoUrl, igContent.caption, {
              thumbOffset: 3000,
            });
            console.log(`Posted Reel to Instagram (Post ID: ${result.id})`);
            return {
              platform: "instagram" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                postId: result.id,
                caption: igContent.caption,
              },
            };
          } catch (error) {
            await logError("post-video-daily-instagram", error, false);
            console.error(`Instagram Reel post failed: ${formatErrorForLog(error)}`);
            return { platform: "instagram" as const, tracker: null };
          }
        })(),
      );
    }

    // ── Threads Post ──
    if (shouldRunThreads && threadsVideoUrl && !trackerState.platforms.threads) {
      publishTasks.push(
        (async () => {
          try {
            const spoilerEntities: TextEntity[] = threadsContent.spoilerLength > 0
              ? [{ entity_type: "SPOILER", offset: threadsContent.spoilerOffset, length: threadsContent.spoilerLength }]
              : [];

            const result = await publishMetaVideo("threads", threadsVideoUrl, threadsContent.caption, {
              topicTag: threadsContent.topicTag,
              spoilerEntities,
            });
            console.log(`Posted video to Threads (Post ID: ${result.id})`);
            return {
              platform: "threads" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                postId: result.id,
                caption: threadsContent.caption,
              },
            };
          } catch (error) {
            await logError("post-video-daily-threads", error, false);
            console.error(`Threads video post failed: ${formatErrorForLog(error)}`);
            return { platform: "threads" as const, tracker: null };
          }
        })(),
      );
    }

    if (shouldRunTikTokDirect && !trackerState.platforms.tiktok) {
      publishTasks.push(
        (async () => {
          try {
            const safeTikTokCaption = normalizeTikTokCaption(tiktokCaption);
            const result = await publishVideoDirectlyToTikTok({
              videoPath: outPath,
              caption: safeTikTokCaption,
            });
            console.log(`Posted video directly to TikTok (Publish ID: ${result.publishId})`);
            return {
              platform: "tiktok" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                publishId: result.publishId,
                tiktokStatus: result.status?.status,
                tiktokFailReason: result.status?.fail_reason,
                tiktokCaption: safeTikTokCaption,
                tiktokPrivacyLevel: result.privacyLevel,
                tiktokCreatorUsername: result.creatorInfo?.creator_username,
                deliveryMode: "content-posting-api-direct" as const,
              },
            };
          } catch (error) {
            await logError("post-video-daily-tiktok-direct", error, false);
            console.error(`TikTok direct post failed: ${formatErrorForLog(error)}`);
            return { platform: "tiktok" as const, tracker: null };
          }
        })(),
      );
    }

    if (shouldRunTikTokInbox && !trackerState.platforms.tiktok) {
      publishTasks.push(
        (async () => {
          try {
            const safeTikTokCaption = normalizeTikTokCaption(tiktokCaption);
            const result = await uploadVideoToTikTokInbox({
              videoPath: outPath,
            });
            console.log(`Uploaded video to TikTok inbox (Publish ID: ${result.publishId})`);

            let reportSummaryMessageId: number | undefined;
            let reportCaptionMessageIds: number[] | undefined;
            if (hasTikTokReportCredentials) {
              try {
                const report = await sendTikTokInboxUploadReport({
                  caption: safeTikTokCaption,
                  tokenName: targetToken.name,
                  symbol: targetToken.symbol,
                  publishId: result.publishId,
                  status: result.status?.status,
                  failReason: result.status?.fail_reason,
                  reason,
                  generatedAt: new Date().toISOString(),
                });
                reportSummaryMessageId = report.summaryMessageId;
                reportCaptionMessageIds = report.captionMessageIds;
                console.log(
                  `Sent TikTok inbox caption to reporting dialog (Summary Message ID: ${report.summaryMessageId})`,
                );
              } catch (reportError) {
                await logError("post-video-daily-tiktok-api-report", reportError, false);
                console.error(`TikTok inbox Telegram report failed: ${formatErrorForLog(reportError)}`);
              }
            } else {
              console.warn("  Missing Telegram reporting credentials. TikTok caption stored in tracker only.");
            }

            return {
              platform: "tiktok" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                publishId: result.publishId,
                tiktokStatus: result.status?.status,
                tiktokFailReason: result.status?.fail_reason,
                tiktokCaption: safeTikTokCaption,
                reportSummaryMessageId,
                reportCaptionMessageIds,
                deliveryMode: "content-posting-api-inbox" as const,
              },
            };
          } catch (error) {
            await logError("post-video-daily-tiktok-api", error, false);
            console.error(`TikTok API upload failed: ${formatErrorForLog(error)}`);
            return { platform: "tiktok" as const, tracker: null };
          }
        })(),
      );
    }

    if (shouldRunTikTokManual && !trackerState.platforms.tiktok) {
      publishTasks.push(
        (async () => {
          try {
            const result = await sendTikTokManualPostReport({
              videoBuffer,
              caption: tiktokCaption,
              tokenName: targetToken.name,
              symbol: targetToken.symbol,
              reason,
              generatedAt: new Date().toISOString(),
            });
            console.log(
              `Sent TikTok manual package to reporting dialog (Video Message ID: ${result.videoMessageId})`,
            );
            return {
              platform: "tiktok" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                reportVideoMessageId: result.videoMessageId,
                reportCaptionMessageIds: result.captionMessageIds,
                tiktokCaption,
                deliveryMode: "telegram-report-manual" as const,
              },
            };
          } catch (error) {
            await logError("post-video-daily-tiktok-manual", error, false);
            console.error(`TikTok manual report failed: ${formatErrorForLog(error)}`);
            return { platform: "tiktok" as const, tracker: null };
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

    const stagedKeysToDelete = [
      trackerState.platforms.instagram ? igVideoKey : "",
      trackerState.platforms.threads ? threadsVideoKey : "",
    ].filter(Boolean);

    if (stagedKeysToDelete.length > 0) {
      try {
        await deleteObjects(stagedKeysToDelete);
      } catch (cleanupError) {
        console.warn(`  R2 staged video cleanup failed: ${formatErrorForLog(cleanupError)}`);
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
    cleanupFile(path.join(process.cwd(), "out-threads.mp4"));
  }
}

main().catch(async (error) => {
  await logError("post-video-daily", error);
  process.exit(1);
});

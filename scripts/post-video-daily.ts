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
  type UnifiedCaptionOptions,
} from "../src/lib/gemini";
import { uploadToYouTubeShorts } from "../src/lib/youtube";
import { buildTelegramMediaCaption, sendTelegramVideo } from "../src/lib/telegram";
import { diversifyXPostText, postTweetWithMedia, postTweet } from "../src/lib/x-client";
import {
  SOCIAL,
  SOCIAL_PLATFORM_LIMITS,
  VIDEO_COOLDOWN_DAYS,
  VIDEO_FORMAT_COOLDOWN_DAYS,
  getTelegramFooter,
} from "../src/lib/config";
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
import { getTrackForDate } from "../src/lib/audio-config";
import { formatCompact, formatPercent, formatPrice } from "../src/lib/formatters";
import {
  formatVideoFormatPromptLine,
  getVideoFormat,
  selectVideoFormatsForSlots,
  type VideoFormat,
  type VideoFormatKey,
} from "../src/lib/video-formats";
import {
  selectVideoVisualRecipe,
  type VideoVisualRecipe,
} from "../src/lib/video-recipes";
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
  youtubeTitle?: string;
  youtubeDescription?: string;
  formatKey?: VideoFormatKey;
  formatLabel?: string;
  formatFamily?: string;
  videoThesis?: string;
  hookText?: string;
  audioTrack?: string;
  audioStartSeconds?: number;
  visualRecipeKey?: string;
  visualRecipe?: VideoVisualRecipe;
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
  // Legacy single-render fields kept so old tracker files can still seed cooldown reads.
  formatKey?: VideoFormatKey;
  formatLabel?: string;
  formatFamily?: string;
  videoThesis?: string;
  hookText?: string;
  audioTrack?: string;
  audioStartSeconds?: number;
  visualRecipeKey?: string;
  visualRecipe?: VideoVisualRecipe;
  platforms: Partial<Record<PlatformName, PlatformTracker>>;
}

interface AudioTrackSelection {
  file: string;
  startSeconds: number;
}

interface PlatformVideoAsset {
  platform: PlatformName;
  outputPath: string;
  buffer: Buffer;
  format: VideoFormat;
  videoThesis: string;
  hookText: string;
  audioTrack: AudioTrackSelection;
  visualRecipe: VideoVisualRecipe;
}

function cleanupFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function getArgValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
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

function getRecentVideoFormatKeys(
  dataDir: string,
  days: number,
  now: Date = new Date(),
  excludeDateKey?: string,
  platform?: PlatformName,
): Set<string> {
  const used = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return used;

  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((dateDir) => {
    const fullPath = path.join(parentDir, dateDir);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dateDir);
  });

  for (const dateDir of dateDirs) {
    if (dateDir < cutoffKey || dateDir === excludeDateKey) continue;
    const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
    const tracker = safeReadJson<VideoTracker | null>(trackerFile, null);
    if (!tracker) continue;

    if (platform) {
      const platformTracker = tracker.platforms?.[platform];
      if (platformTracker?.formatKey) {
        used.add(platformTracker.formatKey);
      } else if (tracker.formatKey) {
        // Legacy tracker support from the single-video format rotation.
        used.add(tracker.formatKey);
      }
      continue;
    }

    if (tracker.formatKey) used.add(tracker.formatKey);
    for (const platformTracker of Object.values(tracker.platforms || {})) {
      if (platformTracker?.formatKey) used.add(platformTracker.formatKey);
    }
  }

  return used;
}

function getRecentVideoRecipeKeys(
  dataDir: string,
  days: number,
  now: Date = new Date(),
  excludeDateKey?: string,
  platform?: PlatformName,
): Set<string> {
  const used = new Set<string>();
  const parentDir = path.join(dataDir, "posted_video");
  if (!fs.existsSync(parentDir)) return used;

  const cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffKey = cutoff.toISOString().split("T")[0];

  const dateDirs = fs.readdirSync(parentDir).filter((dateDir) => {
    const fullPath = path.join(parentDir, dateDir);
    return fs.statSync(fullPath).isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(dateDir);
  });

  for (const dateDir of dateDirs) {
    if (dateDir < cutoffKey || dateDir === excludeDateKey) continue;
    const trackerFile = path.join(parentDir, dateDir, "daily-video.json");
    const tracker = safeReadJson<VideoTracker | null>(trackerFile, null);
    if (!tracker) continue;

    if (platform) {
      const platformTracker = tracker.platforms?.[platform];
      const recipeKey = platformTracker?.visualRecipeKey || platformTracker?.visualRecipe?.key || tracker.visualRecipeKey;
      if (recipeKey) used.add(recipeKey);
      continue;
    }

    if (tracker.visualRecipeKey) used.add(tracker.visualRecipeKey);
    if (tracker.visualRecipe?.key) used.add(tracker.visualRecipe.key);
    for (const platformTracker of Object.values(tracker.platforms || {})) {
      if (platformTracker?.visualRecipeKey) used.add(platformTracker.visualRecipeKey);
      if (platformTracker?.visualRecipe?.key) used.add(platformTracker.visualRecipe.key);
    }
  }

  return used;
}

function buildVideoThesis(
  format: VideoFormat,
  token: TokenData,
  metric: MetricData | undefined,
  contextText: string | undefined,
): string {
  const change = formatPercent(token.market.priceChange24h);
  const price = formatPrice(token.market.price);
  const marketCap = formatCompact(token.market.marketCap);
  const volume = formatCompact(token.market.volume24h);
  const risk = metric?.riskScore !== undefined
    ? `${metric.riskScore.toFixed(1)}/10 ${metric.riskLevel || "risk"}`
    : "risk data pending";
  const growth = metric?.growthPotentialIndex !== undefined
    ? `${Math.round(metric.growthPotentialIndex)}/100 growth index`
    : "growth index pending";
  const context = contextText?.trim();

  const thesisByFormat: Partial<Record<VideoFormatKey, string>> = {
    breakout_watch: `${token.name} is being checked as a breakout candidate after a ${change} 24h move; the test is whether ${volume} volume can support follow-through.`,
    risk_alert: `${token.name} needs a risk-first read: price is at ${price}, but ${risk} keeps confirmation more important than the headline move.`,
    volume_spike_check: `${token.name} is on volume watch because ${volume} traded in 24h against a ${marketCap} market cap.`,
    sector_rotation: `${token.name} is being read as a possible rotation signal; the question is whether the move fits the broader market setup.`,
    token_vs_sector: `${token.name} is being compared against the broader tape: ${change} in 24h, ${marketCap} market cap, and ${volume} volume.`,
    momentum_cooling: `${token.name} is being checked for fade risk after a ${change} 24h move; momentum needs confirmation to stay useful.`,
    catalyst_explainer: `${token.name} is the focus because the selection reason needs a why-now explanation, not just a price snapshot.`,
    liquidity_stress_test: `${token.name} is going through a liquidity stress test using ${volume} volume, ${marketCap} market cap, and ${risk}.`,
    data_vs_hype: `${token.name} gets a data-versus-hype read: ${change} price action is measured against volume, risk, and market-cap context.`,
    risk_score_breakdown: `${token.name} is being judged through TokenRadar's risk lens first, with ${risk} and ${growth}.`,
    watchlist_battle: `${token.name} has to earn a watchlist slot with ${change} performance, ${volume} volume, and ${risk}.`,
    weekly_recap: `${token.name} is the standout name in this scan, with ${change} over 24h and ${marketCap} market cap.`,
    new_listing_radar: `${token.name} is treated as a fresh radar candidate; the first filters are ${risk}, ${volume} volume, and ${marketCap} market cap.`,
    narrative_heatmap: `${token.name} is being checked for narrative heat, with ${change} price action and ${growth}.`,
    contrarian_signal: `${token.name} has a tension setup: ${change} price movement versus ${risk} and ${volume} volume quality.`,
  };

  return [thesisByFormat[format.key as VideoFormatKey] || `${format.label}: ${token.name} is being analyzed through market data quality filters.`, context]
    .filter(Boolean)
    .join(" ");
}

function getPlatformVideoAsset(
  platformVideos: Map<PlatformName, PlatformVideoAsset>,
  platform: PlatformName,
): PlatformVideoAsset {
  const asset = platformVideos.get(platform);
  if (!asset) {
    throw new Error(`Missing rendered video asset for ${platform}.`);
  }
  return asset;
}

function getPlatformTrackerFields(asset: PlatformVideoAsset): Pick<
  PlatformTracker,
  | "formatKey"
  | "formatLabel"
  | "formatFamily"
  | "videoThesis"
  | "hookText"
  | "audioTrack"
  | "audioStartSeconds"
  | "visualRecipeKey"
  | "visualRecipe"
> {
  return {
    formatKey: asset.format.key as VideoFormatKey,
    formatLabel: asset.format.label,
    formatFamily: asset.format.family,
    videoThesis: asset.videoThesis,
    hookText: asset.hookText,
    audioTrack: asset.audioTrack.file,
    audioStartSeconds: asset.audioTrack.startSeconds,
    visualRecipeKey: asset.visualRecipe.key,
    visualRecipe: asset.visualRecipe,
  };
}

function buildPlatformFormatPrompt(
  platformVideos: Map<PlatformName, PlatformVideoAsset>,
  platforms: PlatformTarget[],
): string {
  return platforms
    .map((platform) => {
      const asset = platformVideos.get(platform as PlatformName);
      return asset
        ? `${platform}: ${formatVideoFormatPromptLine(asset.format)} Visual recipe: ${asset.visualRecipe.layoutPack}, ${asset.visualRecipe.chartPack}, ${asset.visualRecipe.backgroundSystem}.`
        : "";
    })
    .filter(Boolean)
    .join("\n");
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
  const outputDirArg = getArgValue(args, "--output-dir");
  const keepOutput = args.includes("--keep-output") || Boolean(outputDirArg);

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

  const outputDir = outputDirArg ? path.resolve(process.cwd(), outputDirArg) : process.cwd();
  if (keepOutput || outputDirArg) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted_video", today);
  const trackerFile = path.join(postedDir, "daily-video.json");
  cleanupExpiredCooldownFolders(DATA_DIR, {
    videoRetentionDays: Math.max(VIDEO_COOLDOWN_DAYS, VIDEO_FORMAT_COOLDOWN_DAYS),
  });
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
  const shouldRunYouTube = runYouTube && (dryRun || hasYouTubeCredentials);
  const shouldRunInstagram = runInstagram && (dryRun || (hasMetaCredentials("instagram") && hasR2Credentials()));
  const shouldRunThreads = runThreads && (dryRun || (hasMetaCredentials("threads") && hasR2Credentials()));
  const hasTikTokApiCredentialsConfigured = hasTikTokApiCredentials();
  const tiktokCredentialMode = runTikTok && hasTikTokApiCredentialsConfigured ? getTikTokCredentialMode() : "sandbox";
  const hasTikTokReportCredentials = hasTikTokManualReportCredentials();
  const shouldRunTikTokDirect = runTikTok && hasTikTokApiCredentialsConfigured && tiktokCredentialMode === "production";
  const shouldRunTikTokInbox = runTikTok && hasTikTokApiCredentialsConfigured && tiktokCredentialMode === "sandbox";
  const shouldRunTikTokManual = runTikTok && !hasTikTokApiCredentialsConfigured && (dryRun || hasTikTokReportCredentials);
  const shouldRunTikTok = runTikTok && (dryRun || shouldRunTikTokDirect || shouldRunTikTokInbox || shouldRunTikTokManual);
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
    marketCapRank: targetToken.market.marketCapRank,
    volume24h: targetToken.market.volume24h,
    trendingContext,
    timeOfDay: getTimeOfDay(),
    tone: getRandomTone(),
    selectionReason: reason,
  };

  console.log();
  console.log("Step 3: Rendering video with Remotion...");
  const platformVideos = new Map<PlatformName, PlatformVideoAsset>();
  const { getVerdict } = await import("../src/video/styles");
  const verdict = getVerdict(targetMetric?.riskScore || 5.0, targetToken.market.priceChange24h);
  const fixedFormatKeys = new Set(
    requestedPlatforms
      .map((platform) => existingTracker?.platforms?.[platform]?.formatKey)
      .filter((key): key is VideoFormatKey => Boolean(key)),
  );
  const platformsNeedingFormats = requestedPlatforms.filter(
    (platform) => !existingTracker?.platforms?.[platform]?.formatKey,
  );
  const getUsedFormatKeysForPlatform = (platform: PlatformName): Set<string> => {
    const used = force
      ? new Set<string>()
      : getRecentVideoFormatKeys(DATA_DIR, VIDEO_FORMAT_COOLDOWN_DAYS, new Date(), today, platform);
    for (const key of fixedFormatKeys) used.add(key);
    return used;
  };
  const generatedFormats = selectVideoFormatsForSlots(platformsNeedingFormats, {
    getUsedFormatKeys: getUsedFormatKeysForPlatform,
    getSeedParts: (platform) => [today, platform, targetToken.id, reason],
  });
  const fixedRecipeKeys = new Set(
    requestedPlatforms
      .map((platform) =>
        existingTracker?.platforms?.[platform]?.visualRecipeKey ||
        existingTracker?.platforms?.[platform]?.visualRecipe?.key,
      )
      .filter((key): key is string => Boolean(key)),
  );
  const selectedRecipeKeys = new Set<string>();

  try {
    for (const platform of requestedPlatforms) {
      const existingPlatformTracker = existingTracker?.platforms?.[platform];
      const usedVideoFormatKeys = getUsedFormatKeysForPlatform(platform);

      const videoFormat = existingPlatformTracker?.formatKey
        ? getVideoFormat(existingPlatformTracker.formatKey)
        : generatedFormats.get(platform) || getVideoFormat(undefined);

      const videoThesis = existingPlatformTracker?.videoThesis ||
        buildVideoThesis(videoFormat, targetToken, targetMetric, context.trendingContext);
      const audioTrack: AudioTrackSelection = existingPlatformTracker?.audioTrack
        ? { file: existingPlatformTracker.audioTrack, startSeconds: existingPlatformTracker.audioStartSeconds || 0 }
        : getTrackForDate(`${today}:${platform}:${videoFormat.key}:${targetToken.id}`);
      const hookText = existingPlatformTracker?.hookText ||
        await generateHookText(targetToken.name, targetToken.symbol, context, videoFormat);
      const usedVideoRecipeKeys = force
        ? new Set<string>()
        : getRecentVideoRecipeKeys(DATA_DIR, VIDEO_FORMAT_COOLDOWN_DAYS, new Date(), today, platform);
      for (const key of fixedRecipeKeys) usedVideoRecipeKeys.add(key);
      for (const key of selectedRecipeKeys) usedVideoRecipeKeys.add(key);
      const visualRecipe = existingPlatformTracker?.visualRecipe ||
        selectVideoVisualRecipe({
          usedRecipeKeys: usedVideoRecipeKeys,
          seedParts: [today, platform, targetToken.id, videoFormat.key, reason],
        });
      selectedRecipeKeys.add(visualRecipe.key);
      const outputPath = path.join(outputDir, `tokenradar-${today}-${platform}.mp4`);
      const propsFile = path.join(outputDir, `remotion-props-${platform}.json`);

      console.log(`  ${platform}: ${videoFormat.label} (${videoFormat.key})`);
      if (!force && usedVideoFormatKeys.has(videoFormat.key) && !existingPlatformTracker?.formatKey) {
        console.warn(`  ${platform}: format cooldown pool was exhausted; selected from the full format library.`);
      }
      if (!force && usedVideoRecipeKeys.has(visualRecipe.key) && !existingPlatformTracker?.visualRecipe) {
        console.warn(`  ${platform}: visual recipe cooldown pool was exhausted; selected from the full recipe library.`);
      }
      console.log(`  ${platform}: recipe ${visualRecipe.key}`);
      console.log(`  ${platform}: ${audioTrack.file} (start: ${audioTrack.startSeconds}s)`);

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
        videoFormatKey: videoFormat.key,
        videoThesis,
        visualRecipe,
        verdict,
      };

      fs.writeFileSync(propsFile, JSON.stringify(videoProps));
      try {
        execFileSync(
          process.execPath,
          [
            getRemotionCliPath(),
            "render",
            "src/video/index.tsx",
            "TopGainerUpdate",
            outputPath,
            `--props=${propsFile}`,
          ],
          { stdio: "inherit" },
        );
      } finally {
        cleanupFile(propsFile);
      }

      platformVideos.set(platform, {
        platform,
        outputPath,
        buffer: fs.readFileSync(outputPath),
        format: videoFormat,
        videoThesis,
        hookText,
        audioTrack,
        visualRecipe,
      });
      console.log(`  ${platform}: rendered ${outputPath}`);
    }
  } catch (error) {
    console.error(`  Video rendering failed: ${formatErrorForLog(error)}`);
    process.exit(1);
  }

  // ── R2 Upload for Meta platforms ──
  let igVideoUrl = "";
  let threadsVideoUrl = "";
  let igVideoKey = "";
  let threadsVideoKey = "";

  if (dryRun) {
    igVideoUrl = platformVideos.get("instagram")?.outputPath || "";
    threadsVideoUrl = platformVideos.get("threads")?.outputPath || "";
  } else if (shouldRunInstagram || shouldRunThreads) {
    console.log();
    console.log("Step 3b: Staging videos to R2 for Meta APIs...");
    try {
      const videoPrefix = `video/${today}/`;
      await cleanPrefix(videoPrefix);
      if (shouldRunInstagram) {
        igVideoKey = `${videoPrefix}instagram.mp4`;
        igVideoUrl = await uploadToR2(getPlatformVideoAsset(platformVideos, "instagram").outputPath, igVideoKey);
      }
      if (shouldRunThreads) {
        threadsVideoKey = `${videoPrefix}threads.mp4`;
        threadsVideoUrl = await uploadToR2(getPlatformVideoAsset(platformVideos, "threads").outputPath, threadsVideoKey);
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
    const captionOptions: UnifiedCaptionOptions = {
      editorialFormat: {
        label: "Platform-specific video formats",
        angle: "each platform receives its own visual format while keeping the same fast TokenRadar tone",
        promptInstruction: "Match each platform caption to its rendered video format:\n" +
          buildPlatformFormatPrompt(platformVideos, requestedPlatforms),
        captionInstruction: "Do not write one generic caption for every platform; mirror the named format for that platform.",
      },
    };

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
      console.log();
      console.log("--- LOCAL VIDEO OUTPUTS ---");
      for (const platform of requestedPlatforms) {
        const asset = getPlatformVideoAsset(platformVideos, platform);
        console.log(`${platform}: ${asset.outputPath}`);
        console.log(`  format: ${asset.format.label} (${asset.format.key})`);
        console.log(`  recipe: ${asset.visualRecipe.key}`);
      }
      if (runTelegram) {
        console.log();
        console.log("--- TELEGRAM CAPTION ---");
        console.log(tgMessage);
      }
      if (runX) {
        console.log();
        console.log("--- X MAIN TWEET (with platform video) ---");
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

    if (platformVideos.size === 0) {
      throw new Error("No rendered video assets were available for publishing.");
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
            const telegramAsset = getPlatformVideoAsset(platformVideos, "telegram");
            const tgFooter = getTelegramFooter(targetToken.symbol);
            const caption = buildTelegramMediaCaption(tgMessage, tgFooter, {
              maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
              bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.VIDEO_AI_SUMMARY_CHARS,
            });

            const msgId = await sendTelegramVideo(telegramAsset.buffer, caption, channelId as string);
            console.log(`Posted video to Telegram (Message ID: ${msgId})`);
            return {
              platform: "telegram" as const,
              tracker: {
                postedAt: new Date().toISOString(),
                messageId: msgId,
                caption,
                ...getPlatformTrackerFields(telegramAsset),
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
            const xAsset = getPlatformVideoAsset(platformVideos, "x");
            const tweetId = await postTweetWithMedia(xMessage, xAsset.buffer, "video/mp4");
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
                ...getPlatformTrackerFields(xAsset),
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
            const youtubeAsset = getPlatformVideoAsset(platformVideos, "youtube");
            const publishAt = new Date();
            publishAt.setMinutes(publishAt.getMinutes() + 15);
            
            console.log(`Starting YouTube upload (scheduled for ${publishAt.toISOString()})...`);
            const videoId = await uploadToYouTubeShorts(
              youtubeAsset.outputPath,
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
                youtubeTitle: ytMetadata.title,
                youtubeDescription: ytMetadata.description,
                ...getPlatformTrackerFields(youtubeAsset),
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
            const instagramAsset = getPlatformVideoAsset(platformVideos, "instagram");
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
                ...getPlatformTrackerFields(instagramAsset),
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
            const threadsAsset = getPlatformVideoAsset(platformVideos, "threads");
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
                ...getPlatformTrackerFields(threadsAsset),
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
            const tiktokAsset = getPlatformVideoAsset(platformVideos, "tiktok");
            const safeTikTokCaption = normalizeTikTokCaption(tiktokCaption);
            const result = await publishVideoDirectlyToTikTok({
              videoPath: tiktokAsset.outputPath,
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
                ...getPlatformTrackerFields(tiktokAsset),
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
            const tiktokAsset = getPlatformVideoAsset(platformVideos, "tiktok");
            const safeTikTokCaption = normalizeTikTokCaption(tiktokCaption);
            const result = await uploadVideoToTikTokInbox({
              videoPath: tiktokAsset.outputPath,
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
                ...getPlatformTrackerFields(tiktokAsset),
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
            const tiktokAsset = getPlatformVideoAsset(platformVideos, "tiktok");
            const result = await sendTikTokManualPostReport({
              videoBuffer: tiktokAsset.buffer,
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
                ...getPlatformTrackerFields(tiktokAsset),
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
    if (!keepOutput) {
      for (const asset of platformVideos.values()) {
        cleanupFile(asset.outputPath);
      }
    }
  }
}

main().catch(async (error) => {
  await logError("post-video-daily", error);
  process.exit(1);
});

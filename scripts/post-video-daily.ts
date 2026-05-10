/**
 * Multi-platform video auto-poster for the daily breakout token.
 * Supports: Telegram, X, YouTube, Instagram, and Threads.
 *
 * Usage:
 *   npx tsx scripts/post-video-daily.ts
 *   npx tsx scripts/post-video-daily.ts --platform x --dry-run
 *   npx tsx scripts/post-video-daily.ts --platform instagram --dry-run
 *   npx tsx scripts/post-video-daily.ts --force
 */

import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

import { logError } from "../src/lib/reporter";
import {
  generateUnifiedCaptions,
  type PlatformTarget,
} from "../src/lib/gemini";
import { uploadToYouTubeShorts } from "../src/lib/youtube";
import { sendTelegramVideo, sanitizeHtmlForTelegram } from "../src/lib/telegram";
import { postTweetWithMedia, postTweet } from "../src/lib/x-client";
import { SOCIAL, SOCIAL_PLATFORM_LIMITS, VIDEO_COOLDOWN_DAYS, getTelegramFooter } from "../src/lib/config";
import { formatErrorForLog, safeReadJson, loadEnv } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import { generateHookText } from "../src/lib/social-content-generator";
import { publishVideo as publishMetaVideo, hasMetaCredentials, type TextEntity } from "../src/lib/meta-client";
import { cleanBucket, uploadVideo as uploadToR2, hasR2Credentials } from "../src/lib/r2-client";
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

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");

type PlatformName = "telegram" | "x" | "youtube" | "instagram" | "threads";

interface PlatformTracker {
  postedAt: string;
  messageId?: number;
  tweetId?: string;
  replyId?: string;
  videoId?: string;
  postId?: string;
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
  runInstagram: boolean,
  runThreads: boolean,
): PlatformName[] {
  const requested: PlatformName[] = [];
  if (runTelegram) requested.push("telegram");
  if (runX) requested.push("x");
  if (runYouTube) requested.push("youtube");
  if (runInstagram) requested.push("instagram");
  if (runThreads) requested.push("threads");
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
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  const platformIdx = args.indexOf("--platform");
  const targetPlatform =
    platformIdx !== -1 && platformIdx + 1 < args.length ? args[platformIdx + 1] : "all";
  if (!["all", "telegram", "x", "youtube", "instagram", "threads"].includes(targetPlatform)) {
    console.error("  Invalid --platform value. Expected one of: all, telegram, x, youtube, instagram, threads.");
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
  const runYouTube = targetPlatform === "all" || targetPlatform === "youtube";
  const runInstagram = targetPlatform === "all" || targetPlatform === "instagram";
  const runThreads = targetPlatform === "all" || targetPlatform === "threads";
  const hasYouTubeCredentials = Boolean(
    process.env.YOUTUBE_CLIENT_ID &&
    process.env.YOUTUBE_CLIENT_SECRET &&
    process.env.YOUTUBE_REFRESH_TOKEN,
  );
  const shouldRunYouTube = runYouTube && hasYouTubeCredentials;
  const shouldRunInstagram = runInstagram && hasMetaCredentials("instagram") && hasR2Credentials();
  const shouldRunThreads = runThreads && hasMetaCredentials("threads") && hasR2Credentials();
  const requestedPlatforms = getRequestedPlatforms(runTelegram, runX, shouldRunYouTube, shouldRunInstagram, shouldRunThreads);

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
    marketCap: targetToken.market.marketCap,
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
      execSync(
        "npx remotion render src/video/index.tsx TopGainerUpdate out.mp4 --props=remotion-props.json",
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
        execSync(
          `ffmpeg -y -i "${outPath}" -c:v libx264 -crf 19 -preset fast -c:a copy "${threadsOutPath}"`,
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

  if (shouldRunInstagram || shouldRunThreads) {
    console.log();
    console.log("Step 3b: Staging videos to R2 for Meta APIs...");
    try {
      await cleanBucket();
      if (shouldRunInstagram) {
        igVideoUrl = await uploadToR2(outPath, `ig-${today}.mp4`);
      }
      if (shouldRunThreads && fs.existsSync(threadsOutPath)) {
        threadsVideoUrl = await uploadToR2(threadsOutPath, `threads-${today}.mp4`);
      }
    } catch (r2Error) {
      console.error(`  R2 staging failed: ${formatErrorForLog(r2Error)}`);
      console.warn("  Continuing without Meta platforms.");
      igVideoUrl = "";
      threadsVideoUrl = "";
    }
  }

  try {
    let tgMessage = "";
    let xMessage = "";
    let xReplyMessage = "";
    let ytMetadata = { title: "", description: "" };
    let igContent = { caption: "", hashtags: [] as string[] };
    let threadsContent = { caption: "", topicTag: "crypto", spoilerText: "", spoilerOffset: 0, spoilerLength: 0 };

    console.log();
    console.log("Step 4: Generating platform captions...");

    const captionPlatforms: PlatformTarget[] = [];
    const captionOptions: {
      telegramMaxChars?: number;
      xMaxChars?: number;
      instagramMaxChars?: number;
      threadsMaxChars?: number;
    } = {};

    if (runTelegram) {
      const footer = getTelegramFooter(targetToken.symbol);
      captionOptions.telegramMaxChars = SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT - footer.length - 20;
      captionPlatforms.push("telegram");
    }

    if (runX) {
      captionOptions.xMaxChars = 260;
      captionPlatforms.push("x");
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      xReplyMessage = isOnWebsite
        ? `Read the $${targetToken.symbol.toUpperCase()} deep-dive and find all TokenRadar links here:\n\n${SOCIAL.ecosystemUrl}`
        : `Discover 300+ tracked and upcoming tokens through TokenRadar links:\n\n${SOCIAL.ecosystemUrl}`;
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
            const footerWithPadding = "\n" + tgFooter.trim();
            const maxBody = SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT - footerWithPadding.length;
            
            // Sanitize AI message to prevent Telegram parse errors (unclosed/unsupported tags),
            // and securely truncate it to maxBody before appending the footer.
            const sanitizedBody = sanitizeHtmlForTelegram(tgMessage.trim(), maxBody);
            const caption = sanitizedBody + footerWithPadding;

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
    cleanupFile(path.join(process.cwd(), "out-threads.mp4"));
  }
}

main().catch(async (error) => {
  await logError("post-video-daily", error);
  process.exit(1);
});

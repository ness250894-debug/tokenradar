/**
 * Telegram, X, and YouTube video auto-poster for the daily breakout token.
 *
 * Usage:
 *   npx tsx scripts/post-video-daily.ts
 *   npx tsx scripts/post-video-daily.ts --platform x --dry-run
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
import { sendTelegramVideo, sanitizeHtmlForTelegram } from "../src/lib/telegram";
import { postTweetWithMedia, postTweet } from "../src/lib/x-client";
import { REFERRAL_LINKS_HTML, SOCIAL } from "../src/lib/config";
import { safeReadJson, loadEnv } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import {
  type MetricData,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const PHOTO_AI_SUMMARY_CHARS = 400;

function cleanupFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const force = args.includes("--force");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  const platformIdx = args.indexOf("--platform");
  const targetPlatform =
    platformIdx !== -1 && platformIdx + 1 < args.length ? args[platformIdx + 1] : "all";

  console.log("==========================================");
  console.log("  TokenRadar Daily Video Breakout");
  console.log("==========================================");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  console.log();

  const today = new Date().toISOString().split("T")[0];
  const postedDir = path.join(DATA_DIR, "posted_video", today);
  if (!fs.existsSync(postedDir)) fs.mkdirSync(postedDir, { recursive: true });

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";
  const runYouTube = targetPlatform === "all" || targetPlatform === "youtube";

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
    if (runYouTube && (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_REFRESH_TOKEN)) {
      console.error("  Missing YouTube credentials.");
      if (targetPlatform === "youtube") process.exit(1);
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
  const selectionPlatform = runX ? "x" : runTelegram ? "telegram" : "all";

  console.log();
  console.log(`Step 2: Selecting top breakout token... (Force: ${force})`);
  const selection = await selectToken(
    candidateTokens,
    todayPosted,
    recentlyPosted,
    metricsDir,
    allTokensRegistry,
    selectionPlatform,
    force,
  );

  if (!selection) {
    console.error("  Could not select a target token.");
    process.exit(1);
  }

  const { token: targetToken, reason, trendingContext } = selection;
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
    console.error("  Video rendering failed:", error);
    process.exit(1);
  }

  const videoBuffer = fs.readFileSync(outPath);

  try {
    let tgMessage = "";
    let xMessage = "";
    let xReplyMessage = "";
    let ytMetadata = { title: "", description: "" };

    if (runTelegram) {
      const aiSummary = await generateTokenSummary(
        targetToken.name,
        targetToken.symbol,
        targetToken.description || "",
        context,
      );
      tgMessage = sanitizeHtmlForTelegram(aiSummary);
    }

    if (runX) {
      xMessage = await generateTweet(targetToken.name, targetToken.symbol, context);
      const isOnWebsite = onWebsiteIds.has(targetToken.id);
      xReplyMessage = isOnWebsite
        ? `📖 Read our full deep-dive data report on $${targetToken.symbol.toUpperCase()} here:\n\n${siteUrl}/${targetToken.id}`
        : `✨ Newly discovered alpha! Discover 300+ tracked and upcoming tokens on our live dashboard here:\n\n${siteUrl}`;
    }

    if (runYouTube) {
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
      if (runYouTube) {
        console.log();
        console.log("--- YOUTUBE SHORTS ---");
        console.log(`TITLE: ${ytMetadata.title}`);
        console.log(`DESC:\n${ytMetadata.description}`);
      }
      return;
    }

    const trackerFile = path.join(postedDir, `${targetToken.id}.json`);
    let posted = false;

    if (runTelegram) {
      try {
        const tgFooter = `
<b>🌐 The TokenRadar Ecosystem:</b>
📉 <a href="${siteUrl}">TokenRadar Dashboard</a> | 𝕏 <a href="${SOCIAL.xUrl}">X (Twitter)</a> | ✈️ <a href="${SOCIAL.telegramUrl}">Telegram</a>

${REFERRAL_LINKS_HTML.join("\n")}

#${targetToken.symbol.toUpperCase()} #Crypto
`;
        const photoSummary = sanitizeHtmlForTelegram(tgMessage, PHOTO_AI_SUMMARY_CHARS);
        const caption = photoSummary + "\n\n" + tgFooter.trim();

        const msgId = await sendTelegramVideo(videoBuffer, caption, channelId as string);
        console.log(`Posted video to Telegram (Message ID: ${msgId})`);
        posted = true;
      } catch (error) {
        await logError("post-video-daily-telegram", error, false);
        console.error("Failed to post Telegram video:", error);
      }
    }

    if (runX) {
      try {
        const tweetId = await postTweetWithMedia(xMessage, videoBuffer, "video/mp4");
        console.log(`Posted tweet with video to X (Tweet ID: ${tweetId})`);
        posted = true;

        try {
          const replyId = await postTweet(xReplyMessage, tweetId);
          console.log(`Posted reply to X (Reply ID: ${replyId})`);
        } catch (replyError) {
          await logError("post-video-daily-x-reply", replyError, false);
          console.warn("Main video tweet succeeded, but the follow-up reply failed:", replyError);
        }
      } catch (error) {
        await logError("post-video-daily-x", error, false);
        console.error("Failed to post to X:", error);
      }
    }

    if (runYouTube && process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
      try {
        console.log();
        console.log("Starting YouTube upload...");
        const videoId = await uploadToYouTubeShorts(
          outPath,
          ytMetadata.title,
          ytMetadata.description,
          "public",
        );
        console.log(`Posted video to YouTube Shorts (Video ID: ${videoId})`);
        posted = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to post to YouTube:", errorMessage);
        await logError("post-video-daily-youtube", error, false);
      }
    }

    if (!posted) {
      throw new Error("Failed to post on all selected platforms.");
    }

    if (!fs.existsSync(trackerFile)) {
      fs.writeFileSync(
        trackerFile,
        JSON.stringify(
          {
            postedAt: new Date().toISOString(),
            platform: targetPlatform,
            reason,
          },
          null,
          2,
        ),
      );
    }
  } finally {
    cleanupFile(outPath);
  }
}

main().catch(async (error) => {
  await logError("post-video-daily", error);
  process.exit(1);
});

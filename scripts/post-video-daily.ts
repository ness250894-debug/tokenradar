/**
 * Telegram & X Video Auto-Poster — Daily Breakout
 *
 * Designed to post 1 very high-quality auto-generated Remotion 
 * MP4 video to X and Telegram per day highlighting the #1 Breakout Token.
 * 
 * Usage:
 *   npx tsx scripts/post-video-daily.ts
 *   npx tsx scripts/post-video-daily.ts --platform x --dry-run
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";
import { logError } from "../src/lib/reporter";
import { generateTweet, generateTokenSummary, generateYoutubeMetadata } from "../src/lib/gemini";
import { uploadToYouTubeShorts } from "../src/lib/youtube";
import { sendTelegramVideo } from "../src/lib/telegram";
import { postTweetWithMedia, postTweet } from "../src/lib/x-client";
import { REFERRAL_LINKS_HTML, SOCIAL } from "../src/lib/config";
import { safeReadJson, getTimeOfDay, getRandomTone } from "../src/lib/utils";
import {
  type TokenData,
  type MetricData,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Utilities ──────────────────────────────────────────────────

const MAX_AI_SUMMARY_CHARS = 1200;
const PHOTO_AI_SUMMARY_CHARS = 400;
const TG_CAPTION_LIMIT = 1024;

function sanitizeHtmlForTelegram(html: string, maxLength: number = MAX_AI_SUMMARY_CHARS): string {
  let text = html;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
    const lastSentence = Math.max(text.lastIndexOf(". "), text.lastIndexOf(".\n"));
    if (lastSentence > maxLength * 0.6) {
      text = text.substring(0, lastSentence + 1);
    }
  }

  const allowedTags = /<\/?(b|i|a|code|pre)(\s[^>]*)?\s*>/gi;
  const placeholders: string[] = [];
  let sanitized = text.replace(allowedTags, (match) => {
    placeholders.push(match);
    return `\x00TAG${placeholders.length - 1}\x00`;
  });

  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  sanitized = sanitized.replace(/\x00TAG(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

  const stack: string[] = [];
  const finalTagRegex = /<\/?(b|i|a|code|pre)(\s[^>]*)?\s*>/gi;
  let match;
  while ((match = finalTagRegex.exec(sanitized)) !== null) {
    const isClosing = match[0].startsWith('</');
    const tagName = match[1].toLowerCase();
    if (isClosing) {
      const idx = stack.lastIndexOf(tagName);
      if (idx !== -1) stack.splice(idx, 1);
    } else {
      stack.push(tagName);
    }
  }

  while (stack.length > 0) {
    const tagName = stack.pop();
    sanitized += `</${tagName}>`;
  }

  return sanitized;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  
  const platformIdx = args.indexOf("--platform");
  const targetPlatform = (platformIdx !== -1 && platformIdx + 1 < args.length) ? args[platformIdx + 1] : "all"; // x, telegram, all

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Daily Video Breakout       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  console.log();

  const TODAY = new Date().toISOString().split('T')[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted_video", TODAY);
  if (!fs.existsSync(POSTED_DIR)) fs.mkdirSync(POSTED_DIR, { recursive: true });

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";
  const runYouTube = targetPlatform === "all" || targetPlatform === "youtube";

  const force = args.includes("--force");

  if (!dryRun) {
    if (runTelegram && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
      console.error("  ✗ Missing Telegram credentials.");
      process.exit(1);
    }
    if (runX && (!process.env.X_API_KEY || !process.env.X_API_SECRET)) {
      console.error("  ✗ Missing X credentials.");
      process.exit(1);
    }
    if (runYouTube && (!process.env.YOUTUBE_CLIENT_ID || !process.env.YOUTUBE_REFRESH_TOKEN)) {
      console.error("  ⚠ Missing YouTube credentials. Make sure to generate them to upload to YT Shorts.");
      if (targetPlatform === 'youtube') process.exit(1);
    }
  }

  // 1. Load candidate tokens
  console.log(`▶ Step 1: Loading candidate tokens...`);
  const metricsDir = path.join(DATA_DIR, "metrics");
  const { candidates: candidateTokens, allRegistry: allTokensRegistry } = await loadCandidateTokens(DATA_DIR, 1, 50);

  if (candidateTokens.length === 0) {
    console.error("  ✗ No tokens found.");
    process.exit(1);
  }

  // 2. Select the daily breakout
  const todayPosted = force ? new Set<string>() : getTodayPostedTokens(DATA_DIR, TODAY); 
  const recentlyPosted = force ? new Set<string>() : getRecentlyPostedTokens(DATA_DIR);

  console.log(`\n▶ Step 2: Selecting Top Breakout Token... (Force: ${force})`);
  const selection = await selectToken(candidateTokens, todayPosted, recentlyPosted, metricsDir, allTokensRegistry, targetPlatform as "x" | "telegram" | "all", force);

  if (!selection) {
    console.error("  ✗ Could not select a target token.");
    process.exit(1);
  }

  const { token: targetToken, reason, trendingContext } = selection;
  console.log(`\n  ✦ Selected: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);

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
    selectionReason: reason
  };

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  
  // 3. Generate Video via Remotion
  console.log(`\n▶ Step 3: Rendering Video with Remotion...`);
  const outPath = path.join(process.cwd(), "out.mp4");
  
  const videoProps = {
    tokenName: targetToken.name,
    symbol: targetToken.symbol.toUpperCase(),
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    riskScore: targetMetric?.riskScore || 5.0,
    marketCap: targetToken.market.marketCap
  };

  try {
    const propsJson = JSON.stringify(videoProps);
    const propsFile = path.join(process.cwd(), "remotion-props.json");
    fs.writeFileSync(propsFile, propsJson);
    
    try {
      execSync(`npx remotion render src/video/index.tsx TopGainerUpdate out.mp4 --props=remotion-props.json`, { stdio: 'inherit' });
    } finally {
      if (fs.existsSync(propsFile)) {
        fs.unlinkSync(propsFile);
      }
    }
    console.log(`  ✓ Video rendered successfully to out.mp4`);
  } catch (error) {
    console.error(`  ✗ Video rendering failed:`, error);
    process.exit(1);
  }

  const videoBuffer = fs.readFileSync(outPath);

  // 4. Content Generation
  let tgMessage = "";
  let xMessage = "";
  let xReplyMessage = "";
  let ytMetadata = { title: "", description: "" };

  if (runTelegram) {
    const aiSummary = await generateTokenSummary(targetToken.name, targetToken.symbol, targetToken.description || "", context);
    tgMessage = sanitizeHtmlForTelegram(aiSummary);
  }

  if (runX) {
    xMessage = await generateTweet(targetToken.name, targetToken.symbol, context);
    xReplyMessage = `📖 Read our full deep-dive data report on $${targetToken.symbol.toUpperCase()} here:\n\n${siteUrl}/${targetToken.id}`;
  }

  if (runYouTube) {
    ytMetadata = await generateYoutubeMetadata(targetToken.name, targetToken.symbol, context);
  }

  if (dryRun) {
    console.log("\n=== DRY RUN MODE ===");
    if (runTelegram) {
      console.log("\n--- TELEGRAM CAPTION ---");
      console.log(tgMessage);
    }
    if (runX) {
      console.log("\n--- X MAIN TWEET (with out.mp4) ---");
      console.log(xMessage);
    }
    if (runYouTube) {
      console.log("\n--- YOUTUBE SHORTS ---");
      console.log(`TITLE: ${ytMetadata.title}`);
      console.log(`DESC:\n${ytMetadata.description}`);
    }
    return;
  }

  // 5. Publishing
  const trackerFile = path.join(POSTED_DIR, `${targetToken.id}.json`);
  let posted = false;

  if (runTelegram) {
    try {
      const tgFooter = `
<b>🌐 The TokenRadar Ecosystem:</b>
📊 <a href="${siteUrl}/${targetToken.id}">TokenRadar</a> | 𝕏 <a href="${SOCIAL.xUrl}">X (Twitter)</a> | ✈️ <a href="${SOCIAL.telegramUrl}">Telegram</a>

${REFERRAL_LINKS_HTML.join("\n")}

#${targetToken.symbol.toUpperCase()} #Crypto
`;
      const photoSummary = sanitizeHtmlForTelegram(tgMessage, PHOTO_AI_SUMMARY_CHARS);
      let caption = photoSummary + "\n\n" + tgFooter.trim();
      
      const msgId = await sendTelegramVideo(videoBuffer, caption, channelId as string);
      console.log(`✅ Posted video to Telegram (Message ID: ${msgId})`);
      posted = true;
    } catch (error) {
      await logError("post-video-daily-telegram", error, false);
      console.error("❌ Failed to post Telegram video:", error);
    }
  }

  if (runX) {
    try {
      // Natively uploads MP4 via chunked upload using v1.uploadMedia
      const tweetId = await postTweetWithMedia(xMessage, videoBuffer, "video/mp4");
      console.log(`✅ Posted tweet with video to X (Tweet ID: ${tweetId})`);
      
      const replyId = await postTweet(xReplyMessage, tweetId);
      console.log(`✅ Posted reply to X (Reply ID: ${replyId})`);
      posted = true;
    } catch (error) {
      await logError("post-video-daily-x", error, false);
      console.error("❌ Failed to post to X:", error);
    }
  }

  if (runYouTube && process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_REFRESH_TOKEN) {
    try {
      console.log(`\n  ▸ Debug: Starting YouTube upload process...`);
      const videoId = await uploadToYouTubeShorts(outPath, ytMetadata.title, ytMetadata.description, 'unlisted');
      console.log(`✅ Posted video to YouTube Shorts (Video ID: ${videoId})`);
      posted = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`❌ Failed to post to YouTube:`, errorMessage);
      await logError("post-video-daily-youtube", error, false);
    }
  }

  if (posted && !fs.existsSync(trackerFile)) {
    fs.writeFileSync(trackerFile, JSON.stringify({ 
      postedAt: new Date().toISOString(), 
      platform: targetPlatform,
      reason,
    }, null, 2));
  }
}

main().catch(async (error) => {
  await logError("post-video-daily", error);
  process.exit(1);
});

/**
 * Telegram & X Auto-Poster — Daily Market Updates
 *
 * Posts short, data-driven market updates to Telegram and/or X.
 * Designed to run frequently (e.g., every 4 hours / 5x daily).
 *
 * Selection Priority (tries each in order until an un-posted token is found):
 *   1. Trending on CoinGecko (user search momentum)
 *   2. Trending on X (matched hashtags/keywords)
 *   3. Top Gainer (24h price increase > 2%)
 *   4. Safe Play (Risk Score <= 4)
 *   5. Random Spotlight (any eligible token)
 *
 * Deduplication: Tokens posted today are skipped. If all trending tokens
 * have been posted, falls back to lower-priority strategies.
 *
 * Alert Types:
 * - 🔥 TRENDING: Token is trending on CoinGecko/X
 * - 🚀 MARKET MOVER: Top gainer (24h)
 * - 🛡️ LOW RISK ASSET: Safe play (Risk Score <= 4)
 * - 🔦 TOKEN SPOTLIGHT: Random spotlight
 *
 * Usage:
 *   npx tsx scripts/post-market-updates.ts
 *   npx tsx scripts/post-market-updates.ts --platform x --dry-run
 *
 * Requires in .env.local:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, X_OAUTH2_CLIENT_ID, etc.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { logError } from "../src/lib/reporter";
import { generateTokenSummary, generateTweet } from "../src/lib/gemini";
import { sendTelegramMessage, sendTelegramPhoto } from "../src/lib/telegram";
import { postTweet, postTweetWithMedia } from "../src/lib/x-client";
import { fetchTokenImage } from "../src/lib/og-fetcher";
import { REFERRAL_LINKS_HTML, SOCIAL } from "../src/lib/config";
import { safeReadJson } from "../src/lib/utils";
import { getTimeOfDay, getRandomTone } from "../src/lib/shared-utils";
import {
  type MetricData,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";
import { fetchGlobalMarketData, fetchTrendingCategories } from "../src/lib/coingecko";

// Try loading from multiple possible relative paths to handle different execution cwd
const envPaths = [
  path.resolve(process.cwd(), ".env.local"),
  path.resolve(__dirname, "../.env.local"),
  path.resolve(__dirname, "../../.env.local"),
];

let loaded = false;
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    console.log(`  ℹ Loaded environment from: ${p}`);
    loaded = true;
    break;
  }
}

if (!loaded) {
  console.warn("  ⚠ No .env.local found in standard locations. Falling back to system environment.");
}

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Utilities ──────────────────────────────────────────────────

/** Max characters for AI summary within a TG message (leaves room for header/footer). */
const MAX_AI_SUMMARY_CHARS = 1200;
/** Shortened AI summary for TG photo captions (photos have 1024 char limit). */
const PHOTO_AI_SUMMARY_CHARS = 400;
/** Telegram caption limit for photos. */
const TG_CAPTION_LIMIT = 1024;
/** Telegram's hard limit per text message. */
const TG_MESSAGE_LIMIT = 4096;

/**
 * Sanitize and truncate AI-generated HTML for Telegram.
 * Escapes raw &, <, > while preserving allowed TG tags.
 * Truncates to MAX_AI_SUMMARY_CHARS at the nearest sentence boundary.
 */
function sanitizeHtmlForTelegram(html: string, maxLength: number = MAX_AI_SUMMARY_CHARS): string {
  // 1. Truncate at sentence boundary if too long
  let text = html;
  if (text.length > maxLength) {
    text = text.substring(0, maxLength);
    const lastSentence = Math.max(text.lastIndexOf(". "), text.lastIndexOf(".\n"));
    if (lastSentence > maxLength * 0.6) {
      text = text.substring(0, lastSentence + 1);
    }
  }

  // 2. Temporarily replace allowed tags with placeholders
  const allowedTags = /<\/?(b|i|a|code|pre)(\s[^>]*)?\s*>/gi;
  const placeholders: string[] = [];
  let sanitized = text.replace(allowedTags, (match) => {
    placeholders.push(match);
    return `\x00TAG${placeholders.length - 1}\x00`;
  });

  // 3. Escape remaining HTML-special characters
  sanitized = sanitized
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 4. Restore allowed tags
  sanitized = sanitized.replace(/\x00TAG(\d+)\x00/g, (_, idx) => placeholders[parseInt(idx)]);

  // 5. Ensure all allowed tags are closed
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



// ── Deduplication & Token Selection: imported from ./lib/token-selection.ts ──

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  
  const platformIdx = args.indexOf("--platform");
  const targetPlatform = platformIdx !== -1 ? args[platformIdx + 1] : "all"; // x, telegram, all

  const startRank = args.includes("--start") ? parseInt(args[args.indexOf("--start") + 1], 10) : 1;
  const endRank = args.includes("--end") ? parseInt(args[args.indexOf("--end") + 1], 10) : 250;

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Daily Market Updates v2    ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  console.log(`  Target Range: #${startRank} — #${endRank}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Platform: ${targetPlatform}`);
  console.log();

  const TODAY = new Date().toISOString().split('T')[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted", TODAY);
  
  if (!fs.existsSync(POSTED_DIR)) fs.mkdirSync(POSTED_DIR, { recursive: true });

  const runTelegram = targetPlatform === "all" || targetPlatform === "telegram";
  const runX = targetPlatform === "all" || targetPlatform === "x";

  if (!dryRun) {
    if (runTelegram && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
      console.error("  ✗ Missing Telegram credentials (required for telegram/all platform).");
      process.exit(1);
    }
    if (runX) {
      const missingX = [];
      if (!process.env.X_OAUTH2_CLIENT_ID) missingX.push("X_OAUTH2_CLIENT_ID");
      if (!process.env.X_OAUTH2_CLIENT_SECRET) missingX.push("X_OAUTH2_CLIENT_SECRET");
      if (!process.env.X_OAUTH2_REFRESH_TOKEN) missingX.push("X_OAUTH2_REFRESH_TOKEN");
      if (!process.env.X_BEARER_TOKEN) missingX.push("X_BEARER_TOKEN");

      if (missingX.length > 0) {
        console.error(`  ✗ Missing X (Twitter) credentials: ${missingX.join(", ")}`);
        console.error("    Run 'npx tsx scripts/generate-x-token.ts' to set up OAuth 2.0.");
        process.exit(1);
      }
    }
  }

  // 1. Load candidate tokens (fetches fresh data + merges with local)
  console.log(`▶ Step 1: Loading candidate tokens for ranks ${startRank}-${endRank}...`);
  const metricsDir = path.join(DATA_DIR, "metrics");
  const { candidates: candidateTokens, allRegistry: allTokensRegistry } = await loadCandidateTokens(DATA_DIR, startRank, endRank);

  console.log(`  Candidates in range #${startRank}-#${endRank}: ${candidateTokens.length}`);

  if (candidateTokens.length === 0) {
    console.error("  ✗ No tokens found in the target rank range. Ensure data/tokens/ exists and contains valid JSON.");
    process.exit(1);
  }

  // 2. Load dedup state
  const todayPosted = getTodayPostedTokens(DATA_DIR, TODAY);
  const recentlyPosted = getRecentlyPostedTokens(DATA_DIR);
  console.log(`  Already posted today: ${todayPosted.size} tokens`);
  console.log(`  Posted in last 30 days: ${recentlyPosted.size} tokens`);

  // 3. Fetch Macro-Market Context (Global & Sector trends)
  console.log(`\n▶ Step 2a: Fetching Macro Market Context...`);
  let globalStatsStr = "";
  let sectorPerformanceStr = "";

  try {
    const globalData = await fetchGlobalMarketData();
    if (globalData) {
      const mcapUSD = globalData.total_market_cap?.usd || 0;
      const mcapChange = globalData.market_cap_change_percentage_24h_usd || 0;
      const btcDom = globalData.market_cap_percentage?.btc || 0;
      
      const mcapStr = mcapUSD >= 1e12 
        ? `$${(mcapUSD / 1e12).toFixed(2)}T` 
        : `$${(mcapUSD / 1e9).toFixed(0)}B`;
        
      globalStatsStr = `${mcapStr} Total Cap (${mcapChange >= 0 ? "+" : ""}${mcapChange.toFixed(1)}% 24h), BTC Dominance: ${btcDom.toFixed(1)}%`;
    }

    const sectors = await fetchTrendingCategories(3);
    if (sectors.length > 0) {
      sectorPerformanceStr = sectors
        .map(s => `${s.name} (${s.market_cap_change_24h && s.market_cap_change_24h >= 0 ? "+" : ""}${s.market_cap_change_24h?.toFixed(1)}%)`)
        .join(", ");
    }
    
    if (globalStatsStr) console.log(`  ✦ Global: ${globalStatsStr}`);
    if (sectorPerformanceStr) console.log(`  ✦ Sectors: ${sectorPerformanceStr}`);
  } catch (err) {
    console.warn("  ⚠ Failed to fetch macro context, skipping...");
  }

  // 3. Select token using priority-based strategy
  console.log(`\n▶ Step 2: Selecting token (priority-based)...`);
  const selection = await selectToken(candidateTokens, todayPosted, recentlyPosted, metricsDir, allTokensRegistry, targetPlatform as "x" | "telegram" | "all");

  if (!selection) {
    console.error("  ✗ Could not select a target token.");
    process.exit(1);
  }

  const { token: targetToken, reason, trendingContext } = selection;
  console.log(`\n  ✦ Selected: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);
  console.log(`  ✦ Reason: ${reason}`);

  // 5. Build Content Properties
  let targetMetric: MetricData | undefined;
  const metricsFile = path.join(metricsDir, `${targetToken.id}.json`);
  if (fs.existsSync(metricsFile)) {
    targetMetric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
  }

  const timeOfDay = getTimeOfDay();
  const tone = getRandomTone();

  const context = {
    ...targetMetric,
    price: targetToken.market.price,
    priceChange24h: targetToken.market.priceChange24h,
    marketCap: targetToken.market.marketCap,
    marketCapRank: targetToken.market.marketCapRank,
    trendingContext,
    globalStats: globalStatsStr,
    sectorPerformance: sectorPerformanceStr,
    timeOfDay,
    tone,
    selectionReason: reason
  };

  let tgMessage = "";
  let xMessage = "";
  let xReplyMessage = "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const _displayUrl = siteUrl.replace("https://", "");

  if (runTelegram) {
    console.log(`▶ Step 3/TG: Generating Telegram Post in "${tone}" tone...`);
    const aiSummary = await generateTokenSummary(targetToken.name, targetToken.symbol, targetToken.description || "", context);
    const sanitized = sanitizeHtmlForTelegram(aiSummary);
    tgMessage = sanitized;
  }

  if (runX) {
    console.log(`▶ Step 3/X: Generating Tweet in "${tone}" tone...`);
    xMessage = await generateTweet(targetToken.name, targetToken.symbol, context);
    xReplyMessage = `📖 Read our full deep-dive data report on $${targetToken.symbol.toUpperCase()} here:\n\n${siteUrl}/${targetToken.id}`;
  }

  if (dryRun) {
    console.log("\n=== DRY RUN MODE ===");
    console.log(`Reason: ${reason} | Time: ${timeOfDay} | Tone: ${tone}`);
    if (runTelegram) {
      console.log("\n--- TELEGRAM MESSAGE ---");
      console.log(tgMessage);
    }
    if (runX) {
      console.log("\n--- X MAIN TWEET ---");
      console.log(xMessage);
      console.log("\n--- X REPLY TWEET ---");
      console.log(xReplyMessage);
    }
    return;
  }

  // Save tracking info immediately (Decentralized)
  const trackerFile = path.join(POSTED_DIR, `${targetToken.id}.json`);

  // ── Fetch OG image (shared between TG and X) ──
  let tokenImage: Buffer | null = null;
  console.log(`▶ Fetching OG image for ${targetToken.id}...`);
  tokenImage = await fetchTokenImage(targetToken.id, {
    symbol: targetToken.symbol.toUpperCase(),
    name: targetToken.name,
    price: targetToken.market.price >= 1 ? `$${targetToken.market.price.toFixed(2)}` : `$${targetToken.market.price.toFixed(6)}`,
    change: targetToken.market.priceChange24h,
    risk: context.riskScore || 5,
  });
  if (tokenImage) {
    console.log(`  ✓ OG image fetched (${(tokenImage.length / 1024).toFixed(1)} KB)`);
  } else {
    console.warn(`  ⚠ No OG image available, will post text-only.`);
  }

  let posted = false;

  if (runTelegram) {
    try {
      const tgFooter = `
<b>🌐 The TokenRadar Ecosystem:</b>
📊 <a href="${siteUrl}/${targetToken.id}">TokenRadar</a> | 𝕏 <a href="${SOCIAL.xUrl}">X (Twitter)</a> | ✈️ <a href="${SOCIAL.telegramUrl}">Telegram</a>

${REFERRAL_LINKS_HTML.join("\n")}

#${targetToken.symbol.toUpperCase()} #Crypto
`;

      if (tokenImage) {
        // ── Photo mode: short caption (1024 char limit) ──
        const photoSummary = sanitizeHtmlForTelegram(tgMessage, PHOTO_AI_SUMMARY_CHARS);
        let caption = photoSummary + "\n\n" + tgFooter.trim();
        if (caption.length > TG_CAPTION_LIMIT) {
          // Trim the summary further to fit
          const footerWithPadding = "\n\n" + tgFooter.trim();
          const maxBody = TG_CAPTION_LIMIT - footerWithPadding.length - 3;
          let cutAt = photoSummary.lastIndexOf("\n", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = photoSummary.lastIndexOf(" ", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = maxBody;
          caption = photoSummary.substring(0, cutAt) + "..." + footerWithPadding;
        }
        const msgId = await sendTelegramPhoto(tokenImage, caption, channelId as string);
        console.log(`✅ Posted photo to Telegram (Message ID: ${msgId})`);
      } else {
        // ── Text-only fallback ──
        let finalTgMessage = tgMessage + "\n\n" + tgFooter.trim();
        if (finalTgMessage.length > TG_MESSAGE_LIMIT) {
          console.warn(`  ⚠ Message too long (${finalTgMessage.length}/${TG_MESSAGE_LIMIT}), trimming body...`);
          const footerWithPadding = "\n\n" + tgFooter.trim();
          const maxBody = TG_MESSAGE_LIMIT - footerWithPadding.length - 3;
          let cutAt = tgMessage.lastIndexOf("\n", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = tgMessage.lastIndexOf(" ", maxBody);
          if (cutAt < maxBody * 0.5) cutAt = maxBody;
          finalTgMessage = tgMessage.substring(0, cutAt) + "..." + footerWithPadding;
        }
        const msgId = await sendTelegramMessage(finalTgMessage, channelId as string);
        console.log(`✅ Posted text to Telegram (Message ID: ${msgId})`);
      }
      posted = true;
    } catch (error) {
      await logError("post-market-updates-telegram", error, false);
      console.error("❌ Failed to post Telegram message:", error);
    }
  }

  if (runX) {
    try {
      let tweetId: string;
      if (tokenImage) {
        tweetId = await postTweetWithMedia(xMessage, tokenImage);
        console.log(`✅ Posted tweet with image to X (Tweet ID: ${tweetId})`);
      } else {
        tweetId = await postTweet(xMessage);
        console.log(`✅ Posted text tweet to X (Tweet ID: ${tweetId})`);
      }
      const replyId = await postTweet(xReplyMessage, tweetId);
      console.log(`✅ Posted reply to X (Reply ID: ${replyId})`);
      posted = true;
    } catch (error) {
      await logError("post-market-updates-x", error, false);
      console.error("❌ Failed to post to X:", error);
    }
  }

  // Only mark as posted if at least one platform succeeded
  if (posted && !fs.existsSync(trackerFile)) {
    fs.writeFileSync(trackerFile, JSON.stringify({ 
      postedAt: new Date().toISOString(), 
      platform: targetPlatform,
      reason,
    }, null, 2));
  }

  if (!posted) {
    console.error("❌ Failed to post on all target platforms.");
    process.exit(1);
  }
}

main().catch(async (error) => {
  await logError("post-market-updates", error);
  process.exit(1);
});

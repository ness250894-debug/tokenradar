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
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, X_API_KEY, etc.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { logError } from "../src/lib/reporter";
import { generateTokenSummary, generateTweet } from "../src/lib/gemini";
import { sendTelegramMessage } from "../src/lib/telegram";
import { postTweet } from "../src/lib/x-client";
import { REFERRAL_LINKS_HTML, SOCIAL } from "../src/lib/config";
import { safeReadJson, getTimeOfDay, getRandomTone } from "../src/lib/utils";
import {
  type TokenData,
  type MetricData,
  type SelectionReason,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Utilities ──────────────────────────────────────────────────

/** Max characters for AI summary within a TG message (leaves room for header/footer). */
const MAX_AI_SUMMARY_CHARS = 1200;
/** Telegram's hard limit per message. */
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

// ── Alert Generators ───────────────────────────────────────────

function createTrendingAlert(token: TokenData, reason: SelectionReason, aiSummary: string = "", isX: boolean = false): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const sym = token.symbol.toUpperCase();
  const emoji = token.market.priceChange24h >= 0 ? "🟢" : "🔴";
  const sign = token.market.priceChange24h >= 0 ? "+" : "";
  
  // Phrasing logic based on platform and reason
  let header = `🔥 <b>TRENDING NOW: ${token.name} ($${sym})</b>`;
  let trendingLine = reason === "trending-x" ? "📈 Trending on X" : "";

  if (isX) {
    header = `🚨 <b>${token.name} ($${sym}) is trending with massive momentum!</b>`;
    trendingLine = `🚨 Major market activity detected!`;
  }

  const lines = [
    header,
    "",
    ...(trendingLine ? [trendingLine] : []),
    `${emoji} 24h: ${sign}${token.market.priceChange24h.toFixed(2)}%`,
    `💰 Price: $${price}`,
    "",
  ];

  if (aiSummary) {
    lines.push(`📝 <b>Deep Insight & Analysis:</b>`);
    lines.push(sanitizeHtmlForTelegram(aiSummary));
    lines.push("");
  } else {
    lines.push("This token is attracting major attention. Read the full analysis on TokenRadar.");
    lines.push("");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (isX) {
    lines.push(`🌐 Main Site: ${displayUrl}`);
    lines.push(`#${sym} #Crypto #TokenRadarCo`);
  }

  return lines.join("\n");
}

function createTopGainerAlert(token: TokenData, aiSummary: string = "", isX: boolean = false): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const sym = token.symbol.toUpperCase();
  
  const lines = [
    `🚀 <b>MARKET MOVER: ${token.name} ($${sym})</b>`,
    "",
    `🟢 Up <b>+${token.market.priceChange24h.toFixed(2)}%</b> today!`,
    `💰 Current Price: $${price}`,
    "",
  ];

  if (aiSummary) {
    lines.push(`📝 <b>Deep Insight & Analysis:</b>`);
    lines.push(sanitizeHtmlForTelegram(aiSummary));
    lines.push("");
  } else {
    lines.push("Is this a breakout? Discover institutional-grade risk scores on TokenRadar.");
    lines.push("");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (isX) {
    lines.push(`🌐 Main Site: ${displayUrl}`);
    lines.push(`#${sym} #Crypto #TokenRadarCo`);
  }

  return lines.join("\n");
}

function createSafePlayAlert(token: TokenData, metric: MetricData, aiSummary: string = "", isX: boolean = false): string {
  const sym = token.symbol.toUpperCase();
  
  const lines = [
    `🛡️ <b>LOW RISK ASSET: ${token.name} ($${sym})</b>`,
    "",
    `Our AI assigned a <b>Risk Score of ${metric.riskScore}/10</b> to $${sym} ($${token.market.price.toFixed(2)}).`,
    "",
  ];

  if (aiSummary) {
    lines.push(`📝 <b>Deep Insight & Analysis:</b>`);
    lines.push(sanitizeHtmlForTelegram(aiSummary));
    lines.push("");
  } else {
    lines.push("Ideal for conservative portfolios looking for growth.");
    lines.push("");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (isX) {
    lines.push(`🌐 Main Site: ${displayUrl}`);
    lines.push(`#${sym} #Crypto #TokenRadarCo`);
  }

  return lines.join("\n");
}

function createSpotlightAlert(token: TokenData, aiSummary: string = "", isX: boolean = false): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const mc = token.market.marketCap >= 1e9 ? `$${(token.market.marketCap / 1e9).toFixed(2)}B` : `$${(token.market.marketCap / 1e6).toFixed(0)}M`;
  const emoji = token.market.priceChange24h >= 0 ? "🟢" : "🔴";
  const sign = token.market.priceChange24h >= 0 ? "+" : "";
  const sym = token.symbol.toUpperCase();
  
  const lines = [
    `🔦 <b>TOKEN SPOTLIGHT: ${token.name} ($${sym})</b>`,
    "",
    `💰 Price: $${price}`,
    `${emoji} 24h: ${sign}${token.market.priceChange24h.toFixed(2)}%`,
    `📊 MCap: ${mc}`,
    "",
  ];

  if (aiSummary) {
    lines.push(`📝 <b>Deep Insight & Analysis:</b>`);
    lines.push(sanitizeHtmlForTelegram(aiSummary));
    lines.push("");
  } else {
    lines.push("Where will the market be in 2026? Check the numbers to find out.");
    lines.push("");
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (isX) {
    lines.push(`🌐 Main Site: ${displayUrl}`);
    lines.push(`#${sym} #Crypto #TokenRadarCo`);
  }

  return lines.join("\n");
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
    if (runX && (!process.env.X_API_KEY || !process.env.X_API_SECRET || !process.env.X_ACCESS_TOKEN || !process.env.X_ACCESS_SECRET)) {
      console.error("  ✗ Missing X (Twitter) credentials (required for x/all platform).");
      process.exit(1);
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
    trendingContext,
    timeOfDay,
    tone,
    selectionReason: reason
  };

  let tgMessage = "";
  let xMessage = "";
  let xReplyMessage = "";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");

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

  let posted = false;

  if (runTelegram) {
    try {
      const tgFooter = `
<b>🌐 The TokenRadar Ecosystem:</b>
📊 <a href="${siteUrl}/${targetToken.id}">TokenRadar</a> | 𝕏 <a href="${SOCIAL.xUrl}">X (Twitter)</a> | ✈️ <a href="${SOCIAL.telegramUrl}">Telegram</a>

${REFERRAL_LINKS_HTML.join("\n")}

#${targetToken.symbol.toUpperCase()} #Crypto
`;
      let finalTgMessage = tgMessage + "\n\n" + tgFooter.trim();
      if (finalTgMessage.length > TG_MESSAGE_LIMIT) {
        console.warn(`  ⚠ Message too long (${finalTgMessage.length}/${TG_MESSAGE_LIMIT}), trimming...`);
        finalTgMessage = finalTgMessage.substring(0, TG_MESSAGE_LIMIT - 3) + "...";
      }
      const msgId = await sendTelegramMessage(finalTgMessage, channelId as string);
      console.log(`✅ Successfully posted to Telegram (Message ID: ${msgId})`);
      posted = true;
    } catch (error) {
      await logError("post-market-updates-telegram", error, false);
      console.error("❌ Failed to post Telegram message:", error);
    }
  }

  if (runX) {
    try {
      const tweetId = await postTweet(xMessage);
      console.log(`✅ Successfully posted to X (Tweet ID: ${tweetId})`);
      const replyId = await postTweet(xReplyMessage, tweetId);
      console.log(`✅ Successfully posted reply to X (Reply ID: ${replyId})`);
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

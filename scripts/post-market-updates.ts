/**
 * Telegram Auto-Poster — Daily Market Updates
 *
 * Posts short, data-driven market updates to a Telegram channel.
 * Designed to run frequently (e.g., every 4 hours).
 *
 * Alert Types:
 * - Top Gainer (24h)
 * - Safe Play (Risk Score <= 4)
 * - Random Spotlight
 *
 * Usage:
 *   npx tsx scripts/post-market-updates.ts
 *
 * Requires in .env.local:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fetchTokensByRank, CoinGeckoToken } from "../src/lib/coingecko";
import { logError } from "../src/lib/reporter";
import { generateTokenSummary } from "../src/lib/gemini";
import { sendTelegramMessage } from "../src/lib/telegram";
import { postTweet } from "../src/lib/x-client";
import { REFERRAL_LINKS_HTML, SOCIAL_FOOTER, STABLECOIN_IDS } from "../src/lib/config";
import { safeReadJson } from "../src/lib/utils";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Types ──────────────────────────────────────────────────────

interface MetricData {
  riskScore: number;
  riskLevel: string;
  growthPotentialIndex: number;
}

interface TokenData {
  id: string;
  symbol: string;
  name: string;
  rank: number;
  description?: string;
  market: {
    price: number;
    priceChange24h: number;
    marketCap: number;
  };
}

// ── Utilities ──────────────────────────────────────────────────

/** Max characters for AI summary within a TG message (leaves room for header/footer). */
const MAX_AI_SUMMARY_CHARS = 2500;
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

  return sanitized;
}

// ── Alert Generators ───────────────────────────────────────────

function createTopGainerAlert(token: TokenData, aiSummary: string = ""): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const sym = token.symbol.toUpperCase();
  
  const lines = [
    `🚀 <b>MARKET MOVER: ${token.name} (${sym})</b>`,
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

  lines.push(...SOCIAL_FOOTER);
  lines.push(`#${sym} #Crypto #TokenRadarCo`);

  return lines.join("\n");
}

function createSafePlayAlert(token: TokenData, metric: MetricData, aiSummary: string = ""): string {
  const sym = token.symbol.toUpperCase();
  
  const lines = [
    `🛡️ <b>LOW RISK ASSET: ${token.name} (${sym})</b>`,
    "",
    `Our AI assigned a <b>Risk Score of ${metric.riskScore}/10</b> to $${sym}.`,
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

  lines.push(...SOCIAL_FOOTER);
  lines.push(`#${sym} #Crypto #TokenRadarCo`);

  return lines.join("\n");
}

function createSpotlightAlert(token: TokenData, aiSummary: string = ""): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const mc = token.market.marketCap >= 1e9 ? `$${(token.market.marketCap / 1e9).toFixed(2)}B` : `$${(token.market.marketCap / 1e6).toFixed(0)}M`;
  const emoji = token.market.priceChange24h >= 0 ? "🟢" : "🔴";
  const sign = token.market.priceChange24h >= 0 ? "+" : "";
  const sym = token.symbol.toUpperCase();
  
  const lines = [
    `🔦 <b>TOKEN SPOTLIGHT: ${token.name} (${sym})</b>`,
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

  lines.push(...SOCIAL_FOOTER);
  lines.push(`#${sym} #Crypto #TokenRadarCo`);

  return lines.join("\n");
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  
  const platformIdx = args.indexOf("--platform");
  const targetPlatform = platformIdx !== -1 ? args[platformIdx + 1] : "all"; // x, telegram, all

  const startRank = args.includes("--start") ? parseInt(args[args.indexOf("--start") + 1], 10) : 50;
  const endRank = args.includes("--end") ? parseInt(args[args.indexOf("--end") + 1], 10) : 250;

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Daily Market Updates       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  console.log(`  Target Range: #${startRank} — #${endRank}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  const TODAY = new Date().toISOString().split('T')[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted", TODAY);
  const LEGACY_TRACKER_FILE = path.join(DATA_DIR, "posted-today.json");
  
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

  // 1. Fetch fresh market data
  console.log(`▶ Step 1: Fetching fresh market data for ranks 1-250...`);
  let freshMarkets: CoinGeckoToken[] = [];
  try {
    freshMarkets = await fetchTokensByRank(1, 250);
    console.log(` ✓ Received ${freshMarkets.length} tokens from CoinGecko`);
  } catch (e) {
    console.warn(`  ⚠ Failed to fetch live data: ${e instanceof Error ? e.message : String(e)}`);
    console.warn(`    Falling back to local data only.`);
  }

  // 2. Load available standard token data & metrics
  const tokensDir = path.join(DATA_DIR, "tokens");
  const metricsDir = path.join(DATA_DIR, "metrics");
  
  if (!fs.existsSync(tokensDir) || !fs.existsSync(metricsDir)) {
    console.error("  ✗ Data directories not found. Run fetch logic first.");
    process.exit(1);
  }

  const tokenFiles = fs.readdirSync(tokensDir).filter(f => f.endsWith('.json'));
  
  // Merge fresh market data with local static details
  const tokens: TokenData[] = tokenFiles.map(f => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const local: any = safeReadJson(path.join(tokensDir, f), null);
    if (!local || !local.id) return null;
    const fresh = freshMarkets.find(t => t.id === local.id);
    
    return {
      id: local.id,
      symbol: local.symbol,
      name: local.name,
      rank: fresh?.market_cap_rank || local.market?.marketCapRank || 999,
      description: local.description || "",
      market: {
        price: fresh?.current_price || local.market?.price || 0,
        priceChange24h: fresh?.price_change_percentage_24h || local.market?.priceChange24h || 0,
        marketCap: fresh?.market_cap || local.market?.marketCap || 0,
      }
    };
  }).filter(Boolean) as TokenData[];

  // Filter by rank strategy (Default 50-250), exclude stablecoins
  const candidateTokens = tokens.filter(t => t.rank >= startRank && t.rank <= endRank && !STABLECOIN_IDS.has(t.id));
  
  console.log(`  Merged Tokens: ${tokens.length}`);
  console.log(`  Candidates in range #${startRank}-#${endRank}: ${candidateTokens.length}`);

  if (candidateTokens.length === 0) {
    console.error("  ✗ No tokens found in the target rank range. Ensure data/tokens/ exists and contains valid JSON.");
    process.exit(1);
  }

  /**
   * Decentralized tracking check:
   * Combines legacy JSON and new folder-based markers to find already posted tokens.
   */
  const getPostedToday = (): string[] => {
    const posted = new Set<string>();
    
    // 1. Check legacy file
    if (fs.existsSync(LEGACY_TRACKER_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(LEGACY_TRACKER_FILE, 'utf-8'));
        if (parsed.date === TODAY && Array.isArray(parsed.tokens)) {
          parsed.tokens.forEach((t: string) => posted.add(t));
        }
      } catch (_e) { /* ignore */ }
    }

    // 2. Check decentralized folder
    if (fs.existsSync(POSTED_DIR)) {
      fs.readdirSync(POSTED_DIR).forEach(f => {
        posted.add(f.replace('.json', ''));
      });
    }

    return Array.from(posted);
  };

  const postedTodayTokens = getPostedToday();

  // 2. Select Alert Strategy
  const strategy = Math.floor(Math.random() * 3);
  let targetToken: TokenData | undefined;
  let message = "";

  if (strategy === 0) {
    const gainers = candidateTokens.filter(t => !postedTodayTokens.includes(t.id) && t.market && t.market.priceChange24h > 2).sort((a, b) => b.market.priceChange24h - a.market.priceChange24h);
    if (gainers.length > 0) {
      targetToken = gainers[Math.floor(Math.random() * Math.min(3, gainers.length))];
    }
  } 
  
  if (strategy === 1 && !targetToken) {
    const metricsFiles = fs.readdirSync(metricsDir).filter(f => f.endsWith('.json'));
    const safeTokens: { token: TokenData, metric: MetricData }[] = [];
    for (const mf of metricsFiles) {
      const metric = safeReadJson<MetricData | null>(path.join(metricsDir, mf), null);
      if (!metric) continue;
      if (metric.riskScore <= 4) {
        const tokenId = mf.replace('.json', '');
        const token = candidateTokens.find(t => t.id === tokenId && !postedTodayTokens.includes(t.id));
        if (token) safeTokens.push({ token, metric });
      }
    }
    if (safeTokens.length > 0) {
      const selected = safeTokens[Math.floor(Math.random() * safeTokens.length)];
      targetToken = selected.token;
    }
  }

  if (!targetToken) {
    const availableTokens = candidateTokens.filter(t => !postedTodayTokens.includes(t.id));
    targetToken = availableTokens.length > 0 
      ? availableTokens[Math.floor(Math.random() * availableTokens.length)]
      : candidateTokens[Math.floor(Math.random() * candidateTokens.length)];
  }

  if (!targetToken) {
    console.error("  ✗ Could not select a target token.");
    process.exit(1);
  }

  // 3. Generate AI Summary (if key is set)
  let aiSummary = "";
  let targetMetric: MetricData | undefined;

  // Load metrics for context if available
  const metricsFile = path.join(metricsDir, `${targetToken.id}.json`);
  if (fs.existsSync(metricsFile)) {
    targetMetric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
  }

  if (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY) {
    console.log(`▶ Step 3: Generating Deep Insight for ${targetToken.name}...`);
    aiSummary = await generateTokenSummary(
      targetToken.name, 
      targetToken.symbol, 
      targetToken.description || "", 
      {
        ...targetMetric,
        price: targetToken.market.price,
        priceChange24h: targetToken.market.priceChange24h,
        marketCap: targetToken.market.marketCap,
      }
    );
    if (aiSummary) console.log(` ✓ Summary generated (${aiSummary.length} chars)`);
  } else {
    console.warn("  ⚠ No GEMINI_API_KEY or ANTHROPIC_API_KEY set — skipping AI summary.");
  }

  // 4. Construct Final Message
  if (strategy === 0) {
    message = createTopGainerAlert(targetToken, aiSummary);
  } else if (strategy === 1 && targetMetric) {
    message = createSafePlayAlert(targetToken, targetMetric, aiSummary);
  } else {
    message = createSpotlightAlert(targetToken, aiSummary);
  }

  if (dryRun) {
    console.log("=== DRY RUN MODE ===");
    console.log(message);
    return;
  }

  // Save tracking info immediately (Decentralized)
  const trackerFile = path.join(POSTED_DIR, `${targetToken.id}.json`);

  let posted = false;

  if (runTelegram) {
    try {
      let tgMessage = message + "\n\n" + REFERRAL_LINKS_HTML.join("\n");
      if (tgMessage.length > TG_MESSAGE_LIMIT) {
        console.warn(`  ⚠ Message too long (${tgMessage.length}/${TG_MESSAGE_LIMIT}), trimming...`);
        tgMessage = tgMessage.substring(0, TG_MESSAGE_LIMIT - 3) + "...";
      }
      const msgId = await sendTelegramMessage(tgMessage, channelId as string);
      console.log(`✅ Successfully posted to Telegram (Message ID: ${msgId})`);
      posted = true;
    } catch (error) {
      await logError("post-market-updates-telegram", error, false);
      console.error("❌ Failed to post Telegram message:", error);
    }
  }

  if (runX) {
    try {
      const tweetId = await postTweet(message);
      console.log(`✅ Successfully posted to X (Tweet ID: ${tweetId})`);
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
      platform: targetPlatform 
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

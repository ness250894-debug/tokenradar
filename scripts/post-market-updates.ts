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
import { fetchTokensByRank, CoinGeckoToken, fetchTrendingCoins, TrendingCoinItem } from "../src/lib/coingecko";
import { logError } from "../src/lib/reporter";
import { generateTokenSummary } from "../src/lib/gemini";
import { sendTelegramMessage } from "../src/lib/telegram";
import { postTweet, fetchXTrends, matchTrendsToTokens } from "../src/lib/x-client";
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

/** Why this token was selected — used for logging and AI context. */
type SelectionReason =
  | "trending-coingecko"
  | "trending-x"
  | "top-gainer"
  | "safe-play"
  | "spotlight";

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
  const sourceLabel = reason === "trending-coingecko" ? "CoinGecko" : "X";

  const lines = [
    `🔥 <b>TRENDING NOW: ${token.name} (${sym})</b>`,
    "",
    `📈 Trending on ${sourceLabel}`,
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
  if (!isX) {
    lines.push(`🔗 <b>Token Report:</b> <a href="${siteUrl}/${token.id}">${displayUrl}/${token.id}</a>`);
  }
  lines.push(`🌐 <b>Main Site:</b> <a href="${siteUrl}">${displayUrl}</a>`);
  lines.push(...SOCIAL_FOOTER.slice(1));
  lines.push(`#${sym} #Crypto #Trending #TokenRadarCo`);

  return lines.join("\n");
}

function createTopGainerAlert(token: TokenData, aiSummary: string = "", isX: boolean = false): string {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (!isX) {
    lines.push(`🔗 <b>Token Report:</b> <a href="${siteUrl}/${token.id}">${displayUrl}/${token.id}</a>`);
  }
  lines.push(`🌐 <b>Main Site:</b> <a href="${siteUrl}">${displayUrl}</a>`);
  lines.push(...SOCIAL_FOOTER.slice(1));
  lines.push(`#${sym} #Crypto #TokenRadarCo`);

  return lines.join("\n");
}

function createSafePlayAlert(token: TokenData, metric: MetricData, aiSummary: string = "", isX: boolean = false): string {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (!isX) {
    lines.push(`🔗 <b>Token Report:</b> <a href="${siteUrl}/${token.id}">${displayUrl}/${token.id}</a>`);
  }
  lines.push(`🌐 <b>Main Site:</b> <a href="${siteUrl}">${displayUrl}</a>`);
  lines.push(...SOCIAL_FOOTER.slice(1));
  lines.push(`#${sym} #Crypto #TokenRadarCo`);

  return lines.join("\n");
}

function createSpotlightAlert(token: TokenData, aiSummary: string = "", isX: boolean = false): string {
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

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  const displayUrl = siteUrl.replace("https://", "");
  if (!isX) {
    lines.push(`🔗 <b>Token Report:</b> <a href="${siteUrl}/${token.id}">${displayUrl}/${token.id}</a>`);
  }
  lines.push(`🌐 <b>Main Site:</b> <a href="${siteUrl}">${displayUrl}</a>`);
  lines.push(...SOCIAL_FOOTER.slice(1));
  lines.push(`#${sym} #Crypto #TokenRadarCo`);

  return lines.join("\n");
}

// ── Deduplication ──────────────────────────────────────────────

/**
 * Get all token IDs that have been posted today.
 * Checks both legacy tracker file and the daily folder structure.
 */
function getTodayPostedTokens(today: string): Set<string> {
  const posted = new Set<string>();

  // 1. Check legacy file
  const legacyFile = path.join(DATA_DIR, "posted-today.json");
  if (fs.existsSync(legacyFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
      if (parsed.date === today && Array.isArray(parsed.tokens)) {
        parsed.tokens.forEach((t: string) => posted.add(t));
      }
    } catch (_e) { /* ignore */ }
  }

  // 2. Scan today's posted folder
  const todayDir = path.join(DATA_DIR, "posted", today);
  if (fs.existsSync(todayDir)) {
    fs.readdirSync(todayDir).forEach((f) => {
      // Exclude social-specific logs which include platform prefix
      if (!f.includes("-telegram-") && !f.includes("-x-")) {
        posted.add(f.replace(".json", ""));
      }
    });
  }

  return posted;
}

/**
 * Get all token IDs posted in the last 30 days (for broader dedup).
 * Used by lower-priority strategies to avoid repeating recent posts.
 */
function getRecentlyPostedTokens(): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(DATA_DIR, "posted");
  if (!fs.existsSync(parentDir)) return posted;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dateDirs = fs.readdirSync(parentDir)
    .filter((d) => fs.statSync(path.join(parentDir, d)).isDirectory());

  for (const dateDir of dateDirs) {
    if (new Date(dateDir) >= thirtyDaysAgo) {
      const dirPath = path.join(parentDir, dateDir);
      fs.readdirSync(dirPath).forEach((f) => {
        if (!f.includes("-telegram-") && !f.includes("-x-")) {
          posted.add(f.replace(".json", ""));
        }
      });
    }
  }

  return posted;
}

// ── Priority-Based Token Selection ─────────────────────────────

interface SelectionResult {
  token: TokenData;
  reason: SelectionReason;
  trendingContext?: string;
}

/**
 * Select the best token to post about using a priority-based strategy.
 *
 * Priority order:
 * 1. Trending on CoinGecko (highest search momentum)
 * 2. Trending on X (matched hashtags)
 * 3. Top Gainer (24h > 2%)
 * 4. Safe Play (risk score <= 4)
 * 5. Random Spotlight
 *
 * For each priority, tokens already posted TODAY are skipped.
 * For lower priorities (3-5), tokens posted in the last 30 days are also avoided.
 */
async function selectToken(
  candidateTokens: TokenData[],
  todayPosted: Set<string>,
  recentlyPosted: Set<string>,
  metricsDir: string,
  allTokens: { id: string; name: string; symbol: string }[]
): Promise<SelectionResult | null> {

  // ── Priority 1: Trending on CoinGecko ──
  console.log("\n  ▸ Priority 1: Checking CoinGecko trending...");
  try {
    const trendingCoins = await fetchTrendingCoins();
    if (trendingCoins.length > 0) {
      console.log(`    Found ${trendingCoins.length} trending coins on CoinGecko`);
      for (const trending of trendingCoins) {
        if (todayPosted.has(trending.id)) {
          console.log(`    ✗ ${trending.name} (${trending.symbol}) — already posted today`);
          continue;
        }
        const token = candidateTokens.find((t) => t.id === trending.id);
        if (token) {
          console.log(`    ✓ Selected: ${token.name} (trending on CoinGecko, rank #${trending.score + 1})`);
          return {
            token,
            reason: "trending-coingecko",
            trendingContext: `This token is currently trending on CoinGecko (rank #${trending.score + 1} by search momentum). It is attracting significant user attention and search activity.`,
          };
        }
      }
      console.log("    No eligible trending coins matched our token registry.");
    } else {
      console.log("    No trending data available from CoinGecko.");
    }
  } catch (e) {
    console.warn(`    ⚠ CoinGecko trending failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Priority 2: Trending on X ──
  console.log("  ▸ Priority 2: Checking X Trends...");
  try {
    const xTrends = await fetchXTrends();
    if (xTrends.length > 0) {
      const matchedIds = matchTrendsToTokens(xTrends, allTokens);
      console.log(`    Found ${xTrends.length} X trends, ${matchedIds.length} matched crypto tokens`);
      for (const tokenId of matchedIds) {
        if (todayPosted.has(tokenId)) {
          console.log(`    ✗ ${tokenId} — already posted today`);
          continue;
        }
        const token = candidateTokens.find((t) => t.id === tokenId);
        if (token) {
          const trend = xTrends.find((tr) =>
            tr.trend_name.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9]/g, "") ===
            token.symbol.toLowerCase() ||
            tr.trend_name.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9]/g, "") ===
            token.name.toLowerCase().replace(/[^a-z0-9]/g, "")
          );
          const tweetCount = trend?.tweet_count ? ` with ~${trend.tweet_count.toLocaleString()} tweets` : "";
          console.log(`    ✓ Selected: ${token.name} (trending on X${tweetCount})`);
          return {
            token,
            reason: "trending-x",
            trendingContext: `This token is currently trending on X (Twitter)${tweetCount}. It is generating significant social media discussion.`,
          };
        }
      }
      console.log("    No eligible X trending tokens matched or all already posted.");
    } else {
      console.log("    No X trends available (API may require Basic+ tier).");
    }
  } catch (e) {
    console.warn(`    ⚠ X Trends failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ── Priority 3: Top Gainer ──
  console.log("  ▸ Priority 3: Checking top gainers...");
  const gainers = candidateTokens
    .filter((t) => !todayPosted.has(t.id) && !recentlyPosted.has(t.id) && t.market.priceChange24h > 2)
    .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h);

  if (gainers.length > 0) {
    // Pick randomly from top 3 gainers for variety
    const target = gainers[Math.floor(Math.random() * Math.min(3, gainers.length))];
    console.log(`    ✓ Selected: ${target.name} (+${target.market.priceChange24h.toFixed(2)}%)`);
    return { token: target, reason: "top-gainer" };
  }
  console.log("    No eligible gainers found.");

  // ── Priority 4: Safe Play ──
  console.log("  ▸ Priority 4: Checking safe plays...");
  const metricsFiles = fs.existsSync(metricsDir) ? fs.readdirSync(metricsDir).filter((f) => f.endsWith(".json")) : [];
  const safePlays: TokenData[] = [];
  for (const mf of metricsFiles) {
    const metric = safeReadJson<MetricData | null>(path.join(metricsDir, mf), null);
    if (!metric || metric.riskScore > 4) continue;
    const tokenId = mf.replace(".json", "");
    if (todayPosted.has(tokenId) || recentlyPosted.has(tokenId)) continue;
    const token = candidateTokens.find((t) => t.id === tokenId);
    if (token) safePlays.push(token);
  }

  if (safePlays.length > 0) {
    const target = safePlays[Math.floor(Math.random() * safePlays.length)];
    console.log(`    ✓ Selected: ${target.name} (safe play)`);
    return { token: target, reason: "safe-play" };
  }
  console.log("    No eligible safe plays found.");

  // ── Priority 5: Spotlight (fallback) ──
  console.log("  ▸ Priority 5: Fallback to random spotlight...");
  const available = candidateTokens.filter((t) => !todayPosted.has(t.id));
  if (available.length > 0) {
    const target = available[Math.floor(Math.random() * available.length)];
    console.log(`    ✓ Selected: ${target.name} (spotlight)`);
    return { token: target, reason: "spotlight" };
  }

  // Absolute fallback: any candidate (all have been posted today)
  console.log("    ⚠ All candidates posted today. Selecting any candidate...");
  const target = candidateTokens[Math.floor(Math.random() * candidateTokens.length)];
  return target ? { token: target, reason: "spotlight" } : null;
}

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

  // Filter by rank strategy (Default 1-250), exclude stablecoins
  const candidateTokens = tokens.filter(t => t.rank >= startRank && t.rank <= endRank && !STABLECOIN_IDS.has(t.id));
  
  // Build a full token registry for trend matching (includes all tokens, not just rank-filtered)
  const allTokensRegistry = tokens.map((t) => ({ id: t.id, name: t.name, symbol: t.symbol }));

  console.log(`  Merged Tokens: ${tokens.length}`);
  console.log(`  Candidates in range #${startRank}-#${endRank}: ${candidateTokens.length}`);

  if (candidateTokens.length === 0) {
    console.error("  ✗ No tokens found in the target rank range. Ensure data/tokens/ exists and contains valid JSON.");
    process.exit(1);
  }

  // 3. Load dedup state
  const todayPosted = getTodayPostedTokens(TODAY);
  const recentlyPosted = getRecentlyPostedTokens();
  console.log(`  Already posted today: ${todayPosted.size} tokens`);
  console.log(`  Posted in last 30 days: ${recentlyPosted.size} tokens`);

  // 4. Select token using priority-based strategy
  console.log(`\n▶ Step 2: Selecting token (priority-based)...`);
  const selection = await selectToken(candidateTokens, todayPosted, recentlyPosted, metricsDir, allTokensRegistry);

  if (!selection) {
    console.error("  ✗ Could not select a target token.");
    process.exit(1);
  }

  const { token: targetToken, reason, trendingContext } = selection;
  console.log(`\n  ✦ Selected: ${targetToken.name} (${targetToken.symbol.toUpperCase()})`);
  console.log(`  ✦ Reason: ${reason}`);

  // 5. Generate AI Summary (if key is set)
  let aiSummary = "";
  let targetMetric: MetricData | undefined;

  // Load metrics for context if available
  const metricsFile = path.join(metricsDir, `${targetToken.id}.json`);
  if (fs.existsSync(metricsFile)) {
    targetMetric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
  }

  // Only generate AI summaries if the platform is NOT 'x' (X has a 280-character limit)
  if ((process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY) && targetPlatform !== "x") {
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
        trendingContext,
      }
    );
    if (aiSummary) console.log(` ✓ Summary generated (${aiSummary.length} chars)`);
  } else if (targetPlatform === "x") {
    console.log("  [X PLATFORM] Bypassing AI Insight generation to respect 280-character tweet limits.");
  } else {
    console.warn("  ⚠ No GEMINI_API_KEY or ANTHROPIC_API_KEY set — skipping AI summary.");
  }

  // 6. Construct Final Message
  let message = "";
  const isX = targetPlatform === "x";

  if (reason === "trending-coingecko" || reason === "trending-x") {
    message = createTrendingAlert(targetToken, reason, aiSummary, isX);
  } else if (reason === "top-gainer") {
    message = createTopGainerAlert(targetToken, aiSummary, isX);
  } else if (reason === "safe-play" && targetMetric) {
    message = createSafePlayAlert(targetToken, targetMetric, aiSummary, isX);
  } else {
    message = createSpotlightAlert(targetToken, aiSummary, isX);
  }

  if (dryRun) {
    console.log("\n=== DRY RUN MODE ===");
    console.log(`Reason: ${reason}`);
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

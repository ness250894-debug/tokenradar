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
import { TwitterApi } from "twitter-api-v2";
import { fetchTokensByRank, CoinGeckoToken } from "../src/lib/coingecko";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

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
  market: {
    price: number;
    priceChange24h: number;
    marketCap: number;
  };
}

// ── Telegram API ───────────────────────────────────────────────

async function sendTelegramMessage(text: string, chatId: string): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Telegram API error ${response.status}: ${error}`);
  }

  const data = (await response.json()) as { ok: boolean; result: { message_id: number } };
  if (!data.ok) throw new Error("Telegram API returned ok: false");
  return data.result.message_id;
}

// ── Twitter API ────────────────────────────────────────────────

async function sendTweet(text: string): Promise<string> {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    throw new Error("Missing X (Twitter) credentials");
  }

  const client = new TwitterApi({
    appKey: apiKey,
    appSecret: apiSecret,
    accessToken: accessToken,
    accessSecret: accessSecret,
  });

  // 1. Extract the URL from <a> tags and append it alongside the link text
  let cleanText = text.replace(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '$2: $1');
  
  // 2. Strip any remaining HTML tags (like <b>, <i>, etc.)
  cleanText = cleanText.replace(/<[^>]*>?/gm, '');
  
  // Truncate to 280 chars max (safe for X)
  // Note: X counts ALL URLs as 23 chars. This local length check is just a broad guard.
  if (cleanText.length <= 280) {
    const rwClient = client.readWrite;
    const { data: createdTweet } = await rwClient.v2.tweet(cleanText);
    return createdTweet.id;
  }

  // If too long, we keep the FIRST few lines (header) and the LAST few lines (links/hashtags)
  const lines = cleanText.split('\n');
  const footerLines = [];
  const headerLines = [];
  
  // Keep the last 5 lines (Socials + Website Link + Hashtags)
  for (let i = 0; i < 5; i++) {
    const line = lines.pop();
    if (line !== undefined) footerLines.unshift(line);
  }
  
  // Keep the first 4 lines (Header + Stats)
  for (let i = 0; i < 4; i++) {
    const line = lines.shift();
    if (line !== undefined) headerLines.push(line);
  }

  const safeText = [
    ...headerLines,
    "...",
    ...footerLines
  ].join('\n').substring(0, 277) + "...";

  const rwClient = client.readWrite;
  const { data: createdTweet } = await rwClient.v2.tweet(safeText);
  return createdTweet.id;
}

// ── Alert Generators ───────────────────────────────────────────

function createTopGainerAlert(token: TokenData): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const sym = token.symbol.toUpperCase();
  
  return [
    `🚀 <b>MARKET MOVER: ${token.name} (${sym})</b>`,
    "",
    `🟢 Up <b>+${token.market.priceChange24h.toFixed(2)}%</b> today!`,
    `💰 Current Price: $${price}`,
    "",
    "Is this a breakout? Discover institutional-grade risk scores on TokenRadar.",
    "",
    `🔗 <b>https://tokenradar.co</b>`,
    "🐦 X: https://x.com/tokenradarco",
    "👥 TG: https://t.me/TokenRadarCo",
    "",
    `#${sym} #CryptoAlert #TokenRadarCo`
  ].join("\n");
}

function createSafePlayAlert(token: TokenData, metric: MetricData): string {
  const sym = token.symbol.toUpperCase();
  
  return [
    `🛡️ <b>LOW RISK ASSET: ${token.name} (${sym})</b>`,
    "",
    `Our AI assigned a <b>Risk Score of ${metric.riskScore}/10</b> to $${sym}.`,
    "",
    "Ideal for conservative portfolios looking for growth.",
    "",
    `🔗 <b>https://tokenradar.co</b>`,
    "🐦 X: https://x.com/tokenradarco",
    "👥 TG: https://t.me/TokenRadarCo",
    "",
    `#${sym} #CryptoInvesting #TokenRadarCo`
  ].join("\n");
}

function createSpotlightAlert(token: TokenData): string {
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const mc = token.market.marketCap >= 1e9 ? `$${(token.market.marketCap / 1e9).toFixed(2)}B` : `$${(token.market.marketCap / 1e6).toFixed(0)}M`;
  const emoji = token.market.priceChange24h >= 0 ? "🟢" : "🔴";
  const sign = token.market.priceChange24h >= 0 ? "+" : "";
  const sym = token.symbol.toUpperCase();
  
  return [
    `🔦 <b>TOKEN SPOTLIGHT: ${token.name} (${sym})</b>`,
    "",
    `💰 Price: $${price}`,
    `${emoji} 24h: ${sign}${token.market.priceChange24h.toFixed(2)}%`,
    `📊 MCap: ${mc}`,
    "",
    "Where will the market be in 2026? Check the numbers to find out.",
    "",
    `🔗 <b>https://tokenradar.co</b>`,
    "🐦 X: https://x.com/tokenradarco",
    "👥 TG: https://t.me/TokenRadarCo",
    "",
    `#${sym} #Crypto #TokenRadarCo`
  ].join("\n");
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  
  const startRank = args.includes("--start") ? parseInt(args[args.indexOf("--start") + 1], 10) : 50;
  const endRank = args.includes("--end") ? parseInt(args[args.indexOf("--end") + 1], 10) : 250;

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Daily Market Updates       ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  console.log(`  Target Range: #${startRank} — #${endRank}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  if (!dryRun && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
    console.error("  ✗ Missing Telegram credentials in environment.");
    process.exit(1);
  }

  // 1. Fetch fresh market data (1 API call for up to 250 tokens)
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
    const local: any = JSON.parse(fs.readFileSync(path.join(tokensDir, f), 'utf-8'));
    const fresh = freshMarkets.find(t => t.id === local.id);
    
    return {
      id: local.id,
      symbol: local.symbol,
      name: local.name,
      rank: fresh?.market_cap_rank || local.market?.marketCapRank || 999,
      market: {
        price: fresh?.current_price || local.market?.price || 0,
        priceChange24h: fresh?.price_change_percentage_24h || local.market?.priceChange24h || 0,
        marketCap: fresh?.market_cap || local.market?.marketCap || 0,
      }
    };
  });

  // Filter by rank strategy (Default 50-250)
  const candidateTokens = tokens.filter(t => t.rank >= startRank && t.rank <= endRank);
  
  console.log(`  Candidates in range: ${candidateTokens.length}`);

  if (candidateTokens.length === 0) {
    console.error("  ✗ No tokens found in the target rank range. Run fetch-crypto-data first.");
    process.exit(1);
  }

  // 1.5 Load tracking state for today to prevent duplicates
  const TODAY = new Date().toISOString().split('T')[0];
  const trackerFile = path.join(DATA_DIR, "posted-today.json");
  let postedToday: { date: string, tokens: string[] } = { date: TODAY, tokens: [] };
  
  if (fs.existsSync(trackerFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(trackerFile, 'utf-8'));
      if (parsed.date === TODAY && Array.isArray(parsed.tokens)) {
        postedToday = parsed;
      }
    } catch (e) { /* ignore parse errors */ }
  }

  // 2. Select Alert Strategy
  // 0 = Top Gainer, 1 = Safe Play, 2 = Spotlight
  const strategy = Math.floor(Math.random() * 3);
  
  let targetToken: TokenData | undefined;
  let message = "";

  if (strategy === 0) {
    // Top Gainer (among candidates)
    const gainers = candidateTokens.filter(t => !postedToday.tokens.includes(t.id) && t.market && t.market.priceChange24h > 2).sort((a, b) => b.market.priceChange24h - a.market.priceChange24h);
    if (gainers.length > 0) {
      targetToken = gainers[Math.floor(Math.random() * Math.min(3, gainers.length))]; // Pick randomly from top 3
      message = createTopGainerAlert(targetToken);
    }
  } 
  
  if (strategy === 1 && !targetToken) {
    // Safe Play (Risk <= 4)
    const metricsFiles = fs.readdirSync(metricsDir).filter(f => f.endsWith('.json'));
    const safeTokens: { token: TokenData, metric: MetricData }[] = [];
    
    for (const mf of metricsFiles) {
      const metric: MetricData = JSON.parse(fs.readFileSync(path.join(metricsDir, mf), 'utf-8'));
      if (metric.riskScore <= 4) {
        const tokenId = mf.replace('.json', '');
        const token = candidateTokens.find(t => t.id === tokenId && !postedToday.tokens.includes(t.id));
        if (token) safeTokens.push({ token, metric });
      }
    }
    
    if (safeTokens.length > 0) {
      const selected = safeTokens[Math.floor(Math.random() * safeTokens.length)];
      targetToken = selected.token;
      message = createSafePlayAlert(targetToken, selected.metric);
    }
  }

  if (!targetToken) {
    // Fallback Spotlight
    const availableTokens = candidateTokens.filter(t => !postedToday.tokens.includes(t.id));
    targetToken = availableTokens.length > 0 
      ? availableTokens[Math.floor(Math.random() * availableTokens.length)]
      : candidateTokens[Math.floor(Math.random() * candidateTokens.length)];
    message = createSpotlightAlert(targetToken);
  }

  if (dryRun) {
    console.log("=== DRY RUN MODE ===");
    console.log(message);
    return;
  }

  // Save tracking info immediately after choosing token
  if (!postedToday.tokens.includes(targetToken.id)) {
    postedToday.tokens.push(targetToken.id);
    fs.writeFileSync(trackerFile, JSON.stringify(postedToday, null, 2));
  }

  try {
    const msgId = await sendTelegramMessage(message, channelId as string);
    console.log(`✅ Successfully posted to Telegram (Message ID: ${msgId})`);
  } catch (error) {
    console.error("❌ Failed to post Telegram message:", error);
  }

  try {
    const tweetId = await sendTweet(message);
    console.log(`✅ Successfully posted to X (Tweet ID: ${tweetId})`);
  } catch (error) {
    console.error("❌ Failed to post to X:", error);
    // Don't exit 1 here so we don't crash the action if just Twitter fails
  }
}

main().catch(console.error);

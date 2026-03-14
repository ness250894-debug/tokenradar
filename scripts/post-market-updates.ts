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

  // Strip HTML tags roughly before sending to Twitter
  const cleanText = text.replace(/<[^>]*>?/gm, '');
  
  // Truncate to 280 chars max (shouldn't be needed for these short alerts, but safe)
  const safeText = cleanText.length > 280 ? cleanText.substring(0, 277) + "..." : cleanText;

  const rwClient = client.readWrite;
  const { data: createdTweet } = await rwClient.v2.tweet(safeText);
  return createdTweet.id;
}

// ── Alert Generators ───────────────────────────────────────────

function createTopGainerAlert(token: TokenData): string {
  const url = `${SITE_URL}/${token.id}`;
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  
  return [
    `🚀 <b>MARKET MOVER: ${token.name} (${token.symbol.toUpperCase()})</b>`,
    "",
    `🟢 Up <b>+${token.market.priceChange24h.toFixed(2)}%</b> today!`,
    `💰 Current Price: $${price}`,
    "",
    "Is this a breakout or a fakeout? Read our proprietary Risk Assessment and Price Prediction before buying.",
    "",
    `🔗 <a href="${url}">Read Full Analysis on TokenRadar</a>`,
    "",
    `#${token.symbol.toUpperCase()} #CryptoAlert #${token.name.replace(/\s+/g, '')}`
  ].join("\n");
}

function createSafePlayAlert(token: TokenData, metric: MetricData): string {
  const url = `${SITE_URL}/${token.id}`;
  
  return [
    `🛡️ <b>LOW RISK ASSET: ${token.name} (${token.symbol.toUpperCase()})</b>`,
    "",
    `Our AI has assigned a <b>Risk Score of ${metric.riskScore}/10</b> (${metric.riskLevel}) to $${token.symbol.toUpperCase()}.`,
    "",
    "Ideal for conservative portfolios looking for long-term growth potential.",
    "",
    `🔗 <a href="${url}">See the Data on TokenRadar</a>`,
    "",
    `#${token.symbol.toUpperCase()} #CryptoInvesting #TokenRadar`
  ].join("\n");
}

function createSpotlightAlert(token: TokenData): string {
  const url = `${SITE_URL}/${token.id}`;
  const price = token.market.price >= 1 ? token.market.price.toFixed(2) : token.market.price.toFixed(6);
  const mc = token.market.marketCap >= 1e9 ? `$${(token.market.marketCap / 1e9).toFixed(2)}B` : `$${(token.market.marketCap / 1e6).toFixed(0)}M`;
  const emoji = token.market.priceChange24h >= 0 ? "🟢" : "🔴";
  const sign = token.market.priceChange24h >= 0 ? "+" : "";
  
  return [
    `🔦 <b>TOKEN SPOTLIGHT: ${token.name} (${token.symbol.toUpperCase()})</b>`,
    "",
    `💰 Price: $${price}`,
    `${emoji} 24h: ${sign}${token.market.priceChange24h.toFixed(2)}%`,
    `📊 Market Cap: ${mc}`,
    "",
    "Where will it be in 2026? We've crunched the numbers.",
    "",
    `🔗 <a href="${url}">Read 2026 Price Prediction</a>`,
    "",
    `#${token.symbol.toUpperCase()} #Crypto #TokenRadar`
  ].join("\n");
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!dryRun && (!process.env.TELEGRAM_BOT_TOKEN || !channelId)) {
    console.error("Missing Telegram credentials in environment.");
    process.exit(1);
  }

  // 1. Load available standard token data
  const tokensDir = path.join(DATA_DIR, "tokens");
  const metricsDir = path.join(DATA_DIR, "metrics");
  
  if (!fs.existsSync(tokensDir) || !fs.existsSync(metricsDir)) {
    console.error("Data directories not found. Run fetch logic first.");
    process.exit(1);
  }

  const tokenFiles = fs.readdirSync(tokensDir).filter(f => f.endsWith('.json'));
  const tokens: TokenData[] = tokenFiles.map(f => JSON.parse(fs.readFileSync(path.join(tokensDir, f), 'utf-8')));

  if (tokens.length === 0) {
    console.error("No token data found.");
    process.exit(1);
  }

  // 2. Select Alert Strategy
  // 0 = Top Gainer, 1 = Safe Play, 2 = Spotlight
  const strategy = Math.floor(Math.random() * 3);
  
  let targetToken: TokenData | undefined;
  let message = "";

  if (strategy === 0) {
    // Top Gainer
    const gainers = tokens.filter(t => t.market && t.market.priceChange24h > 5).sort((a, b) => b.market.priceChange24h - a.market.priceChange24h);
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
        const token = tokens.find(t => t.id === tokenId);
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
    targetToken = tokens[Math.floor(Math.random() * tokens.length)];
    message = createSpotlightAlert(targetToken);
  }

  if (dryRun) {
    console.log("=== DRY RUN MODE ===");
    console.log(message);
    return;
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

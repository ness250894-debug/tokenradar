/**
 * Telegram Auto-Poster — Phase 6
 *
 * Posts new article announcements to a Telegram channel.
 * Each message includes:
 * - Token name, symbol, and article type
 * - Key metrics (Risk Score, price, 24h change)
 * - Article link
 * - Rich formatting (bold, emoji, inline links)
 *
 * Usage:
 *   npx tsx scripts/post-to-telegram.ts
 *   npx tsx scripts/post-to-telegram.ts --token injective-protocol
 *   npx tsx scripts/post-to-telegram.ts --dry-run
 *
 * Requires in .env.local:
 *   TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID
 *
 * Cost: $0 (Telegram Bot API is free, unlimited messages)
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const POSTED_FILE = path.join(DATA_DIR, "telegram-posted.json");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

// ── Types ──────────────────────────────────────────────────────

interface PostedLog {
  posts: {
    tokenId: string;
    articleType: string;
    messageId: number;
    postedAt: string;
  }[];
}

// ── Message Builder ────────────────────────────────────────────

/**
 * Build a Telegram message with HTML formatting.
 * Telegram supports: <b>, <i>, <a>, <code>, <pre>
 */
function buildMessage(
  tokenName: string,
  tokenId: string,
  symbol: string,
  metrics: {
    riskScore?: number;
    riskLevel?: string;
    price?: number;
    priceChange24h?: number;
    growthPotential?: number;
    marketCap?: number;
  } = {}
): string {
  const url = `${SITE_URL}/${tokenId}`;
  const sym = symbol.toUpperCase();

  const header = `🚀 <b>New Coverage: ${tokenName} (${sym})</b>`;
  const body = buildMetricsBlock(metrics);

  return [
    header,
    "",
    body,
    "",
    "We just published our complete data-driven analysis:",
    "✅ Overview & Risk Assessment",
    "✅ 2026-2027 Price Prediction",
    "✅ Step-by-Step Buying Guide",
    "",
    `🔗 <a href="${url}">Read Full Reports on TokenRadar</a>`,
    "",
    `💰 <b>Trade ${sym} Now:</b>`,
    `• <a href="https://www.binance.com/referral/earn-together/refer2earn-usdc/claim?hl=en&ref=GRO_28502_65AUB&utm_source=default">Binance</a>`,
    `• <a href="https://www.bybit.com/invite?ref=QONQNG">Bybit</a>`,
    `• <a href="https://okx.com/join/66004268">OKX</a>`,
    `• <a href="https://www.kucoin.com/r/rf/FQ67QZ7A">KuCoin</a>`,
    "",
    `🐦 Follow us on X: https://x.com/tokenradarco`,
    "",
    `#${sym} #crypto #TokenRadar`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Build metrics summary for overview posts. */
function buildMetricsBlock(metrics: {
  riskScore?: number;
  riskLevel?: string;
  price?: number;
  priceChange24h?: number;
  growthPotential?: number;
  marketCap?: number;
}): string {
  const lines: string[] = [];

  if (metrics.price !== undefined) {
    const priceFmt = metrics.price >= 1 ? metrics.price.toFixed(2) : metrics.price.toFixed(6);
    lines.push(`💰 <b>Price:</b> $${priceFmt}`);
  }
  if (metrics.priceChange24h !== undefined) {
    const emoji = metrics.priceChange24h >= 0 ? "🟢" : "🔴";
    lines.push(`${emoji} <b>24h:</b> ${metrics.priceChange24h >= 0 ? "+" : ""}${metrics.priceChange24h.toFixed(2)}%`);
  }
  if (metrics.marketCap !== undefined) {
    const mcFmt =
      metrics.marketCap >= 1e9
        ? `$${(metrics.marketCap / 1e9).toFixed(2)}B`
        : `$${(metrics.marketCap / 1e6).toFixed(0)}M`;
    lines.push(`📊 <b>Market Cap:</b> ${mcFmt}`);
  }
  if (metrics.riskScore !== undefined) {
    const riskEmoji = metrics.riskScore <= 3 ? "🟢" : metrics.riskScore <= 6 ? "🟡" : "🔴";
    lines.push(`${riskEmoji} <b>Risk Score:</b> ${metrics.riskScore}/10 (${metrics.riskLevel || "unknown"})`);
  }
  if (metrics.growthPotential !== undefined) {
    lines.push(`📈 <b>Growth Potential:</b> ${metrics.growthPotential}/100`);
  }

  return lines.join("\n");
}

/** Build price summary for prediction posts. */
function buildPriceBlock(metrics: {
  price?: number;
  priceChange24h?: number;
  riskScore?: number;
}): string {
  const lines: string[] = [];

  if (metrics.price !== undefined) {
    const priceFmt = metrics.price >= 1 ? metrics.price.toFixed(2) : metrics.price.toFixed(6);
    lines.push(`💰 <b>Current Price:</b> $${priceFmt}`);
  }
  if (metrics.priceChange24h !== undefined) {
    const emoji = metrics.priceChange24h >= 0 ? "🟢" : "🔴";
    lines.push(`${emoji} <b>24h Change:</b> ${metrics.priceChange24h >= 0 ? "+" : ""}${metrics.priceChange24h.toFixed(2)}%`);
  }
  if (metrics.riskScore !== undefined) {
    lines.push(`⚠️ <b>Risk Score:</b> ${metrics.riskScore}/10`);
  }

  lines.push("");
  lines.push("Data-driven scenarios for 2026-2027 based on historical trends and proprietary metrics.");

  return lines.join("\n");
}

// ── Telegram API ───────────────────────────────────────────────

/**
 * Send a message to a Telegram channel via the Bot API.
 *
 * @returns Message ID if successful
 */
async function sendTelegramMessage(
  text: string,
  chatId: string
): Promise<number> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in .env.local");
  }

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

  const data = (await response.json()) as {
    ok: boolean;
    result: { message_id: number };
  };

  if (!data.ok) {
    throw new Error("Telegram API returned ok: false");
  }

  return data.result.message_id;
}

// ── Utilities ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadPostedLog(): PostedLog {
  if (!fs.existsSync(POSTED_FILE)) {
    return { posts: [] };
  }
  return JSON.parse(fs.readFileSync(POSTED_FILE, "utf-8"));
}

function savePostedLog(log: PostedLog): void {
  fs.writeFileSync(POSTED_FILE, JSON.stringify(log, null, 2));
}

function isAlreadyPosted(
  log: PostedLog,
  tokenId: string,
  articleType: string
): boolean {
  return log.posts.some(
    (p) => p.tokenId === tokenId && p.articleType === articleType
  );
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf("--token");
  const targetToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;
  const dryRun = args.includes("--dry-run");
  const maxIdx = args.indexOf("--max");
  const maxPosts = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 10;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Telegram Auto-Poster       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Max posts: ${maxPosts}`);
  console.log();

  // Verify credentials
  const channelId = process.env.TELEGRAM_CHANNEL_ID;
  if (!dryRun) {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      console.error("  ✗ TELEGRAM_BOT_TOKEN not set in .env.local");
      process.exit(1);
    }
    if (!channelId) {
      console.error("  ✗ TELEGRAM_CHANNEL_ID not set in .env.local");
      process.exit(1);
    }
  }

  // Find articles to post
  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("  No content found. Run generate-content first.");
    return;
  }

  const postedLog = loadPostedLog();
  const tokenDirs = fs
    .readdirSync(CONTENT_DIR)
    .filter((d) => fs.statSync(path.join(CONTENT_DIR, d)).isDirectory())
    .filter((d) => !targetToken || d === targetToken);

  let postCount = 0;

  for (const tokenId of tokenDirs) {
    if (postCount >= maxPosts) break;

    const tokenDir = path.join(CONTENT_DIR, tokenId);
    const articleFiles = fs
      .readdirSync(tokenDir)
      .filter((f) => f.endsWith(".json") && !f.includes(".prompt"));

    if (articleFiles.length === 0) continue;

    // Skip if already posted ANY content for this token
    if (postedLog.posts.some((p) => p.tokenId === tokenId)) {
      continue;
    }

    const firstArticleFile = articleFiles.includes("overview.json") ? "overview.json" : articleFiles[0];
    const article = JSON.parse(
      fs.readFileSync(path.join(tokenDir, firstArticleFile), "utf-8")
    );

    // Load metrics
    let metrics: {
      riskScore?: number;
      riskLevel?: string;
      price?: number;
      priceChange24h?: number;
      growthPotential?: number;
      marketCap?: number;
    } = {};

    const metricsFile = path.join(DATA_DIR, "metrics", `${tokenId}.json`);
    if (fs.existsSync(metricsFile)) {
      const m = JSON.parse(fs.readFileSync(metricsFile, "utf-8"));
      metrics.riskScore = m.riskScore;
      metrics.riskLevel = m.riskLevel;
      metrics.growthPotential = m.growthPotentialIndex;
    }

    const tokenFile = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
    if (fs.existsSync(tokenFile)) {
      const t = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
      metrics.price = t.market?.price;
      metrics.priceChange24h = t.market?.priceChange24h;
      metrics.marketCap = t.market?.marketCap;
    }

    const message = buildMessage(
      article.tokenName,
      tokenId,
      article.tokenName.toLowerCase().replace(/\s+/g, ""),
      metrics
    );

    if (dryRun) {
      console.log(`  📝 [${tokenId}/combined]`);
      console.log(`     ${message.replace(/\n/g, "\n     ")}`);
      console.log();
      postCount++;
      continue;
    }

    try {
      process.stdout.write(`  📨 ${tokenId}/combined...`);
      const msgId = await sendTelegramMessage(message, channelId!);
      console.log(` ✓ (msg: ${msgId})`);

      postedLog.posts.push({
        tokenId,
        articleType: "combined",
        messageId: msgId,
        postedAt: new Date().toISOString(),
      });
      savePostedLog(postedLog);
      postCount++;

      // Telegram rate limit: 1 msg/sec to same chat
      await sleep(1500);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ✗ ${msg}`);
    }
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║       Telegram Posting Complete          ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Posted:   ${String(postCount).padStart(6)}                 ║`);
  console.log(`║  Total:    ${String(postedLog.posts.length).padStart(6)}                 ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error("\n✖ Fatal error:", error);
  process.exit(1);
});

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
import { logError } from "../src/lib/reporter";
import { sendTelegramMessage } from "../src/lib/telegram";
import { SITE_URL, REFERRAL_LINKS_HTML, SOCIAL_FOOTER } from "../src/lib/config";
import { sleep, safeReadJson } from "../src/lib/utils";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const POSTED_DIR = path.join(DATA_DIR, "posted");

// Ensure posted dir exists
if (!fs.existsSync(POSTED_DIR)) {
  fs.mkdirSync(POSTED_DIR, { recursive: true });
}

// ── Types ──────────────────────────────────────────────────────

interface PostRecord {
  tokenId: string;
  articleType: string;
  messageId: number;
  postedAt: string;
}

interface PostedLog {
  posts: PostRecord[];
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
    `🔗 <b>Token Report:</b> <a href="${url}">${SITE_URL.replace('https://', '')}/${tokenId}</a>`,
    `🌐 <b>Main Site:</b> <a href="${SITE_URL}">${SITE_URL.replace('https://', '')}</a>`,
    ...SOCIAL_FOOTER.slice(1),
    "",
    `#${sym} #Crypto #TokenRadarCo`,
    "",
    ...REFERRAL_LINKS_HTML,
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



// ── Utilities ──────────────────────────────────────────────────

function loadPostedLog(): PostedLog {
  const posts: PostRecord[] = [];
  if (!fs.existsSync(POSTED_DIR)) return { posts };

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Scan recent daily folders
  const dateDirs = fs.readdirSync(POSTED_DIR)
    .filter(d => fs.statSync(path.join(POSTED_DIR, d)).isDirectory());

  for (const dateDir of dateDirs) {
    // Only check folders from the last 30 days
    if (new Date(dateDir) >= thirtyDaysAgo) {
      const dirPath = path.join(POSTED_DIR, dateDir);
      const files = fs.readdirSync(dirPath).filter(f => f.includes("-telegram-") && f.endsWith(".json"));
      
      for (const file of files) {
        const record = safeReadJson<PostRecord>(path.join(dirPath, file), null as unknown as PostRecord);
        if (record) posts.push(record);
      }
    }
  }

  return { posts };
}

function saveSinglePostRecord(record: PostRecord): void {
  const dateStr = record.postedAt.split("T")[0]; // YYYY-MM-DD
  const dailyDir = path.join(POSTED_DIR, dateStr);
  
  if (!fs.existsSync(dailyDir)) {
    fs.mkdirSync(dailyDir, { recursive: true });
  }

  const id = Math.random().toString(36).substring(2, 6);
  const filePath = path.join(dailyDir, `${record.tokenId}-telegram-${id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
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
    .filter((d) => !targetToken || d === targetToken)
    .map(d => {
      const article = safeReadJson<any>(path.join(CONTENT_DIR, d, "overview.json"), null);
      return { id: d, generatedAt: article ? new Date(article.generatedAt || 0).getTime() : 0 };
    })
    .sort((a, b) => b.generatedAt - a.generatedAt)
    .map(item => item.id);

  let postCount = 0;

  for (const tokenId of tokenDirs) {
    if (postCount >= maxPosts) break;

    const tokenDir = path.join(CONTENT_DIR, tokenId);
    const articleFiles = fs
      .readdirSync(tokenDir)
      .filter((f) => f.endsWith(".json") && !f.includes(".prompt"));

    if (articleFiles.length === 0) continue;

    // Skip if posted within the last 30 days
    const REPOST_COOLDOWN_DAYS = 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - REPOST_COOLDOWN_DAYS);
    const recentlyPosted = postedLog.posts.some(
      (p) => p.tokenId === tokenId && new Date(p.postedAt) > cutoffDate
    );
    if (recentlyPosted) {
      continue;
    }

    const firstArticleFile = articleFiles.includes("overview.json") ? "overview.json" : articleFiles[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const article = safeReadJson<any>(path.join(tokenDir, firstArticleFile), null);
    if (!article) continue;

    // Load metrics
    const metrics: {
      riskScore?: number;
      riskLevel?: string;
      price?: number;
      priceChange24h?: number;
      growthPotential?: number;
      marketCap?: number;
    } = {};
    let symbol = tokenId; // Fallback

    const metricsFile = path.join(DATA_DIR, "metrics", `${tokenId}.json`);
    if (fs.existsSync(metricsFile)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = safeReadJson<any>(metricsFile, null);
      if (m) {
        metrics.riskScore = m.riskScore;
        metrics.riskLevel = m.riskLevel;
        metrics.growthPotential = m.growthPotentialIndex;
      }
    }

    const tokenFile = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
    if (fs.existsSync(tokenFile)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = safeReadJson<any>(tokenFile, null);
      if (t) {
        metrics.price = t.market?.price;
        metrics.priceChange24h = t.market?.priceChange24h;
        metrics.marketCap = t.market?.marketCap;
        if (t.symbol) symbol = t.symbol;
      }
    }

    const message = buildMessage(
      article.tokenName,
      tokenId,
      symbol,
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

      const record: PostRecord = {
        tokenId,
        articleType: "combined",
        messageId: msgId,
        postedAt: new Date().toISOString(),
      };
      
      postedLog.posts.push(record);
      saveSinglePostRecord(record);
      postCount++;

      // Telegram rate limit: 1 msg/sec to same chat
      await sleep(1500);
    } catch (error) {
      await logError("post-to-telegram-single", error, false);
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

main().catch(async (error) => {
  await logError("post-to-telegram", error);
  process.exit(1);
});

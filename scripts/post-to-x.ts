/**
 * X (Twitter) Auto-Poster — Phase 6
 *
 * Posts new article announcements to X using the v2 API.
 * Each post includes:
 * - Token name and article type
 * - Key metric (Risk Score or price)
 * - Link to the article on TokenRadar.co
 * - Relevant hashtags
 *
 * Usage:
 *   npx tsx scripts/post-to-x.ts
 *   npx tsx scripts/post-to-x.ts --token injective-protocol
 *   npx tsx scripts/post-to-x.ts --dry-run  (preview tweets without posting)
 *
 * Requires in .env.local:
 *   X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET
 *
 * Cost: $0 (X Free tier: 1,500 tweets/month)
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { logError } from "../src/lib/reporter";
import { postTweet, validateXCredentials } from "../src/lib/x-client";
import { SITE_URL, SOCIAL_FOOTER } from "../src/lib/config";
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
  tweetId: string;
  postedAt: string;
}

interface PostedLog {
  posts: PostRecord[];
}

// ── Post Builder ───────────────────────────────────────────────

/**
 * Build a tweet text for a given article.
 * Stays within 280 characters.
 */
function buildTweet(
  tokenName: string,
  tokenId: string,
  symbol: string,
  metrics: { riskScore?: number; price?: number } = {}
): string {
  const sym = symbol.toUpperCase();
  const priceFmt = metrics.price !== undefined 
    ? (metrics.price >= 1 ? metrics.price.toFixed(2) : metrics.price.toFixed(6))
    : "0.00";

  const tokenUrl = `${SITE_URL}/${tokenId}`;

  const tweet = [
    `🚀 New Coverage: ${tokenName} ( $${sym} - $${priceFmt} )`,
    `💰 Current Price: $${priceFmt} | ⚠️ Risk Score: ${metrics.riskScore || 'N/A'}/10`,
    `🔗 ${tokenUrl}`,
    ...SOCIAL_FOOTER.slice(1),
    "",
    `#${sym} #Crypto #TokenRadarCo`
  ].join("\n");

  if (tweet.length <= 280) return tweet;

  // Smart truncation: Keep first 3 lines and last 3 lines
  const lines = tweet.split('\n');
  const footerLines: string[] = [];
  const headerLines: string[] = [];
  
  for (let i = 0; i < 3; i++) {
    const line = lines.pop();
    if (line !== undefined) footerLines.unshift(line);
  }
  for (let i = 0; i < 3; i++) {
    const line = lines.shift();
    if (line !== undefined) headerLines.push(line);
  }

  return [...headerLines, "...", ...footerLines]
    .join('\n')
    .substring(0, 277) + "...";
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
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith("-x.json"));
      
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
  const filePath = path.join(dailyDir, `${record.tokenId}-x-${id}.json`);
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
  console.log("║  TokenRadar — X (Twitter) Auto-Poster    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Max posts: ${maxPosts}`);
  console.log();

  // Verify credentials
  if (!dryRun) {
    try {
      validateXCredentials();
    } catch (_e: unknown) {
      const e = _e as Error;
      console.error(`  ✗ ${e.message}`);
      console.error("    Add to .env.local or use --dry-run");
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

    // Load metrics and symbol for the tweet
    const metrics: { riskScore?: number; price?: number } = {};
    let symbol = tokenId.toUpperCase(); // Fallback

    const metricsFile = path.join(DATA_DIR, "metrics", `${tokenId}.json`);
    if (fs.existsSync(metricsFile)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = safeReadJson<any>(metricsFile, null);
      if (m) metrics.riskScore = m.riskScore;
    }

    const tokenFile = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
    if (fs.existsSync(tokenFile)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const t = safeReadJson<any>(tokenFile, null);
      if (t) {
        metrics.price = t.market?.price;
        if (t.symbol) symbol = t.symbol.toUpperCase();
      }
    }

    const tweetText = buildTweet(
      article.tokenName,
      tokenId,
      symbol,
      metrics
    );

    if (dryRun) {
      console.log(`  📝 [${tokenId}/combined]`);
      console.log(`     ${tweetText.replace(/\n/g, "\n     ")}`);
      console.log(`     (${tweetText.length}/280 chars)`);
      console.log();
      postCount++;
      continue;
    }

    try {
      process.stdout.write(`  🐦 ${tokenId}/combined...`);
      const tweetId = await postTweet(tweetText);
      console.log(` ✓ (ID: ${tweetId})`);

      postCount++;

      const record: PostRecord = {
        tokenId,
        articleType: "combined",
        tweetId,
        postedAt: new Date().toISOString(),
      };

      postedLog.posts.push(record);
      saveSinglePostRecord(record);

      // Rate limit: wait 2s between posts
      await sleep(2000);
    } catch (error) {
      await logError("post-to-x-single", error, false);
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ✗ ${msg}`);
    }
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║          X Posting Complete              ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Posted:   ${String(postCount).padStart(6)}                 ║`);
  console.log(`║  Total:    ${String(postedLog.posts.length).padStart(6)}                 ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch(async (error) => {
  await logError("post-to-x", error);
  process.exit(1);
});

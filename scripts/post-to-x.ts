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
import * as crypto from "crypto";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const POSTED_FILE = path.join(DATA_DIR, "x-posted.json");
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";

// ── Types ──────────────────────────────────────────────────────

interface PostedLog {
  posts: {
    tokenId: string;
    articleType: string;
    tweetId: string;
    postedAt: string;
  }[];
}

// ── OAuth 1.0a Signature ───────────────────────────────────────

/**
 * Generate OAuth 1.0a signature for X API v2.
 * Required for user-context endpoints (posting tweets).
 */
function generateOAuthHeader(
  method: string,
  url: string,
  params: Record<string, string> = {}
): string {
  const apiKey = process.env.X_API_KEY!;
  const apiSecret = process.env.X_API_SECRET!;
  const accessToken = process.env.X_ACCESS_TOKEN!;
  const accessSecret = process.env.X_ACCESS_SECRET!;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
    ...params,
  };

  // Sort and encode parameters
  const sortedParams = Object.keys(oauthParams)
    .sort()
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(oauthParams[key])}`
    )
    .join("&");

  // Create signature base string
  const signatureBase = [
    method.toUpperCase(),
    encodeURIComponent(url),
    encodeURIComponent(sortedParams),
  ].join("&");

  // Create signing key
  const signingKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;

  // Generate HMAC-SHA1 signature
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBase)
    .digest("base64");

  // Build Authorization header
  const authParams = {
    oauth_consumer_key: apiKey,
    oauth_nonce: nonce,
    oauth_signature: signature,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_token: accessToken,
    oauth_version: "1.0",
  };

  const authHeader = Object.entries(authParams)
    .map(([k, v]) => `${encodeURIComponent(k)}="${encodeURIComponent(v)}"`)
    .join(", ");

  return `OAuth ${authHeader}`;
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
  const url = `${SITE_URL}/${tokenId}`;
  const sym = symbol.toUpperCase();
  const hashtags = `#${sym} #crypto #TokenRadarCo`;
  
  const priceFmt = metrics.price !== undefined 
    ? (metrics.price >= 1 ? metrics.price.toFixed(2) : metrics.price.toFixed(6))
    : "0.00";

  // New multi-line template per user request
  const tweet = [
    `🚀 New Coverage: ${tokenName} (`,
    `${tokenName} · $${priceFmt}`,
    `)`,
    `💰 $${priceFmt} | ⚠️ Risk Score: ${metrics.riskScore || 'N/A'}/10`,
    `🔗 ${url}`,
    `👥 TG: https://t.me/TokenRadarCo`,
    hashtags
  ].join("\n");

  // Ensure within 280 chars
  if (tweet.length <= 280) {
    return tweet;
  }

  // Smart truncation: Keep first 3 lines and last 3 lines
  const lines = tweet.split('\n');
  const footerLines = [];
  const headerLines = [];
  
  for (let i = 0; i < 3; i++) {
    const line = lines.pop();
    if (line !== undefined) footerLines.unshift(line);
  }
  for (let i = 0; i < 3; i++) {
    const line = lines.shift();
    if (line !== undefined) headerLines.push(line);
  }

  return [
    ...headerLines,
    "...",
    ...footerLines
  ].join('\n').substring(0, 277) + "...";
}

// ── X API v2 ───────────────────────────────────────────────────

/**
 * Post a tweet using X API v2.
 *
 * @returns Tweet ID if successful
 */
async function postTweet(text: string): Promise<string> {
  const url = "https://api.twitter.com/2/tweets";
  const authHeader = generateOAuthHeader("POST", url);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`X API error ${response.status}: ${error}`);
  }

  const data = (await response.json()) as {
    data: { id: string; text: string };
  };

  return data.data.id;
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
  console.log("║  TokenRadar — X (Twitter) Auto-Poster    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`  Max posts: ${maxPosts}`);
  console.log();

  // Verify credentials
  if (!dryRun) {
    const required = ["X_API_KEY", "X_API_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_SECRET"];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      console.error(`  ✗ Missing env vars: ${missing.join(", ")}`);
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

    // Skip if already posted ANY content for this token
    if (postedLog.posts.some((p) => p.tokenId === tokenId)) {
      continue;
    }

    const firstArticleFile = articleFiles.includes("overview.json") ? "overview.json" : articleFiles[0];
    const article = JSON.parse(
      fs.readFileSync(path.join(tokenDir, firstArticleFile), "utf-8")
    );

    // Load metrics and symbol for the tweet
    let metrics: { riskScore?: number; price?: number } = {};
    let symbol = tokenId.toUpperCase(); // Fallback

    const metricsFile = path.join(DATA_DIR, "metrics", `${tokenId}.json`);
    if (fs.existsSync(metricsFile)) {
      const m = JSON.parse(fs.readFileSync(metricsFile, "utf-8"));
      metrics.riskScore = m.riskScore;
    }

    const tokenFile = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
    if (fs.existsSync(tokenFile)) {
      const t = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
      metrics.price = t.market?.price;
      if (t.symbol) symbol = t.symbol.toUpperCase();
    }

    const tweet = buildTweet(
      article.tokenName,
      tokenId,
      symbol,
      metrics
    );

    if (dryRun) {
      console.log(`  📝 [${tokenId}/combined]`);
      console.log(`     ${tweet.replace(/\n/g, "\n     ")}`);
      console.log(`     (${tweet.length}/280 chars)`);
      console.log();
      postCount++;
      continue;
    }

    try {
      process.stdout.write(`  🐦 ${tokenId}/combined...`);
      const tweetId = await postTweet(tweet);
      console.log(` ✓ (ID: ${tweetId})`);

      postedLog.posts.push({
        tokenId,
        articleType: "combined",
        tweetId,
        postedAt: new Date().toISOString(),
      });
      savePostedLog(postedLog);
      postCount++;

      // Rate limit: wait 2s between posts
      await sleep(2000);
    } catch (error) {
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

main().catch((error) => {
  console.error("\n✖ Fatal error:", error);
  process.exit(1);
});

/**
 * TokenRadar — Interactive Daily Post for X
 *
 * Posts one interactive poll per day as the FIRST X post of the day.
 * Rotates through 4 poll types based on day-of-year:
 *   0 = Sentiment  ("What's your move on $TOKEN?")
 *   1 = Prediction  ("Where does $TOKEN close today?")
 *   2 = Narrative   ("Which narrative dominates this week?")
 *   3 = Community   ("Which token should TokenRadar deep-dive?")
 *
 * Deduplication: Only one interactive post per day (tracked via
 * data/posted/YYYY-MM-DD/interactive-daily.json).
 *
 * Usage:
 *   npx tsx scripts/post-interactive-daily.ts
 *   npx tsx scripts/post-interactive-daily.ts --dry-run
 *   npx tsx scripts/post-interactive-daily.ts --type sentiment
 *   npx tsx scripts/post-interactive-daily.ts --type prediction
 *   npx tsx scripts/post-interactive-daily.ts --type narrative
 *   npx tsx scripts/post-interactive-daily.ts --type community
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { logError } from "../src/lib/reporter";
import { postPoll, type PollOptions } from "../src/lib/x-client";
import {
  POLL_DURATION_MINUTES,
  INTERACTIVE_POST_NARRATIVES,
  SOCIAL,
} from "../src/lib/config";
import { safeReadJson } from "../src/lib/utils";
import {
  type TokenData,
  type MetricData,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Poll Types ─────────────────────────────────────────────────

export type PollType = "sentiment" | "prediction" | "narrative" | "community";

/**
 * Determine the poll type for today using day-of-year rotation.
 * Cycles through: sentiment → prediction → narrative → community
 */
export function getPollTypeForToday(): PollType {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const types: PollType[] = ["sentiment", "prediction", "narrative", "community"];
  return types[dayOfYear % types.length];
}

// ── Poll Generators ────────────────────────────────────────────

/**
 * Format a price for display. Uses 2 decimals for prices >= $1,
 * 4 decimals for >= $0.01, 6 decimals for smaller.
 */
function formatPrice(price: number): string {
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/**
 * Generate a Sentiment Poll.
 * "What's your move on $TOKEN today?"
 */
export function buildSentimentPoll(token: TokenData, metric?: MetricData): PollOptions {
  const sym = token.symbol.toUpperCase();
  const riskStr = metric ? ` Risk: ${metric.riskScore}/10.` : "";
  const change = token.market.priceChange24h;
  const emoji = change >= 0 ? "🟢" : "🔴";
  const sign = change >= 0 ? "+" : "";

  return {
    text: `GM! ${emoji} $${sym} is ${sign}${change.toFixed(1)}% today.${riskStr}\n\nWhat's your move?\n\n#${sym} #Crypto #TokenRadarCo`,
    options: ["Bullish 🚀", "Bearish 📉", "HODL 💎", "Just Watching 👀"],
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

/**
 * Generate a Prediction Poll.
 * "Where does $TOKEN close today?" with price-range options.
 */
export function buildPredictionPoll(token: TokenData): PollOptions {
  const sym = token.symbol.toUpperCase();
  const price = token.market.price;
  const low = price * 0.95;
  const high = price * 1.05;

  return {
    text: `📊 $${sym} is at ${formatPrice(price)} right now.\n\nWhere does it end the day?\n\n#${sym} #Crypto #TokenRadarCo`,
    options: [
      `Below ${formatPrice(low)}`,
      `${formatPrice(low)}-${formatPrice(high)}`,
      `Above ${formatPrice(high)}`,
      `Moon bound 🚀`,
    ],
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

/**
 * Generate a Narrative Poll.
 * "Which crypto narrative dominates this week?"
 */
export function buildNarrativePoll(): PollOptions {
  return {
    text: `🔍 Which crypto narrative dominates this week?\n\nVote and tell us why in the replies!\n\ntokenradar.co\n#Crypto #TokenRadarCo`,
    options: [...INTERACTIVE_POST_NARRATIVES],
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

/**
 * Generate a Community Vote Poll.
 * "Which token should TokenRadar deep-dive today?"
 * Selects top 4 candidates from gainers/trending.
 */
export function buildCommunityPoll(candidates: TokenData[]): PollOptions {
  // Pick 4 interesting tokens: top gainers by 24h change
  const sorted = [...candidates]
    .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h)
    .slice(0, 4);

  // Fallback if fewer than 2 candidates
  if (sorted.length < 2) {
    return buildNarrativePoll();
  }

  const options = sorted.map((t) => `$${t.symbol.toUpperCase()}`);

  return {
    text: `🗳️ Community vote! Which token should TokenRadar deep-dive today?\n\ntokenradar.co\n#Crypto #TokenRadarCo`,
    options,
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  const typeIdx = args.indexOf("--type");
  const forcedType = typeIdx !== -1 ? (args[typeIdx + 1] as PollType) : undefined;

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Interactive Daily Post (X)     ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log();

  const TODAY = new Date().toISOString().split("T")[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted", TODAY);
  const TRACKER_FILE = path.join(POSTED_DIR, "interactive-daily.json");

  // ── Dedup check ──
  if (fs.existsSync(TRACKER_FILE) && !dryRun) {
    const existing = safeReadJson<{ postedAt?: string }>(TRACKER_FILE, {});
    console.log(`  ⚠ Interactive post already sent today (${existing.postedAt}). Exiting.`);
    return;
  }

  if (!fs.existsSync(POSTED_DIR)) fs.mkdirSync(POSTED_DIR, { recursive: true });

  // ── Credential check ──
  if (!dryRun) {
    if (!process.env.X_API_KEY || !process.env.X_API_SECRET || !process.env.X_ACCESS_TOKEN || !process.env.X_ACCESS_SECRET) {
      console.error("  ✗ Missing X (Twitter) credentials.");
      process.exit(1);
    }
  }

  // ── Determine poll type ──
  const pollType = forcedType || getPollTypeForToday();
  console.log(`  Poll Type: ${pollType}${forcedType ? " (forced)" : " (auto-rotation)"}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  // ── Load candidate tokens ──
  console.log(`▶ Step 1: Loading candidate tokens...`);
  const metricsDir = path.join(DATA_DIR, "metrics");
  const { candidates, allRegistry } = await loadCandidateTokens(DATA_DIR);

  console.log(`  Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.error("  ✗ No candidate tokens found.");
    process.exit(1);
  }

  // ── Build poll ──
  console.log(`\n▶ Step 2: Building ${pollType} poll...`);

  let poll: PollOptions;
  let selectedTokenId: string | undefined;

  if (pollType === "narrative") {
    // Narrative polls don't need a specific token
    poll = buildNarrativePoll();
  } else if (pollType === "community") {
    poll = buildCommunityPoll(candidates);
  } else {
    // Sentiment & Prediction need a specific token
    const todayPosted = getTodayPostedTokens(DATA_DIR, TODAY);
    const recentlyPosted = getRecentlyPostedTokens(DATA_DIR);

    const selection = await selectToken(candidates, todayPosted, recentlyPosted, metricsDir, allRegistry);

    if (!selection) {
      console.error("  ✗ Could not select a target token. Falling back to narrative poll.");
      poll = buildNarrativePoll();
    } else {
      const { token } = selection;
      selectedTokenId = token.id;
      console.log(`  ✦ Selected: ${token.name} (${token.symbol.toUpperCase()})`);
      console.log(`  ✦ Reason: ${selection.reason}`);

      // Load metrics if available
      let metric: MetricData | undefined;
      const metricsFile = path.join(metricsDir, `${token.id}.json`);
      if (fs.existsSync(metricsFile)) {
        metric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
      }

      if (pollType === "sentiment") {
        poll = buildSentimentPoll(token, metric);
      } else {
        poll = buildPredictionPoll(token);
      }
    }
  }

  // ── Preview ──
  console.log(`\n  ── Poll Preview ──`);
  console.log(`  Text: ${poll.text}`);
  console.log(`  Options: ${poll.options.join(" | ")}`);
  console.log(`  Duration: ${poll.durationMinutes} min`);

  if (dryRun) {
    console.log(`\n=== DRY RUN MODE — no post sent ===`);
    return;
  }

  // ── Post ──
  console.log(`\n▶ Step 3: Posting to X...`);
  try {
    const result = await postPoll(poll);
    console.log(`✅ Posted successfully (Tweet ID: ${result.tweetId}, Native poll: ${result.native})`);

    // Save tracking
    fs.writeFileSync(
      TRACKER_FILE,
      JSON.stringify(
        {
          postedAt: new Date().toISOString(),
          pollType,
          tweetId: result.tweetId,
          nativePoll: result.native,
          tokenId: selectedTokenId || null,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await logError("post-interactive-daily", error, false);
    console.error("❌ Failed to post interactive poll:", error);
    process.exit(1);
  }
}

main().catch(async (error) => {
  await logError("post-interactive-daily", error);
  process.exit(1);
});

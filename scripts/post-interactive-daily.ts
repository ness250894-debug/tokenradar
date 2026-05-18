/**
 * TokenRadar — Interactive Daily Post for X
 *
 * Posts one interactive poll per day to X on its scheduled slot.
 * Selects from 4 poll types with deterministic controlled variety:
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
import { postPoll, postTweet, type PollOptions } from "../src/lib/x-client";
import {
  POLL_DURATION_MINUTES,
  INTERACTIVE_POST_NARRATIVES,
  SOCIAL_VARIANT_COOLDOWN_DAYS,
  SOCIAL,
} from "../src/lib/config";
import { generatePollHook } from "../src/lib/gemini";
import { sanitizeSocialEditorialText } from "../src/lib/social-editorial";
import { safeReadJson, formatErrorForLog } from "../src/lib/utils";
import { getTimeOfDay } from "../src/lib/shared-utils";
import { formatPrice } from "../src/lib/content-loader";
import { hasSocialPost, recordSocialPost } from "../src/lib/ops-ledger";
import { getRecentSocialVariantKeys } from "./lib/social-history";
import {
  type TokenData,
  type MetricData,
  cleanupExpiredCooldownFolders,
  getTodayPostedTokens,
  getRecentlyPostedTokens,
  loadCandidateTokens,
  selectToken,
} from "./lib/token-selection";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");

// ── Poll Types ─────────────────────────────────────────────────

export type PollType = "sentiment" | "prediction" | "narrative" | "community";
const POLL_TYPES: PollType[] = ["sentiment", "prediction", "narrative", "community"];

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectPollTypeForToday(options: {
  usedPollTypes?: Iterable<string>;
  date?: Date;
} = {}): PollType {
  const used = new Set(options.usedPollTypes || []);
  const eligible = POLL_TYPES.filter((type) => !used.has(type));
  const candidates = eligible.length > 0 ? eligible : POLL_TYPES;
  const date = options.date || new Date();
  return candidates[stableHash(`interactive-poll:${utcDateKey(date)}`) % candidates.length];
}

/**
 * Determine the poll type for today using deterministic controlled variety.
 */
export function getPollTypeForToday(): PollType {
  return selectPollTypeForToday();
}

function cleanPollHook(hook: string, fallback: string): string {
  return sanitizeSocialEditorialText(hook || fallback) || fallback;
}

// ── Poll Generators ────────────────────────────────────────────

/**
 * Generate a Sentiment Poll.
 */
export async function buildSentimentPoll(token: TokenData, metric?: MetricData): Promise<PollOptions> {
  const sym = token.symbol.toUpperCase();
  const hook = cleanPollHook(await generatePollHook("sentiment", getTimeOfDay(), token.name, token.symbol, {
    price: token.market.price,
    priceChange24h: token.market.priceChange24h,
    ...metric
  }), `How are you reading ${sym} today?`);

  return {
    text: `${hook}\n\n$${sym} #TokenRadarCo`,
    options: ["Strengthening", "Weakening", "Range-bound", "Just watching"],
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

/**
 * Generate a Prediction Poll.
 */
export async function buildPredictionPoll(token: TokenData): Promise<PollOptions> {
  const sym = token.symbol.toUpperCase();
  const price = token.market.price;
  const low = price * 0.95;
  const high = price * 1.05;

  const hook = cleanPollHook(await generatePollHook("prediction", getTimeOfDay(), token.name, token.symbol, {
    price: token.market.price,
    priceChange24h: token.market.priceChange24h
  }), `Which ${sym} range looks most realistic today?`);

  return {
    text: `${hook}\n\n$${sym} #PricePrediction #TokenRadarCo`,
    options: [
      `Below ${formatPrice(low)}`,
      `${formatPrice(low)}-${formatPrice(high)}`,
      `Above ${formatPrice(high)}`,
      "Needs confirmation",
    ],
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

/**
 * Generate a Narrative Poll.
 */
export async function buildNarrativePoll(): Promise<PollOptions> {
  const hook = cleanPollHook(
    await generatePollHook("narrative", getTimeOfDay()),
    "Which crypto narrative deserves more research this week?",
  );
  return {
    text: `${hook}\n\n#TokenRadarCo`,
    options: [...INTERACTIVE_POST_NARRATIVES],
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

/**
 * Generate a Community Vote Poll.
 */
export async function buildCommunityPoll(candidates: TokenData[]): Promise<PollOptions> {
  // Pick 4 interesting tokens
  const sorted = [...candidates]
    .sort((a, b) => b.market.priceChange24h - a.market.priceChange24h)
    .slice(0, 4);

  // Fallback
  if (sorted.length < 2) return buildNarrativePoll();

  const options = sorted.map((t) => `$${t.symbol.toUpperCase()}`);
  const hook = cleanPollHook(
    await generatePollHook("community vote", getTimeOfDay()),
    "Which token should get a deeper data review?",
  );

  return {
    text: `${hook}\n\n#TokenRadarCo`,
    options,
    durationMinutes: POLL_DURATION_MINUTES,
  };
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const includeLinkReply = args.includes("--link-reply");

  const typeIdx = args.indexOf("--type");
  const forcedType = typeIdx !== -1 ? (args[typeIdx + 1] as PollType) : undefined;

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Interactive Daily Post (X)     ║`);
  console.log(`╚══════════════════════════════════════════════╝`);
  console.log();

  const TODAY = new Date().toISOString().split("T")[0];
  const POSTED_DIR = path.join(DATA_DIR, "posted", TODAY);
  const TRACKER_FILE = path.join(POSTED_DIR, "interactive-daily.json");
  const socialPostKey = `${TODAY}:interactive-poll`;
  cleanupExpiredCooldownFolders(DATA_DIR);

  // ── Dedup check ──
  if (!dryRun && (fs.existsSync(TRACKER_FILE) || await hasSocialPost("x", socialPostKey))) {
    const existing = safeReadJson<{ postedAt?: string }>(TRACKER_FILE, {});
    console.log(`  ⚠ Interactive post already sent today (${existing.postedAt || "D1 ledger"}). Exiting.`);
    return;
  }

  if (!fs.existsSync(POSTED_DIR)) fs.mkdirSync(POSTED_DIR, { recursive: true });

  // ── Credential check ──
  if (!dryRun) {
    if (!process.env.X_OAUTH2_CLIENT_ID || !process.env.X_OAUTH2_CLIENT_SECRET || !process.env.X_OAUTH2_REFRESH_TOKEN) {
      console.error("  ✗ Missing X (Twitter) OAuth 2.0 credentials.");
      process.exit(1);
    }
  }

  // ── Determine poll type ──
  const runDate = new Date(`${TODAY}T00:00:00.000Z`);
  const usedPollTypes = getRecentSocialVariantKeys(
    DATA_DIR,
    "x",
    SOCIAL_VARIANT_COOLDOWN_DAYS,
    runDate,
    "interactive-poll",
  );
  const pollType = forcedType || selectPollTypeForToday({ usedPollTypes, date: runDate });
  console.log(`  Poll Type: ${pollType}${forcedType ? " (forced)" : " (controlled variety)"}`);
  console.log(`  Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  // ── Load candidate tokens ──
  console.log(`▶ Step 1: Loading candidate tokens...`);
  const metricsDir = path.join(DATA_DIR, "metrics");
  const { candidates, allRegistry, onWebsiteIds } = await loadCandidateTokens(DATA_DIR);

  console.log(`  Candidates: ${candidates.length}`);

  if (candidates.length === 0) {
    console.error("  ✗ No candidate tokens found.");
    process.exit(1);
  }

  // ── Build poll ──
  console.log(`\n▶ Step 2: Building ${pollType} poll...`);

  let poll: PollOptions;
  let selectedTokenId: string | undefined;
  let selectedTokenSymbol: string | undefined;

  if (pollType === "narrative") {
    // Narrative polls don't need a specific token
    poll = await buildNarrativePoll();
  } else if (pollType === "community") {
    poll = await buildCommunityPoll(candidates);
  } else {
    // Sentiment & Prediction need a specific token
    const todayPosted = getTodayPostedTokens(DATA_DIR, TODAY);
    const recentlyPosted = getRecentlyPostedTokens(DATA_DIR);

    const selection = await selectToken(candidates, todayPosted, recentlyPosted, metricsDir, allRegistry, onWebsiteIds, "x");

    if (!selection) {
      console.error("  ✗ Could not select a target token. Falling back to narrative poll.");
      poll = await buildNarrativePoll();
    } else {
      const { token } = selection;
      selectedTokenId = token.id;
      selectedTokenSymbol = token.symbol.toUpperCase();
      console.log(`  ✦ Selected: ${token.name} (${token.symbol.toUpperCase()})`);
      console.log(`  ✦ Reason: ${selection.reason}`);

      // Load metrics if available
      let metric: MetricData | undefined;
      const metricsFile = path.join(metricsDir, `${token.id}.json`);
      if (fs.existsSync(metricsFile)) {
        metric = safeReadJson<MetricData>(metricsFile, undefined as unknown as MetricData) || undefined;
      }

      if (pollType === "sentiment") {
        poll = await buildSentimentPoll(token, metric);
      } else {
        poll = await buildPredictionPoll(token);
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

    // ── Post Reply (External Link) ──
    if (includeLinkReply) {
      try {
        const displaySym = selectedTokenSymbol || "";
        const isOnWebsite = selectedTokenId ? onWebsiteIds.has(selectedTokenId) : false;
        const replyText = isOnWebsite 
          ? `Vote above and find the $${displaySym} profile through TokenRadar links:\n\n${SOCIAL.ecosystemUrl}`
          : `Vote above and follow what's driving crypto markets through TokenRadar links:\n\n${SOCIAL.ecosystemUrl}`;
        
        const replyId = await postTweet(replyText, result.tweetId);
        console.log(`✅ Posted self-reply link successfully (Tweet ID: ${replyId})`);
      } catch (err) {
        console.warn(`  ⚠ Failed to post self-reply link: ${formatErrorForLog(err)}`);
      }
    }

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
          xText: poll.text,
          variantKey: pollType,
          variantLabel: pollType,
          variantSurface: "interactive-poll",
        },
        null,
        2,
      ),
    );
    await recordSocialPost({
      platform: "x",
      contentKey: socialPostKey,
      externalId: result.tweetId,
      details: {
        pollType,
        nativePoll: result.native,
        tokenId: selectedTokenId || null,
        variantSurface: "interactive-poll",
      },
    });
  } catch (error) {
    await logError("post-interactive-daily", error, false);
    console.error(`❌ Failed to post interactive poll: ${formatErrorForLog(error)}`);
    process.exit(1);
  }
}

// Entry Point (only run if executed directly)
const isEntryPoint = process.argv[1]?.endsWith("post-interactive-daily.ts");

if (isEntryPoint) {
  main().catch(async (error) => {
    await logError("post-interactive-daily", error);
    process.exit(1);
  });
}

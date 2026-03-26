/**
 * TokenRadar — Shared Token Selection Logic
 *
 * Extracted from post-market-updates.ts so that both market-update
 * and interactive-daily scripts share one token selection pipeline.
 */

import * as fs from "fs";
import * as path from "path";
import { fetchTokensByRank, CoinGeckoToken, fetchTrendingCoins } from "../../src/lib/coingecko";
import { fetchXTrends, matchTrendsToTokens } from "../../src/lib/x-client";
import { STABLECOIN_IDS } from "../../src/lib/config";
import { safeReadJson } from "../../src/lib/utils";

// ── Types ──────────────────────────────────────────────────────

export interface MetricData {
  riskScore: number;
  riskLevel: string;
  growthPotentialIndex: number;
}

export interface TokenData {
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
export type SelectionReason =
  | "trending-coingecko"
  | "trending-x"
  | "top-gainer"
  | "safe-play"
  | "spotlight";

export interface SelectionResult {
  token: TokenData;
  reason: SelectionReason;
  trendingContext?: string;
}

// ── Deduplication ──────────────────────────────────────────────

/**
 * Get all token IDs that have been posted today.
 * Checks both legacy tracker file and the daily folder structure.
 */
export function getTodayPostedTokens(dataDir: string, today: string): Set<string> {
  const posted = new Set<string>();

  // 1. Check legacy file
  const legacyFile = path.join(dataDir, "posted-today.json");
  if (fs.existsSync(legacyFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(legacyFile, "utf-8"));
      if (parsed.date === today && Array.isArray(parsed.tokens)) {
        parsed.tokens.forEach((t: string) => posted.add(t));
      }
    } catch (_e) { /* ignore */ }
  }

  // 2. Scan today's posted folder
  const todayDir = path.join(dataDir, "posted", today);
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
export function getRecentlyPostedTokens(dataDir: string): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(dataDir, "posted");
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

// ── Data Loading ───────────────────────────────────────────────

/**
 * Load candidate tokens from local data merged with fresh CoinGecko prices.
 *
 * @param dataDir - Path to `data/` directory
 * @param startRank - Minimum rank to include
 * @param endRank - Maximum rank to include
 * @returns Filtered & merged token array and the full registry for trend matching
 */
export async function loadCandidateTokens(
  dataDir: string,
  startRank: number = 1,
  endRank: number = 250,
): Promise<{ candidates: TokenData[]; allRegistry: { id: string; name: string; symbol: string }[] }> {
  // Fetch fresh market data
  let freshMarkets: CoinGeckoToken[] = [];
  try {
    freshMarkets = await fetchTokensByRank(1, 250);
    console.log(` ✓ Received ${freshMarkets.length} tokens from CoinGecko`);
  } catch (e) {
    console.warn(`  ⚠ Failed to fetch live data: ${e instanceof Error ? e.message : String(e)}`);
    console.warn(`    Falling back to local data only.`);
  }

  const tokensDir = path.join(dataDir, "tokens");
  if (!fs.existsSync(tokensDir)) {
    throw new Error("data/tokens/ directory not found. Run fetch logic first.");
  }

  const tokenFiles = fs.readdirSync(tokensDir).filter((f) => f.endsWith(".json"));

  // Merge fresh market data with local static details
  const tokens: TokenData[] = tokenFiles.map((f) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const local: any = safeReadJson(path.join(tokensDir, f), null);
    if (!local || !local.id) return null;
    const fresh = freshMarkets.find((t) => t.id === local.id);

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
      },
    };
  }).filter(Boolean) as TokenData[];

  // Filter by rank + exclude stablecoins
  const candidates = tokens.filter(
    (t) => t.rank >= startRank && t.rank <= endRank && !STABLECOIN_IDS.has(t.id),
  );

  const allRegistry = tokens.map((t) => ({ id: t.id, name: t.name, symbol: t.symbol }));

  return { candidates, allRegistry };
}

// ── Priority-Based Token Selection ─────────────────────────────

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
export async function selectToken(
  candidateTokens: TokenData[],
  todayPosted: Set<string>,
  recentlyPosted: Set<string>,
  metricsDir: string,
  allTokens: { id: string; name: string; symbol: string }[],
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
            token.name.toLowerCase().replace(/[^a-z0-9]/g, ""),
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

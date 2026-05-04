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
import { STABLECOIN_IDS, TRENDING_COOLDOWN_DAYS, GENERAL_COOLDOWN_DAYS } from "../../src/lib/config";
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
  community?: {
    twitterFollowers?: number | null;
    redditSubscribers?: number | null;
  };
  developer?: {
    commits4Weeks?: number | null;
  };
  market: {
    price: number;
    priceChange24h: number;
    marketCap: number;
    marketCapRank: number;
    volume24h: number;
  };
}

/** Why this token was selected — used for logging and AI context. */
export type SelectionReason =
  | "trending-coingecko"
  | "trending-x"
  | "newly-published"
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
 * 
 * @param platform - Optional platform to filter by (e.g., "telegram", "x"). 
 *                   If provided, includes platform-specific AND global trackers.
 *                   If omitted, includes ALL trackers (global cooldown).
 */
export function getTodayPostedTokens(dataDir: string, today: string, platform?: string): Set<string> {
  const posted = new Set<string>();

  // 1. Check legacy file (always global)
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
      if (!f.endsWith(".json")) return;
      const fileName = f.replace(".json", "");
      
      const isTG = fileName.endsWith("-telegram");
      const isX = fileName.endsWith("-x");
      const baseId = fileName.replace("-telegram", "").replace("-x", "");

      if (!platform || platform === "all") {
        // Global cooldown: any post blocks everything
        posted.add(baseId);
      } else if (platform === "telegram") {
        // Telegram cooldown: blocked by global posts or TG-specific posts
        if (!isX) posted.add(baseId);
      } else if (platform === "x") {
        // X cooldown: blocked by global posts or X-specific posts
        if (!isTG) posted.add(baseId);
      }
    });
  }

  return posted;
}

/**
 * Get all token IDs posted within the last N days.
 * 
 * @param platform - Optional platform to filter by.
 */
export function getTokensPostedWithinDays(dataDir: string, days: number, platform?: string): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(dataDir, "posted");
  if (!fs.existsSync(parentDir)) return posted;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const dateDirs = fs.readdirSync(parentDir)
    .filter((d) => {
      const fullPath = path.join(parentDir, d);
      return fs.statSync(fullPath).isDirectory() && !isNaN(new Date(d).getTime());
    });

  for (const dateDir of dateDirs) {
    if (new Date(dateDir) >= cutoff) {
      const dirPath = path.join(parentDir, dateDir);
      fs.readdirSync(dirPath).forEach((f) => {
        if (!f.endsWith(".json")) return;
        const fileName = f.replace(".json", "");
        
        const isTG = fileName.endsWith("-telegram");
        const isX = fileName.endsWith("-x");
        const baseId = fileName.replace("-telegram", "").replace("-x", "");

        if (!platform || platform === "all") {
          posted.add(baseId);
        } else if (platform === "telegram") {
          if (!isX) posted.add(baseId);
        } else if (platform === "x") {
          if (!isTG) posted.add(baseId);
        }
      });
    }
  }

  return posted;
}

/**
 * Get all token IDs posted in the last GENERAL_COOLDOWN_DAYS (default 30).
 */
export function getRecentlyPostedTokens(dataDir: string, platform?: string): Set<string> {
  return getTokensPostedWithinDays(dataDir, GENERAL_COOLDOWN_DAYS, platform);
}

/**
 * Get all token IDs posted within the trending cooldown window.
 */
export function getTrendingCooldownTokens(dataDir: string, platform?: string): Set<string> {
  return getTokensPostedWithinDays(dataDir, TRENDING_COOLDOWN_DAYS, platform);
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
): Promise<{ 
  candidates: TokenData[]; 
  allRegistry: { id: string; name: string; symbol: string }[];
  onWebsiteIds: Set<string>;
}> {
  // Only tokens with an overview page should deep-link back into the site.
  const contentDir = path.resolve(dataDir, "..", "content", "tokens");
  const onWebsiteIds = new Set<string>();
  if (fs.existsSync(contentDir)) {
    const tokenDirs = fs.readdirSync(contentDir).filter((entry) => {
      const tokenDir = path.join(contentDir, entry);
      return fs.statSync(tokenDir).isDirectory() && fs.existsSync(path.join(tokenDir, "overview.json"));
    });
    tokenDirs.forEach((tokenId) => onWebsiteIds.add(tokenId));
    console.log(` ✓ Verified ${onWebsiteIds.size} token overview pages on the website.`);
  }

  // Fetch fresh market data
  let freshMarkets: CoinGeckoToken[] = [];
  try {
    freshMarkets = await fetchTokensByRank(startRank, endRank);
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
    const local: any = safeReadJson(path.join(tokensDir, f), null);
    if (!local || !local.id) return null;
    const fresh = freshMarkets.find((t) => t.id === local.id);

    return {
      id: local.id,
      symbol: local.symbol,
      name: local.name,
      rank: fresh?.market_cap_rank || local.market?.marketCapRank || 999,
      description: local.description || "",
      community: {
        twitterFollowers: local.community?.twitterFollowers ?? null,
        redditSubscribers: local.community?.redditSubscribers ?? null,
      },
      developer: {
        commits4Weeks: local.developer?.commits4Weeks ?? null,
      },
      market: {
        price: fresh?.current_price || local.market?.price || 0,
        // Only trust priceChange24h from live API — stale local values
        // can be wildly outdated (e.g., 588,000% from a one-time pump)
        // and permanently dominate the top-gainer selection.
        priceChange24h: fresh?.price_change_percentage_24h ?? 0,
        marketCap: fresh?.market_cap || local.market?.marketCap || 0,
        marketCapRank: fresh?.market_cap_rank || local.market?.marketCapRank || 999,
        volume24h: fresh?.total_volume || local.market?.volume24h || 0,
      },
    };
  }).filter(Boolean) as TokenData[];

  // Filter by rank + exclude stablecoins
  const candidates = tokens.filter(
    (t) => t.rank >= startRank && t.rank <= endRank && !STABLECOIN_IDS.has(t.id),
  );

  const allRegistry = tokens.map((t) => ({ id: t.id, name: t.name, symbol: t.symbol }));

  return { candidates, allRegistry, onWebsiteIds };
}

// ── Trending Strategy Helpers ──────────────────────────────────

/** Check CoinGecko trending and return the first eligible token. */
async function tryCoinGeckoTrending(
  candidateTokens: TokenData[],
  cooldownPosted: Set<string>,
  priorityLabel: string,
): Promise<SelectionResult | null> {
  console.log(`\n  ▸ ${priorityLabel}: Checking CoinGecko trending...`);
  try {
    const trendingCoins = await fetchTrendingCoins();
    if (trendingCoins.length > 0) {
      console.log(`    Found ${trendingCoins.length} trending coins on CoinGecko`);
      for (const trending of trendingCoins) {
        if (cooldownPosted.has(trending.id)) {
          console.log(`    ✗ ${trending.name} (${trending.symbol}) — posted within cooldown window`);
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
  return null;
}

/** Check X trending and return the first eligible token. */
async function tryXTrending(
  candidateTokens: TokenData[],
  cooldownPosted: Set<string>,
  allTokens: { id: string; name: string; symbol: string }[],
  priorityLabel: string,
): Promise<SelectionResult | null> {
  console.log(`  ▸ ${priorityLabel}: Checking X Trends...`);
  try {
    const xTrends = await fetchXTrends();
    if (xTrends.length > 0) {
      const matchedIds = matchTrendsToTokens(xTrends, allTokens);
      console.log(`    Found ${xTrends.length} X trends, ${matchedIds.length} matched crypto tokens`);
      for (const tokenId of matchedIds) {
        if (cooldownPosted.has(tokenId)) {
          console.log(`    ✗ ${tokenId} — posted within cooldown window`);
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
      console.log("    No X trends available.");
    }
  } catch (e) {
    console.warn(`    ⚠ X Trends failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  return null;
}

// ── Priority-Based Token Selection ─────────────────────────────

/**
 * Select the best token to post about using a priority-based strategy.
 *
 * Trending priority varies by platform:
 *   - X:        X trending → CoinGecko → Gainer → Safe → Spotlight
 *   - Telegram: CoinGecko → X trending → Gainer → Safe → Spotlight
 *
 * Cooldowns (configurable in config.ts):
 *   - Trending strategies use TRENDING_COOLDOWN_DAYS (default 3 days)
 *   - Lower priorities (3-5) use GENERAL_COOLDOWN_DAYS (default 30 days)
 *
 * @param platform - "x" or "telegram" (defaults to "telegram" priority order)
 */
export async function selectToken(
  candidateTokens: TokenData[],
  todayPosted: Set<string>,
  recentlyPosted: Set<string>,
  metricsDir: string,
  allTokens: { id: string; name: string; symbol: string }[],
  onWebsiteIds: Set<string> = new Set(),
  platform: "x" | "telegram" | "all" = "telegram",
  force: boolean = false
): Promise<SelectionResult | null> {

  // Trending cooldown: tokens posted within TRENDING_COOLDOWN_DAYS are skipped
  // This is a superset of todayPosted (includes today + previous N days)
  const trendingCooldown = force ? new Set<string>() : new Set([...todayPosted, ...getTrendingCooldownTokens(path.resolve(metricsDir, ".."), platform)]);

  // ── Trending priorities (platform-dependent) ──
  const useXFirst = platform === "x";

  // First trending check
  const first = useXFirst
    ? await tryXTrending(candidateTokens, trendingCooldown, allTokens, "Priority 1")
    : await tryCoinGeckoTrending(candidateTokens, trendingCooldown, "Priority 1");
  if (first) return first;

  // Second trending check
  const second = useXFirst
    ? await tryCoinGeckoTrending(candidateTokens, trendingCooldown, "Priority 2")
    : await tryXTrending(candidateTokens, trendingCooldown, allTokens, "Priority 2");
  if (second) return second;

  // ── Priority 3: Newly Published Articles ──
  console.log("  ▸ Priority 3: Checking newly published articles...");
  const contentDir = path.resolve(metricsDir, "..", "..", "content", "tokens");
  const newlyPublished: TokenData[] = [];
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

  for (const tokenId of onWebsiteIds) {
    if (todayPosted.has(tokenId) || recentlyPosted.has(tokenId)) continue;
    
    try {
      const overviewPath = path.join(contentDir, tokenId, "overview.json");
      if (fs.existsSync(overviewPath)) {
        const stats = fs.statSync(overviewPath);
        const age = Date.now() - stats.mtimeMs;
        if (age < FORTY_EIGHT_HOURS_MS) {
          const token = candidateTokens.find(t => t.id === tokenId);
          if (token) newlyPublished.push(token);
        }
      }
    } catch (_e) { /* ignore */ }
  }

  if (newlyPublished.length > 0) {
    // Pick the most recent one
    const target = newlyPublished[0]; 
    console.log(`    ✓ Selected: ${target.name} (newly published article)`);
    return { token: target, reason: "newly-published" };
  }
  console.log("    No eligible newly published articles found.");

  // ── Priority 4: Top Gainer ──
  console.log("  ▸ Priority 4: Checking top gainers...");
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

  // ── Priority 5: Safe Play ──
  console.log("  ▸ Priority 5: Checking safe plays...");
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

  // ── Priority 6: Spotlight (fallback) ──
  console.log("  ▸ Priority 6: Fallback to random spotlight...");
  const available = candidateTokens.filter((t) => !todayPosted.has(t.id));
  if (available.length > 0) {
    const target = available[Math.floor(Math.random() * available.length)];
    console.log(`    ✓ Selected: ${target.name} (spotlight)`);
    return { token: target, reason: "spotlight" };
  }

  // Absolute fallback: any candidate (all have been posted today)
  if (force) {
    console.log("    ⚠ All candidates posted today. Selecting any candidate due to --force...");
    const target = candidateTokens[Math.floor(Math.random() * candidateTokens.length)];
    return target ? { token: target, reason: "spotlight" } : null;
  }

  console.log("    ✗ All eligible candidates are currently on cooldown. Stopping to avoid duplicate posts.");
  return null;
}

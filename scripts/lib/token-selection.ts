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
import {
  STABLECOIN_IDS,
  TRENDING_COOLDOWN_DAYS,
  GENERAL_COOLDOWN_DAYS,
  VIDEO_COOLDOWN_DAYS,
  VIDEO_FORMAT_COOLDOWN_DAYS,
} from "../../src/lib/config";
import { safeReadJson } from "../../src/lib/utils";

// ── Types ──────────────────────────────────────────────────────

export interface MetricData {
  riskScore: number;
  riskLevel: string;
  growthPotentialIndex: number;
  computedAt?: string;
}

export interface TokenData {
  id: string;
  symbol: string;
  name: string;
  imageUrl?: string;
  fetchedAt?: string;
  lastMarketUpdate?: string;
  marketDataSource?: "coingecko-live" | "local-cache";
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

type TrackerPlatform = "telegram" | "x" | "instagram" | "threads" | "youtube" | "tiktok";
type TrendSource = "coingecko" | "x";

interface CleanupOptions {
  now?: Date;
  postedRetentionDays?: number;
  videoRetentionDays?: number;
}

export interface CleanupResult {
  posted: string[];
  postedVideo: string[];
}

const DATE_DIR_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOCIAL_IMAGE_TEXT_RE = /^[\x20-\x7E]+$/;
const MIN_SOCIAL_VOLUME_24H = 50_000;
const MIN_SOCIAL_VOLUME_TO_CAP_RATIO = 0.001;
const MIN_NEWLY_PUBLISHED_ABS_CHANGE_24H = 1;
const MIN_NEWLY_PUBLISHED_VOLUME_TO_CAP_RATIO = 0.005;
const TRACKER_PLATFORMS = new Set<TrackerPlatform>([
  "telegram",
  "x",
  "instagram",
  "threads",
  "youtube",
  "tiktok",
]);

export function getAutomatedTrendSources(platform: "x" | "telegram" | "all" = "telegram"): TrendSource[] {
  // X's automation rules prohibit automatically posting about X trending topics.
  // Treat "all" as X-capable and keep X trends out of any multi-platform selection.
  return platform === "telegram" ? ["coingecko", "x"] : ["coingecko"];
}

export function hasSocialImageSafeText(token: { symbol?: string; name?: string }): boolean {
  return Boolean(
    token.symbol &&
    token.name &&
    SOCIAL_IMAGE_TEXT_RE.test(token.symbol) &&
    SOCIAL_IMAGE_TEXT_RE.test(token.name),
  );
}

function volumeToMarketCapRatio(token: TokenData): number {
  const { volume24h, marketCap } = token.market;
  if (!Number.isFinite(volume24h) || !Number.isFinite(marketCap) || marketCap <= 0) return 0;
  return volume24h / marketCap;
}

function hasUsableSocialMarketData(token: TokenData): boolean {
  const market = token.market;
  if (!Number.isFinite(market.price) || market.price <= 0) return false;
  if (!Number.isFinite(market.marketCap) || market.marketCap <= 0) return false;
  if (!Number.isFinite(market.volume24h) || market.volume24h <= 0) return false;

  return market.volume24h >= MIN_SOCIAL_VOLUME_24H ||
    volumeToMarketCapRatio(token) >= MIN_SOCIAL_VOLUME_TO_CAP_RATIO;
}

function hasNewlyPublishedSocialActivity(token: TokenData): boolean {
  if (!hasUsableSocialMarketData(token)) return false;

  return Math.abs(token.market.priceChange24h) >= MIN_NEWLY_PUBLISHED_ABS_CHANGE_24H ||
    volumeToMarketCapRatio(token) >= MIN_NEWLY_PUBLISHED_VOLUME_TO_CAP_RATIO;
}

function dateKey(date: Date): string {
  return date.toISOString().split("T")[0];
}

function dateKeyDaysAgo(days: number, now: Date): string {
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  startOfToday.setUTCDate(startOfToday.getUTCDate() - days);
  return dateKey(startOfToday);
}

function isDateDirName(value: string): boolean {
  return DATE_DIR_RE.test(value);
}

function isKnownGenericTracker(fileName: string): boolean {
  return fileName === "interactive-daily" ||
    fileName === "daily-telegram-movers" ||
    fileName === "daily-telegram-poll" ||
    fileName === "daily-instagram-movers" ||
    fileName === "daily-threads-text";
}

function getPayloadTokenIds(payload: Record<string, unknown> | null): string[] {
  if (!payload) return [];

  const ids: string[] = [];
  const tokenId = payload.tokenId;
  if (typeof tokenId === "string" && tokenId.trim().length > 0) {
    ids.push(tokenId);
  }

  for (const key of ["movers", "tokenIds"]) {
    const value = payload[key];
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (typeof item === "string" && item.trim().length > 0) {
        ids.push(item);
      }
    }
  }

  return ids;
}

function getTrackerPlatform(fileName: string, payload: Record<string, unknown> | null): TrackerPlatform | undefined {
  if (typeof payload?.platform === "string" && TRACKER_PLATFORMS.has(payload.platform as TrackerPlatform)) {
    return payload.platform as TrackerPlatform;
  }
  if (fileName === "interactive-daily") return "x";
  if (fileName === "daily-telegram-movers" || fileName === "daily-telegram-poll") return "telegram";
  if (fileName === "daily-instagram-movers") return "instagram";
  if (fileName === "daily-threads-text") return "threads";

  const legacyPlatform = fileName.match(/-(telegram|x|instagram|threads|youtube|tiktok)-[a-z0-9]+$/);
  if (legacyPlatform?.[1] && TRACKER_PLATFORMS.has(legacyPlatform[1] as TrackerPlatform)) {
    return legacyPlatform[1] as TrackerPlatform;
  }

  return undefined;
}

function getFileTokenId(fileName: string, trackerPlatform: TrackerPlatform | undefined): string | null {
  if (isKnownGenericTracker(fileName)) return null;

  if (trackerPlatform) {
    const randomSuffix = new RegExp(`^(.+)-${trackerPlatform}-[a-z0-9]+$`);
    const randomMatch = fileName.match(randomSuffix);
    if (randomMatch?.[1]) return randomMatch[1];

    const platformSuffix = `-${trackerPlatform}`;
    if (fileName.endsWith(platformSuffix)) {
      return fileName.slice(0, -platformSuffix.length);
    }
  }

  return fileName;
}

function addPostedToken(
  posted: Set<string>,
  tokenId: string,
  trackerPlatform: TrackerPlatform | undefined,
  requestedPlatform?: string,
): void {
  if (!tokenId) return;

  if (!requestedPlatform || requestedPlatform === "all") {
    posted.add(tokenId);
    return;
  }

  if (requestedPlatform === "telegram") {
    if (trackerPlatform !== "x") posted.add(tokenId);
    return;
  }

  if (requestedPlatform === "x") {
    if (trackerPlatform !== "telegram") posted.add(tokenId);
    return;
  }

  if (TRACKER_PLATFORMS.has(requestedPlatform as TrackerPlatform)) {
    if (!trackerPlatform || trackerPlatform === requestedPlatform) posted.add(tokenId);
  }
}

function addPostedTokensFromTrackerFile(
  posted: Set<string>,
  filePath: string,
  requestedPlatform?: string,
): void {
  const fileName = path.basename(filePath, ".json");
  const payload = safeReadJson<Record<string, unknown> | null>(filePath, null);
  const trackerPlatform = getTrackerPlatform(fileName, payload);
  const payloadTokenIds = getPayloadTokenIds(payload);

  if (payloadTokenIds.length > 0) {
    for (const tokenId of payloadTokenIds) {
      addPostedToken(posted, tokenId, trackerPlatform, requestedPlatform);
    }
    return;
  }

  const fileTokenId = getFileTokenId(fileName, trackerPlatform);
  if (fileTokenId) {
    addPostedToken(posted, fileTokenId, trackerPlatform, requestedPlatform);
  }
}

function addPostedTokensFromDateDir(
  posted: Set<string>,
  dirPath: string,
  requestedPlatform?: string,
): void {
  if (!fs.existsSync(dirPath)) return;

  for (const file of fs.readdirSync(dirPath)) {
    if (!file.endsWith(".json")) continue;
    addPostedTokensFromTrackerFile(posted, path.join(dirPath, file), requestedPlatform);
  }
}

function pruneExpiredDateDirs(parentDir: string, cutoffKey: string): string[] {
  const removed: string[] = [];
  if (!fs.existsSync(parentDir)) return removed;

  for (const entry of fs.readdirSync(parentDir)) {
    if (!isDateDirName(entry) || entry >= cutoffKey) continue;

    const fullPath = path.join(parentDir, entry);
    if (!fs.statSync(fullPath).isDirectory()) continue;

    fs.rmSync(fullPath, { recursive: true, force: true });
    removed.push(entry);
  }

  return removed;
}

/**
 * Remove expired cooldown date folders after their retention windows pass.
 */
export function cleanupExpiredCooldownFolders(dataDir: string, options: CleanupOptions = {}): CleanupResult {
  const now = options.now ?? new Date();
  const postedRetentionDays = options.postedRetentionDays ?? GENERAL_COOLDOWN_DAYS;
  const videoRetentionDays = options.videoRetentionDays ?? Math.max(VIDEO_COOLDOWN_DAYS, VIDEO_FORMAT_COOLDOWN_DAYS);

  const postedCutoff = dateKeyDaysAgo(postedRetentionDays, now);
  const videoCutoff = dateKeyDaysAgo(videoRetentionDays, now);

  return {
    posted: pruneExpiredDateDirs(path.join(dataDir, "posted"), postedCutoff),
    postedVideo: pruneExpiredDateDirs(path.join(dataDir, "posted_video"), videoCutoff),
  };
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
  addPostedTokensFromDateDir(posted, path.join(dataDir, "posted", today), platform);

  return posted;
}

/**
 * Get all token IDs posted within the last N days.
 * 
 * @param platform - Optional platform to filter by.
 */
export function getTokensPostedWithinDays(dataDir: string, days: number, platform?: string, now: Date = new Date()): Set<string> {
  const posted = new Set<string>();
  const parentDir = path.join(dataDir, "posted");
  if (!fs.existsSync(parentDir)) return posted;

  const cutoffKey = dateKeyDaysAgo(days, now);

  const dateDirs = fs.readdirSync(parentDir)
    .filter((d) => {
      const fullPath = path.join(parentDir, d);
      return fs.statSync(fullPath).isDirectory() && isDateDirName(d);
    });

  for (const dateDir of dateDirs) {
    if (dateDir >= cutoffKey) {
      addPostedTokensFromDateDir(posted, path.join(parentDir, dateDir), platform);
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
    const freshRecord = fresh as Record<string, unknown> | undefined;
    const freshMarketTimestamp = fresh
      ? typeof freshRecord?.last_updated === "string" && freshRecord.last_updated
        ? freshRecord.last_updated
        : new Date().toISOString()
      : undefined;
    const localFetchedAt = typeof local.fetchedAt === "string" ? local.fetchedAt : undefined;
    const localLastMarketUpdate = typeof local.lastMarketUpdate === "string" ? local.lastMarketUpdate : localFetchedAt;

    return {
      id: local.id,
      symbol: local.symbol,
      name: local.name,
      imageUrl: fresh?.image || local.imageUrl || local.image?.large || local.image?.small || undefined,
      fetchedAt: freshMarketTimestamp || localFetchedAt,
      lastMarketUpdate: freshMarketTimestamp || localLastMarketUpdate,
      marketDataSource: fresh ? "coingecko-live" : "local-cache",
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
 *   - X/all:    CoinGecko only, then Gainer → Safe → Spotlight
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
  const trendSources = getAutomatedTrendSources(platform);

  for (const [index, source] of trendSources.entries()) {
    const priorityLabel = `Priority ${index + 1}`;
    const selection = source === "coingecko"
      ? await tryCoinGeckoTrending(candidateTokens, trendingCooldown, priorityLabel)
      : await tryXTrending(candidateTokens, trendingCooldown, allTokens, priorityLabel);
    if (selection) return selection;
  }

  if (!trendSources.includes("x")) {
    console.log("  ▸ Skipping X Trends for this route to avoid automated X trend-chasing.");
  }

  // ── Priority 3: Newly Published Articles ──
  console.log("  ▸ Priority 3: Checking newly published articles...");
  const contentDir = path.resolve(metricsDir, "..", "..", "content", "tokens");
  const newlyPublished: Array<{ token: TokenData; publishedAtMs: number }> = [];
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
          if (!token) continue;
          if (hasNewlyPublishedSocialActivity(token)) {
            newlyPublished.push({ token, publishedAtMs: stats.mtimeMs });
          } else {
            console.log(`    - Skipping ${token.name}: newly published but market activity is too thin for a social post.`);
          }
        }
      }
    } catch (_e) { /* ignore */ }
  }

  if (newlyPublished.length > 0) {
    const target = newlyPublished
      .sort((a, b) =>
        b.publishedAtMs - a.publishedAtMs ||
        Math.abs(b.token.market.priceChange24h) - Math.abs(a.token.market.priceChange24h)
      )[0].token;
    console.log(`    ✓ Selected: ${target.name} (newly published article)`);
    return { token: target, reason: "newly-published" };
  }
  console.log("    No eligible newly published articles found.");

  // ── Priority 4: Top Gainer ──
  console.log("  ▸ Priority 4: Checking top gainers...");
  const gainers = candidateTokens
    .filter((t) =>
      !todayPosted.has(t.id) &&
      !recentlyPosted.has(t.id) &&
      t.market.priceChange24h > 2 &&
      hasUsableSocialMarketData(t)
    )
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
    if (token && hasUsableSocialMarketData(token)) safePlays.push(token);
  }

  if (safePlays.length > 0) {
    const target = safePlays[Math.floor(Math.random() * safePlays.length)];
    console.log(`    ✓ Selected: ${target.name} (safe play)`);
    return { token: target, reason: "safe-play" };
  }
  console.log("    No eligible safe plays found.");

  // ── Priority 6: Spotlight (fallback) ──
  console.log("  ▸ Priority 6: Fallback to random spotlight...");
  const available = candidateTokens.filter((t) =>
    !todayPosted.has(t.id) &&
    !recentlyPosted.has(t.id) &&
    hasUsableSocialMarketData(t)
  );
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

/**
 * CoinGecko API client with built-in rate limiting and caching.
 *
 * Free tier limits:
 * - 30 calls/minute
 * - 10,000 calls/month
 *
 * This client enforces:
 * - 2-second delay between requests
 * - Local JSON file caching (configurable TTL)
 * - Monthly call counter with auto-pause at 9,000
 */

import * as fs from "fs";
import * as path from "path";
import { logError } from "./reporter";
import { sleep } from "./shared-utils";

import { Coingecko } from "@coingecko/coingecko-typescript";
import { fetchWithRetry } from "./fetch-with-retry";

// ── Constants & Configuration ───────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const COUNTER_FILE = path.join(CACHE_DIR, "api-counter.json");
const RATE_LIMIT_DELAY_MS = 2100; // 2.1s between requests
const MONTHLY_LIMIT = 9000; // Strictly safe within user limit

// ── SDK Initialization ────────────────────────────────────────

/** Singleton SDK client instance. */
let _client: Coingecko | null = null;

function getClient(): Coingecko {
  if (!_client) {
    const apiKey = process.env.COINGECKO_API_KEY;
    // Determine if it's a demo or pro key based on prefix (demo keys start with CG-)
    const isDemo = apiKey?.startsWith("CG-");
    
    _client = new Coingecko({
      demoAPIKey: isDemo ? apiKey : undefined,
      proAPIKey: !isDemo ? apiKey : undefined,
      environment: isDemo ? "demo" : "pro",
    });
  }
  return _client;
}

/** Ensure cache directory exists. */
function ensureCacheDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Get current month key (e.g., "2026-03"). */
function monthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

interface ApiCounter {
  month: string;
  count: number;
}

/** Read monthly API call counter. */
function readCounter(): ApiCounter {
  ensureCacheDir();
  if (!fs.existsSync(COUNTER_FILE)) {
    return { month: monthKey(), count: 0 };
  }
  const raw = JSON.parse(fs.readFileSync(COUNTER_FILE, "utf-8")) as ApiCounter;
  if (raw.month !== monthKey()) {
    return { month: monthKey(), count: 0 };
  }
  return raw;
}

/** Increment and persist the counter. */
function incrementCounter(): number {
  const counter = readCounter();
  counter.count += 1;
  fs.writeFileSync(COUNTER_FILE, JSON.stringify(counter, null, 2));
  return counter.count;
}


let lastRequestTime = 0;

/**
 * Internal logic to enforce monthly limits and rate-limiting delays.
 * Call this before any SDK request.
 */
async function enforceQuotas(): Promise<number> {
  ensureCacheDir();

  // Check monthly limit
  const counter = readCounter();
  if (counter.count >= MONTHLY_LIMIT) {
    throw new Error(
      `Monthly CoinGecko API limit reached (${counter.count}/${MONTHLY_LIMIT}). ` +
        `Resets next month. Use cached data.`
    );
  }

  // Rate limiting — enforce 2.1s between requests
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
    process.stdout.write(` [rate limit: wait ${waitTime}ms...] `);
    await sleep(waitTime);
  }

  lastRequestTime = Date.now();
  return incrementCounter();
}

/**
 * Handle API responses, caching, and common error patterns.
 */
async function withCache<T>(
  cacheKey: string | undefined,
  cacheTtlMs: number,
  fetcher: () => Promise<T>
): Promise<T> {
  // Check cache first
  if (cacheKey) {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    if (fs.existsSync(cacheFile)) {
      const stat = fs.statSync(cacheFile);
      const age = Date.now() - stat.mtimeMs;
      if (age < cacheTtlMs) {
        console.log(`  [cache hit] ${cacheKey} (age: ${Math.round(age / 60000)}min)`);
        return JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as T;
      }
    }
  }

  // Enforce limits and perform fetch
  const currentCount = await enforceQuotas();
  const data = await fetcher();

  // Save to cache
  if (cacheKey) {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    console.log(`  [cached] ${cacheKey} (call ${currentCount}/${MONTHLY_LIMIT} this month)`);
  }

  return data;
}

/**
 * Legacy wrapper for generic endpoints not yet covered by specific SDK methods.
 * @deprecated Use SDK methods directly via getClient() if possible.
 */
export async function fetchCoinGecko<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  cacheKey?: string,
  cacheTtlMs: number = 24 * 60 * 60 * 1000
): Promise<T> {
  return withCache(cacheKey, cacheTtlMs, async () => {
    // Build URL for raw fetch
    const url = new URL(`https://api.coingecko.com/api/v3${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    const apiKey = process.env.COINGECKO_API_KEY;
    if (apiKey) url.searchParams.set("x_cg_demo_api_key", apiKey);

    console.log(`  [api/raw] GET ${url.pathname}${url.search}`);
    const response = await fetchWithRetry(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": "TokenRadar/1.0" },
    });
    if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);
    return (await response.json()) as T;
  });
}

// ── SDK Type Definitions (Exported for convenience) ──────────

import type { CoinGetIDResponse } from "@coingecko/coingecko-typescript/resources/coins/coins";
import type { MarketGetResponse } from "@coingecko/coingecko-typescript/resources/coins/markets";
import type { MarketChartGetResponse } from "@coingecko/coingecko-typescript/resources/coins/market-chart";
import type { GlobalGetResponse } from "@coingecko/coingecko-typescript/resources/global/global";
import type { CategoryGetResponse } from "@coingecko/coingecko-typescript/resources/coins/categories";
import type { TrendingGetResponse } from "@coingecko/coingecko-typescript/resources/search/trending";

export type { CoinGetIDResponse as CoinDetail, MarketChartGetResponse as MarketChartData, GlobalGetResponse, CategoryGetResponse, TrendingGetResponse };
export type CoinGeckoToken = MarketGetResponse[number];
// The SDK's GlobalMarketData is missing many currency fields in total_market_cap and total_volume
// We override it here to ensure 'usd' and other common fields are accessible
export interface GlobalMarketStats {
  active_cryptocurrencies?: number;
  upcoming_icos?: number;
  ongoing_icos?: number;
  ended_icos?: number;
  markets?: number;
  total_market_cap?: Record<string, number>;
  total_volume?: Record<string, number>;
  market_cap_percentage?: Record<string, number>;
  market_cap_change_percentage_24h_usd?: number;
  updated_at?: number;
}

/** Augmented community data because SDK type is missing twitter_followers */
export interface CommunityStats {
  twitter_followers?: number | null;
  reddit_subscribers?: number | null;
  telegram_channel_user_count?: number | null;
}

/** Simplified DEX data structure from GeckoTerminal */
export interface DEXPoolData {
  id: string;
  name: string;
  priceUsd: number;
  volume24h: number;
  reserveUsd: number;
  fdvUsd: number;
  dexId: string;
  poolCreatedAt: string | null;
  priceChange24h: number;
}

/** Cleaned per-token data structure used by TokenRadar */
export interface TokenDetailData {
  id: string;
  symbol: string;
  name: string;
  description: string;
  categories: string[];
  genesisDate: string | null;
  links: {
    website: string | null;
    github: string | null;
    reddit: string | null;
    explorer: string | null;
  };
  market: {
    price: number;
    marketCap: number;
    marketCapRank: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    priceChange24h: number;
    priceChange7d: number;
    priceChange30d: number;
    priceChange1y: number;
    ath: number;
    athChangePercentage: number;
    athDate: string;
    atl: number;
    atlDate: string;
    circulatingSupply: number;
    totalSupply: number | null;
    maxSupply: number | null;
    fdv: number | null;
  };
  community: {
    twitterFollowers: number | null;
    redditSubscribers: number | null;
  };
  developer: {
    githubStars: number | null;
    githubForks: number | null;
    commits4Weeks: number | null;
  };
  chart30d?: MarketChartGetResponse;
  chart1y?: MarketChartGetResponse;
  fetchedAt: string;
}

/**
 * Fetch full token details and price history from CoinGecko.
 * This performs 3 API calls (Details, 30d Chart, 1y Chart).
 */
export async function fetchFullTokenData(tokenId: string): Promise<TokenDetailData> {
  const client = getClient();

  // 1. Fetch detailed coin info
  const detail = await withCache(
    `coin-detail-${tokenId}`,
    3 * 24 * 60 * 60 * 1000, // 3 days (72h) to stay under 9k/month quota
    () => client.coins.getID(tokenId, {
      localization: false,
      tickers: false,
      market_data: true,
      community_data: true,
      developer_data: true,
    }) as unknown as Promise<CoinGetIDResponse>
  );

  // 2. Fetch 30-day price history
  const chart30d = await withCache(
    `chart-30d-${tokenId}`,
    72 * 60 * 60 * 1000, // 3 days (72h)
    () => client.coins.marketChart.get(tokenId, {
      vs_currency: "usd",
      days: "30",
      interval: "daily",
    }) as unknown as Promise<MarketChartGetResponse>
  );

  // 3. Fetch 365-day price history
  const chart1y = await withCache(
    `chart-1y-${tokenId}`,
    72 * 60 * 60 * 1000, // 3 days (72h)
    () => client.coins.marketChart.get(tokenId, {
      vs_currency: "usd",
      days: "365",
      interval: "daily",
    }) as unknown as Promise<MarketChartGetResponse>
  );

  // 4. Transform into clean clean format
  return {
    id: detail.id || tokenId,
    symbol: detail.symbol || "",
    name: detail.name || "",
    description: truncateDescription(detail.description?.en || ""),
    categories: detail.categories?.filter(Boolean) || [],
    genesisDate: detail.genesis_date || null,
    links: {
      website: detail.links?.homepage?.[0] || null,
      github: detail.links?.repos_url?.github?.[0] || null,
      reddit: detail.links?.subreddit_url || null,
      explorer: detail.links?.blockchain_site?.[0] || null,
    },
    market: {
      price: detail.market_data?.current_price?.usd ?? 0,
      marketCap: detail.market_data?.market_cap?.usd ?? 0,
      marketCapRank: detail.market_cap_rank ?? 999,
      volume24h: detail.market_data?.total_volume?.usd ?? 0,
      high24h: detail.market_data?.high_24h?.usd ?? 0,
      low24h: detail.market_data?.low_24h?.usd ?? 0,
      priceChange24h: detail.market_data?.price_change_percentage_24h ?? 0,
      priceChange7d: detail.market_data?.price_change_percentage_7d ?? 0,
      priceChange30d: detail.market_data?.price_change_percentage_30d ?? 0,
      priceChange1y: detail.market_data?.price_change_percentage_1y ?? 0,
      ath: detail.market_data?.ath?.usd ?? 0,
      athChangePercentage: detail.market_data?.ath_change_percentage?.usd ?? 0,
      athDate: detail.market_data?.ath_date?.usd ?? "",
      atl: detail.market_data?.atl?.usd ?? 0,
      atlDate: detail.market_data?.atl_date?.usd ?? "",
      circulatingSupply: detail.market_data?.circulating_supply ?? 0,
      totalSupply: detail.market_data?.total_supply ?? null,
      maxSupply: detail.market_data?.max_supply ?? null,
      fdv: detail.market_data?.fully_diluted_valuation?.usd ?? null,
    },
    community: {
      twitterFollowers: (detail.community_data as unknown as CommunityStats)?.twitter_followers ?? null,
      redditSubscribers: detail.community_data?.reddit_subscribers ?? null,
    },
    developer: {
      githubStars: detail.developer_data?.stars ?? null,
      githubForks: detail.developer_data?.forks ?? null,
      commits4Weeks: detail.developer_data?.commit_count_4_weeks ?? null,
    },
    chart30d,
    chart1y,
    fetchedAt: new Date().toISOString(),
  };
}

/** Truncate long descriptions to stay under Claude's prompt window and save space. */
function truncateDescription(text: string, maxChars: number = 3000): string {
  if (text.length <= maxChars) return text;
  return text.substring(0, maxChars) + "... [truncated]";
}

// (Interfaces CoinGeckoToken and TrendingCoinItem removed in favor of SDK types)

/**
 * Fetch tokens ranked by market cap within a given range.
 *
 * @param startRank - Start rank (inclusive), e.g., 50
 * @param endRank - End rank (inclusive), e.g., 200
 * @returns Array of token data sorted by market_cap_rank
 */
export async function fetchTokensByRank(
  startRank: number = 50,
  endRank: number = 200
): Promise<CoinGeckoToken[]> {
  const perPage = 250; 
  const page = Math.ceil(startRank / perPage);
  const client = getClient();

  const tokens = await withCache(
    `tokens-page-${page}`,
    2 * 60 * 60 * 1000, // 2 hours for fresh prices/movers
    () => client.coins.markets.get({
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: perPage,
      page,
      sparkline: false,
      price_change_percentage: "24h,7d,30d,1y",
    }) as unknown as Promise<MarketGetResponse>
  );

  return (tokens || []).filter(
    (t: any) =>
      t.market_cap_rank !== null &&
      t.market_cap_rank >= startRank &&
      t.market_cap_rank <= endRank
  );
}

// ── Trending Coins ────────────────────────────────────────────

// Raw response shape matches SDK TrendingResponse

/**
 * Fetch the top trending coins from CoinGecko's search/trending endpoint.
 * This is a zero-cost endpoint based on user search volume.
 */
export async function fetchTrendingCoins(): Promise<any[]> {
  const client = getClient();
  try {
    const raw = await withCache(
      "trending-coins",
      30 * 60 * 1000, 
      () => client.search.trending.get() as unknown as Promise<TrendingGetResponse>
    );

    return (raw.coins || [])
      .sort((a, b) => (a.score || 0) - (b.score || 0));
  } catch (error) {
    console.warn(`  ⚠ Failed to fetch trending coins: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Search for a token's CoinGecko ID by its symbol or name.
 * 
 * @param query - The symbol or name to search for (e.g. "sol")
 * @returns The best matching token ID or null
 */
export async function searchTokenId(query: string): Promise<string | null> {
  const client = getClient();
  try {
    const response = await withCache(
      `search-${query}`,
      24 * 60 * 60 * 1000, // 24h cache is fine for search results
      () => client.search.get({ query })
    );

    if (response?.coins && response.coins.length > 0) {
      // Find exact symbol match first
      const exactMatch = response.coins.find(c => c.symbol?.toLowerCase() === query.toLowerCase());
      if (exactMatch) return exactMatch.id || null;
      
      // Fallback to first result
      return response.coins[0].id || null;
    }
    return null;
  } catch (error) {
    console.warn(`  ⚠ Search failed for "${query}": ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ── Global Market Data ────────────────────────────────────────

/**
 * Fetch global cryptocurrency market statistics.
 */
export async function fetchGlobalMarketData(): Promise<GlobalMarketStats | undefined> {
  const client = getClient();
  const response = await withCache(
    "global-market-data",
    60 * 60 * 1000, // 1 hour cache
    () => client.global.get() as unknown as Promise<GlobalGetResponse>
  );
  return response?.data as unknown as GlobalMarketStats;
}

// ── Sector / Category Data ────────────────────────────────────

/**
 * Fetch the top performing coin categories (sectors).
 */
export async function fetchTrendingCategories(limit: number = 5): Promise<CategoryGetResponse[]> {
  const client = getClient();
  const categories = await withCache(
    "trending-categories",
    2 * 60 * 60 * 1000, // 2 hour cache
    () => client.coins.categories.get({ order: "market_cap_change_24h_desc" }) as unknown as Promise<CategoryGetResponse[]>
  );
  return (categories || []).slice(0, limit);
}

// ── GeckoTerminal (On-Chain Discovery) ────────────────────────

/**
 * Search GeckoTerminal for DEX pools matching a token symbol.
 * Useful for TGE tokens that aren't on the main CoinGecko site yet.
 */
export async function searchGeckoTerminalPools(query: string): Promise<DEXPoolData[]> {
  return withCache(`gt-search-${query}`, 60 * 60 * 1000, async () => {
    const url = `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query)}`;
    
    // We reuse enforceQuotas even for GT to keep overall velocity in check
    // but GT doesn't count towards the official CoinGecko 10k monthly limit.
    // However, GT has its own rate limits, so we respect our delay.
    await enforceQuotas(); 

    console.log(`  [GT/api] GET ${url}`);
    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json", "User-Agent": "TokenRadar/1.0" },
    });

    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`GeckoTerminal error: ${response.status}`);
    }

    const json = await response.json();
    const pools = json.data || [];

    return pools.map((p: any) => ({
      id: p.id,
      name: p.attributes.name,
      priceUsd: parseFloat(p.attributes.base_token_price_usd || "0"),
      volume24h: parseFloat(p.attributes.volume_usd?.h24 || "0"),
      reserveUsd: parseFloat(p.attributes.reserve_in_usd || "0"),
      fdvUsd: parseFloat(p.attributes.fdv_usd || "0"),
      dexId: p.relationships?.dex?.data?.id || "unknown",
      poolCreatedAt: p.attributes.pool_created_at || null,
      priceChange24h: parseFloat(p.attributes.price_change_percentage?.h24 || "0"),
    })).sort((a: any, b: any) => b.reserveUsd - a.reserveUsd); // Sort by highest liquidity
  });
}

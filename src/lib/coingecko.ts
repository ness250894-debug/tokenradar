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
import { sleep } from "./utils";

const BASE_URL = "https://api.coingecko.com/api/v3";
const DATA_DIR = path.resolve(__dirname, "../data");
const CACHE_DIR = path.join(DATA_DIR, "cache");
const COUNTER_FILE = path.join(CACHE_DIR, "api-counter.json");
const RATE_LIMIT_DELAY_MS = 2100; // 2.1s between requests
const MONTHLY_LIMIT = 9000;

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
 * Fetch a CoinGecko API endpoint with rate limiting and optional caching.
 *
 * @param endpoint - API path (e.g., "/coins/markets")
 * @param params - URL query parameters
 * @param cacheKey - If provided, results are cached with this key
 * @param cacheTtlMs - Cache TTL in milliseconds (default: 24h)
 * @returns Parsed JSON response
 */
export async function fetchCoinGecko<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  cacheKey?: string,
  cacheTtlMs: number = 24 * 60 * 60 * 1000,
  maxRetries: number = 3
): Promise<T> {
  ensureCacheDir();

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

  // Check monthly limit
  const counter = readCounter();
  if (counter.count >= MONTHLY_LIMIT) {
    throw new Error(
      `Monthly CoinGecko API limit reached (${counter.count}/${MONTHLY_LIMIT}). ` +
        `Resets next month. Use cached data or CoinMarketCap fallback.`
    );
  }

  // Rate limiting — enforce 2.1s between requests
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < RATE_LIMIT_DELAY_MS) {
    const waitTime = RATE_LIMIT_DELAY_MS - elapsed;
    console.log(`  [rate limit] waiting ${waitTime}ms...`);
    await sleep(waitTime);
  }

  // Build URL
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  // Add API key if available
  const apiKey = process.env.COINGECKO_API_KEY;
  if (apiKey) {
    url.searchParams.set("x_cg_demo_api_key", apiKey);
  }

  console.log(`  [api] GET ${url.pathname}${url.search}`);
  lastRequestTime = Date.now();
  const currentCount = incrementCounter();

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "TokenRadar/1.0",
    },
  });

  if (response.status === 429) {
    if (maxRetries <= 0) {
      throw new Error(`CoinGecko API rate limited (429) for ${endpoint} — max retries exhausted.`);
    }
    console.warn(`  [rate limited] 429 — waiting 60s before retry (${maxRetries} retries left)...`);
    await logError("CoinGecko", "Rate limited (429)", false); // non-fatal alert
    await sleep(60_000);
    return fetchCoinGecko<T>(endpoint, params, cacheKey, cacheTtlMs, maxRetries - 1);
  }

  if (!response.ok) {
    throw new Error(
      `CoinGecko API error: ${response.status} ${response.statusText} for ${endpoint}`
    );
  }

  const data = (await response.json()) as T;

  // Save to cache
  if (cacheKey) {
    const cacheFile = path.join(CACHE_DIR, `${cacheKey}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    console.log(`  [cached] ${cacheKey} (call ${currentCount}/${MONTHLY_LIMIT} this month)`);
  }

  return data;
}

/** Detailed coin data from CoinGecko /coins/{id} */
export interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  description: { en: string };
  links: {
    homepage: string[];
    blockchain_site: string[];
    official_forum_url: string[];
    subreddit_url: string;
    repos_url: { github: string[]; bitbucket: string[] };
  };
  categories: string[];
  genesis_date: string | null;
  market_cap_rank: number | null;
  market_data: {
    current_price: { usd: number };
    market_cap: { usd: number };
    total_volume: { usd: number };
    high_24h: { usd: number };
    low_24h: { usd: number };
    price_change_percentage_24h: number;
    price_change_percentage_7d: number;
    price_change_percentage_30d: number;
    price_change_percentage_1y: number;
    ath: { usd: number };
    ath_change_percentage: { usd: number };
    ath_date: { usd: string };
    atl: { usd: number };
    atl_date: { usd: string };
    circulating_supply: number;
    total_supply: number | null;
    max_supply: number | null;
    fully_diluted_valuation: { usd: number | null };
  };
  community_data: {
    twitter_followers: number | null;
    reddit_subscribers: number | null;
    reddit_average_posts_48h: number | null;
  };
  developer_data: {
    stars: number | null;
    forks: number | null;
    subscribers: number | null;
    total_issues: number | null;
    closed_issues: number | null;
    commit_count_4_weeks: number | null;
  };
}

/** Market chart data from /market_chart */
export interface MarketChartData {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
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
  chart30d?: MarketChartData;
  chart1y?: MarketChartData;
  fetchedAt: string;
}

/**
 * Fetch full token details and price history from CoinGecko.
 * This performs 3 API calls (Details, 30d Chart, 1y Chart).
 */
export async function fetchFullTokenData(tokenId: string): Promise<TokenDetailData> {
  // 1. Fetch detailed coin info
  const detail = await fetchCoinGecko<CoinDetail>(
    `/coins/${tokenId}`,
    {
      localization: "false",
      tickers: "false",
      market_data: "true",
      community_data: "true",
      developer_data: "true",
    },
    `coin-detail-${tokenId}`,
    30 * 24 * 60 * 60 * 1000 // 30-day static cache
  );

  // 2. Fetch 30-day price history
  const chart30d = await fetchCoinGecko<MarketChartData>(
    `/coins/${tokenId}/market_chart`,
    {
      vs_currency: "usd",
      days: "30",
      interval: "daily",
    },
    `chart-30d-${tokenId}`,
    12 * 60 * 60 * 1000 // 12h cache
  );

  // 3. Fetch 365-day price history
  const chart1y = await fetchCoinGecko<MarketChartData>(
    `/coins/${tokenId}/market_chart`,
    {
      vs_currency: "usd",
      days: "365",
      interval: "daily",
    },
    `chart-1y-${tokenId}`,
    24 * 60 * 60 * 1000 // 24h cache
  );

  // 4. Transform into clean clean format
  return {
    id: detail.id,
    symbol: detail.symbol,
    name: detail.name,
    description: truncateDescription(detail.description?.en || ""),
    categories: detail.categories?.filter(Boolean) || [],
    genesisDate: detail.genesis_date,
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
      twitterFollowers: detail.community_data?.twitter_followers ?? null,
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

/** Minimal token info from CoinGecko /coins/markets endpoint. */
export interface CoinGeckoToken {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank: number;
  total_volume: number;
  price_change_percentage_24h: number;
  circulating_supply: number;
  total_supply: number | null;
  max_supply: number | null;
  ath: number;
  ath_change_percentage: number;
  ath_date: string;
  atl: number;
  atl_date: string;
}

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
  const perPage = 250; // max per page on CoinGecko
  const page = Math.ceil(startRank / perPage);

  const tokens = await fetchCoinGecko<CoinGeckoToken[]>(
    "/coins/markets",
    {
      vs_currency: "usd",
      order: "market_cap_desc",
      per_page: perPage,
      page,
      sparkline: "false",
      price_change_percentage: "24h,7d,30d,1y",
    },
    `tokens-page-${page}`,
    12 * 60 * 60 * 1000 // 12h cache
  );

  return tokens.filter(
    (t) =>
      t.market_cap_rank !== null &&
      t.market_cap_rank >= startRank &&
      t.market_cap_rank <= endRank
  );
}

// ── Trending Coins ────────────────────────────────────────────

/** A single trending coin item from the CoinGecko /search/trending endpoint. */
export interface TrendingCoinItem {
  id: string;
  coin_id: number;
  name: string;
  symbol: string;
  market_cap_rank: number | null;
  thumb: string;
  score: number;
}

/** Raw response shape from CoinGecko /search/trending. */
interface TrendingResponse {
  coins: { item: TrendingCoinItem }[];
}

/**
 * Fetch the top trending coins from CoinGecko's search/trending endpoint.
 * This is a zero-cost endpoint based on user search volume — a strong signal
 * of current market interest and momentum.
 *
 * Results are cached for 30 minutes to avoid redundant API calls.
 *
 * @returns Array of trending coin items, sorted by score (highest momentum first)
 */
export async function fetchTrendingCoins(): Promise<TrendingCoinItem[]> {
  try {
    const raw = await fetchCoinGecko<TrendingResponse>(
      "/search/trending",
      {},
      "trending-coins",
      30 * 60 * 1000 // 30-minute cache
    );

    return (raw.coins || [])
      .map((c) => c.item)
      .sort((a, b) => a.score - b.score);
  } catch (error) {
    console.warn(
      `  ⚠ Failed to fetch trending coins: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

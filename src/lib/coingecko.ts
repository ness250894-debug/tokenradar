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

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  cacheTtlMs: number = 24 * 60 * 60 * 1000
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
    console.warn("  [rate limited] 429 — waiting 60s before retry...");
    await sleep(60_000);
    return fetchCoinGecko<T>(endpoint, params, cacheKey, cacheTtlMs);
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
      price_change_percentage: "24h",
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

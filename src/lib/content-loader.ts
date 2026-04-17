/**
 * Content loader — reads generated articles and token data from JSON files.
 * Used by dynamic pages at build time (SSG) to render content.
 */

import { slugify } from "@/lib/shared-utils";
import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CONTENT_DIR = path.resolve(process.cwd(), "content/tokens");
const METRICS_FILE = path.join(DATA_DIR, "_metrics_blob.json");
const TOKENS_FILE = path.join(DATA_DIR, "_tokens_blob.json");
const PRICES_FILE = path.join(DATA_DIR, "_prices_blob.json");
const REGISTRY_FILE = path.join(DATA_DIR, "_registry.json");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");

// ── Types ──────────────────────────────────────────────────────

export interface TokenSummary {
  id: string;
  name: string;
  symbol: string;
  categories: string[];
  rank: number;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  image: string;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
}

export interface TokenDetail {
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
  fetchedAt: string;
}

export interface TokenMetrics {
  tokenId: string;
  tokenName: string;
  symbol: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  growthPotentialIndex: number;
  narrativeStrength: number;
  valueVsAth: number;
  volatilityIndex: number;
  summary: string;
  computedAt: string;
}

export interface PricePoint {
  date: string;
  price: number;
}

export interface PriceHistory {
  id: string;
  name: string;
  chart30d: PricePoint[];
  chart1y: PricePoint[];
  fetchedAt: string;
}

export interface Article {
  tokenId: string;
  tokenName: string;
  type: string;
  title: string;
  slug: string;
  content: string;
  wordCount: number;
  generatedAt: string;
}

export interface FAQ {
  question: string;
  answer: string;
}

export interface UpcomingTge {
  id: string;
  name: string;
  symbol: string;
  category: string;
  expectedTge: string;
  narrativeStrength: number;
  dataSource: string;
  discoveredAt: string;
  status?: "upcoming" | "released";
  graduatedAt?: string;
  coingeckoRank?: number;
}

// ── Cache ──────────────────────────────────────────────────────

let _allTokensCache: TokenSummary[] | null = null;
let _tokenIdsCache: string[] | null = null;
let _categoriesCache: CategorySummary[] | null = null;

// Raw blobs (lazy loaded)
let _tokensBlob: Record<string, unknown> | null = null;
let _metricsBlob: Record<string, unknown> | null = null;
let _pricesBlob: Record<string, unknown> | null = null;

// ── Data Fetching ─────────────────────────────────────────────

async function fetchAsset(relativePath: string) {
  try {
    const url = `/${relativePath.replace(/\\/g, "/")}`;
    const isBrowser = typeof window !== "undefined";
    const isNode = !isBrowser && (process.env.NEXT_RUNTIME !== 'edge');
    
    // Diagnostic prefix for logs
    const logPrefix = `[LOADER]`;

    // 1. In Browser: Use relative fetch
    if (isBrowser) {
      const resp = await fetch(url);
      if (resp.ok) return await resp.json();
      return null;
    }

    // 2. In Server (Cloudflare Edge Runtime)
    if (!isNode) {
      try {
        const resp = await fetch(url, { next: { revalidate: 3600 } });
        if (resp.ok) {
          const data = await resp.json();
          // Log success for critical blobs
          if (url.includes('_blob') || url.includes('_registry')) {
            console.info(`${logPrefix} Successfully fetched ${url} via Relative Fetch`);
          }
          return data;
        }
      } catch (_err) {
        // Fall back peacefully to absolute
      }
    }

    // 3. Absolute Fallback (Mandatory for Node.js scripts and local builds)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
    
    // Safety: If we are in CI or a production build, DO NOT fetch from the live site.
    // This prevents a "stale data" loop where a new build inherits the old site's zeroed-out data.
    if (process.env.CI || (process.env.NODE_ENV === 'production' && !isBrowser)) {
      if (url.includes('_blob') || url.includes('_registry')) {
        console.warn(`${logPrefix} Skipping absolute fetch for ${url} in CI/Production build environment.`);
        return null;
      }
    }

    const fullUrl = new URL(url, siteUrl).toString();
    
    // Add 3s safety timeout to prevent build hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    try {
      const fallbackResp = await fetch(fullUrl, { 
        next: { revalidate: 3600 },
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (!fallbackResp.ok) {
        console.warn(`${logPrefix} Failed to fetch ${fullUrl} (Status: ${fallbackResp.status})`);
        return null;
      }
      
      const data = await fallbackResp.json();
      if (url.includes('_blob') || url.includes('_registry')) {
        console.info(`${logPrefix} Successfully fetched ${url} via Absolute Fallback (${siteUrl})`);
      }
      return data;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      const name = e instanceof Error ? e.name : "Error";
      
      if (name === 'AbortError') {
        console.error(`${logPrefix} TIMEOUT fetching ${fullUrl} (3s limit)`);
      } else {
        console.error(`${logPrefix} ERROR fetching ${fullUrl}: ${msg}`);
      }
      return null;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ Global fetch error for ${relativePath}: ${msg}`);
  }
  return null;
}

async function loadBlob(filePath: string, relativePath: string) {
  const isServer = typeof window === "undefined";
  // Detect build or script environment (Pure Node.js, no Edge runtime)
  const isNode = isServer && (!process.env.NEXT_RUNTIME || process.env.NEXT_RUNTIME === 'nodejs');

  // 1. Try FS (Works in local Dev and SSG build)
  if (isServer && fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      // Only log on critical file loads in Node to keep logs clean
      if (isNode && (filePath.endsWith('_registry.json') || filePath.endsWith('_blob.json'))) {
        console.info(`[LOADER] Found ${path.basename(filePath)} on local Filesystem.`);
      }
      return data;
    } catch (e) {
      console.error(`❌ FS load failed for ${filePath}:`, e);
    }
  }

  return await fetchAsset(relativePath);
}

/** Get all token summaries from the master list (memoized). */
export async function getAllTokens(): Promise<TokenSummary[]> {
  if (_allTokensCache) return _allTokensCache;

  const data = await loadBlob(REGISTRY_FILE, "data/_registry.json");
  if (data) {
    _allTokensCache = data;
    return _allTokensCache || [];
  }

  // Fallback to legacy directory scanning (Dev mode safety)
  const tokensDir = path.join(DATA_DIR, "tokens");
  if (typeof window === "undefined" && fs.existsSync(tokensDir)) {
    const files = fs.readdirSync(tokensDir).filter((f) => f.endsWith(".json"));
    const summaries: TokenSummary[] = [];

    for (const file of files) {
      try {
        const detail: TokenDetail = JSON.parse(
          fs.readFileSync(path.join(tokensDir, file), "utf-8")
        );
      
      summaries.push({
        id: detail.id,
        name: detail.name,
        symbol: detail.symbol,
        categories: detail.categories || [],
        rank: detail.market?.marketCapRank ?? 999,
        price: detail.market?.price ?? 0,
        marketCap: detail.market?.marketCap ?? 0,
        volume24h: detail.market?.volume24h ?? 0,
        priceChange24h: detail.market?.priceChange24h ?? 0,
        image: "", 
        ath: detail.market?.ath ?? 0,
        athDate: detail.market?.athDate ?? "",
        atl: detail.market?.atl ?? 0,
        atlDate: detail.market?.atlDate ?? "",
        circulatingSupply: detail.market?.circulatingSupply ?? 0,
        totalSupply: detail.market?.totalSupply ?? null,
        maxSupply: detail.market?.maxSupply ?? null,
      });
    } catch (_e) {}
    }
    _allTokensCache = summaries;
    return summaries;
  }
  
  return [];
}

export interface CategorySummary {
  id: string;
  name: string;
  count: number;
}

/** Get all discrete categories with at least 3 tokens (memoized) */
export async function getAllCategories(): Promise<CategorySummary[]> {
  if (_categoriesCache) return _categoriesCache;

  const allTokens = await getAllTokens();
  const counts: Record<string, number> = {};
  const nameMap: Record<string, string> = {};
  
  for (const t of allTokens) {
    if (!t.categories) continue;
    for (const c of t.categories) {
       const id = slugify(c);
       counts[id] = (counts[id] || 0) + 1;
       nameMap[id] = c;
    }
  }
  
  const result = Object.entries(counts)
    .filter(([_, count]) => count >= 3)
    .map(([id, count]) => ({ id, name: nameMap[id], count }))
    .sort((a, b) => b.count - a.count);

  _categoriesCache = result;
  return result;
}

/** Get all tokens belonging to a specific category slug */
export async function getTokensByCategory(categoryId: string): Promise<TokenSummary[]> {
  const allTokens = await getAllTokens();
  return allTokens.filter(t => 
    (t.categories || []).some(c => slugify(c) === categoryId)
  ).sort((a, b) => a.rank - b.rank);
}

/**
 * Get all token IDs that should have a page on the regular /[token] route.
 *
 * Excludes upcoming TGE tokens that lack real market data — those should
 * only appear under /upcoming/[token]. Tokens that have graduated
 * (status === "released") or that have real market data (e.g. hyperliquid)
 * are NOT excluded.
 */
/**
 * Get all token IDs that should have a page on the regular /[token] route. (memoized)
 */
export async function getTokenIds(): Promise<string[]> {
  if (_tokenIdsCache) return _tokenIdsCache;

  // Use the registry or allTokens as the source for IDs
  const allTokens = await getAllTokens();
  const ids = new Set<string>(allTokens.map(t => t.id));

  // Also include tokens that have content but might missing from registry
  if (typeof window === "undefined" && fs.existsSync(CONTENT_DIR)) {
    fs.readdirSync(CONTENT_DIR).forEach((dir) => {
      try {
        if (fs.statSync(path.join(CONTENT_DIR, dir)).isDirectory()) {
          ids.add(dir);
        }
      } catch { /* Skip invalid/inaccessible dirs */ }
    });
  }

  // Load upcoming TGE IDs so we can exclude pre-launch tokens without data
  const upcomingTgeIds = new Set<string>();
  const tges = await getUpcomingTGEs();
  tges
    .filter((t) => t.status !== "released")
    .forEach((t) => upcomingTgeIds.add(t.id));

  const result: string[] = [];
  for (const id of Array.from(ids)) {
    if (!upcomingTgeIds.has(id)) {
      result.push(id);
      continue;
    }

    // Upcoming TGE — only include if it has real market data
    const detail = await getTokenDetail(id);
    if (detail && detail.market?.price > 0 && detail.market?.marketCap > 0) {
      result.push(id);
    }
  }
  
  _tokenIdsCache = result;
  return result;
}

/** Load detailed token data. */
export async function getTokenDetail(tokenId: string): Promise<TokenDetail | null> {
  const sanitized = tokenId.replace(/[^a-z0-9-]/g, "");
  
  // Try loading from blob first
  if (!_tokensBlob) _tokensBlob = await loadBlob(TOKENS_FILE, "data/_tokens_blob.json");
  const raw = _tokensBlob ? _tokensBlob[sanitized] : null;

  if (raw) {
    return mapRawToTokenDetail(raw as Record<string, unknown>);
  }

  // Fallback to single file read (Development/Scripts)
  const file = path.join(DATA_DIR, "tokens", `${sanitized}.json`);
  const relPath = `data/tokens/${sanitized}.json`;
  const rawFile = await loadBlob(file, relPath);
  if (rawFile) {
    return mapRawToTokenDetail(rawFile as Record<string, unknown>);
  }
  return null;
}

function mapRawToTokenDetail(raw: Record<string, unknown>): TokenDetail | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  if (!r || !r.id) {
    throw new Error("Invalid token data: object is null or missing ID");
  }

  // Ensure we don't return an object with zero market data if it looks corrupted
  const market = r.market || {};
  const hasMarket = market.price > 0 || market.marketCap > 0 || market.volume24h > 0;
  
  if (!hasMarket) {
    console.warn(`⚠️ Token ${r.id} has invalid/zero market data. Skipping mapping.`);
    return null;
  }
  
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    description: r.description || "",
    categories: r.categories || [],
    genesisDate: r.genesisDate || null,
    links: {
      website: r.links?.website || null,
      github: r.links?.github || null,
      reddit: r.links?.reddit || null,
      explorer: r.links?.explorer || null,
    },
    market: {
      price: r.market?.price ?? 0,
      marketCap: r.market?.marketCap ?? 0,
      marketCapRank: r.market?.marketCapRank ?? 999,
      volume24h: r.market?.volume24h ?? 0,
      high24h: r.market?.high24h ?? 0,
      low24h: r.market?.low24h ?? 0,
      priceChange24h: r.market?.priceChange24h ?? 0,
      priceChange7d: r.market?.priceChange7d ?? 0,
      priceChange30d: r.market?.priceChange30d ?? 0,
      priceChange1y: r.market?.priceChange1y ?? 0,
      ath: r.market?.ath ?? 0,
      athChangePercentage: r.market?.athChangePercentage ?? 0,
      athDate: r.market?.athDate ?? "",
      atl: r.market?.atl ?? 0,
      atlDate: r.market?.atlDate ?? "",
      circulatingSupply: r.market?.circulatingSupply ?? 0,
      totalSupply: r.market?.totalSupply ?? null,
      maxSupply: r.market?.maxSupply ?? null,
      fdv: r.market?.fdv ?? null,
    },
    community: {
      twitterFollowers: r.community?.twitterFollowers ?? null,
      redditSubscribers: r.community?.redditSubscribers ?? null,
    },
    developer: {
      githubStars: r.developer?.githubStars ?? null,
      githubForks: r.developer?.githubForks ?? null,
      commits4Weeks: r.developer?.commits4Weeks ?? null,
    },
    fetchedAt: r.fetchedAt || r.lastMarketUpdate || new Date().toISOString(),
  };
}

/**
 * Load upcoming TGEs. Sorts: upcoming first, then released.
 */
export async function getUpcomingTGEs(): Promise<UpcomingTge[]> {
  try {
    const tges: UpcomingTge[] = (await loadBlob(TGE_FILE, "data/upcoming-tges.json")) || [];
    if (!tges.length) return [];

    // Sort: upcoming first, released last; then by narrative strength desc
    tges.sort((a, b) => {
      const aReleased = a.status === "released" ? 1 : 0;
      const bReleased = b.status === "released" ? 1 : 0;
      if (aReleased !== bReleased) return aReleased - bReleased;
      return (b.narrativeStrength || 0) - (a.narrativeStrength || 0);
    });

    // Deduplicate by symbol — generic symbols (TBD/N/A/TBA) are exempt
    const GENERIC_SYMBOLS = new Set(["TBD", "N/A", "TBA", ""]);
    const seenSymbols = new Set<string>();
    const deduped: UpcomingTge[] = [];

    for (const tge of tges) {
      const sym = (tge.symbol || "").toUpperCase();
      if (!GENERIC_SYMBOLS.has(sym) && seenSymbols.has(sym)) continue;
      if (!GENERIC_SYMBOLS.has(sym)) seenSymbols.add(sym);
      deduped.push(tge);
    }

    return deduped;
  } catch (_e) {
    return [];
  }
}

/** Load token metrics. */
export async function getTokenMetrics(tokenId: string): Promise<TokenMetrics | null> {
  // Try loading from blob
  if (!_metricsBlob) _metricsBlob = await loadBlob(METRICS_FILE, "data/_metrics_blob.json");
  const raw = _metricsBlob ? _metricsBlob[tokenId] : null;

  if (raw) {
    return mapRawToTokenMetrics(raw as Record<string, unknown>, tokenId);
  }

  // Fallback
  const file = path.join(DATA_DIR, "metrics", `${tokenId}.json`);
  const relPath = `data/metrics/${tokenId}.json`;
  const rawFile = await loadBlob(file, relPath);
  if (rawFile) {
    return mapRawToTokenMetrics(rawFile as Record<string, unknown>, tokenId);
  }
  return null;
}

function mapRawToTokenMetrics(raw: Record<string, unknown>, tokenId: string): TokenMetrics {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  return {
    tokenId: r.tokenId || tokenId,
    tokenName: r.tokenName || "",
    symbol: r.symbol || "",
    riskScore: r.riskScore ?? 0,
    riskLevel: r.riskLevel || "medium",
    growthPotentialIndex: r.growthPotentialIndex ?? 0,
    narrativeStrength: r.narrativeStrength ?? 0,
    valueVsAth: r.valueVsAth ?? 0,
    volatilityIndex: r.volatilityIndex ?? 0,
    summary: r.summary || "",
    computedAt: r.computedAt || new Date().toISOString(),
  };
}

/** Load price history for charts. */
export async function getPriceHistory(tokenId: string): Promise<PriceHistory | null> {
  // Try loading from blob
  if (!_pricesBlob) _pricesBlob = await loadBlob(PRICES_FILE, "data/_prices_blob.json");
  const raw = _pricesBlob ? _pricesBlob[tokenId] : null;

  if (raw) {
    return mapRawToPriceHistory(raw as Record<string, unknown>, tokenId);
  }

  // Fallback
  const file = path.join(DATA_DIR, "prices", `${tokenId}.json`);
  const relPath = `data/prices/${tokenId}.json`;
  const rawFile = await loadBlob(file, relPath);
  if (rawFile) {
    return mapRawToPriceHistory(rawFile as Record<string, unknown>, tokenId);
  }
  return null;
}

function mapRawToPriceHistory(raw: Record<string, unknown>, tokenId: string): PriceHistory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  return {
    id: r.id || tokenId,
    name: r.name || "",
    chart30d: r.chart30d || [],
    chart1y: r.chart1y || [],
    fetchedAt: r.fetchedAt || new Date().toISOString(),
  };
}

/** Load a generated article for a token. */
export async function getArticle(tokenId: string, slug: string): Promise<Article | null> {
  const file = path.join(CONTENT_DIR, tokenId, `${slug}.json`);
  const relPath = `content/tokens/${tokenId}/${slug}.json`;
  return await loadBlob(file, relPath);
}

/** Get all article slugs for a token. */
export async function getArticleSlugs(tokenId: string): Promise<string[]> {
  const dir = path.join(CONTENT_DIR, tokenId);
  if (typeof window === "undefined" && fs.existsSync(dir)) {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json") && !f.includes(".prompt"))
      .map((f) => f.replace(".json", ""));
  }
  
  // Minimal fallback — we usually only need "overview" for checks
  return ["overview"];
}

/** Count all published articles across all tokens. */
export async function getTotalArticleCount(): Promise<number> {
  if (typeof window === "undefined" && fs.existsSync(CONTENT_DIR)) {
    let count = 0;
    for (const tokenDir of fs.readdirSync(CONTENT_DIR)) {
      const dirPath = path.join(CONTENT_DIR, tokenDir);
      if (!fs.statSync(dirPath).isDirectory()) continue;
      count += fs
        .readdirSync(dirPath)
        .filter((f) => f.endsWith(".json") && !f.includes(".prompt")).length;
    }
    return count;
  }
  
  // Fallback for SSR
  const registry = await getAllTokens();
  return Math.floor(registry.length * 0.95); // High-confidence estimate if FS missing
}

/** Extract FAQs from article markdown content for structured data. */
export function getArticleFaqs(content: string): FAQ[] {
  const faqs: FAQ[] = [];
  const faqSectionMatch = content.match(/##\s*FAQ([\s\S]*?)(?:---|$)/i);
  if (!faqSectionMatch) return faqs;

  const faqText = faqSectionMatch[1].trim();
  
  // Try pattern 1: **Q: question** \n A: answer
  const qnaPattern = /\*\*Q:\s*(.*?)\*\*\s*\n+(?:A:\s*)?([\s\S]*?)(?=\n+\*\*Q:|$)/gi;
  let match;
  let qnaFound = false;
  while ((match = qnaPattern.exec(faqText)) !== null) {
    qnaFound = true;
    faqs.push({
      question: match[1].trim(),
      answer: match[2].trim()
    });
  }
  
  if (qnaFound) return faqs;
  
  // Try pattern 2: ## or ### Question \n Answer
  const headerPattern = /#{2,3}\s*(.*?)\s*\n+([\s\S]*?)(?=\n+#{2,3}|$)/g;
  while ((match = headerPattern.exec(faqText)) !== null) {
    const q = match[1].trim();
    if (q.toLowerCase() !== 'faq') {
       faqs.push({
         question: q,
         answer: match[2].trim()
       });
    }
  }
  
  return faqs;
}

/** Get related tokens based on shared categories and semantic similarity. */
export async function getRelatedTokens(tokenId: string, limit: number = 3): Promise<TokenSummary[]> {
  const allTokens = await getAllTokens();
  const targetToken = allTokens.find((t) => t.id === tokenId);
  
  // Basic fallback
  const index = allTokens.findIndex((t) => t.id === tokenId);
  if (!targetToken || !targetToken.categories || targetToken.categories.length === 0) {
    if (index === -1) return allTokens.slice(0, limit);
    const startIndex = Math.max(0, index - limit);
    return allTokens.slice(startIndex, index + limit + 1).filter((t) => t.id !== tokenId).slice(0, limit);
  }

  // Semantic category matching
  const targetCategories = new Set(targetToken.categories);
  const candidates = allTokens
    .filter(t => t.id !== tokenId)
    .map(t => {
       let sharedScore = 0;
       (t.categories || []).forEach(c => {
          if (targetCategories.has(c)) sharedScore += 1;
       });
       return { token: t, score: sharedScore };
    })
    .filter(t => t.score > 0)
    .sort((a, b) => {
       if (b.score !== a.score) return b.score - a.score;
       return a.token.rank - b.token.rank;
    });

  if (candidates.length >= limit) {
    return candidates.slice(0, limit).map(c => c.token);
  }

  // Fill up with nearby ranked tokens if not enough semantic matches
  const startIndex = Math.max(0, index - limit);
  const fallback = allTokens.slice(startIndex, index + limit + 1).filter((t) => t.id !== tokenId && !candidates.some(c => c.token.id === t.id));
  
  return [...candidates.map(c => c.token), ...fallback].slice(0, limit);
}

export { formatPrice, formatCompact, formatSupply, formatPercent } from "./formatters";

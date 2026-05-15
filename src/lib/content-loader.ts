/**
 * Content loader — reads generated articles and token data from JSON files.
 * Used by dynamic pages at build time (SSG) to render content.
 */

import { slugify } from "@/lib/shared-utils";
import { normalizeArticleMarkdown } from "@/lib/article-formatting";
import type { ArticleQualitySnapshot } from "@/lib/content-quality";
import { getMarketDataQualityIssues } from "@/lib/market-data-quality";
import { getTgeSortWeight, isGenericTgeSymbol, normalizeTge } from "@/lib/tge";
import type { UpcomingTge } from "@/lib/tge";
import type {
  SearchIntentDataset,
  SearchIntentHistoryDataset,
  SearchIntentType,
  TokenSearchIntentTrend,
  TokenSearchIntentSnapshot,
} from "@/lib/search-intent";
import * as fs from "fs";
import * as path from "path";

export type {
  TgeContract,
  TgeLifecycleStatus,
  TgeMarketEvidence,
  TgeOfficialLinks,
  TgeSignal,
  TgeSignalType,
  TgeSourceType,
  TgeTokenomics,
  UpcomingTge,
} from "@/lib/tge";

/**
 * Resolve the data directory path.
 * 
 * On local dev / CI build: `process.cwd()` points to the project root → `data/` exists.
 * On Cloudflare Edge Worker: `process.cwd()` doesn't point to the bundled server function.
 * We try multiple candidates to find the actual location of the data directory.
 */
function resolveDataDir(): string {
  const cwd = process.cwd();
  // Using template strings bypasses Turbopack's overly-aggressive path.join tracer
  const candidates = [
    `${cwd}/data`,
    `${__dirname}/../../data`,
    `${__dirname}/../data`,
    `${__dirname}/data`,
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ dir)) return dir;
    } catch {
      // continue
    }
  }

  return `${cwd}/data`;
}

// Lazily resolved once per cold start
let _dataDirResolved: string | null = null;
let _contentDirResolved: string | null = null;

function getDataDir(): string {
  if (!_dataDirResolved) _dataDirResolved = resolveDataDir();
  return _dataDirResolved;
}

function resolveContentDir(): string {
  const cwd = process.cwd();
  const candidates = [
    `${cwd}/content/tokens`,
    `${__dirname}/../../content/tokens`,
    `${__dirname}/../content/tokens`,
    `${__dirname}/content/tokens`,
  ];

  for (const dir of candidates) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ dir)) return dir;
    } catch {
      // continue
    }
  }

  return `${cwd}/content/tokens`;
}

function getContentDir(): string {
  if (!_contentDirResolved) _contentDirResolved = resolveContentDir();
  return _contentDirResolved;
}

// Helper to get absolute path for data files
function getFilePath(relativePath: string) {
  const base = getDataDir();
  return `${base}/${relativePath}`;
}

/**
 * Get the base origin for internal fetches.
 * Prioritizes NEXT_PUBLIC_SITE_URL to ensure consistency between Server & Client.
 */
function getOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  
  // In GHA or local production simulation, ensure we have a valid origin
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co";
  
  // Strip trailing slash if present
  return siteUrl.replace(/\/$/, "");
}

// ── Types ──────────────────────────────────────────────────────

export interface TokenSummary {
  id: string;
  name: string;
  symbol: string;
  image?: string;
  imageUrl?: string;
  categories: string[];
  rank: number;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
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
  imageUrl?: string;
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

function getEmbeddedTokenImageUrl(token: unknown): string | undefined {
  if (!token || typeof token !== "object") return undefined;
  const source = token as {
    imageUrl?: unknown;
    image?: unknown;
  };

  if (typeof source.imageUrl === "string" && source.imageUrl.trim()) {
    return source.imageUrl;
  }

  if (typeof source.image === "string" && source.image.trim()) {
    return source.image;
  }

  if (source.image && typeof source.image === "object") {
    const image = source.image as { large?: unknown; small?: unknown; thumb?: unknown };
    for (const candidate of [image.large, image.small, image.thumb]) {
      if (typeof candidate === "string" && candidate.trim()) return candidate;
    }
  }

  return undefined;
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
  quality?: ArticleQualitySnapshot;
}

export interface FAQ {
  question: string;
  answer: string;
}

// ── Cache ──────────────────────────────────────────────────────

let _allTokensCache: TokenSummary[] | null = null;
let _tokenIdsCache: string[] | null = null;
let _categoriesCache: CategorySummary[] | null = null;
let _categoryIdsCache: Set<string> | null = null;
const _relatedTokensCache = new Map<string, TokenSummary[]>();

// Raw blobs (lazy loaded)
let _registry: TokenSummary[] | null = null;
let _tokensBlob: Record<string, unknown> | null = null;
let _metricsBlob: Record<string, unknown> | null = null;
let _pricesBlob: Record<string, unknown> | null = null;
let _searchIntentDataset: SearchIntentDataset | null = null;
let _searchIntentHistoryDataset: SearchIntentHistoryDataset | null = null;
let _searchIntentTrendMap: Record<string, TokenSearchIntentTrend> | null = null;
const _loadBlobCache = new Map<string, unknown>();
const _untrustedTokenWarningCache = new Set<string>();
const shouldLogLoaderInfo = process.env.DEBUG_CONTENT_LOADER === "true";

function logLoaderDebug(message: string): void {
  if (shouldLogLoaderInfo) {
    console.info(`[LOADER] ${message}`);
  }
}

function cacheLoadedBlob<T>(relativePath: string, data: T): T {
  _loadBlobCache.set(relativePath, data);
  return data;
}

// ── Data Fetching ─────────────────────────────────────────────

async function fetchAsset(relativePath: string) {
  const logPrefix = `[LOADER]`;
  const origin = getOrigin();
  const path = relativePath.replace(/\\/g, "/");
  const fullUrl = `${origin}/${path}`;
  
  const isBrowser = typeof window !== "undefined";
  
  try {
    // 1. In Browser: Always use relative fetch for better performance/caching
    if (isBrowser) {
      const resp = await fetch(`/${path}`);
      if (resp.ok) return await resp.json();
      console.warn(`${logPrefix} Browser fetch failed for /${path} (Status: ${resp.status})`);
      return null;
    }

    // 2. In Server (Edge or Node fallback)
    // We add a 10s timeout to prevent build hangs but allow enough time for heavy blobs on Cloudflare
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // We use the full URL in server context to ensure reliable resolution on Cloudflare Edge
      const resp = await fetch(fullUrl, { 
        next: { revalidate: 3600 },
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      
      if (!resp.ok) {
        // Detailed logging for critical files (blobs)
        if (path.includes('_blob') || path.includes('_registry')) {
          console.warn(`${logPrefix} Server fetch failed for ${fullUrl} (Status: ${resp.status})`);
        }
        return null;
      }
      
      const data = await resp.json();
      if (shouldLogLoaderInfo && (path.includes('_blob') || path.includes('_registry'))) {
        console.info(`${logPrefix} Successfully fetched ${path} via ${fullUrl}`);
      }
      return data;
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      if (path.includes('_blob') || path.includes('_registry')) {
        const msg = e instanceof Error ? e.message : String(e);
        if (e instanceof Error && e.name === 'AbortError') {
          console.error(`${logPrefix} TIMEOUT fetching ${fullUrl} (10s limit)`);
        } else {
          console.error(`${logPrefix} ERROR fetching ${fullUrl}: ${msg}`);
        }
      }
      return null;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`❌ Global loader error for ${path}: ${msg}`);
  }
  return null;
}

async function loadBlob<T = unknown>(filePath: string, relativePath: string): Promise<T | null> {
  if (_loadBlobCache.has(relativePath)) {
    logLoaderDebug(`Cache hit for ${relativePath}`);
    return _loadBlobCache.get(relativePath) as T | null;
  }

  const isServer = typeof window === "undefined";
  // Detect build or script environment (Pure Node.js, no Edge runtime)
  const isNode = isServer && (!process.env.NEXT_RUNTIME || process.env.NEXT_RUNTIME === 'nodejs');
  const fileName = path.basename(filePath);

  // 1. Try FS with multiple path candidates (handles both local dev + Cloudflare Worker bundle)
  // turbopackIgnore comments prevent Turbopack from tracing these dynamic paths,
  // which would otherwise cause the entire project to be bundled (~13k+ files).
  if (isServer) {
    const candidates = [
      filePath,                                         // Primary: resolved via getDataDir()
      `${process.cwd()}/data/${fileName}`,              // Explicit cwd fallback
      `${__dirname}/../../data/${fileName}`,             // Relative to compiled loader
      `${__dirname}/../data/${fileName}`,                // Alternate bundle layout
      `${__dirname}/data/${fileName}`,                   // Flat bundle layout
    ];

    for (const candidate of candidates) {
      try {
        const raw = await fs.promises.readFile(/* turbopackIgnore: true */ candidate, "utf-8");
        const data = JSON.parse(raw);
        if (shouldLogLoaderInfo && isNode && (fileName.endsWith('_registry.json') || fileName.endsWith('_blob.json'))) {
          console.info(`[LOADER] Found ${fileName} at ${candidate}`);
        }
        return cacheLoadedBlob(relativePath, data as T);
      } catch {
        // fs.existsSync or readFileSync might throw on Edge — continue trying
      }
    }
  }

  // 2. HTTP Fetch Fallback (for environments where FS is completely unavailable)
  const data = await fetchAsset(relativePath);

  // CRITICAL: If we are in a production build and a critical asset fails to load,
  // we MUST throw an error to prevent a "broken" deployment (e.g. BTC 404s).
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build';
  const isCritical = relativePath.includes('_blob') || relativePath.includes('_registry');
  
  if (isBuild && isCritical && !data) {
    throw new Error(`[LOADER] CRITICAL FAILURE: Failed to load ${relativePath} during build. Aborting to prevent production 404s.`);
  }

  return cacheLoadedBlob(relativePath, data as T | null);
}

/** Get all token summaries from the master list (memoized). */
export async function getAllTokens(): Promise<TokenSummary[]> {
  if (_allTokensCache) {
    logLoaderDebug("Cache hit for all token summaries");
    return _allTokensCache;
  }

  const relativePath = "data/_registry.json";
  const file = getFilePath("_registry.json");
  
  if (!_registry) {
    _registry = await loadBlob<TokenSummary[]>(file, relativePath);
  }
  if (_registry) {
    _allTokensCache = _registry;
    return _allTokensCache || [];
  }

  // Fallback to legacy directory scanning (Dev mode safety)
  const tokensDir = `${getDataDir()}/tokens`;
  if (typeof window === "undefined") {
    try {
      const files = (await fs.promises.readdir(/* turbopackIgnore: true */ tokensDir)).filter((f) => f.endsWith(".json"));
    const summaries: TokenSummary[] = [];

    for (const file of files) {
      try {
        const tokenFilePath = `${tokensDir}/${file}`;
        const detail: TokenDetail = JSON.parse(
          await fs.promises.readFile(/* turbopackIgnore: true */ tokenFilePath, "utf-8")
        );
      
      summaries.push({
        id: detail.id,
        name: detail.name,
        symbol: detail.symbol,
        image: getEmbeddedTokenImageUrl(detail),
        categories: detail.categories || [],
        rank: detail.market?.marketCapRank ?? 999,
        price: detail.market?.price ?? 0,
        marketCap: detail.market?.marketCap ?? 0,
        volume24h: detail.market?.volume24h ?? 0,
        priceChange24h: detail.market?.priceChange24h ?? 0,
        ath: detail.market?.ath ?? 0,
        athDate: detail.market?.athDate ?? "",
        atl: detail.market?.atl ?? 0,
        atlDate: detail.market?.atlDate ?? "",
        circulatingSupply: detail.market?.circulatingSupply ?? 0,
        totalSupply: detail.market?.totalSupply ?? null,
        maxSupply: detail.market?.maxSupply ?? null,
      });
    } catch (_e) {
        console.warn(`⚠️ Failed to parse token file: ${file}`, _e);
      }
    }
      _allTokensCache = summaries;
      return summaries;
    } catch (_err) {
      // fallback
    }
  }
  
  return [];
}

export interface CategorySummary {
  id: string;
  name: string;
  count: number;
}

export interface LinkableCategory {
  name: string;
  href?: string;
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

/** Get the generated category route IDs. */
export async function getCategoryIds(): Promise<Set<string>> {
  if (_categoryIdsCache) return _categoryIdsCache;

  const categories = await getAllCategories();
  _categoryIdsCache = new Set(categories.map((category) => category.id));
  return _categoryIdsCache;
}

export function getCategoryHref(category: string | undefined, categoryIds: ReadonlySet<string>): string | undefined {
  if (!category) return undefined;

  const categoryId = slugify(category);
  return categoryIds.has(categoryId) ? `/category/${categoryId}` : undefined;
}

export function getPrimaryTokenCategory(
  categories: readonly string[] | undefined,
  categoryIds: ReadonlySet<string>,
  fallback = "Crypto",
): LinkableCategory {
  const validCategories = (categories || []).filter(Boolean);
  const linkableCategory = validCategories.find((category) => getCategoryHref(category, categoryIds));

  if (linkableCategory) {
    return {
      name: linkableCategory,
      href: getCategoryHref(linkableCategory, categoryIds),
    };
  }

  return { name: validCategories[0] || fallback };
}

/** Get all tokens belonging to a specific category slug */
export async function getTokensByCategory(categoryId: string): Promise<TokenSummary[]> {
  const allTokens = await getAllTokens();
  return allTokens.filter(t => 
    (t.categories || []).some(c => slugify(c) === categoryId)
  ).sort((a, b) => a.rank - b.rank);
}

/**
 * Get all token IDs that should have a page on the regular /[token] route. (memoized)
 * Excludes non-released upcoming TGE tokens so they only appear under /upcoming/[token].
 */
export async function getTokenIds(): Promise<string[]> {
  if (_tokenIdsCache) return _tokenIdsCache;

  // Use the registry or allTokens as the source for IDs
  const allTokens = await getAllTokens();
  const ids = new Set<string>(allTokens.map(t => t.id));

  // Also include tokens that have content but might missing from registry
  const contentDir = getContentDir();
  if (typeof window === "undefined") {
    try {
      const dirs = await fs.promises.readdir(/* turbopackIgnore: true */ contentDir);
      for (const dir of dirs) {
        try {
          const dirPath = `${contentDir}/${dir}`;
          const stat = await fs.promises.stat(/* turbopackIgnore: true */ dirPath);
          if (stat.isDirectory()) {
            const tokenFile = `${getDataDir()}/tokens/${dir}.json`;
            const raw = JSON.parse(await fs.promises.readFile(/* turbopackIgnore: true */ tokenFile, "utf-8"));
            if (getMarketDataQualityIssues(raw).length === 0) {
              ids.add(dir);
            }
          }
        } catch { /* Skip invalid/inaccessible dirs */ }
      }
    } catch {}
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
    }
  }
  
  _tokenIdsCache = result;
  return result;
}

/** Load detailed token data. */
export async function getTokenDetail(tokenId: string): Promise<TokenDetail | null> {
  const sanitized = tokenId.replace(/[^a-z0-9-]/g, "");
  
  // Try loading from blob first
  const relativePath = "data/_tokens_blob.json";
  const file = getFilePath("_tokens_blob.json");
  
  if (!_tokensBlob) _tokensBlob = await loadBlob<Record<string, unknown>>(file, relativePath);
  const raw = _tokensBlob ? _tokensBlob[sanitized] : null;

  if (raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRawToTokenDetail(raw as Record<string, any>);
  }

  // Fallback to single file read (Development/Scripts)
  const fallbackFile = `${getDataDir()}/tokens/${sanitized}.json`;
  const relPath = `data/tokens/${sanitized}.json`;
  const rawFile = await loadBlob<Record<string, unknown>>(fallbackFile, relPath);
  if (rawFile) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRawToTokenDetail(rawFile as Record<string, any>);
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawToTokenDetail(r: any): TokenDetail | null {
  if (!r || !r.id) {
    return null;
  }

  const marketIssues = getMarketDataQualityIssues(r);

  if (marketIssues.length > 0) {
    if (!_untrustedTokenWarningCache.has(r.id)) {
      _untrustedTokenWarningCache.add(r.id);
      console.warn(`[LOADER] Token ${r.id} has untrusted market data (${marketIssues.join(", ")}). Skipping mapping.`);
    }
    return null;
  }
  
  return {
    id: r.id,
    symbol: r.symbol,
    name: r.name,
    imageUrl: getEmbeddedTokenImageUrl(r),
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
    fetchedAt: (r.fetchedAt as string) || (r.lastMarketUpdate as string) || new Date().toISOString(),
  };
}

/**
 * Load upcoming TGEs. Sorts: upcoming first, then released.
 */
export async function getUpcomingTGEs(): Promise<UpcomingTge[]> {
  try {
    const relativePath = "data/upcoming-tges.json";
    const file = getFilePath("upcoming-tges.json");
    const tges: UpcomingTge[] = ((await loadBlob<UpcomingTge[]>(file, relativePath)) || [])
      .map(normalizeTge)
      .filter((tge) => tge.lifecycleStatus !== "rejected");
    if (!tges.length) return [];

    // Sort: upcoming first, released last; then by narrative strength desc
    tges.sort((a, b) => {
      const statusWeight = getTgeSortWeight(a) - getTgeSortWeight(b);
      if (statusWeight !== 0) return statusWeight;
      const confidenceWeight = (b.confidence || 0) - (a.confidence || 0);
      if (confidenceWeight !== 0) return confidenceWeight;
      return (b.narrativeStrength || 0) - (a.narrativeStrength || 0);
    });

    // Deduplicate by symbol — generic symbols (TBD/N/A/TBA) are exempt
    const seenSymbols = new Set<string>();
    const deduped: UpcomingTge[] = [];

    for (const tge of tges) {
      const sym = (tge.symbol || "").toUpperCase();
      if (!isGenericTgeSymbol(sym) && seenSymbols.has(sym)) continue;
      if (!isGenericTgeSymbol(sym)) seenSymbols.add(sym);
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
  const relativePath = "data/_metrics_blob.json";
  const file = getFilePath("_metrics_blob.json");
  
  if (!_metricsBlob) _metricsBlob = await loadBlob<Record<string, unknown>>(file, relativePath);
  const raw = _metricsBlob ? _metricsBlob[tokenId] : null;

  if (raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRawToTokenMetrics(raw as any, tokenId);
  }

  // Fallback
  const fallbackFile = `${getDataDir()}/metrics/${tokenId}.json`;
  const relPath = `data/metrics/${tokenId}.json`;
  const rawFile = await loadBlob<Record<string, unknown>>(fallbackFile, relPath);
  if (rawFile) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRawToTokenMetrics(rawFile as any, tokenId);
  }
  return null;
}

/** Load the generated free-data search intent dataset. */
export async function getSearchIntentDataset(): Promise<SearchIntentDataset | null> {
  if (_searchIntentDataset) return _searchIntentDataset;

  const relativePath = "data/search-intent.json";
  const file = getFilePath("search-intent.json");
  _searchIntentDataset = await loadBlob<SearchIntentDataset>(file, relativePath);
  return _searchIntentDataset;
}

/** Load generated daily search-intent snapshot history. */
export async function getSearchIntentHistoryDataset(): Promise<SearchIntentHistoryDataset | null> {
  if (_searchIntentHistoryDataset) return _searchIntentHistoryDataset;

  const relativePath = "data/search-intent-history.json";
  const file = getFilePath("search-intent-history.json");
  _searchIntentHistoryDataset = await loadBlob<SearchIntentHistoryDataset>(file, relativePath);
  return _searchIntentHistoryDataset;
}

/** Return per-token deltas between the two most recent daily search-intent snapshots. */
export async function getSearchIntentTrendMap(): Promise<Record<string, TokenSearchIntentTrend>> {
  if (_searchIntentTrendMap) return _searchIntentTrendMap;

  const history = await getSearchIntentHistoryDataset();
  const entries = [...(history?.entries || [])].sort((a, b) => b.date.localeCompare(a.date));

  if (entries.length < 2) {
    _searchIntentTrendMap = {};
    return _searchIntentTrendMap;
  }

  const [current, previous] = entries;
  const trends: Record<string, TokenSearchIntentTrend> = {};

  for (const [tokenId, currentPoint] of Object.entries(current.tokens)) {
    const previousPoint = previous.tokens[tokenId];
    if (!previousPoint) continue;

    trends[tokenId] = {
      tokenId,
      currentDate: current.date,
      previousDate: previous.date,
      attentionDelta: currentPoint.attentionScore - previousPoint.attentionScore,
      hypeDelta: currentPoint.hypeScore - previousPoint.hypeScore,
      supplyRiskDelta: currentPoint.supplyRiskScore - previousPoint.supplyRiskScore,
      previousClassification: previousPoint.classification,
      previousPrimaryIntent: previousPoint.primaryIntent,
      classificationChanged: currentPoint.classification !== previousPoint.classification,
      primaryIntentChanged: currentPoint.primaryIntent !== previousPoint.primaryIntent,
    };
  }

  _searchIntentTrendMap = trends;
  return _searchIntentTrendMap;
}

/** Load one token's generated search intent snapshot. */
export async function getTokenSearchIntent(tokenId: string): Promise<TokenSearchIntentSnapshot | null> {
  const dataset = await getSearchIntentDataset();
  return dataset?.tokens?.[tokenId] || null;
}

/** Return one token's search-intent trend, when at least two daily snapshots exist. */
export async function getTokenSearchIntentTrend(tokenId: string): Promise<TokenSearchIntentTrend | null> {
  const trendMap = await getSearchIntentTrendMap();
  return trendMap[tokenId] || null;
}

/** Return the highest-attention generated search intent snapshots. */
export async function getTopSearchIntentTokens(limit: number = 6): Promise<TokenSearchIntentSnapshot[]> {
  const dataset = await getSearchIntentDataset();
  if (!dataset?.tokens) return [];

  return Object.values(dataset.tokens)
    .sort((a, b) => b.attentionScore - a.attentionScore || b.hypeScore - a.hypeScore || a.tokenName.localeCompare(b.tokenName))
    .slice(0, limit);
}

/** Return tokens where a given search intent appears in the generated intent mix. */
export async function getSearchIntentTokensByIntent(
  intent: SearchIntentType,
  limit?: number,
): Promise<TokenSearchIntentSnapshot[]> {
  const dataset = await getSearchIntentDataset();
  if (!dataset?.tokens) return [];

  const matching = Object.values(dataset.tokens)
    .filter((token) => token.intentMix.some((item) => item.intent === intent))
    .sort((a, b) => {
      const aIntentScore = a.intentMix.find((item) => item.intent === intent)?.score || 0;
      const bIntentScore = b.intentMix.find((item) => item.intent === intent)?.score || 0;
      return bIntentScore - aIntentScore || b.attentionScore - a.attentionScore || a.tokenName.localeCompare(b.tokenName);
    });

  return typeof limit === "number" ? matching.slice(0, limit) : matching;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawToTokenMetrics(r: any, tokenId: string): TokenMetrics {
  const riskScore = r.riskScore ?? 5; // Default to 5 instead of 0 if missing
  
  if (riskScore === 0 && r.tokenId) {
    console.warn(`[LOADER] riskScore is 0 for ${tokenId}. Check source data.`);
  }

  return {
    tokenId: r.tokenId || tokenId,
    tokenName: r.tokenName || "",
    symbol: r.symbol || "",
    riskScore: riskScore,
    riskLevel: r.riskLevel || "medium",
    growthPotentialIndex: r.growthPotentialIndex ?? 0,
    narrativeStrength: r.narrativeStrength ?? 0,
    valueVsAth: r.valueVsAth ?? 0,
    volatilityIndex: r.volatilityIndex ?? 0,
    summary: r.summary || "",
    computedAt: (r.computedAt as string) || new Date().toISOString(),
  };
}

/** Load price history for charts. */
export async function getPriceHistory(tokenId: string): Promise<PriceHistory | null> {
  // Try loading from blob
  const relativePath = "data/_prices_blob.json";
  const file = getFilePath("_prices_blob.json");
  
  if (!_pricesBlob) _pricesBlob = await loadBlob<Record<string, unknown>>(file, relativePath);
  const raw = _pricesBlob ? _pricesBlob[tokenId] : null;

  if (raw) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRawToPriceHistory(raw as any, tokenId);
  }

  // Fallback
  const fallbackFile = `${getDataDir()}/prices/${tokenId}.json`;
  const relPath = `data/prices/${tokenId}.json`;
  const rawFile = await loadBlob<Record<string, unknown>>(fallbackFile, relPath);
  if (rawFile) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapRawToPriceHistory(rawFile as any, tokenId);
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawToPriceHistory(r: any, tokenId: string): PriceHistory {
  return {
    id: r.id || tokenId,
    name: r.name || "",
    chart30d: r.chart30d || [],
    chart1y: r.chart1y || [],
    fetchedAt: (r.fetchedAt as string) || new Date().toISOString(),
  };
}

/** Load a generated article for a token. */
export async function getArticle(tokenId: string, slug: string): Promise<Article | null> {
  const file = `${getContentDir()}/${tokenId}/${slug}.json`;
  const relPath = `content/tokens/${tokenId}/${slug}.json`;
  const article = await loadBlob<Article>(file, relPath);
  if (!article) return null;

  const normalizedContent = normalizeArticleMarkdown(article.content || "");
  const wordCount = normalizedContent.split(/\s+/).filter(Boolean).length;

  return {
    ...article,
    content: normalizedContent,
    wordCount,
  };
}

/** Get token IDs that have a published article for the given article slug. */
export async function getTokenIdsWithArticle(slug: string): Promise<string[]> {
  const sanitizedSlug = slug.replace(/[^a-z0-9-]/g, "");
  if (!sanitizedSlug || typeof window !== "undefined") return [];

  const tokenIds = await getTokenIds();
  const contentDir = getContentDir();
  const result: string[] = [];

  for (const tokenId of tokenIds) {
    const file = `${contentDir}/${tokenId}/${sanitizedSlug}.json`;
    try {
      if (!fs.existsSync(/* turbopackIgnore: true */ file)) continue;
      const detail = await getTokenDetail(tokenId);
      if (detail) result.push(tokenId);
    } catch {
      // Skip inaccessible or malformed content paths.
    }
  }

  return result;
}

/** Get all article slugs for a token. */
export async function getArticleSlugs(tokenId: string): Promise<string[]> {
  const dir = `${getContentDir()}/${tokenId}`;
  if (typeof window === "undefined") {
    try {
      const files = await fs.promises.readdir(/* turbopackIgnore: true */ dir);
      return files
        .filter((f) => f.endsWith(".json") && !f.includes(".prompt"))
        .map((f) => f.replace(".json", ""));
    } catch {}
  }
  
  // Minimal fallback — we usually only need "overview" for checks
  return ["overview"];
}

/** Count all published articles across all tokens. */
export async function getTotalArticleCount(): Promise<number> {
  const contentDir = getContentDir();
  if (typeof window === "undefined") {
    try {
      const routableTokenIds = new Set(await getTokenIds());
      const routableTgeIds = new Set((await getUpcomingTGEs()).map((tge) => tge.id));
      let count = 0;
      const tokenDirs = await fs.promises.readdir(/* turbopackIgnore: true */ contentDir);
      for (const tokenDir of tokenDirs) {
        if (!routableTokenIds.has(tokenDir) && !routableTgeIds.has(tokenDir)) continue;

        const dirPath = `${contentDir}/${tokenDir}`;
        const stat = await fs.promises.stat(/* turbopackIgnore: true */ dirPath);
        if (!stat.isDirectory()) continue;
        const files = await fs.promises.readdir(/* turbopackIgnore: true */ dirPath);
        count += files.filter((file) => {
          if (!file.endsWith(".json") || file.includes(".prompt")) return false;
          if (routableTokenIds.has(tokenDir)) return true;
          return file === "tge-preview.json";
        }).length;
      }
      return count;
    } catch {}
  }
  
  // Fallback for SSR
  const registry = await getAllTokens();
  return Math.floor(registry.length * 0.95); // High-confidence estimate if FS missing
}

/** Extract FAQs from article markdown content for structured data. */
export function getArticleFaqs(content: string): FAQ[] {
  const faqs: FAQ[] = [];
  const normalized = normalizeArticleMarkdown(content);
  const faqSectionMatch = normalized.match(/##\s*FAQ([\s\S]*?)(?:---|$)/i);
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

  const boldQuestionPattern = /\*\*(.+?)\*\*\s*\n+([\s\S]*?)(?=\n+\*\*.+?\*\*|$)/g;
  while ((match = boldQuestionPattern.exec(faqText)) !== null) {
    faqs.push({
      question: match[1].trim().replace(/^Q:\s*/i, ""),
      answer: match[2].trim().replace(/^A:\s*/i, ""),
    });
  }

  if (faqs.length > 0) return faqs;

  const numberedPattern = /(?:^|\n)(\d+\.\s+[^?\n]+?\?)\s*([\s\S]*?)(?=(?:\n\d+\.\s+[^?\n]+?\?)|$)/g;
  while ((match = numberedPattern.exec(faqText)) !== null) {
    faqs.push({
      question: match[1].replace(/^\d+\.\s+/, "").trim(),
      answer: match[2].trim(),
    });
  }

  if (faqs.length > 0) return faqs;
  
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
  const cacheKey = `${tokenId}:${limit}`;
  const cached = _relatedTokensCache.get(cacheKey);
  if (cached) {
    logLoaderDebug(`Cache hit for related tokens ${cacheKey}`);
    return cached;
  }

  const allTokens = await getAllTokens();
  const targetToken = allTokens.find((t) => t.id === tokenId);
  
  // Basic fallback
  const index = allTokens.findIndex((t) => t.id === tokenId);
  if (!targetToken || !targetToken.categories || targetToken.categories.length === 0) {
    if (index === -1) {
      const result = allTokens.slice(0, limit);
      _relatedTokensCache.set(cacheKey, result);
      return result;
    }
    const startIndex = Math.max(0, index - limit);
    const result = allTokens.slice(startIndex, index + limit + 1).filter((t) => t.id !== tokenId).slice(0, limit);
    _relatedTokensCache.set(cacheKey, result);
    return result;
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
    const result = candidates.slice(0, limit).map(c => c.token);
    _relatedTokensCache.set(cacheKey, result);
    return result;
  }

  // Fill up with nearby ranked tokens if not enough semantic matches
  const startIndex = Math.max(0, index - limit);
  const fallback = allTokens.slice(startIndex, index + limit + 1).filter((t) => t.id !== tokenId && !candidates.some(c => c.token.id === t.id));
  
  const result = [...candidates.map(c => c.token), ...fallback].slice(0, limit);
  _relatedTokensCache.set(cacheKey, result);
  return result;
}

export { formatPrice, formatCompact, formatSupply, formatPercent } from "./formatters";

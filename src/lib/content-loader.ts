/**
 * Content loader — reads generated articles and token data from JSON files.
 * Used by dynamic pages at build time (SSG) to render content.
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CONTENT_DIR = path.resolve(process.cwd(), "content/tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PRICES_DIR = path.join(DATA_DIR, "prices");
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

// ── Memoization ────────────────────────────────────────────────

let _allTokensCache: TokenSummary[] | null = null;

/** Get all token summaries from the master list (memoized). */
export function getAllTokens(): TokenSummary[] {
  if (_allTokensCache) return _allTokensCache;

  const tokensDir = path.join(DATA_DIR, "tokens");
  if (!fs.existsSync(tokensDir)) return [];
  
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
        rank: detail.market.marketCapRank || 999,
        price: detail.market.price,
        marketCap: detail.market.marketCap,
        volume24h: detail.market.volume24h,
        priceChange24h: detail.market.priceChange24h,
        image: "", // Safely optional in UI
        ath: detail.market.ath,
        athDate: detail.market.athDate,
        atl: detail.market.atl,
        atlDate: detail.market.atlDate,
        circulatingSupply: detail.market.circulatingSupply,
        totalSupply: detail.market.totalSupply,
        maxSupply: detail.market.maxSupply,
      });
    } catch (_e) {
      // Skip invalid JSONs safely
    }
  }
  
  _allTokensCache = summaries;
  return summaries;
}

export interface CategorySummary {
  id: string;
  name: string;
  count: number;
}

/** Get all discrete categories with at least 3 tokens */
export function getAllCategories(): CategorySummary[] {
  const allTokens = getAllTokens();
  const counts: Record<string, number> = {};
  const nameMap: Record<string, string> = {};
  
  for (const t of allTokens) {
    if (!t.categories) continue;
    for (const c of t.categories) {
       const id = c.toLowerCase().replace(/[^a-z0-9]+/g, '-');
       counts[id] = (counts[id] || 0) + 1;
       nameMap[id] = c;
    }
  }
  
  return Object.entries(counts)
    .filter(([_, count]) => count >= 3)
    .map(([id, count]) => ({ id, name: nameMap[id], count }))
    .sort((a, b) => b.count - a.count);
}

/** Get all tokens belonging to a specific category slug */
export function getTokensByCategory(categoryId: string): TokenSummary[] {
  return getAllTokens().filter(t => 
    (t.categories || []).some(c => c.toLowerCase().replace(/[^a-z0-9]+/g, '-') === categoryId)
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
export function getTokenIds(): string[] {
  const tokensDir = path.join(DATA_DIR, "tokens");
  const ids = new Set<string>();

  if (fs.existsSync(tokensDir)) {
    fs.readdirSync(tokensDir)
      .filter((f) => f.endsWith(".json"))
      .forEach((f) => ids.add(f.replace(".json", "")));
  }

  if (fs.existsSync(CONTENT_DIR)) {
    fs.readdirSync(CONTENT_DIR)
      .forEach((dir) => {
        if (fs.statSync(path.join(CONTENT_DIR, dir)).isDirectory()) {
          ids.add(dir);
        }
      });
  }

  // Load upcoming TGE IDs so we can exclude pre-launch tokens without data
  const upcomingTgeIds = new Set<string>();
  if (fs.existsSync(TGE_FILE)) {
    try {
      const tges: UpcomingTge[] = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8"));
      tges
        .filter((t) => t.status !== "released")
        .forEach((t) => upcomingTgeIds.add(t.id));
    } catch {
      // Ignore parse errors — fail open (include all tokens)
    }
  }

  return Array.from(ids).filter((id) => {
    if (!upcomingTgeIds.has(id)) return true;

    // Upcoming TGE — only include if it has real market data
    const tokenFile = path.join(tokensDir, `${id}.json`);
    if (!fs.existsSync(tokenFile)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(tokenFile, "utf-8"));
      return data.market?.price > 0 && data.market?.marketCap > 0;
    } catch {
      return false;
    }
  });
}

/** Load detailed token data. */
export function getTokenDetail(tokenId: string): TokenDetail | null {
  // Sanitize tokenId to prevent path traversal
  const sanitized = tokenId.replace(/[^a-z0-9-]/g, "");
  const file = path.join(DATA_DIR, "tokens", `${sanitized}.json`);
  if (!fs.existsSync(file)) return null;
  
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    
    // Provide safe defaults for Lite tokens missing full data
    return {
      id: raw.id,
      symbol: raw.symbol,
      name: raw.name,
      description: raw.description || "",
      categories: raw.categories || [],
      genesisDate: raw.genesisDate || null,
      links: {
        website: raw.links?.website || null,
        github: raw.links?.github || null,
        reddit: raw.links?.reddit || null,
        explorer: raw.links?.explorer || null,
      },
      market: {
        price: raw.market?.price ?? 0,
        marketCap: raw.market?.marketCap ?? 0,
        marketCapRank: raw.market?.marketCapRank ?? 999,
        volume24h: raw.market?.volume24h ?? 0,
        high24h: raw.market?.high24h ?? 0,
        low24h: raw.market?.low24h ?? 0,
        priceChange24h: raw.market?.priceChange24h ?? 0,
        priceChange7d: raw.market?.priceChange7d ?? 0,
        priceChange30d: raw.market?.priceChange30d ?? 0,
        priceChange1y: raw.market?.priceChange1y ?? 0,
        ath: raw.market?.ath ?? 0,
        athChangePercentage: raw.market?.athChangePercentage ?? 0,
        athDate: raw.market?.athDate ?? "",
        atl: raw.market?.atl ?? 0,
        atlDate: raw.market?.atlDate ?? "",
        circulatingSupply: raw.market?.circulatingSupply ?? 0,
        totalSupply: raw.market?.totalSupply ?? null,
        maxSupply: raw.market?.maxSupply ?? null,
        fdv: raw.market?.fdv ?? null,
      },
      community: {
        twitterFollowers: raw.community?.twitterFollowers ?? null,
        redditSubscribers: raw.community?.redditSubscribers ?? null,
      },
      developer: {
        githubStars: raw.developer?.githubStars ?? null,
        githubForks: raw.developer?.githubForks ?? null,
        commits4Weeks: raw.developer?.commits4Weeks ?? null,
      },
      fetchedAt: raw.fetchedAt || raw.lastMarketUpdate || new Date().toISOString(),
    };
  } catch (_e) {
    return null;
  }
}

/**
 * Load upcoming TGEs. Sorts: upcoming first, then released.
 * Deduplicates by symbol (case-insensitive) as a runtime safety net,
 * keeping the entry with the highest narrativeStrength.
 */
export function getUpcomingTGEs(): UpcomingTge[] {
  if (!fs.existsSync(TGE_FILE)) return [];
  try {
    const tges: UpcomingTge[] = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8"));

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
export function getTokenMetrics(tokenId: string): TokenMetrics | null {
  const file = path.join(METRICS_DIR, `${tokenId}.json`);
  if (!fs.existsSync(file)) return null;
  
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return {
      tokenId: raw.tokenId || tokenId,
      tokenName: raw.tokenName || "",
      symbol: raw.symbol || "",
      riskScore: raw.riskScore ?? 0,
      riskLevel: raw.riskLevel || "medium",
      growthPotentialIndex: raw.growthPotentialIndex ?? 0,
      narrativeStrength: raw.narrativeStrength ?? 0,
      valueVsAth: raw.valueVsAth ?? 0,
      volatilityIndex: raw.volatilityIndex ?? 0,
      summary: raw.summary || "",
      computedAt: raw.computedAt || new Date().toISOString(),
    };
  } catch (_e) {
    return null;
  }
}

/** Load price history for charts. */
export function getPriceHistory(tokenId: string): PriceHistory | null {
  const file = path.join(PRICES_DIR, `${tokenId}.json`);
  if (!fs.existsSync(file)) return null;
  
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return {
      id: raw.id || tokenId,
      name: raw.name || "",
      chart30d: raw.chart30d || [],
      chart1y: raw.chart1y || [],
      fetchedAt: raw.fetchedAt || new Date().toISOString(),
    };
  } catch (_e) {
    return null;
  }
}

/** Load a generated article for a token. */
export function getArticle(tokenId: string, slug: string): Article | null {
  const file = path.join(CONTENT_DIR, tokenId, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (_e) {
    return null;
  }
}

/** Get all article slugs for a token. */
export function getArticleSlugs(tokenId: string): string[] {
  const dir = path.join(CONTENT_DIR, tokenId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.includes(".prompt"))
    .map((f) => f.replace(".json", ""));
}

/** Count all published articles across all tokens. */
export function getTotalArticleCount(): number {
  if (!fs.existsSync(CONTENT_DIR)) return 0;
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
export function getRelatedTokens(tokenId: string, limit: number = 3): TokenSummary[] {
  const allTokens = getAllTokens();
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

export { formatPrice, formatCompact, formatSupply } from "./formatters";

/**
 * Content loader — reads generated articles and token data from JSON files.
 * Used by dynamic pages at build time (SSG) to render content.
 */

import * as fs from "fs";
import * as path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CONTENT_DIR = path.resolve(process.cwd(), "content/tokens");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PRICES_DIR = path.join(DATA_DIR, "prices");

// ── Types ──────────────────────────────────────────────────────

export interface TokenSummary {
  id: string;
  name: string;
  symbol: string;
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

// ── Loaders ────────────────────────────────────────────────────

/** Get all token summaries from the master list. */
export function getAllTokens(): TokenSummary[] {
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
        rank: 999, // Fallback if rank isn't strictly tracked in Detail
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
    } catch (e) {
      // Skip invalid JSONs safely
    }
  }
  
  return summaries;
}

/** Get all token IDs that have detailed data. */
export function getTokenIds(): string[] {
  const tokensDir = path.join(DATA_DIR, "tokens");
  if (!fs.existsSync(tokensDir)) return [];
  return fs
    .readdirSync(tokensDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

/** Load detailed token data. */
export function getTokenDetail(tokenId: string): TokenDetail | null {
  const file = path.join(DATA_DIR, "tokens", `${tokenId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Load token metrics. */
export function getTokenMetrics(tokenId: string): TokenMetrics | null {
  const file = path.join(METRICS_DIR, `${tokenId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Load price history for charts. */
export function getPriceHistory(tokenId: string): PriceHistory | null {
  const file = path.join(PRICES_DIR, `${tokenId}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

/** Load a generated article for a token. */
export function getArticle(tokenId: string, slug: string): Article | null {
  const file = path.join(CONTENT_DIR, tokenId, `${slug}.json`);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8"));
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

/** Format price for display. */
export function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/** Format large numbers compactly. */
export function formatCompact(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/** Format supply numbers. */
export function formatSupply(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(0)}K`;
  return value.toFixed(0);
}

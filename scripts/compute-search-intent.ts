/**
 * Search Intent Radar computation.
 *
 * Generates a static, free-data attention layer from cached token data,
 * TokenRadar metrics, generated keyword templates, and TGE records.
 *
 * No paid APIs or live network requests are used.
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";

import {
  SEARCH_INTENT_LABELS,
  clampScore,
  getAttentionLabel,
  type HypeClassification,
  type SearchIntentDataset,
  type SearchIntentHistoryDataset,
  type SearchIntentHistoryEntry,
  type SearchIntentType,
  type TokenSearchIntentMixItem,
  type TokenSearchIntentSnapshot,
} from "../src/lib/search-intent";
import { getMarketDataQualityIssues } from "../src/lib/market-data-quality";
import { writeFileAtomic } from "../src/lib/utils";

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const KEYWORDS_FILE = path.join(DATA_DIR, "keywords.json");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const OUTPUT_FILE = path.join(DATA_DIR, "search-intent.json");
const HISTORY_OUTPUT_FILE = path.join(DATA_DIR, "search-intent-history.json");
const MAX_HISTORY_DAYS = 45;

type TokenData = {
  id: string;
  symbol: string;
  name: string;
  categories?: string[];
  genesisDate?: string | null;
  fetchedAt?: string;
  lastMarketUpdate?: string;
  market?: {
    marketCap?: number;
    marketCapRank?: number;
    volume24h?: number;
    priceChange24h?: number;
    priceChange7d?: number;
    priceChange30d?: number;
    priceChange1y?: number;
    athChangePercentage?: number;
    circulatingSupply?: number;
    totalSupply?: number | null;
    maxSupply?: number | null;
    fdv?: number | null;
  };
  developer?: {
    githubStars?: number | null;
    commits4Weeks?: number | null;
  };
};

type TokenMetrics = {
  riskScore?: number;
  growthPotentialIndex?: number;
  narrativeStrength?: number;
  volatilityIndex?: number;
  computedAt?: string;
};

type KeywordRecord = {
  tokenId?: string;
  keyword?: string;
  type?: string;
};

type UpcomingTgeRecord = {
  id?: string;
  symbol?: string;
  name?: string;
  expectedTge?: string;
  status?: string;
  lifecycleStatus?: string;
  confidence?: number;
  narrativeStrength?: number;
};

type IntentCandidate = {
  intent: SearchIntentType;
  score: number;
  queries: string[];
};

const MAX_QUERY_EXAMPLES = 5;

function readJson<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function latestIsoTimestamp(values: Array<string | undefined | null>): string {
  const timestamps = values
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter((value) => Number.isFinite(value));
  if (timestamps.length === 0) return new Date().toISOString();
  return new Date(Math.max(...timestamps)).toISOString();
}

function categoryText(token: TokenData): string {
  return (token.categories || []).join(" ").toLowerCase();
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function hasStablecoinIntent(token: TokenData): boolean {
  const haystack = `${token.name} ${token.symbol} ${categoryText(token)}`.toLowerCase();
  return includesAny(haystack, [
    "stablecoin",
    "usd stable",
    "us dollar",
    "dollar",
    "euro",
    "eur",
    "t-bill",
    "treasury",
    "yield-bearing stablecoin",
  ]);
}

function hasRwaIntent(token: TokenData): boolean {
  const haystack = `${token.name} ${categoryText(token)}`.toLowerCase();
  return includesAny(haystack, [
    "real world asset",
    "rwa",
    "tokenized",
    "treasury",
    "t-bill",
    "stock",
    "xstock",
    "securitize",
    "fund",
    "private credit",
  ]);
}

function hasAiIntent(token: TokenData): boolean {
  const haystack = `${token.name} ${categoryText(token)}`.toLowerCase();
  return includesAny(haystack, ["artificial intelligence", " ai", "ai ", "agent", "compute", "depin"]);
}

function hasMemeIntent(token: TokenData): boolean {
  const haystack = `${token.name} ${categoryText(token)}`.toLowerCase();
  return includesAny(haystack, ["meme", "politifi", "frog", "dog", "cat", "4chan", "the boy"]);
}

function hasYieldIntent(token: TokenData): boolean {
  const haystack = `${token.name} ${categoryText(token)}`.toLowerCase();
  return includesAny(haystack, ["defi", "staking", "yield", "lending", "liquid staking", "restaking", "treasury"]);
}

function volumeRatioPercent(token: TokenData): number {
  const marketCap = token.market?.marketCap || 0;
  const volume24h = token.market?.volume24h || 0;
  if (marketCap <= 0) return 0;
  return (volume24h / marketCap) * 100;
}

export function computeSupplyRiskScore(token: TokenData): number {
  const market = token.market || {};
  const circulating = market.circulatingSupply || 0;
  const total = market.totalSupply || market.maxSupply || 0;
  const fdv = market.fdv || 0;
  const marketCap = market.marketCap || 0;

  const lockedSupplyRatio = total > 0 && circulating > 0 ? Math.max(0, (total - circulating) / total) : 0;
  const fdvGapRatio = fdv > marketCap && marketCap > 0 ? (fdv - marketCap) / fdv : 0;
  const weakLiquidityPenalty = volumeRatioPercent(token) < 1 ? 18 : volumeRatioPercent(token) < 3 ? 8 : 0;

  return clampScore(lockedSupplyRatio * 65 + fdvGapRatio * 55 + weakLiquidityPenalty);
}

export function computeAttentionScore(token: TokenData, metrics: TokenMetrics = {}): number {
  const market = token.market || {};
  const abs24h = Math.abs(market.priceChange24h || 0);
  const abs7d = Math.abs(market.priceChange7d || 0);
  const abs30d = Math.abs(market.priceChange30d || 0);
  const ratio = volumeRatioPercent(token);
  const rank = market.marketCapRank || 9999;

  let score = 18;
  score += Math.min(24, abs24h * 3);
  score += Math.min(18, abs7d * 0.9);
  score += Math.min(16, abs30d * 0.35);
  score += Math.min(16, ratio * 1.8);
  score += Math.min(14, (metrics.narrativeStrength || 30) * 0.14);

  if (rank <= 25) score += 12;
  else if (rank <= 100) score += 9;
  else if (rank <= 250) score += 5;

  if (hasMemeIntent(token)) score += 8;
  if (hasAiIntent(token)) score += 6;
  if (hasRwaIntent(token)) score += 5;
  if (hasStablecoinIntent(token)) score += 4;

  return clampScore(score);
}

export function computeFundamentalsScore(token: TokenData, metrics: TokenMetrics = {}): number {
  const market = token.market || {};
  const riskScore = metrics.riskScore || 5;
  const ratio = volumeRatioPercent(token);
  const marketCap = market.marketCap || 0;
  const rank = market.marketCapRank || 9999;
  const supplyRisk = computeSupplyRiskScore(token);
  const commits = token.developer?.commits4Weeks || 0;
  const stars = token.developer?.githubStars || 0;

  let score = 18;
  score += Math.max(0, 10 - riskScore) * 5.5;
  score += Math.min(18, ratio * 2.2);
  score += Math.min(15, (metrics.growthPotentialIndex || 0) * 0.15);
  score += Math.min(12, (metrics.narrativeStrength || 30) * 0.12);
  score += Math.min(8, commits * 0.2 + stars / 2000);
  score += marketCap >= 10e9 ? 12 : marketCap >= 1e9 ? 8 : marketCap >= 250e6 ? 4 : 0;
  score += rank <= 100 ? 5 : rank <= 250 ? 2 : 0;
  score -= supplyRisk * 0.25;

  return clampScore(score);
}

function buildQuery(token: TokenData, template: string): string {
  return template.replace("{token}", token.name).replace("{symbol}", token.symbol.toUpperCase());
}

function addQueries(base: string[], extra: string[]): string[] {
  return Array.from(new Set([...base, ...extra])).slice(0, MAX_QUERY_EXAMPLES);
}

function keywordQueries(tokenId: string, keywords: KeywordRecord[]): string[] {
  return keywords
    .filter((keyword) => keyword.tokenId === tokenId && typeof keyword.keyword === "string")
    .map((keyword) => keyword.keyword || "")
    .filter(Boolean)
    .slice(0, MAX_QUERY_EXAMPLES);
}

function createIntentCandidates(token: TokenData, metrics: TokenMetrics, keywords: KeywordRecord[], tge?: UpcomingTgeRecord): IntentCandidate[] {
  const market = token.market || {};
  const riskScore = metrics.riskScore || 5;
  const supplyRisk = computeSupplyRiskScore(token);
  const keywordMatches = keywordQueries(token.id, keywords);
  const positiveMomentum = Math.max(0, market.priceChange24h || 0) + Math.max(0, market.priceChange30d || 0) * 0.25;
  const absoluteMomentum = Math.abs(market.priceChange24h || 0) + Math.abs(market.priceChange30d || 0) * 0.18;
  const liquidity = volumeRatioPercent(token);

  const candidates: IntentCandidate[] = [
    {
      intent: "prediction",
      score: clampScore(28 + absoluteMomentum * 2 + (metrics.growthPotentialIndex || 0) * 0.25),
      queries: addQueries(keywordMatches, [
        buildQuery(token, "{token} price prediction 2026"),
        buildQuery(token, "{token} price prediction today"),
        buildQuery(token, "{symbol} price target"),
      ]),
    },
    {
      intent: "buying",
      score: clampScore(20 + positiveMomentum * 1.8 + Math.min(22, liquidity * 2.5) + (market.marketCapRank && market.marketCapRank <= 150 ? 8 : 0)),
      queries: [
        buildQuery(token, "how to buy {token}"),
        buildQuery(token, "where to buy {token}"),
        buildQuery(token, "{symbol} crypto exchange"),
      ],
    },
    {
      intent: "risk",
      score: clampScore(22 + riskScore * 5.5 + (metrics.volatilityIndex || 0) * 0.18 + (liquidity < 1 ? 12 : 0)),
      queries: [
        buildQuery(token, "{token} risks"),
        buildQuery(token, "is {token} safe"),
        buildQuery(token, "{token} scam check"),
      ],
    },
    {
      intent: "supply",
      score: clampScore(12 + supplyRisk * 0.85),
      queries: [
        buildQuery(token, "{token} token unlock"),
        buildQuery(token, "{token} circulating supply"),
        buildQuery(token, "{token} tokenomics"),
      ],
    },
    {
      intent: "news",
      score: clampScore(14 + Math.abs(market.priceChange24h || 0) * 2 + Math.min(16, liquidity * 1.2)),
      queries: [
        buildQuery(token, "{token} news today"),
        buildQuery(token, "why is {token} moving"),
        buildQuery(token, "{symbol} crypto news"),
      ],
    },
  ];

  if (hasYieldIntent(token)) {
    candidates.push({
      intent: "yield",
      score: clampScore(42 + (hasStablecoinIntent(token) ? 12 : 0) + (metrics.narrativeStrength || 30) * 0.2),
      queries: [
        buildQuery(token, "{token} staking rewards"),
        buildQuery(token, "{token} yield"),
        buildQuery(token, "{symbol} APY"),
      ],
    });
  }

  if (hasStablecoinIntent(token)) {
    candidates.push({
      intent: "stablecoin",
      score: clampScore(72 + supplyRisk * 0.25 + (liquidity < 1 ? 10 : 0)),
      queries: [
        buildQuery(token, "{token} stablecoin risk"),
        buildQuery(token, "{token} reserves"),
        buildQuery(token, "{symbol} depeg risk"),
      ],
    });
  }

  if (hasRwaIntent(token)) {
    candidates.push({
      intent: "rwa",
      score: clampScore(50 + (metrics.narrativeStrength || 30) * 0.25 + supplyRisk * 0.2),
      queries: [
        buildQuery(token, "{token} RWA crypto"),
        buildQuery(token, "{token} tokenized asset"),
        buildQuery(token, "{token} issuer risk"),
      ],
    });
  }

  if (hasAiIntent(token)) {
    candidates.push({
      intent: "ai",
      score: clampScore(48 + (metrics.narrativeStrength || 30) * 0.3 + positiveMomentum),
      queries: [
        buildQuery(token, "{token} AI crypto"),
        buildQuery(token, "{token} AI agent"),
        buildQuery(token, "{symbol} AI token"),
      ],
    });
  }

  if (hasMemeIntent(token)) {
    candidates.push({
      intent: "meme",
      score: clampScore(46 + positiveMomentum * 2 + riskScore * 2),
      queries: [
        buildQuery(token, "{token} meme coin"),
        buildQuery(token, "{token} price prediction"),
        buildQuery(token, "is {token} worth buying"),
      ],
    });
  }

  if (tge) {
    candidates.push({
      intent: "airdrop",
      score: clampScore(54 + (tge.confidence || 0) * 0.25 + (tge.narrativeStrength || 0) * 0.2),
      queries: [
        buildQuery(token, "{token} airdrop"),
        buildQuery(token, "{token} TGE"),
        buildQuery(token, "{token} listing date"),
      ],
    });
  }

  return candidates;
}

function classifyIntent(token: TokenData, attentionScore: number, hypeScore: number, fundamentalsScore: number, supplyRiskScore: number): HypeClassification {
  if (hasStablecoinIntent(token)) return "Stablecoin Safety Check";
  if (supplyRiskScore >= 70 && attentionScore >= 45) return "Supply-Risk Spike";
  if (attentionScore < 35) return "Quiet Watch";
  if (attentionScore >= 55 && fundamentalsScore < 42 && hypeScore >= 58) return "FOMO Spike";
  if (attentionScore >= 45 && fundamentalsScore < 35) return "Low-Quality Attention";
  if ((hasAiIntent(token) || hasRwaIntent(token) || hasMemeIntent(token)) && attentionScore >= 45) return "Narrative Rotation";
  return "Organic Interest";
}

function createDrivers(token: TokenData, metrics: TokenMetrics, attentionScore: number, topIntent: SearchIntentType): string[] {
  const market = token.market || {};
  const drivers: string[] = [];
  const change24h = market.priceChange24h || 0;
  const change30d = market.priceChange30d || 0;
  const ratio = volumeRatioPercent(token);

  if (Math.abs(change24h) >= 5) drivers.push(`${change24h >= 0 ? "Positive" : "Negative"} 24h move is large enough to trigger prediction and news searches.`);
  if (Math.abs(change30d) >= 15) drivers.push(`30-day move of ${change30d.toFixed(1)}% keeps medium-term forecasts relevant.`);
  if (ratio >= 5) drivers.push(`24h volume equals ${ratio.toFixed(1)}% of market cap, so liquidity is visible.`);
  if ((metrics.narrativeStrength || 0) >= 75) drivers.push("Category mapping points to an active crypto narrative.");
  if (hasAiIntent(token)) drivers.push("AI-related categories match current AI crypto search behavior.");
  if (hasRwaIntent(token)) drivers.push("RWA/tokenization category matches current tokenized asset searches.");
  if (hasMemeIntent(token)) drivers.push("Meme-token category can amplify retail search spikes.");
  if (topIntent === "stablecoin") drivers.push("Stablecoin searches tend to focus on peg, reserves, and yield safety.");
  if (drivers.length === 0 && attentionScore >= 35) drivers.push("Market rank and baseline token searches keep this asset on the watchlist.");
  if (drivers.length === 0) drivers.push("No strong free-data catalyst is visible yet.");

  return drivers.slice(0, 4);
}

function createCautions(token: TokenData, metrics: TokenMetrics, supplyRiskScore: number): string[] {
  const market = token.market || {};
  const cautions: string[] = [];
  const ratio = volumeRatioPercent(token);
  const riskScore = metrics.riskScore || 5;

  if (riskScore >= 7) cautions.push(`Risk score is ${riskScore}/10, so attention should be treated as speculative.`);
  if (ratio < 1) cautions.push("24h volume is thin relative to market cap.");
  if (supplyRiskScore >= 55) cautions.push("FDV or supply gap suggests unlock/sell-pressure checks matter.");
  if ((market.athChangePercentage || 0) <= -80) cautions.push("Price remains deeply below all-time high, which can attract recovery searches without confirming trend quality.");
  if (hasStablecoinIntent(token)) cautions.push("Stablecoin and tokenized cash pages should focus on issuer, reserve, and depeg risk.");
  if (cautions.length === 0) cautions.push("No major free-data caution dominated the search-intent score.");

  return cautions.slice(0, 4);
}

export function buildTokenSearchIntent(
  token: TokenData,
  metrics: TokenMetrics = {},
  keywords: KeywordRecord[] = [],
  tge?: UpcomingTgeRecord,
  computedAt = new Date().toISOString(),
): TokenSearchIntentSnapshot {
  const attentionScore = computeAttentionScore(token, metrics);
  const fundamentalsScore = computeFundamentalsScore(token, metrics);
  const supplyRiskScore = computeSupplyRiskScore(token);
  const hypeScore = clampScore(
    attentionScore * 0.75 +
      Math.max(0, (token.market?.priceChange24h || 0)) * 2 +
      (hasMemeIntent(token) ? 14 : 0) +
      (metrics.riskScore || 5) * 2 -
      fundamentalsScore * 0.25,
  );

  const intentMix = createIntentCandidates(token, metrics, keywords, tge)
    .map<TokenSearchIntentMixItem>((candidate) => ({
      intent: candidate.intent,
      label: SEARCH_INTENT_LABELS[candidate.intent],
      score: candidate.score,
      queries: candidate.queries,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const primaryIntent = intentMix[0]?.intent || "prediction";
  const classification = classifyIntent(token, attentionScore, hypeScore, fundamentalsScore, supplyRiskScore);
  const queryExamples = Array.from(new Set(intentMix.flatMap((item) => item.queries))).slice(0, MAX_QUERY_EXAMPLES);

  return {
    tokenId: token.id,
    tokenName: token.name,
    symbol: token.symbol,
    attentionScore,
    attentionLabel: getAttentionLabel(attentionScore),
    hypeScore,
    fundamentalsScore,
    supplyRiskScore,
    classification,
    primaryIntent,
    intentMix,
    drivers: createDrivers(token, metrics, attentionScore, primaryIntent),
    cautions: createCautions(token, metrics, supplyRiskScore),
    queryExamples,
    sourceSignals: [
      "TokenRadar keyword templates",
      "Cached CoinGecko market and supply data",
      "TokenRadar risk and narrative metrics",
      "Local TGE records when available",
    ],
    computedAt,
  };
}

function buildSummary(dataset: Record<string, TokenSearchIntentSnapshot>, generatedAt: string) {
  const tokens = Object.values(dataset);
  const intentStats = new Map<SearchIntentType, { tokenCount: number; scoreSum: number }>();

  for (const token of tokens) {
    const current = intentStats.get(token.primaryIntent) || { tokenCount: 0, scoreSum: 0 };
    current.tokenCount += 1;
    current.scoreSum += token.intentMix[0]?.score || 0;
    intentStats.set(token.primaryIntent, current);
  }

  const topIntents = Array.from(intentStats.entries())
    .map(([intent, stats]) => ({
      intent,
      label: SEARCH_INTENT_LABELS[intent],
      tokenCount: stats.tokenCount,
      avgScore: clampScore(stats.scoreSum / Math.max(1, stats.tokenCount)),
    }))
    .sort((a, b) => b.tokenCount - a.tokenCount || b.avgScore - a.avgScore)
    .slice(0, 6);

  const sorted = [...tokens].sort(
    (a, b) => b.attentionScore - a.attentionScore || b.hypeScore - a.hypeScore || a.tokenName.localeCompare(b.tokenName),
  );

  return {
    generatedAt,
    tokenCount: tokens.length,
    topIntents,
    hotTokens: sorted.filter((token) => token.attentionLabel === "Hot").slice(0, 10).map((token) => token.tokenId),
    watchTokens: sorted.slice(0, 20).map((token) => token.tokenId),
    methodology: [
      "Scores are built from TokenRadar's cached market, liquidity, supply, category, developer, and risk signals.",
      "Attention blends price movement, volume-to-market-cap, market rank, and narrative category strength.",
      "Fundamentals blend risk score, liquidity, market cap, developer activity, growth potential, and supply pressure.",
      "Intent labels are research prompts, not trading signals or financial advice.",
    ],
  };
}

function buildHistoryEntry(output: SearchIntentDataset, capturedAt: string): SearchIntentHistoryEntry {
  const sorted = Object.values(output.tokens).sort(
    (a, b) => b.attentionScore - a.attentionScore || b.hypeScore - a.hypeScore || a.tokenName.localeCompare(b.tokenName),
  );

  return {
    date: capturedAt.slice(0, 10),
    generatedAt: capturedAt,
    tokenCount: output.summary.tokenCount,
    topIntents: output.summary.topIntents,
    hotTokens: output.summary.hotTokens,
    watchTokens: output.summary.watchTokens,
    tokens: Object.fromEntries(
      sorted.map((token) => [
        token.tokenId,
        {
          tokenId: token.tokenId,
          attentionScore: token.attentionScore,
          hypeScore: token.hypeScore,
          supplyRiskScore: token.supplyRiskScore,
          classification: token.classification,
          primaryIntent: token.primaryIntent,
        },
      ]),
    ),
  };
}

function historyEntryFingerprint(entry: SearchIntentHistoryEntry): string {
  const { generatedAt: _generatedAt, ...stableFields } = entry;
  return JSON.stringify(stableFields);
}

function sameHistoryDataset(a: SearchIntentHistoryDataset, b: SearchIntentHistoryDataset): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function mergeSearchIntentHistory(
  output: SearchIntentDataset,
  existing: SearchIntentHistoryDataset,
  capturedAt = new Date().toISOString(),
): SearchIntentHistoryDataset {
  const currentEntry = buildHistoryEntry(output, capturedAt);
  const existingSameDayEntry = existing.entries.find((entry) => entry.date === currentEntry.date);
  const entryToStore =
    existingSameDayEntry && historyEntryFingerprint(existingSameDayEntry) === historyEntryFingerprint(currentEntry)
      ? existingSameDayEntry
      : currentEntry;

  const legacySourceDate = output.generatedAt.slice(0, 10);
  const entries = [
    entryToStore,
    ...existing.entries.filter((entry) => (
      entry.date !== entryToStore.date &&
      !(entry.date === legacySourceDate && entry.generatedAt === output.generatedAt)
    )),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_HISTORY_DAYS);

  const nextHistory: SearchIntentHistoryDataset = {
    version: 1,
    generatedAt: capturedAt,
    entries,
  };

  return sameHistoryDataset(existing, { ...nextHistory, generatedAt: existing.generatedAt })
    ? { ...nextHistory, generatedAt: existing.generatedAt }
    : nextHistory;
}

async function updateHistory(output: SearchIntentDataset, capturedAt = new Date().toISOString()): Promise<SearchIntentHistoryDataset> {
  const existing = readJson<SearchIntentHistoryDataset>(HISTORY_OUTPUT_FILE, {
    version: 1,
    generatedAt: capturedAt,
    entries: [],
  });

  const history = mergeSearchIntentHistory(output, existing, capturedAt);
  if (!sameHistoryDataset(existing, history)) {
    await writeFileAtomic(HISTORY_OUTPUT_FILE, JSON.stringify(history, null, 2));
  }

  return history;
}

async function main() {
  console.log("Computing Search Intent Radar from free cached data...");
  const keywordFile = readJson<{ generatedAt?: string; keywords?: KeywordRecord[] }>(KEYWORDS_FILE, { keywords: [] });
  const keywords = keywordFile.keywords || [];
  const tges = readJson<UpcomingTgeRecord[]>(TGE_FILE, []);
  const tgeById = new Map(tges.filter((tge) => tge.id).map((tge) => [tge.id as string, tge]));
  const tgeBySymbol = new Map(tges.filter((tge) => tge.symbol).map((tge) => [(tge.symbol || "").toLowerCase(), tge]));

  const records: Array<{ token: TokenData; metrics: TokenMetrics; tge?: UpcomingTgeRecord }> = [];
  const sourceTimestamps: Array<string | undefined | null> = [keywordFile.generatedAt];
  const tokens: Record<string, TokenSearchIntentSnapshot> = {};
  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter((file) => file.endsWith(".json")).sort();

  for (const file of tokenFiles) {
    const token = readJson<TokenData | null>(path.join(TOKENS_DIR, file), null);
    if (!token?.id || getMarketDataQualityIssues(token).length > 0) continue;

    const metrics = readJson<TokenMetrics>(path.join(METRICS_DIR, `${token.id}.json`), {});
    const tge = tgeById.get(token.id) || tgeBySymbol.get((token.symbol || "").toLowerCase());
    records.push({ token, metrics, tge });
    sourceTimestamps.push(token.lastMarketUpdate, token.fetchedAt, metrics.computedAt);
  }

  const generatedAt = latestIsoTimestamp(sourceTimestamps);
  for (const { token, metrics, tge } of records) {
    tokens[token.id] = buildTokenSearchIntent(token, metrics, keywords, tge, generatedAt);
  }

  const output: SearchIntentDataset = {
    generatedAt,
    version: 1,
    summary: buildSummary(tokens, generatedAt),
    tokens,
  };

  await writeFileAtomic(OUTPUT_FILE, JSON.stringify(output, null, 2));
  const history = await updateHistory(output);
  console.log(`Search Intent Radar complete: ${Object.keys(tokens).length} tokens -> ${path.relative(process.cwd(), OUTPUT_FILE)}`);
  console.log(`Search Intent history updated: ${history.entries.length} daily snapshot(s) -> ${path.relative(process.cwd(), HISTORY_OUTPUT_FILE)}`);
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

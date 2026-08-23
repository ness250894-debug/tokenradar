/**
 * Proprietary Metrics Computation — Phase 3
 *
 * Computes TokenRadar's unique metrics from CoinGecko data:
 * - Risk Score (1-10)
 * - Growth Potential Index
 * - Narrative Strength
 * - Value vs ATH
 * - Volatility Index
 *
 * These metrics are the core differentiation vs. generic crypto sites.
 *
 * Usage:
 *   npx tsx scripts/compute-metrics.ts
 *   npx tsx scripts/compute-metrics.ts --token bitcoin
 *
 * Cost: $0 (pure computation on cached data)
 */

import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import {
  CATEGORY_INPUT_SELECTION_MAX_AGE_MS,
  newestValidObservationTimestamp,
  resolveProviderMarketTimestamp,
} from "../src/lib/market-data-quality";
import { logError, logActivity } from "../src/lib/reporter";
import { safeReadJson, loadEnv, ensureDirSync } from "../src/lib/utils";
import type { TokenDetail } from "../src/lib/content-loader";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const PRICES_DIR = path.join(DATA_DIR, "prices");
const METRICS_DIR = path.join(DATA_DIR, "metrics");

// ── Types ──────────────────────────────────────────────────────

export interface TokenMetrics {
  tokenId: string;
  tokenName: string;
  symbol: string;
  riskScore: number; // 1–10 (10 = highest risk)
  riskLevel: "low" | "medium" | "high";
  growthPotentialIndex: number; // 0–100
  narrativeStrength: number; // 0–100
  valueVsAth: number; // 0–100 (% of ATH)
  volatilityIndex: number; // 0–100
  holderConcentrationEstimate: "low" | "medium" | "high" | "unknown";
  summary: string; // One-line human-readable summary
  /** Snapshot time of the cached market inputs used by this computation. */
  marketDataAsOf: string;
  /** Newest underlying price observation used for volatility. */
  priceHistoryAsOf?: string;
  /** Oldest market snapshot used in the selected category median. */
  categoryDataAsOf?: string;
  /** Oldest timestamp across every required metric input. */
  inputDataAsOf?: string;
  computedAt: string;
}

export function resolvePriceHistoryAsOf(priceData: {
  priceHistoryAsOf?: unknown;
  chart30d?: Array<{ date?: unknown }>;
  chart1y?: Array<{ date?: unknown }>;
}): string | undefined {
  const chartTimestamp = newestValidObservationTimestamp(
    (priceData.chart30d || []).map((point) => point.date),
  );
  return chartTimestamp || resolveProviderMarketTimestamp(priceData.priceHistoryAsOf);
}

export function resolveMetricMarketDataAsOf(token: {
  lastMarketUpdate?: unknown;
  fetchedAt?: unknown;
}): string | undefined {
  return resolveProviderMarketTimestamp(token.lastMarketUpdate);
}

export function isCategoryInputEligibleForMetrics(
  marketDataAsOf: unknown,
  now: Date = new Date(),
): boolean {
  const timestamp = resolveProviderMarketTimestamp(marketDataAsOf);
  if (!timestamp) return false;
  const ageMs = now.getTime() - Date.parse(timestamp);
  return ageMs >= -60_000 && ageMs < CATEGORY_INPUT_SELECTION_MAX_AGE_MS;
}

export function resolveCategoryMetricContext(
  categories: string[],
  medians: Readonly<Record<string, number>>,
  observationTimes: Readonly<Record<string, number[]>>,
): { medianCap: number; dataAsOf?: string } | undefined {
  for (const category of categories) {
    const key = category.toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(medians, key)) continue;
    const oldestInput = Math.min(...(observationTimes[key] || []));
    return {
      medianCap: medians[key],
      dataAsOf: Number.isFinite(oldestInput)
        ? new Date(oldestInput).toISOString()
        : undefined,
    };
  }
  return undefined;
}

// ── Metric Calculations ────────────────────────────────────────

/**
 * Compute 30-day price volatility (coefficient of variation).
 * CV = (std dev / mean) * 100
 */
export function computeVolatility(prices: { price: number }[]): number {
  if (prices.length < 2) return 0;

  const values = prices.map((p) => p.price);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;

  const variance =
    values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  return (stdDev / mean) * 100;
}

/**
 * Risk Score (1-10)
 *
 * Based on 4 factors:
 * 1. Volatility (30d CV) — higher = riskier
 * 2. Market cap — lower = riskier
 * 3. Trading volume ratio — lower volume-to-cap = riskier
 * 4. ATH drawdown — bigger drawdown = riskier
 *
 * Each factor contributes 0-2.5 points, clamped to 1-10.
 */
export function computeRiskScore(
  volatility: number,
  marketCap: number,
  volume24h: number,
  athChangePercentage: number
): number {
  // Factor 1: Volatility (0-2.5)
  // CV < 3 = low vol, CV > 20 = extreme vol
  const volScore = Math.min(2.5, (volatility / 20) * 2.5);

  // Factor 2: Market cap (0-2.5)
  // > $10B = 0, < $500M = 2.5
  const capScore =
    marketCap >= 10e9
      ? 0
      : marketCap <= 500e6
        ? 2.5
        : 2.5 * (1 - (marketCap - 500e6) / (10e9 - 500e6));

  // Factor 3: Volume ratio (0-2.5)
  // volume/cap > 10% = liquid, < 1% = illiquid
  const volumeRatio = marketCap > 0 ? (volume24h / marketCap) * 100 : 0;
  const volumeScore =
    volumeRatio >= 10
      ? 0
      : volumeRatio <= 1
        ? 2.5
        : 2.5 * (1 - (volumeRatio - 1) / 9);

  // Factor 4: ATH drawdown (0-2.5)
  // athChangePercentage is negative (e.g., -80 means 80% down from ATH)
  const drawdown = Math.abs(athChangePercentage);
  const athScore = Math.min(2.5, (drawdown / 90) * 2.5);

  const raw = volScore + capScore + volumeScore + athScore;
  return Math.max(1, Math.min(10, Math.round(raw)));
}

/**
 * Growth Potential Index (0-100)
 *
 * How much room this token has to grow relative to peers.
 * Based on: distance from ATH, market cap vs category median, and age.
 */
export function computeGrowthPotential(
  marketCap: number,
  categoryMedianCap: number,
  athChangePercentage: number,
  priceChange30d: number
): number {
  // Factor 1: Distance from ATH (0-40 points)
  // Tokens far from ATH have more "recovery potential"
  const drawdown = Math.abs(athChangePercentage);
  const athFactor = Math.min(40, (drawdown / 95) * 40);

  // Factor 2: Market cap vs category median (0-40 points)
  // Tokens below category median have more upside
  const capRatio =
    categoryMedianCap > 0 ? marketCap / categoryMedianCap : 1;
  const capFactor = capRatio < 1 ? 40 * (1 - capRatio) : 0;

  // Factor 3: Recent momentum (0-20 points)
  // Positive 30d change suggests building momentum
  const momentumFactor = Math.min(20, Math.max(0, priceChange30d * 0.5));

  return Math.round(Math.min(100, athFactor + capFactor + momentumFactor));
}

/**
 * Narrative Strength (0-100)
 *
 * How strong the narrative is for this token's category.
 * Based on category popularity scores.
 */
const NARRATIVE_SCORES: Record<string, number> = {
  // High narrative strength (hot categories)
  "artificial-intelligence": 95,
  ai: 95,
  "layer-2": 85,
  "real-world-assets": 80,
  depin: 78,
  meme: 75,
  gaming: 70,
  // Medium narrative strength
  "decentralized-finance-defi": 65,
  defi: 65,
  "layer-1": 60,
  modular: 60,
  "data-availability": 58,
  oracle: 55,
  infrastructure: 55,
  interoperability: 50,
  // Lower narrative strength
  "exchange-based-tokens": 45,
  privacy: 40,
  storage: 40,
  payment: 35,
};

export function computeNarrativeStrength(categories: string[]): number {
  if (!categories || categories.length === 0) return 30; // default

  let maxScore = 30;
  for (const cat of categories) {
    const normalized = cat.toLowerCase().replace(/\s+/g, "-");
    for (const [key, score] of Object.entries(NARRATIVE_SCORES)) {
      if (normalized.includes(key)) {
        maxScore = Math.max(maxScore, score);
      }
    }
  }
  return maxScore;
}

/**
 * Value vs ATH — how far the current price is from the all-time high.
 * Returns 0-100 (100 = at ATH, 0 = nearly worthless).
 */
export function computeValueVsAth(athChangePercentage: number): number {
  // athChangePercentage is negative (e.g., -80 = 80% below ATH)
  return Math.max(0, Math.min(100, Math.round(100 + athChangePercentage)));
}

export function buildMetricSummary(
  tokenName: string,
  riskLevel: "low" | "medium" | "high",
  growthPotential: number,
  narrativeStrength: number,
  valueVsAth: number
): string {
  const summaryParts: string[] = [];
  if (riskLevel === "high") summaryParts.push("high-risk");
  else if (riskLevel === "low") summaryParts.push("lower-risk");
  if (growthPotential >= 70) summaryParts.push("high recovery-room signal");
  else if (growthPotential <= 30) summaryParts.push("limited recovery-room signal");
  if (narrativeStrength >= 75) summaryParts.push("strong narrative");
  if (valueVsAth >= 80) summaryParts.push("near ATH");
  else if (valueVsAth <= 20) summaryParts.push("deeply discounted vs ATH");

  return summaryParts.length > 0
    ? `${tokenName} is a ${summaryParts.join(", ")} token.`
    : `${tokenName} has moderate metrics across the board.`;
}

// ── Main ───────────────────────────────────────────────────────

export async function main(args = process.argv.slice(2)) {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Metrics Computation        ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  ensureDirSync(METRICS_DIR);

  const tokenArg = args.indexOf("--token") !== -1 ? args[args.indexOf("--token") + 1] : null;

  let tokenFiles = fs
    .readdirSync(TOKENS_DIR)
    .filter((f) => f.endsWith(".json"));

  if (tokenArg) {
    tokenFiles = tokenFiles.filter(f => f === `${tokenArg}.json`);
    if (tokenFiles.length === 0) {
      console.error(`  ✗ Token data file for "${tokenArg}" not found in data/tokens/.`);
      process.exit(1);
    }
  }

  if (tokenFiles.length === 0) {
    console.error("  ✗ No token files to process.");
    process.exit(1);
  }

  if (tokenArg) {
    console.log(`  Target: Single Token (${tokenArg})`);
  } else {
    console.log(`  Found ${tokenFiles.length} token data files`);
  }
  console.log();

  // Compute category median market caps
  const allTokenData: {
    id: string;
    name: string;
    symbol: string;
    marketCap: number;
    categories: string[];
    market: {
      athChangePercentage: number;
      volume24h: number;
      priceChange30d: number;
    };
    marketDataAsOf?: string;
  }[] = [];

  for (const file of tokenFiles) {
    const raw = safeReadJson<TokenDetail>(path.join(TOKENS_DIR, file), null as unknown as TokenDetail);
    if (!raw || !raw.id) continue;
    allTokenData.push({
      id: raw.id,
      name: raw.name,
      symbol: raw.symbol,
      marketCap: raw.market?.marketCap || 0,
      categories: raw.categories || [],
      marketDataAsOf: resolveMetricMarketDataAsOf(
        raw as TokenDetail & { lastMarketUpdate?: unknown },
      ),
      market: {
        athChangePercentage: raw.market?.athChangePercentage || 0,
        volume24h: raw.market?.volume24h || 0,
        priceChange30d: raw.market?.priceChange30d || 0,
      },
    });
  }

  // Category median computation
  const categoryMarketCaps: Record<string, number[]> = {};
  const categoryMarketTimes: Record<string, number[]> = {};
  const categoryFreshnessNow = new Date();
  for (const token of allTokenData) {
    const marketTimestamp = Date.parse(token.marketDataAsOf || "");
    if (!isCategoryInputEligibleForMetrics(token.marketDataAsOf, categoryFreshnessNow)) continue;
    for (const cat of token.categories) {
      const key = cat.toLowerCase();
      if (!categoryMarketCaps[key]) categoryMarketCaps[key] = [];
      if (!categoryMarketTimes[key]) categoryMarketTimes[key] = [];
      categoryMarketCaps[key].push(token.marketCap);
      categoryMarketTimes[key].push(marketTimestamp);
    }
  }

  const categoryMedians: Record<string, number> = {};
  for (const [cat, caps] of Object.entries(categoryMarketCaps)) {
    const sorted = caps.sort((a, b) => a - b);
    categoryMedians[cat] = sorted[Math.floor(sorted.length / 2)];
  }

  // Compute metrics for each token
  console.log("▶ Computing metrics...");
  let tokensProcessed = 0;

  for (const token of allTokenData) {
    if (!token.marketDataAsOf) {
      console.warn(`  Skipping ${token.name}: no provider-observed market timestamp.`);
      continue;
    }
    // Load price history for volatility
    let volatility = 10; // default
    let priceHistoryAsOf: string | undefined;
    const priceFile = path.join(PRICES_DIR, `${token.id}.json`);
    if (fs.existsSync(priceFile)) {
      const priceData = safeReadJson<any>(priceFile, {});
      if (priceData.chart30d?.length > 0) {
        volatility = computeVolatility(priceData.chart30d);
        priceHistoryAsOf = resolvePriceHistoryAsOf(priceData);
      }
    }

    // Get category median
    const categoryContext = resolveCategoryMetricContext(
      token.categories,
      categoryMedians,
      categoryMarketTimes,
    );
    const categoryMedianCap = categoryContext?.medianCap ?? 1e9; // default $1B
    const categoryDataAsOf = categoryContext?.dataAsOf;

    const riskScore = computeRiskScore(
      volatility,
      token.marketCap,
      token.market.volume24h,
      token.market.athChangePercentage
    );

    const growthPotential = computeGrowthPotential(
      token.marketCap,
      categoryMedianCap,
      token.market.athChangePercentage,
      token.market.priceChange30d
    );

    const narrativeStrength = computeNarrativeStrength(token.categories);
    const valueVsAth = computeValueVsAth(token.market.athChangePercentage);

    const riskLevel: "low" | "medium" | "high" =
      riskScore <= 3 ? "low" : riskScore <= 6 ? "medium" : "high";

    const summary = buildMetricSummary(
      token.name,
      riskLevel,
      growthPotential,
      narrativeStrength,
      valueVsAth
    );

    const inputTimestamps = [token.marketDataAsOf, priceHistoryAsOf, categoryDataAsOf]
      .map((value) => Date.parse(value || ""))
      .filter(Number.isFinite);
    const hasAllRequiredInputTimestamps = Boolean(priceHistoryAsOf && categoryDataAsOf);
    const metrics: TokenMetrics = {
      tokenId: token.id,
      tokenName: token.name,
      symbol: token.symbol,
      riskScore,
      riskLevel,
      growthPotentialIndex: growthPotential,
      narrativeStrength,
      valueVsAth,
      volatilityIndex: Math.round(Math.min(100, volatility * 5)),
      holderConcentrationEstimate: "unknown", // requires on-chain data
      summary,
      marketDataAsOf: token.marketDataAsOf,
      priceHistoryAsOf,
      categoryDataAsOf,
      inputDataAsOf: hasAllRequiredInputTimestamps
        ? new Date(Math.min(...inputTimestamps)).toISOString()
        : undefined,
      computedAt: new Date().toISOString(),
    };

    tokensProcessed++;

    // Save per-token metrics
    fs.writeFileSync(
      path.join(METRICS_DIR, `${token.id}.json`),
      JSON.stringify(metrics, null, 2)
    );

    console.log(
      `  ${token.name.padEnd(20)} Risk: ${riskScore}/10  Growth: ${growthPotential}  Narrative: ${narrativeStrength}  ATH: ${valueVsAth}%`
    );
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║        Metrics Computation Complete      ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Tokens:    ${String(tokensProcessed).padStart(6)}                 ║`);
  console.log(`║  Output:    data/metrics/                ║`);
  console.log("╚══════════════════════════════════════════╝");

  // Log success for Daily Report
  logActivity("metrics-calc", {
    tokensProcessed
  });
}

function isDirectExecution(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint) && import.meta.url === pathToFileURL(path.resolve(entrypoint)).href;
}

if (isDirectExecution()) {
  main().catch(async (error) => {
    await logError("compute-metrics", error);
    process.exit(1);
  });
}

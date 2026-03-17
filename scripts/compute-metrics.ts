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
 *
 * Cost: $0 (pure computation on cached data)
 */

import * as fs from "fs";
import * as path from "path";
import { logError } from "../src/lib/reporter";

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
  computedAt: string;
}

// ── Metric Calculations ────────────────────────────────────────

/**
 * Compute 30-day price volatility (coefficient of variation).
 * CV = (std dev / mean) * 100
 */
function computeVolatility(prices: { price: number }[]): number {
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
function computeRiskScore(
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
function computeGrowthPotential(
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

function computeNarrativeStrength(categories: string[]): number {
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
function computeValueVsAth(athChangePercentage: number): number {
  // athChangePercentage is negative (e.g., -80 = 80% below ATH)
  return Math.max(0, Math.round(100 + athChangePercentage));
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Metrics Computation        ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  if (!fs.existsSync(METRICS_DIR)) {
    fs.mkdirSync(METRICS_DIR, { recursive: true });
  }

  // Load all token detail files
  if (!fs.existsSync(TOKENS_DIR)) {
    console.error("  ✗ data/tokens/ not found. Run fetch-crypto-data first.");
    process.exit(1);
  }

  const tokenFiles = fs
    .readdirSync(TOKENS_DIR)
    .filter((f) => f.endsWith(".json"));

  if (tokenFiles.length === 0) {
    console.error("  ✗ No token files found in data/tokens/. Run fetch-crypto-data first.");
    process.exit(1);
  }

  console.log(`  Found ${tokenFiles.length} token data files`);
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
  }[] = [];

  for (const file of tokenFiles) {
    const raw = JSON.parse(
      fs.readFileSync(path.join(TOKENS_DIR, file), "utf-8")
    );
    allTokenData.push({
      id: raw.id,
      name: raw.name,
      symbol: raw.symbol,
      marketCap: raw.market?.marketCap || 0,
      categories: raw.categories || [],
      market: {
        athChangePercentage: raw.market?.athChangePercentage || 0,
        volume24h: raw.market?.volume24h || 0,
        priceChange30d: raw.market?.priceChange30d || 0,
      },
    });
  }

  // Category median computation
  const categoryMarketCaps: Record<string, number[]> = {};
  for (const token of allTokenData) {
    for (const cat of token.categories) {
      const key = cat.toLowerCase();
      if (!categoryMarketCaps[key]) categoryMarketCaps[key] = [];
      categoryMarketCaps[key].push(token.marketCap);
    }
  }

  const categoryMedians: Record<string, number> = {};
  for (const [cat, caps] of Object.entries(categoryMarketCaps)) {
    const sorted = caps.sort((a, b) => a - b);
    categoryMedians[cat] = sorted[Math.floor(sorted.length / 2)];
  }

  // Compute metrics for each token
  console.log("▶ Computing metrics...");
  const allMetrics: TokenMetrics[] = [];

  for (const token of allTokenData) {
    // Load price history for volatility
    let volatility = 10; // default
    const priceFile = path.join(PRICES_DIR, `${token.id}.json`);
    if (fs.existsSync(priceFile)) {
      const priceData = JSON.parse(fs.readFileSync(priceFile, "utf-8"));
      if (priceData.chart30d?.length > 0) {
        volatility = computeVolatility(priceData.chart30d);
      }
    }

    // Get category median
    let categoryMedianCap = 1e9; // default $1B
    for (const cat of token.categories) {
      const key = cat.toLowerCase();
      if (categoryMedians[key]) {
        categoryMedianCap = categoryMedians[key];
        break;
      }
    }

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

    // Generate one-line summary
    const summaryParts: string[] = [];
    if (riskLevel === "high") summaryParts.push("high-risk");
    else if (riskLevel === "low") summaryParts.push("lower-risk");
    if (growthPotential >= 70) summaryParts.push("high growth potential");
    else if (growthPotential <= 30) summaryParts.push("limited upside");
    if (narrativeStrength >= 75) summaryParts.push("strong narrative");
    if (valueVsAth <= 20) summaryParts.push("near ATH");
    else if (valueVsAth >= 80) summaryParts.push("deeply discounted vs ATH");

    const summary =
      summaryParts.length > 0
        ? `${token.name} is a ${summaryParts.join(", ")} token.`
        : `${token.name} has moderate metrics across the board.`;

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
      computedAt: new Date().toISOString(),
    };

    allMetrics.push(metrics);

    // Save per-token metrics
    fs.writeFileSync(
      path.join(METRICS_DIR, `${token.id}.json`),
      JSON.stringify(metrics, null, 2)
    );

    console.log(
      `  ${token.name.padEnd(20)} Risk: ${riskScore}/10  Growth: ${growthPotential}  Narrative: ${narrativeStrength}  ATH: ${valueVsAth}%`
    );
  }

  // Save combined metrics file
  fs.writeFileSync(
    path.join(METRICS_DIR, "_all.json"),
    JSON.stringify(
      {
        computedAt: new Date().toISOString(),
        tokenCount: allMetrics.length,
        metrics: allMetrics,
      },
      null,
      2
    )
  );

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║        Metrics Computation Complete      ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Tokens:    ${String(allMetrics.length).padStart(6)}                 ║`);
  console.log(`║  Output:    data/metrics/                ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch(async (error) => {
  await logError("compute-metrics", error);
  process.exit(1);
});

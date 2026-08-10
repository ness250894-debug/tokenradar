import type { TokenMetrics, TokenSummary } from "@/lib/content-loader";

export interface RiskBucket {
  id: "low" | "medium" | "high";
  label: string;
  min: number;
  max: number;
  count: number;
  share: number;
}

export interface CategoryRiskRow {
  category: string;
  tokenCount: number;
  averageRisk: number;
  averageVolatility: number;
  averageChange24h: number;
  totalMarketCap: number;
}

export interface LiquidRiskRow {
  id: string;
  name: string;
  symbol: string;
  rank: number;
  riskScore: number;
  volatilityIndex: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
}

export interface MarketRiskSnapshot {
  generatedAt: string;
  sampleSize: number;
  trackedTokenCount: number;
  liquidCoverageCount: number;
  riskIndex: number;
  averageRisk: number;
  averageVolatility: number;
  averageChange24h: number;
  totalMarketCap: number;
  buckets: RiskBucket[];
  categories: CategoryRiskRow[];
  liquidRiskLeaders: LiquidRiskRow[];
}

interface ScoredToken {
  token: TokenSummary;
  metrics: TokenMetrics;
}

const LIQUID_VOLUME_THRESHOLD_USD = 1_000_000;
const CATEGORY_MIN_SAMPLE = 5;

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function average(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function latestTimestamp(metrics: TokenMetrics[]): string {
  let latest = 0;
  for (const item of metrics) {
    const timestamp = Date.parse(item.computedAt || "");
    if (Number.isFinite(timestamp) && timestamp > latest) latest = timestamp;
  }
  return latest > 0 ? new Date(latest).toISOString() : new Date(0).toISOString();
}

function buildRiskBuckets(rows: ScoredToken[]): RiskBucket[] {
  const definitions = [
    { id: "low" as const, label: "Lower observed risk", min: 1, max: 3 },
    { id: "medium" as const, label: "Moderate observed risk", min: 4, max: 6 },
    { id: "high" as const, label: "Higher observed risk", min: 7, max: 10 },
  ];

  return definitions.map((bucket) => {
    const count = rows.filter(({ metrics }) => metrics.riskScore >= bucket.min && metrics.riskScore <= bucket.max).length;
    return {
      ...bucket,
      count,
      share: rows.length > 0 ? round((count / rows.length) * 100, 1) : 0,
    };
  });
}

function buildCategoryRows(rows: ScoredToken[]): CategoryRiskRow[] {
  const groups = new Map<string, ScoredToken[]>();

  for (const row of rows) {
    for (const category of row.token.categories) {
      const current = groups.get(category) || [];
      current.push(row);
      groups.set(category, current);
    }
  }

  return Array.from(groups.entries())
    .filter(([, categoryRows]) => categoryRows.length >= CATEGORY_MIN_SAMPLE)
    .map(([category, categoryRows]) => ({
      category,
      tokenCount: categoryRows.length,
      averageRisk: round(average(categoryRows.map(({ metrics }) => metrics.riskScore))),
      averageVolatility: round(average(categoryRows.map(({ metrics }) => metrics.volatilityIndex))),
      averageChange24h: round(average(categoryRows.map(({ token }) => token.priceChange24h)), 2),
      totalMarketCap: Math.round(categoryRows.reduce((sum, { token }) => sum + Math.max(token.marketCap || 0, 0), 0)),
    }))
    .sort((a, b) => b.tokenCount - a.tokenCount || b.totalMarketCap - a.totalMarketCap)
    .slice(0, 12);
}

export function buildMarketRiskSnapshot(
  tokens: TokenSummary[],
  metricsByTokenId: ReadonlyMap<string, TokenMetrics>,
): MarketRiskSnapshot {
  const scoredRows: ScoredToken[] = tokens.flatMap((token) => {
    const metrics = metricsByTokenId.get(token.id);
    return metrics ? [{ token, metrics }] : [];
  });
  const metrics = scoredRows.map((row) => row.metrics);
  const averageRisk = average(metrics.map((item) => item.riskScore));

  const liquidRiskLeaders = scoredRows
    .filter(({ token }) => token.volume24h >= LIQUID_VOLUME_THRESHOLD_USD)
    .toSorted((a, b) =>
      b.metrics.riskScore - a.metrics.riskScore ||
      b.metrics.volatilityIndex - a.metrics.volatilityIndex ||
      b.token.volume24h - a.token.volume24h,
    )
    .slice(0, 10)
    .map(({ token, metrics: tokenMetrics }) => ({
      id: token.id,
      name: token.name,
      symbol: token.symbol,
      rank: token.rank,
      riskScore: tokenMetrics.riskScore,
      volatilityIndex: tokenMetrics.volatilityIndex,
      marketCap: token.marketCap,
      volume24h: token.volume24h,
      priceChange24h: token.priceChange24h,
    }));

  return {
    generatedAt: latestTimestamp(metrics),
    sampleSize: scoredRows.length,
    trackedTokenCount: tokens.length,
    liquidCoverageCount: scoredRows.filter(({ token }) => token.volume24h >= LIQUID_VOLUME_THRESHOLD_USD).length,
    riskIndex: round(averageRisk * 10),
    averageRisk: round(averageRisk),
    averageVolatility: round(average(metrics.map((item) => item.volatilityIndex))),
    averageChange24h: round(average(scoredRows.map(({ token }) => token.priceChange24h)), 2),
    totalMarketCap: Math.round(scoredRows.reduce((sum, { token }) => sum + Math.max(token.marketCap || 0, 0), 0)),
    buckets: buildRiskBuckets(scoredRows),
    categories: buildCategoryRows(scoredRows),
    liquidRiskLeaders,
  };
}

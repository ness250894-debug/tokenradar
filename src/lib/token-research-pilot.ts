import { getPriceHistory, getTokenDetail, getTokenIds, getTokenMetrics } from "@/lib/content-loader";
import type { PriceHistory, TokenDetail, TokenMetrics } from "@/lib/content-loader";
import { computeRiskScore, computeVolatility, riskScoreFactors } from "@/lib/risk-score";

export const RESEARCH_PILOT_IDS = ["bitcoin", "hyperliquid"] as const;

export interface ResearchObservation {
  detail: TokenDetail;
  metrics: TokenMetrics;
  history: PriceHistory | null;
}

function day(value: string | undefined): string | null {
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString().slice(0, 10) : null;
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function observation(row: ResearchObservation) {
  const { detail, metrics, history } = row;
  const { market } = detail;
  const marketDay = day(detail.fetchedAt);
  if (!marketDay || Date.parse(metrics.marketDataAsOf || "") !== Date.parse(detail.fetchedAt) || !history || history.chart30d.length < 2) return null;
  if (![market.price, market.ath, market.marketCap, market.volume24h].every((value) => Number.isFinite(value) && value > 0)) return null;
  if (!Number.isFinite(market.athChangePercentage) || !history.chart30d.every((point) => Number.isFinite(point.price) && point.price > 0 && day(point.date))) return null;
  const priceWindowEnd = history.chart30d.map((point) => point.date).toSorted().at(-1)!;
  if (Date.parse(metrics.priceHistoryAsOf || "") !== Date.parse(priceWindowEnd) || priceWindowEnd.slice(0, 10) > marketDay) return null;
  const volatility = computeVolatility(history.chart30d);
  // Only explain a score when the available inputs reproduce the stored score.
  if (computeRiskScore(volatility, market.marketCap, market.volume24h, market.athChangePercentage) !== metrics.riskScore) return null;
  return {
    id: detail.id,
    name: detail.name,
    categories: detail.categories,
    marketDay,
    marketDataAt: detail.fetchedAt,
    priceWindowStart: history.chart30d.map((point) => point.date).toSorted()[0],
    priceWindowEnd,
    computedAt: metrics.computedAt,
    riskScore: metrics.riskScore,
    drawdown: Math.abs(market.athChangePercentage),
    turnover: market.volume24h / market.marketCap * 100,
    marketCap: market.marketCap,
    volume24h: market.volume24h,
    volatility,
    factors: riskScoreFactors(volatility, market.marketCap, market.volume24h, market.athChangePercentage),
  };
}

export function buildPilotComparison(tokenId: string, rows: ResearchObservation[]) {
  if (!RESEARCH_PILOT_IDS.some((id) => id === tokenId)) return null;
  const observations = rows.flatMap((row) => {
    const result = observation(row);
    return result ? [result] : [];
  });
  const asset = observations.find((row) => row.id === tokenId);
  if (!asset) return null;
  const peers = observations.filter((row) => row.id !== tokenId && row.marketDay === asset.marketDay &&
    (tokenId !== "hyperliquid" || row.categories.includes("Exchange-based Tokens")));
  if (peers.length < 3) return null;
  return {
    asset,
    cohort: tokenId === "hyperliquid" ? "other exchange tokens" : "other tracked assets",
    sampleSize: peers.length,
    medianRisk: median(peers.map((row) => row.riskScore)),
    medianDrawdown: median(peers.map((row) => row.drawdown)),
    medianTurnover: median(peers.map((row) => row.turnover)),
    meanFactors: Object.fromEntries(Object.keys(asset.factors).map((key) => [
      key, peers.reduce((sum, row) => sum + row.factors[key as keyof typeof row.factors], 0) / peers.length,
    ])) as typeof asset.factors,
    peers,
  };
}

export type PilotComparison = NonNullable<ReturnType<typeof buildPilotComparison>>;

let comparisons: Promise<(PilotComparison | null)[]> | undefined;

export function getPilotComparisons() {
  comparisons ??= (async () => {
    const ids = await getTokenIds();
    const rows: ResearchObservation[] = [];
    // The content loader lazily reads large blobs. Avoid concurrent cold reads per token.
    for (const id of ids) {
      const [detail, metrics, history] = await Promise.all([getTokenDetail(id), getTokenMetrics(id), getPriceHistory(id)]);
      if (detail && metrics) rows.push({ detail, metrics, history });
    }
    return RESEARCH_PILOT_IDS.map((id) => buildPilotComparison(id, rows));
  })();
  return comparisons;
}

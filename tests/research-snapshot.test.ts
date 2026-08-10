import { describe, expect, it } from "vitest";

import type { TokenMetrics, TokenSummary } from "../src/lib/content-loader";
import { buildMarketRiskSnapshot } from "../src/lib/research-snapshot";

function token(index: number): TokenSummary {
  return {
    id: `token-${index}`,
    name: `Token ${index}`,
    symbol: `t${index}`,
    categories: ["Test Category"],
    rank: index,
    price: index,
    marketCap: index * 1_000_000,
    volume24h: index * 500_000,
    priceChange24h: index - 3,
    ath: index * 2,
    athDate: "2026-01-01T00:00:00.000Z",
    atl: index / 2,
    atlDate: "2025-01-01T00:00:00.000Z",
    circulatingSupply: 1_000_000,
    totalSupply: 2_000_000,
    maxSupply: 2_000_000,
  };
}

function metrics(index: number, riskScore: number): TokenMetrics {
  return {
    tokenId: `token-${index}`,
    tokenName: `Token ${index}`,
    symbol: `t${index}`,
    riskScore,
    riskLevel: riskScore <= 3 ? "low" : riskScore <= 6 ? "medium" : "high",
    growthPotentialIndex: 50,
    narrativeStrength: 50,
    valueVsAth: 50,
    volatilityIndex: index * 10,
    summary: "Test metric",
    computedAt: `2026-08-0${index}T00:00:00.000Z`,
  };
}

describe("buildMarketRiskSnapshot", () => {
  it("builds a reproducible equal-weighted index and category aggregates", () => {
    const tokens = [1, 2, 3, 4, 5].map(token);
    const risks = [2, 4, 6, 8, 10];
    const metricsByTokenId = new Map(tokens.map((item, index) => [item.id, metrics(index + 1, risks[index])]));

    const snapshot = buildMarketRiskSnapshot(tokens, metricsByTokenId);

    expect(snapshot.sampleSize).toBe(5);
    expect(snapshot.riskIndex).toBe(60);
    expect(snapshot.averageRisk).toBe(6);
    expect(snapshot.buckets.map((bucket) => bucket.count)).toEqual([1, 2, 2]);
    expect(snapshot.categories).toEqual([
      expect.objectContaining({ category: "Test Category", tokenCount: 5, averageRisk: 6 }),
    ]);
    expect(snapshot.liquidCoverageCount).toBe(4);
    expect(snapshot.generatedAt).toBe("2026-08-05T00:00:00.000Z");
  });
});

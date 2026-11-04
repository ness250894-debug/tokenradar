import { describe, expect, it } from "vitest";
import type { ResearchObservation } from "../src/lib/token-research-pilot";
import { buildPilotComparison } from "../src/lib/token-research-pilot";
import { computeRiskScore, computeVolatility, riskScoreFactors } from "../src/lib/risk-score";

function observation(id: string, categories = ["Exchange-based Tokens"], drawdown = -36): ResearchObservation {
  const marketCap = 20e9;
  const volume24h = 1e9;
  const chart30d = [{ date: "2026-10-01T00:00:00.000Z", price: 60 }, { date: "2026-10-15T00:00:00.000Z", price: 64 }];
  return {
    detail: {
      id, name: id, symbol: id, categories, fetchedAt: "2026-11-03T22:30:00.000Z",
      market: { price: 64, ath: 100, marketCap, volume24h, athChangePercentage: drawdown },
    } as ResearchObservation["detail"],
    metrics: {
      riskScore: computeRiskScore(computeVolatility(chart30d), marketCap, volume24h, drawdown),
      marketDataAsOf: "2026-11-03T22:30:00.000Z", priceHistoryAsOf: "2026-10-15T00:00:00.000Z", computedAt: "2026-11-03T23:00:00.000Z",
    } as ResearchObservation["metrics"],
    history: { id, name: id, chart30d, chart1y: [], fetchedAt: "2026-10-15T00:00:00.000Z" },
  };
}

describe("editorial pilot comparisons", () => {
  it("excludes the subject and compares the same market date without misdating old volatility", () => {
    const rows = [observation("bitcoin"), ...["a", "b", "c"].map((id) => observation(id, [], -90))];
    const stale = observation("stale");
    stale.detail.fetchedAt = stale.metrics.marketDataAsOf = "2026-11-02T22:30:00.000Z";
    const result = buildPilotComparison("bitcoin", [...rows, stale])!;
    expect(result.sampleSize).toBe(3);
    expect(result.medianDrawdown).toBe(90);
    expect(result.asset.drawdown).toBe(36);
    expect(result.asset.priceWindowEnd).toBe("2026-10-15T00:00:00.000Z");
    expect(result.peers.map((row) => row.id)).toEqual(["a", "b", "c"]);
    expect(result.medianTurnover).toBe(5);
  });

  it("limits HYPE peers to exchange tokens and calculates medians", () => {
    const result = buildPilotComparison("hyperliquid", [
      observation("hyperliquid"), observation("a", undefined, -10), observation("b", undefined, -20),
      observation("c", undefined, -30), observation("d", undefined, -40), observation("unrelated", [], -100),
    ])!;
    expect(result.sampleSize).toBe(4);
    expect(result.medianDrawdown).toBe(25);
    expect(result.meanFactors.drawdown).toBeCloseTo(25 / 90 * 2.5);
  });

  it("excludes missing, mixed-date and irreproducible inputs instead of presenting them as evidence", () => {
    const invalid = [observation("missing"), observation("mixed"), observation("mismatch"), observation("bad-window"), observation("zero-cap")];
    invalid[0].history = null;
    invalid[1].metrics.marketDataAsOf = "2026-11-03T21:30:00.000Z";
    invalid[2].metrics.riskScore = 10;
    invalid[3].metrics.priceHistoryAsOf = "2026-10-14T00:00:00.000Z";
    invalid[4].detail.market.marketCap = 0;
    expect(buildPilotComparison("bitcoin", [observation("bitcoin"), ...invalid])).toBeNull();
    expect(buildPilotComparison("other", [observation("other")])).toBeNull();
  });

  it("keeps the contribution model consistent with the published score boundaries", () => {
    expect(riskScoreFactors(20, 500e6, 5e6, -90)).toEqual({ volatility: 2.5, marketCap: 2.5, turnover: 2.5, drawdown: 2.5 });
    expect(computeRiskScore(20, 500e6, 5e6, -90)).toBe(10);
    expect(computeRiskScore(0, 10e9, 1e9, 0)).toBe(1);
    expect(riskScoreFactors(0, 10e9, 1e9, 0)).toEqual({ volatility: 0, marketCap: 0, turnover: 0, drawdown: 0 });
  });
});

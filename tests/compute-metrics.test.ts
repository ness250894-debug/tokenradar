import { describe, it, expect } from "vitest";
import {
  computeVolatility,
  computeRiskScore,
  computeGrowthPotential,
  computeNarrativeStrength,
  computeValueVsAth,
  buildMetricSummary,
  isCategoryInputEligibleForMetrics,
  resolveCategoryMetricContext,
  resolveMetricMarketDataAsOf,
  resolvePriceHistoryAsOf,
} from "../scripts/compute-metrics";

// ── computeVolatility ─────────────────────────────────────────

describe("computeVolatility", () => {
  it("returns 0 for fewer than 2 data points", () => {
    expect(computeVolatility([])).toBe(0);
    expect(computeVolatility([{ price: 100 }])).toBe(0);
  });

  it("returns 0 for flat prices", () => {
    const flat = Array(30).fill({ price: 50 });
    expect(computeVolatility(flat)).toBe(0);
  });

  it("returns a positive value for volatile prices", () => {
    const volatile = [
      { price: 100 }, { price: 120 }, { price: 80 },
      { price: 110 }, { price: 90 }, { price: 130 },
    ];
    const vol = computeVolatility(volatile);
    expect(vol).toBeGreaterThan(0);
    expect(vol).toBeLessThan(100);
  });

  it("returns 0 if mean price is 0", () => {
    expect(computeVolatility([{ price: 0 }, { price: 0 }])).toBe(0);
  });
});

describe("price-history provenance", () => {
  it("uses chart observation time rather than a newer ingestion timestamp", () => {
    expect(resolvePriceHistoryAsOf({
      chart30d: [
        { date: "2026-08-21T00:00:00Z" },
        { date: "2026-08-22T00:00:00Z" },
      ],
      chart1y: [{ date: "2026-08-23T00:00:00Z" }],
      priceHistoryAsOf: "2026-08-22T00:00:00Z",
      fetchedAt: "2026-08-23T12:00:00Z",
    } as Parameters<typeof resolvePriceHistoryAsOf>[0])).toBe("2026-08-22T00:00:00.000Z");
  });

  it("does not substitute ingestion time for missing market observation time", () => {
    expect(resolveMetricMarketDataAsOf({
      fetchedAt: "2026-08-23T12:00:00Z",
    })).toBeUndefined();
    expect(resolveMetricMarketDataAsOf({
      lastMarketUpdate: "not-a-date",
      fetchedAt: "2026-08-23T12:00:00Z",
    })).toBeUndefined();
    expect(resolveMetricMarketDataAsOf({
      lastMarketUpdate: "2026-08-23T11:59:00Z",
      fetchedAt: "2026-08-23T12:00:00Z",
    })).toBe("2026-08-23T11:59:00.000Z");
  });

  it("keeps category inputs below 35 hours so publication has freshness headroom", () => {
    const now = new Date("2026-08-23T12:00:00.000Z");
    expect(isCategoryInputEligibleForMetrics("2026-08-22T01:01:00.000Z", now)).toBe(true);
    expect(isCategoryInputEligibleForMetrics("2026-08-22T01:00:00.000Z", now)).toBe(false);
    expect(isCategoryInputEligibleForMetrics("not-a-date", now)).toBe(false);
  });

  it("preserves a present zero category median and its observation provenance", () => {
    expect(resolveCategoryMetricContext(
      ["Zero Category"],
      { "zero category": 0 },
      { "zero category": [Date.parse("2026-08-23T10:00:00Z")] },
    )).toEqual({
      medianCap: 0,
      dataAsOf: "2026-08-23T10:00:00.000Z",
    });
    expect(resolveCategoryMetricContext(["Missing"], {}, {})).toBeUndefined();
  });
});

// ── computeRiskScore ──────────────────────────────────────────

describe("computeRiskScore", () => {
  it("returns low risk (1-3) for large, stable tokens", () => {
    // Low volatility, high cap, good liquidity, near ATH
    const score = computeRiskScore(3, 50e9, 5e9, -10);
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThanOrEqual(3);
  });

  it("returns high risk (7-10) for volatile, small-cap tokens", () => {
    // High volatility, low cap, poor liquidity, far from ATH
    const score = computeRiskScore(25, 100e6, 1e6, -95);
    expect(score).toBeGreaterThanOrEqual(7);
    expect(score).toBeLessThanOrEqual(10);
  });

  it("is always clamped between 1 and 10", () => {
    // Extreme best case
    expect(computeRiskScore(0, 100e9, 50e9, 0)).toBeGreaterThanOrEqual(1);
    // Extreme worst case
    expect(computeRiskScore(100, 0, 0, -99)).toBeLessThanOrEqual(10);
  });

  it("returns a medium score for mid-range parameters", () => {
    const score = computeRiskScore(10, 2e9, 100e6, -50);
    expect(score).toBeGreaterThanOrEqual(3);
    expect(score).toBeLessThanOrEqual(7);
  });
});

// ── computeGrowthPotential ────────────────────────────────────

describe("computeGrowthPotential", () => {
  it("returns high score for token far below ATH and category median", () => {
    const score = computeGrowthPotential(100e6, 2e9, -90, 10);
    expect(score).toBeGreaterThanOrEqual(60);
  });

  it("returns low score for token near ATH and above category median", () => {
    const score = computeGrowthPotential(5e9, 1e9, -5, -10);
    expect(score).toBeLessThanOrEqual(20);
  });

  it("is clamped to 0-100", () => {
    const score = computeGrowthPotential(1, 1e12, -99, 100);
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  it("handles zero category median gracefully", () => {
    const score = computeGrowthPotential(1e9, 0, -50, 0);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ── computeNarrativeStrength ──────────────────────────────────

describe("computeNarrativeStrength", () => {
  it("returns 95 for AI-related categories", () => {
    expect(computeNarrativeStrength(["Artificial Intelligence"])).toBe(95);
  });

  it("returns 65 for DeFi categories", () => {
    expect(computeNarrativeStrength(["Decentralized Finance (DeFi)"])).toBe(65);
  });

  it("returns 30 (default) for empty categories", () => {
    expect(computeNarrativeStrength([])).toBe(30);
  });

  it("returns default for unknown categories", () => {
    expect(computeNarrativeStrength(["Some Unknown Category"])).toBe(30);
  });

  it("returns the highest matching score across multiple categories", () => {
    const score = computeNarrativeStrength(["Payment", "Artificial Intelligence"]);
    expect(score).toBe(95); // AI trumps Payment
  });
});

// ── computeValueVsAth ─────────────────────────────────────────

describe("computeValueVsAth", () => {
  it("returns 100 when at ATH (0% change)", () => {
    expect(computeValueVsAth(0)).toBe(100);
  });

  it("returns 20 when 80% below ATH", () => {
    expect(computeValueVsAth(-80)).toBe(20);
  });

  it("returns 0 when 100% or more below ATH", () => {
    expect(computeValueVsAth(-100)).toBe(0);
    expect(computeValueVsAth(-120)).toBe(0);
  });

  it("handles small drawdowns", () => {
    expect(computeValueVsAth(-5)).toBe(95);
  });

  it("caps scores at 100 when price is above the previous ATH", () => {
    expect(computeValueVsAth(7)).toBe(100);
  });
});

describe("buildMetricSummary", () => {
  it("labels high valueVsAth as near ATH and low valueVsAth as deeply discounted", () => {
    expect(buildMetricSummary("Near Token", "medium", 40, 30, 92)).toBe("Near Token is a near ATH token.");
    expect(buildMetricSummary("Discount Token", "medium", 40, 30, 8)).toBe("Discount Token is a deeply discounted vs ATH token.");
  });
});

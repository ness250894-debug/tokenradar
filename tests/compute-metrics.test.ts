import { describe, it, expect } from "vitest";
import {
  computeVolatility,
  computeRiskScore,
  computeGrowthPotential,
  computeNarrativeStrength,
  computeValueVsAth,
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
});

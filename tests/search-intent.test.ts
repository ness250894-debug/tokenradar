import { describe, expect, it } from "vitest";

import {
  buildTokenSearchIntent,
  computeAttentionScore,
  computeFundamentalsScore,
  computeSupplyRiskScore,
  mergeSearchIntentHistory,
} from "../scripts/compute-search-intent";
import { SEARCH_INTENT_LABELS, type SearchIntentDataset } from "../src/lib/search-intent";

const baseToken = {
  id: "test-token",
  symbol: "test",
  name: "Test Token",
  categories: ["Layer 1 (L1)"],
  market: {
    marketCap: 1_000_000_000,
    marketCapRank: 100,
    volume24h: 50_000_000,
    priceChange24h: 2,
    priceChange7d: 4,
    priceChange30d: 8,
    athChangePercentage: -40,
    circulatingSupply: 900_000_000,
    totalSupply: 1_000_000_000,
    maxSupply: 1_000_000_000,
    fdv: 1_100_000_000,
  },
  developer: {
    githubStars: 2500,
    commits4Weeks: 20,
  },
};

describe("search intent scoring", () => {
  it("raises supply risk when FDV and circulating supply diverge", () => {
    const lowRisk = computeSupplyRiskScore(baseToken);
    const highRisk = computeSupplyRiskScore({
      ...baseToken,
      market: {
        ...baseToken.market,
        marketCap: 100_000_000,
        volume24h: 500_000,
        circulatingSupply: 100_000_000,
        totalSupply: 1_000_000_000,
        fdv: 1_000_000_000,
      },
    });

    expect(highRisk).toBeGreaterThan(lowRisk);
    expect(highRisk).toBeGreaterThanOrEqual(70);
  });

  it("scores attention above fundamentals for volatile meme spikes", () => {
    const token = {
      ...baseToken,
      id: "test-meme",
      name: "Test Meme",
      categories: ["Meme"],
      market: {
        ...baseToken.market,
        priceChange24h: 22,
        priceChange7d: 35,
        priceChange30d: 80,
        volume24h: 300_000_000,
      },
    };
    const metrics = {
      riskScore: 8,
      growthPotentialIndex: 70,
      narrativeStrength: 75,
      volatilityIndex: 80,
    };

    expect(computeAttentionScore(token, metrics)).toBeGreaterThan(computeFundamentalsScore(token, metrics));
    expect(buildTokenSearchIntent(token, metrics).classification).toMatch(/FOMO|Narrative|Low-Quality/);
  });

  it("classifies stablecoin-like assets as safety checks", () => {
    const intent = buildTokenSearchIntent(
      {
        ...baseToken,
        id: "test-usd",
        symbol: "tusd",
        name: "Test USD",
        categories: ["Stablecoins", "Tokenized Treasury"],
      },
      {
        riskScore: 4,
        growthPotentialIndex: 20,
        narrativeStrength: 80,
        volatilityIndex: 5,
      },
    );

    expect(intent.classification).toBe("Stablecoin Safety Check");
    expect(intent.primaryIntent).toBe("stablecoin");
    expect(intent.queryExamples.some((query) => query.includes("reserves"))).toBe(true);
  });

  it("keeps unchanged same-day history snapshots stable across repeated runs", () => {
    const generatedAt = "2026-05-15T00:00:00.000Z";
    const tokenIntent = buildTokenSearchIntent(baseToken, {}, [], undefined, generatedAt);
    const output: SearchIntentDataset = {
      generatedAt,
      version: 1,
      summary: {
        generatedAt,
        tokenCount: 1,
        topIntents: [
          {
            intent: tokenIntent.primaryIntent,
            label: SEARCH_INTENT_LABELS[tokenIntent.primaryIntent],
            tokenCount: 1,
            avgScore: tokenIntent.intentMix[0]?.score || 0,
          },
        ],
        hotTokens: [],
        watchTokens: [tokenIntent.tokenId],
        methodology: ["test"],
      },
      tokens: {
        [tokenIntent.tokenId]: tokenIntent,
      },
    };

    const firstHistory = mergeSearchIntentHistory(
      output,
      { version: 1, generatedAt: "2026-05-15T09:00:00.000Z", entries: [] },
      "2026-05-15T09:00:00.000Z",
    );
    const secondHistory = mergeSearchIntentHistory(output, firstHistory, "2026-05-15T12:00:00.000Z");

    expect(secondHistory).toEqual(firstHistory);
  });
});

import { describe, expect, it } from "vitest";

import {
  ArticleQualitySnapshotSchema,
  GeneratedArticleSchema,
  PriceHistorySchema,
  SearchIntentDatasetSchema,
  TokenMetricsSchema,
  UpcomingTgeSchema,
} from "../src/lib/schemas";

describe("data schema contracts", () => {
  it("enforces TokenMetrics score bounds from the data-schema docs", () => {
    const baseMetric = {
      tokenId: "bitcoin",
      tokenName: "Bitcoin",
      symbol: "btc",
      riskScore: 4,
      riskLevel: "medium",
      growthPotentialIndex: 16,
      narrativeStrength: 60,
      valueVsAth: 62,
      volatilityIndex: 15,
      summary: "Bitcoin is a limited upside token.",
      computedAt: "2026-05-17T18:48:03.565Z",
    };

    expect(TokenMetricsSchema.safeParse(baseMetric).success).toBe(true);
    expect(TokenMetricsSchema.safeParse({ ...baseMetric, valueVsAth: -1 }).success).toBe(false);
    expect(TokenMetricsSchema.safeParse({ ...baseMetric, valueVsAth: 101 }).success).toBe(false);
    expect(TokenMetricsSchema.safeParse({ ...baseMetric, volatilityIndex: -1 }).success).toBe(false);
    expect(TokenMetricsSchema.safeParse({ ...baseMetric, volatilityIndex: 101 }).success).toBe(false);
  });

  it("preserves optional generated article quality snapshots", () => {
    const article = {
      tokenId: "bitcoin",
      tokenName: "Bitcoin",
      type: "overview",
      title: "Bitcoin Overview",
      slug: "overview",
      content: "## FAQ\n\nInformational purposes only. Always do your own research.",
      wordCount: 9,
      generatedAt: "2026-05-17T18:48:03.565Z",
      model: "local-template",
      quality: {
        passed: true,
        issues: [],
        warnings: [],
        stats: {
          wordCount: 9,
          hasFaq: true,
          hasDisclaimer: true,
          dataPointCount: 0,
          prohibitedPhrases: [],
          avgSentenceLength: 9,
          repeatedParagraphCount: 0,
          hasMalformedTable: false,
          hasContinuationLink: false,
        },
        checkedAt: "2026-05-17T18:48:03.565Z",
      },
    };

    const parsed = GeneratedArticleSchema.parse(article);

    expect(ArticleQualitySnapshotSchema.safeParse(article.quality).success).toBe(true);
    expect(parsed.quality).toEqual(article.quality);
  });

  it("defines concrete schemas for persisted price, TGE, and search-intent artifacts", () => {
    expect(
      PriceHistorySchema.safeParse({
        id: "bitcoin",
        name: "Bitcoin",
        chart30d: [{ date: "2026-05-17T00:00:00.000Z", price: 78097 }],
        chart1y: [],
        fetchedAt: "2026-05-17T18:48:03.565Z",
      }).success,
    ).toBe(true);

    expect(
      UpcomingTgeSchema.safeParse({
        id: "test-token",
        name: "Test Token",
        symbol: "TEST",
        category: "AI",
        expectedTge: "2026-Q2",
        narrativeStrength: 80,
        dataSource: "manual",
        discoveredAt: "2026-05-17T18:48:03.565Z",
        lifecycleStatus: "watchlist",
        confidence: 75,
        signals: [
          {
            type: "tge",
            sourceType: "official",
            url: "https://example.com",
            observedAt: "2026-05-17T18:48:03.565Z",
          },
        ],
      }).success,
    ).toBe(true);

    expect(
      SearchIntentDatasetSchema.safeParse({
        generatedAt: "2026-05-17T18:48:03.565Z",
        version: 1,
        summary: {
          generatedAt: "2026-05-17T18:48:03.565Z",
          tokenCount: 1,
          topIntents: [{ intent: "risk", label: "Risk check", tokenCount: 1, avgScore: 72 }],
          hotTokens: [],
          watchTokens: ["bitcoin"],
          methodology: ["Scores are built from cached signals."],
        },
        tokens: {
          bitcoin: {
            tokenId: "bitcoin",
            tokenName: "Bitcoin",
            symbol: "btc",
            attentionScore: 50,
            attentionLabel: "Watch",
            hypeScore: 42,
            fundamentalsScore: 70,
            supplyRiskScore: 10,
            classification: "Organic Interest",
            primaryIntent: "risk",
            intentMix: [{ intent: "risk", label: "Risk check", score: 72, queries: ["Bitcoin risks"] }],
            drivers: ["Market rank keeps it visible."],
            cautions: ["No major caution dominated."],
            queryExamples: ["Bitcoin risks"],
            sourceSignals: ["TokenRadar risk and narrative metrics"],
            computedAt: "2026-05-17T18:48:03.565Z",
          },
        },
      }).success,
    ).toBe(true);
  });

  it("rejects date-only strings for timestamp fields", () => {
    expect(
      UpcomingTgeSchema.safeParse({
        id: "test-token",
        name: "Test Token",
        symbol: "TEST",
        category: "AI",
        expectedTge: "2026-Q2",
        narrativeStrength: 80,
        dataSource: "manual",
        discoveredAt: "2026-05-17T18:48:03.565Z",
        lifecycleStatus: "watchlist",
        confidence: 75,
        signals: [
          {
            type: "tge",
            sourceType: "official",
            url: "https://example.com",
            observedAt: "2026-06-02",
          },
        ],
      }).success,
    ).toBe(false);
  });
});

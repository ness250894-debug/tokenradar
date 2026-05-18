import { describe, expect, it } from "vitest";

import {
  describeTgeFilters,
  describeTokenFilters,
  filterAndSortTges,
  filterAndSortTokens,
  hasActiveTgeFilters,
  hasActiveTokenFilters,
  type TgeDirectoryState,
  type TokenDirectoryState,
} from "../src/lib/directory-filters";

const tokenDefaults: TokenDirectoryState = {
  searchQuery: "",
  categoryFilter: "all",
  riskFilter: "all",
  intentFilter: "all",
  attentionFilter: "all",
  sortBy: "market-cap-desc",
};

const tgeDefaults: TgeDirectoryState = {
  searchQuery: "",
  statusFilter: "all",
  categoryFilter: "all",
  sortBy: "confidence-desc",
};

describe("directory filter helpers", () => {
  it("detects active token directory filters and produces reset copy", () => {
    const state = {
      ...tokenDefaults,
      searchQuery: " eth ",
      riskFilter: "low",
      sortBy: "risk-asc",
    };

    expect(hasActiveTokenFilters(tokenDefaults)).toBe(false);
    expect(hasActiveTokenFilters(state)).toBe(true);
    expect(describeTokenFilters(state)).toBe('No tokens match "eth" with the selected risk and sort filters.');
  });

  it("filters tokens by query, risk, intent, attention, and sort order", () => {
    const tokens = [
      {
        id: "bitcoin",
        name: "Bitcoin",
        symbol: "BTC",
        category: "Store of Value",
        riskScore: 4,
        marketCap: 100,
        priceChange24h: 1,
        searchIntentPrimaryIntent: "buy",
        searchIntentAttentionScore: 50,
        searchIntentHypeScore: 10,
        searchIntentSupplyRiskScore: 5,
      },
      {
        id: "new-ai",
        name: "New AI",
        symbol: "NAI",
        category: "AI",
        riskScore: 8,
        marketCap: 30,
        priceChange24h: 12,
        searchIntentPrimaryIntent: "risk",
        searchIntentAttentionScore: 82,
        searchIntentHypeScore: 71,
        searchIntentSupplyRiskScore: 72,
      },
    ];

    const result = filterAndSortTokens(tokens, {
      ...tokenDefaults,
      searchQuery: "ai",
      riskFilter: "high",
      intentFilter: "risk",
      attentionFilter: "supply-risk",
      sortBy: "attention-desc",
    });

    expect(result.map((token) => token.id)).toEqual(["new-ai"]);
  });

  it("detects active TGE filters and explains the empty state", () => {
    const state = {
      ...tgeDefaults,
      statusFilter: "stale",
      categoryFilter: "Gaming",
    };

    expect(hasActiveTgeFilters(tgeDefaults)).toBe(false);
    expect(hasActiveTgeFilters(state)).toBe(true);
    expect(describeTgeFilters(state)).toBe("No launches match the selected status and category filters.");
  });

  it("filters TGEs by query, lifecycle status, category, and sort order", () => {
    const tges = [
      {
        id: "alpha",
        name: "Alpha Protocol",
        symbol: "ALP",
        category: "Infrastructure",
        lifecycleStatus: "watchlist",
        confidence: 55,
        dataSource: "https://example.com/alpha",
        discoveredAt: "2026-05-01T00:00:00.000Z",
        lastVerifiedAt: "2026-05-10T00:00:00.000Z",
        signals: [{ type: "tge", url: "https://example.com/alpha", sourceType: "official", observedAt: "2026-05-10T00:00:00.000Z" }],
      },
      {
        id: "beta",
        name: "Beta Game",
        symbol: "BET",
        category: "Gaming",
        lifecycleStatus: "confirmed_tge",
        confidence: 82,
        dataSource: "https://example.com/beta",
        discoveredAt: "2026-05-03T00:00:00.000Z",
        lastVerifiedAt: "2026-05-12T00:00:00.000Z",
        signals: [],
      },
    ];

    const result = filterAndSortTges(tges, {
      ...tgeDefaults,
      searchQuery: "game",
      statusFilter: "confirmed_tge",
      categoryFilter: "Gaming",
      sortBy: "verified-desc",
    });

    expect(result.map((tge) => tge.id)).toEqual(["beta"]);
  });
});

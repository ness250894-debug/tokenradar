import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const coingeckoMocks = vi.hoisted(() => ({
  fetchFullTokenData: vi.fn(),
  fetchTokensByRank: vi.fn(),
  fetchTrendingCoins: vi.fn(),
}));

vi.mock("../src/lib/coingecko", () => ({
  fetchFullTokenData: coingeckoMocks.fetchFullTokenData,
  fetchTokensByRank: coingeckoMocks.fetchTokensByRank,
  fetchTrendingCoins: coingeckoMocks.fetchTrendingCoins,
}));

vi.mock("../src/lib/x-client", () => ({
  fetchXTrends: vi.fn().mockResolvedValue([]),
  matchTrendsToTokens: vi.fn().mockReturnValue([]),
}));

import {
  isFreshSocialMarketData,
  isMetricDataFreshForMarket,
  loadCandidateTokens,
} from "../scripts/lib/token-selection";
import type { MetricData, TokenData } from "../scripts/lib/token-selection";
import {
  evaluateComparisonReadiness,
  evaluateVideoReadiness,
} from "../scripts/validate-social-market-readiness";
import { priceHistoryAgeMs } from "../scripts/fetch-crypto-data";

const tempDirs: string[] = [];

function makeDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-token-data-"));
  tempDirs.push(dir);
  fs.mkdirSync(path.join(dir, "tokens"), { recursive: true });
  return dir;
}

function writeToken(dataDir: string, token: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dataDir, "tokens", `${token.id}.json`), JSON.stringify(token, null, 2));
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  vi.clearAllMocks();
});

describe("price-history refresh selection", () => {
  it("ignores a fresh checkout mtime when the provider observation is stale", () => {
    const dataDir = makeDataDir();
    const pricesDir = path.join(dataDir, "prices");
    fs.mkdirSync(pricesDir, { recursive: true });
    const priceFile = path.join(pricesDir, "bitcoin.json");
    fs.writeFileSync(priceFile, JSON.stringify({
      chart30d: [{ date: "2026-05-13T18:24:07.000Z", price: 100_000 }],
      priceHistoryAsOf: "2026-05-13T18:24:07.000Z",
    }));

    const checkoutTime = new Date("2026-08-24T13:18:47.000Z");
    fs.utimesSync(priceFile, checkoutTime, checkoutTime);

    expect(fs.statSync(priceFile).mtimeMs).toBe(checkoutTime.getTime());
    expect(priceHistoryAgeMs("bitcoin", checkoutTime, pricesDir))
      .toBe(checkoutTime.getTime() - Date.parse("2026-05-13T18:24:07.000Z"));
    expect(priceHistoryAgeMs("bitcoin", checkoutTime, pricesDir))
      .toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });
});

describe("derived metric category freshness", () => {
  const now = new Date("2026-08-23T12:00:00.000Z");
  const metricAtCategoryTime = (categoryDataAsOf: string) => ({
    riskScore: 4,
    riskLevel: "medium",
    growthPotentialIndex: 50,
    computedAt: "2026-08-23T11:59:00.000Z",
    marketDataAsOf: "2026-08-23T11:55:00.000Z",
    priceHistoryAsOf: "2026-08-22T12:00:00.000Z",
    categoryDataAsOf,
    inputDataAsOf: categoryDataAsOf,
  });

  it("accepts category provenance below 36 hours and rejects the exact boundary", () => {
    expect(isMetricDataFreshForMarket(
      metricAtCategoryTime("2026-08-22T00:01:00.000Z"),
      "2026-08-23T11:55:00.000Z",
      now,
    )).toBe(true);
    expect(isMetricDataFreshForMarket(
      metricAtCategoryTime("2026-08-22T00:00:00.000Z"),
      "2026-08-23T11:55:00.000Z",
      now,
    )).toBe(false);
  });
});

describe("loadCandidateTokens market timestamps", () => {
  it("preserves local timestamps and stamps live CoinGecko market data", async () => {
    const dataDir = makeDataDir();
    writeToken(dataDir, {
      id: "fresh-token",
      symbol: "fresh",
      name: "Fresh Token",
      market: {
        price: 1,
        priceChange24h: 0,
        marketCap: 1_000_000,
        marketCapRank: 10,
        volume24h: 100_000,
      },
      fetchedAt: "2026-05-17T00:00:00.000Z",
      lastMarketUpdate: "2026-05-17T00:00:00.000Z",
    });
    writeToken(dataDir, {
      id: "local-token",
      symbol: "local",
      name: "Local Token",
      market: {
        price: 2,
        priceChange24h: 1,
        marketCap: 2_000_000,
        marketCapRank: 20,
        volume24h: 200_000,
      },
      fetchedAt: "2026-05-16T00:00:00.000Z",
      lastMarketUpdate: "2026-05-16T12:00:00.000Z",
    });

    coingeckoMocks.fetchTokensByRank.mockResolvedValueOnce([
      {
        id: "fresh-token",
        symbol: "fresh",
        name: "Fresh Token",
        current_price: 1.5,
        price_change_percentage_24h: 2,
        market_cap: 1_500_000,
        market_cap_rank: 10,
        total_volume: 150_000,
        last_updated: "2026-05-18T17:30:00.000Z",
      },
    ]);

    const { candidates } = await loadCandidateTokens(dataDir, 1, 50, {
      requireFreshMarketData: false,
    });

    expect(coingeckoMocks.fetchTokensByRank).toHaveBeenCalledWith(1, 50, {
      cacheTtlMs: 10 * 60 * 1000,
    });

    expect(candidates.find((token) => token.id === "fresh-token")).toMatchObject({
      marketDataSource: "coingecko-live",
      fetchedAt: "2026-05-18T17:30:00.000Z",
      lastMarketUpdate: "2026-05-18T17:30:00.000Z",
      market: {
        price: 1.5,
        priceChange24h: 2,
      },
    });
    expect(candidates.find((token) => token.id === "local-token")).toMatchObject({
      marketDataSource: "local-cache",
      fetchedAt: "2026-05-16T00:00:00.000Z",
      lastMarketUpdate: "2026-05-16T12:00:00.000Z",
    });
  });

  it("ignores an undated CoinGecko market snapshot instead of mixing its values with local provenance", async () => {
    const dataDir = makeDataDir();
    writeToken(dataDir, {
      id: "undated-token",
      symbol: "old",
      name: "Undated Token",
      market: {
        price: 1,
        priceChange24h: 0,
        marketCap: 1_000_000,
        marketCapRank: 10,
        volume24h: 100_000,
      },
      fetchedAt: "2026-05-17T00:00:00.000Z",
      lastMarketUpdate: "2026-05-17T12:00:00.000Z",
    });
    coingeckoMocks.fetchTokensByRank.mockResolvedValueOnce([{
      id: "undated-token",
      symbol: "old",
      name: "Undated Token",
      current_price: 1.5,
      price_change_percentage_24h: 2,
      market_cap: 1_500_000,
      market_cap_rank: 10,
      total_volume: 150_000,
    }]);

    const { candidates } = await loadCandidateTokens(dataDir, 1, 50, {
      requireFreshMarketData: false,
    });

    expect(candidates[0]).toMatchObject({
      marketDataSource: "local-cache",
      lastMarketUpdate: "2026-05-17T12:00:00.000Z",
      market: { price: 1, priceChange24h: 0 },
    });
  });

  it("fails closed when only stale or local-cache market data is available", async () => {
    const dataDir = makeDataDir();
    writeToken(dataDir, {
      id: "local-token",
      symbol: "local",
      name: "Local Token",
      market: {
        price: 2,
        priceChange24h: 1,
        marketCap: 2_000_000,
        marketCapRank: 20,
        volume24h: 200_000,
      },
      lastMarketUpdate: "2026-08-23T09:00:00.000Z",
    });
    coingeckoMocks.fetchTokensByRank.mockRejectedValueOnce(new Error("API unavailable"));

    await expect(loadCandidateTokens(dataDir, 1, 50, {
      now: new Date("2026-08-23T12:00:00.000Z"),
    })).rejects.toThrow("No fresh CoinGecko market candidates");
  });

  it("accepts only a recent live CoinGecko timestamp", () => {
    expect(isFreshSocialMarketData({
      marketDataSource: "coingecko-live",
      lastMarketUpdate: "2026-08-23T11:50:00.000Z",
    }, new Date("2026-08-23T12:00:00.000Z"))).toBe(true);

    expect(isFreshSocialMarketData({
      marketDataSource: "coingecko-live",
      lastMarketUpdate: "2026-08-23T11:30:00.000Z",
    }, new Date("2026-08-23T12:00:00.000Z"))).toBe(false);

    expect(isFreshSocialMarketData({
      marketDataSource: "local-cache",
      lastMarketUpdate: "2026-08-23T11:59:00.000Z",
    }, new Date("2026-08-23T12:00:00.000Z"))).toBe(false);

    expect(isFreshSocialMarketData({
      marketDataSource: "coingecko-live",
      lastMarketUpdate: "2026-08-23T12:01:00.000Z",
    }, new Date("2026-08-23T12:00:00.000Z"))).toBe(true);

    expect(isFreshSocialMarketData({
      marketDataSource: "coingecko-live",
      lastMarketUpdate: "2026-08-23T12:03:00.000Z",
    }, new Date("2026-08-23T12:00:00.000Z"))).toBe(false);
  });
});

const strictReadinessNow = new Date("2026-08-24T13:18:47.000Z");

function readinessToken(id: string, rank: number): TokenData {
  return {
    id,
    symbol: id.slice(0, 3).toUpperCase(),
    name: id[0].toUpperCase() + id.slice(1),
    categories: ["Layer 1"],
    rank,
    marketDataSource: "coingecko-live",
    lastMarketUpdate: "2026-08-24T13:17:00.000Z",
    market: {
      price: 10 + rank,
      priceChange24h: rank,
      priceChange7d: rank + 1,
      marketCap: 1_000_000_000 - rank * 10_000_000,
      marketCapRank: rank,
      volume24h: 25_000_000,
    },
  };
}

function readinessMetric(overrides: Partial<MetricData> = {}): MetricData {
  return {
    riskScore: 4,
    riskLevel: "medium",
    growthPotentialIndex: 65,
    computedAt: "2026-08-24T13:18:00.000Z",
    marketDataAsOf: "2026-08-24T13:17:00.000Z",
    priceHistoryAsOf: "2026-08-24T00:00:00.000Z",
    categoryDataAsOf: "2026-08-24T13:17:00.000Z",
    inputDataAsOf: "2026-08-24T00:00:00.000Z",
    ...overrides,
  };
}

describe("strict social market readiness", () => {
  it("requires two exact comparison candidates with fresh derived inputs", () => {
    const candidates = [readinessToken("alpha", 10), readinessToken("beta", 11)];
    const metrics = new Map(candidates.map((candidate) => [candidate.id, readinessMetric()]));
    const result = evaluateComparisonReadiness(
      candidates,
      (id) => metrics.get(id),
      strictReadinessNow,
    );

    expect(result.eligibleCandidates).toBe(2);
    expect(result.pair).toBeDefined();
    expect([result.pair?.left.id, result.pair?.right.id].sort()).toEqual(["alpha", "beta"]);
  });

  it("reports stale price history before a comparison reaches a platform API", () => {
    const candidates = [readinessToken("alpha", 10), readinessToken("beta", 11)];
    const staleMetric = readinessMetric({
      priceHistoryAsOf: "2026-05-13T18:24:07.000Z",
      inputDataAsOf: "2026-05-13T18:24:07.000Z",
    });
    const result = evaluateComparisonReadiness(candidates, () => staleMetric, strictReadinessNow);

    expect(result.eligibleCandidates).toBe(0);
    expect(result.pair).toBeUndefined();
    expect(result.metricIssueCounts["stale-price-history"]).toBe(2);
  });

  it("requires at least one fully fresh video candidate", () => {
    const candidate = readinessToken("alpha", 10);
    expect(evaluateVideoReadiness(
      [candidate],
      () => readinessMetric(),
      strictReadinessNow,
    ).readyCandidates).toBe(1);

    const stale = readinessMetric({
      priceHistoryAsOf: "2026-05-13T18:24:07.000Z",
      inputDataAsOf: "2026-05-13T18:24:07.000Z",
    });
    const rejected = evaluateVideoReadiness([candidate], () => stale, strictReadinessNow);
    expect(rejected.readyCandidates).toBe(0);
    expect(rejected.issueCounts["stale-derived-metrics"]).toBe(1);
  });
});

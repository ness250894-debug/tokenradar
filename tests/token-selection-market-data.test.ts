import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, describe, expect, it, vi } from "vitest";

const coingeckoMocks = vi.hoisted(() => ({
  fetchTokensByRank: vi.fn(),
  fetchTrendingCoins: vi.fn(),
}));

vi.mock("../src/lib/coingecko", () => ({
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

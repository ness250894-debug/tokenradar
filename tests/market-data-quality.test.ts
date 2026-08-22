import { describe, expect, it } from "vitest";

import {
  getMarketDataQualityIssues,
  getMarketDataTimestamp,
  isTrustedTokenMarketData,
} from "../src/lib/market-data-quality";

const now = new Date("2026-05-15T00:00:00.000Z");

describe("market data quality", () => {
  it("accepts finite, fresh market data", () => {
    const token = {
      market: {
        price: 1.25,
        marketCap: 500_000,
        volume24h: 25_000,
        priceChange24h: 12.5,
      },
      fetchedAt: "2026-05-14T00:00:00.000Z",
    };

    expect(getMarketDataQualityIssues(token, now)).toEqual([]);
    expect(isTrustedTokenMarketData(token, now)).toBe(true);
  });

  it("uses last market update before fetchedAt", () => {
    expect(getMarketDataTimestamp({
      fetchedAt: "2026-05-10T00:00:00.000Z",
      lastMarketUpdate: "2026-05-14T00:00:00.000Z",
    })).toBe("2026-05-14T00:00:00.000Z");
  });

  it("falls back to a valid ingestion timestamp when the provider timestamp is malformed", () => {
    expect(getMarketDataTimestamp({
      fetchedAt: "2026-05-13T00:00:00.000Z",
      lastMarketUpdate: "not-a-timestamp",
    })).toBe("2026-05-13T00:00:00.000Z");
  });

  it("rejects market data when every available timestamp is malformed", () => {
    const token = {
      market: {
        price: 1.25,
        marketCap: 500_000,
        volume24h: 25_000,
        priceChange24h: 12.5,
      },
      fetchedAt: "also-invalid",
      lastMarketUpdate: "not-a-timestamp",
    };

    expect(getMarketDataTimestamp(token)).toBeNull();
    expect(getMarketDataQualityIssues(token, now)).toEqual(["missing-market-timestamp"]);
  });

  it("flags missing, empty, stale, invalid, and extreme market data", () => {
    expect(getMarketDataQualityIssues({}, now)).toEqual(["missing-market"]);

    expect(getMarketDataQualityIssues({
      market: {
        price: 0,
        marketCap: 0,
        volume24h: 0,
        priceChange24h: Number.POSITIVE_INFINITY,
      },
      fetchedAt: "2026-05-01T00:00:00.000Z",
    }, now)).toEqual([
      "invalid-market-value",
      "empty-market",
      "stale-market-data",
    ]);

    expect(getMarketDataQualityIssues({
      market: {
        price: 1,
        marketCap: 1_000,
        volume24h: 100,
        priceChange24h: 1_200,
      },
      fetchedAt: "2026-05-14T00:00:00.000Z",
    }, now)).toEqual(["extreme-24h-change"]);
  });

  it("quarantines the stale Little Pepe outlier snapshot", () => {
    const token = {
      id: "little-pepe-5",
      fetchedAt: "2026-04-02T20:59:02.507Z",
      market: {
        price: 12.09,
        marketCap: 11_908_633_380,
        volume24h: 1_204_499,
        priceChange24h: 906_349.25162,
      },
    };

    expect(getMarketDataQualityIssues(token, now)).toEqual([
      "stale-market-data",
      "extreme-24h-change",
    ]);
    expect(isTrustedTokenMarketData(token, now)).toBe(false);
  });
});

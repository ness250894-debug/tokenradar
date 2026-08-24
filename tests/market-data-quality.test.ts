import { describe, expect, it } from "vitest";

import {
  CATEGORY_INPUT_BUILD_HEADROOM_MS,
  CATEGORY_INPUT_PUBLICATION_MAX_AGE_MS,
  CATEGORY_INPUT_SELECTION_MAX_AGE_MS,
  getPriceHistoryObservationAgeMs,
  getMarketDataQualityIssues,
  getMarketDataTimestamp,
  isTrustedTokenMarketData,
  mergeTokenRecordWithNewestMarketSnapshot,
  newestValidObservationTimestamp,
  normalizeObservedPricePoints,
  resolvePriceHistoryObservationTimestamp,
  resolveProviderMarketTimestamp,
} from "../src/lib/market-data-quality";

const now = new Date("2026-05-15T00:00:00.000Z");

describe("market data quality", () => {
  it("reserves one hour of category-input headroom for publishing", () => {
    expect(CATEGORY_INPUT_SELECTION_MAX_AGE_MS + CATEGORY_INPUT_BUILD_HEADROOM_MS)
      .toBe(CATEGORY_INPUT_PUBLICATION_MAX_AGE_MS);
  });

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

  it("preserves provider observation time without synthesizing a current timestamp", () => {
    expect(resolveProviderMarketTimestamp(
      "2026-05-15T11:00:00Z",
      "2026-05-14T10:00:00Z",
    )).toBe("2026-05-15T11:00:00.000Z");
    expect(resolveProviderMarketTimestamp(
      "not-a-timestamp",
      "2026-05-14T10:00:00Z",
    )).toBe("2026-05-14T10:00:00.000Z");
    expect(resolveProviderMarketTimestamp(undefined, "also-invalid")).toBeUndefined();
  });

  it("keeps a newer lite market snapshot when cached full metadata arrives afterward", () => {
    const merged = mergeTokenRecordWithNewestMarketSnapshot({
      name: "Old metadata",
      market: { price: 2, volume24h: 200 },
      lastMarketUpdate: "2026-08-23T12:00:00Z",
      fetchedAt: "2026-08-23T12:01:00Z",
    }, {
      name: "Fresh metadata",
      market: { price: 1, volume24h: 100 },
      lastMarketUpdate: "2026-08-21T12:00:00Z",
      fetchedAt: "2026-08-23T12:02:00Z",
    });

    expect(merged).toMatchObject({
      name: "Fresh metadata",
      market: { price: 2, volume24h: 200 },
      lastMarketUpdate: "2026-08-23T12:00:00.000Z",
      fetchedAt: "2026-08-23T12:02:00Z",
    });

    expect(mergeTokenRecordWithNewestMarketSnapshot(merged, {
      market: { price: 99, volume24h: 999 },
      lastMarketUpdate: undefined,
    })).toMatchObject({
      market: { price: 2, volume24h: 200 },
      lastMarketUpdate: "2026-08-23T12:00:00.000Z",
    });
  });

  it("derives observation time from the newest valid chart point", () => {
    expect(newestValidObservationTimestamp([
      "invalid",
      Date.parse("2026-08-22T00:00:00Z"),
      "2026-08-23T00:00:00Z",
    ])).toBe("2026-08-23T00:00:00.000Z");
  });

  it("does not let a fresh checkout or ingestion time relabel stale price history", () => {
    const priceData = {
      chart30d: [{ date: "2026-05-13T18:24:07Z" }],
      priceHistoryAsOf: "2026-05-13T18:24:07Z",
      // This field mirrors a freshly written/restored file but is not provider provenance.
      fetchedAt: "2026-08-24T13:18:47Z",
    };
    const refreshRunTime = new Date("2026-08-24T13:18:47Z");

    expect(resolvePriceHistoryObservationTimestamp(priceData)).toBe("2026-05-13T18:24:07.000Z");
    expect(getPriceHistoryObservationAgeMs(priceData, refreshRunTime))
      .toBe(refreshRunTime.getTime() - Date.parse("2026-05-13T18:24:07Z"));
    expect(getPriceHistoryObservationAgeMs(priceData, refreshRunTime))
      .toBeGreaterThan(7 * 24 * 60 * 60 * 1000);
  });

  it("treats missing or materially future price observations as repair candidates", () => {
    const refreshRunTime = new Date("2026-08-24T13:18:47Z");
    expect(getPriceHistoryObservationAgeMs({}, refreshRunTime)).toBe(Number.POSITIVE_INFINITY);
    expect(getPriceHistoryObservationAgeMs({ chart30d: {} }, refreshRunTime))
      .toBe(Number.POSITIVE_INFINITY);
    expect(getPriceHistoryObservationAgeMs({
      priceHistoryAsOf: "2026-08-24T14:18:47Z",
    }, refreshRunTime)).toBe(Number.POSITIVE_INFINITY);
  });

  it("ignores finite timestamps outside JavaScript's representable date range", () => {
    expect(newestValidObservationTimestamp([
      "2026-08-23T00:00:00Z",
      8_640_000_000_000_001,
    ])).toBe("2026-08-23T00:00:00.000Z");
    expect(newestValidObservationTimestamp([
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ])).toBeUndefined();
  });

  it("drops malformed provider price observations before serialization", () => {
    expect(normalizeObservedPricePoints([
      [Date.parse("2026-08-23T00:00:00Z"), 1.25],
      [8_640_000_000_000_001, 9],
      [Date.parse("2026-08-23T01:00:00Z"), Number.NaN],
      ["invalid"],
    ])).toEqual([{
      date: "2026-08-23T00:00:00.000Z",
      price: 1.25,
    }]);
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

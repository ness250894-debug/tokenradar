import { describe, expect, it } from "vitest";

import {
  createWatchlistExport,
  getWatchlistIds,
  normalizeWatchlistIds,
  parseWatchlistIds,
  parseWatchlistImport,
  setWatchlistIds,
} from "../src/lib/watchlist-storage";

describe("watchlist storage helpers", () => {
  it("normalizes token IDs and removes duplicates", () => {
    expect(normalizeWatchlistIds([" Bitcoin ", "ethereum", "bitcoin", "../bad", "", "solana"])).toEqual([
      "bitcoin",
      "ethereum",
      "solana",
    ]);
  });

  it("parses persisted JSON arrays and export objects", () => {
    expect(parseWatchlistIds(JSON.stringify(["btc", "eth", "btc"]))).toEqual(["btc", "eth"]);

    const exported = createWatchlistExport(["solana", "ethereum"]);
    expect(parseWatchlistIds(JSON.stringify(exported))).toEqual(["solana", "ethereum"]);
  });

  it("imports JSON, CSV, and newline watchlists", () => {
    expect(parseWatchlistImport('{"tokenIds":["bitcoin","ethereum"]}')).toEqual(["bitcoin", "ethereum"]);
    expect(parseWatchlistImport("bitcoin, ethereum\nsolana")).toEqual(["bitcoin", "ethereum", "solana"]);
  });

  it("continues when browser storage is present but unavailable", () => {
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem: () => {
            throw new Error("storage disabled");
          },
          setItem: () => {
            throw new Error("quota exceeded");
          },
        },
        dispatchEvent: () => true,
      },
    });

    try {
      expect(getWatchlistIds()).toEqual([]);
      expect(setWatchlistIds(["bitcoin", "ethereum"])).toEqual(["bitcoin", "ethereum"]);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});

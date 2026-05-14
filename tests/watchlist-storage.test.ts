import { describe, expect, it } from "vitest";

import {
  createWatchlistExport,
  normalizeWatchlistIds,
  parseWatchlistIds,
  parseWatchlistImport,
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
});

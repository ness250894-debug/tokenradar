import { describe, expect, it } from "vitest";

import { buildGroundedMoversCaption } from "../src/lib/grounded-movers-caption";

describe("grounded movers caption", () => {
  it("uses only supplied price facts and declares unavailable claim classes", () => {
    const caption = buildGroundedMoversCaption([
      { symbol: "ALP", name: "Alpha", price: 1.25, change24h: 12.5 },
      { symbol: "BET", name: "Beta", price: 0.08, change24h: 7.25 },
    ], "2026-08-23T12:23:00.000Z", "CoinGecko");

    expect(caption).toContain("Alpha (ALP) is +12.50% over 24h at $1.25");
    expect(caption).toContain("ALP +12.50% · BET +7.25%");
    expect(caption).toContain("does not establish order-book depth, flows, or investor participation");
    expect(caption).toContain("CoinGecko snapshot, 12:23 UTC");
    expect(caption).not.toMatch(/institutional interest|whales|support|resistance|entry|accumulation/i);
  });

  it("requires a valid timestamp", () => {
    expect(() => buildGroundedMoversCaption([
      { symbol: "ALP", name: "Alpha", price: 1, change24h: 2 },
    ], "invalid", "CoinGecko")).toThrow("valid market snapshot timestamp");
    expect(() => buildGroundedMoversCaption([
      { symbol: "ALP", name: "Alpha", price: 1, change24h: 2 },
    ], "2026-08-23T12:23:00.000Z", "  ")).toThrow("market data source");
  });

  it("uses the supplied provider label", () => {
    expect(buildGroundedMoversCaption([
      { symbol: "ALP", name: "Alpha", price: 1, change24h: 2 },
    ], "2026-08-23T12:23:00.000Z", "Provider X"))
      .toContain("Source: Provider X snapshot");
  });
});

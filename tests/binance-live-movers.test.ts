import { describe, expect, it } from "vitest";

import { selectBinanceLiveMovers, type BinanceMiniTicker, type BinanceTokenReference } from "../src/lib/binance-live-movers";

const tokens: BinanceTokenReference[] = [
  { id: "alpha", name: "Alpha", symbol: "ALP", imageUrl: "https://example.com/alp.png", marketCap: 500_000_000, rank: 80 },
  { id: "beta", name: "Beta", symbol: "BET", marketCap: 250_000_000, rank: 120 },
  { id: "gamma", name: "Gamma", symbol: "GAM", marketCap: 100_000_000, rank: 240 },
  { id: "delta", name: "Delta", symbol: "DEL", marketCap: 90_000_000, rank: 260 },
  { id: "epsilon", name: "Epsilon", symbol: "EPS", marketCap: 80_000_000, rank: 300 },
  { id: "zeta", name: "Zeta", symbol: "ZET", marketCap: 70_000_000, rank: 320 },
  { id: "theta", name: "Theta", symbol: "THETA", marketCap: 60_000_000, rank: 340 },
];

function ticker(symbol: string, open: number, close: number, quoteVolume = 1_000_000): BinanceMiniTicker {
  return {
    e: "24hrMiniTicker",
    E: 1_786_000_000_000,
    s: symbol,
    o: String(open),
    c: String(close),
    h: String(Math.max(open, close)),
    l: String(Math.min(open, close)),
    v: "1000",
    q: String(quoteVolume),
  };
}

describe("selectBinanceLiveMovers", () => {
  it("returns the top three liquid USDT gainers and losers by rolling 24h change", () => {
    const result = selectBinanceLiveMovers(
      [
        ticker("ALPUSDT", 10, 12),
        ticker("BETUSDT", 5, 5.75),
        ticker("GAMUSDT", 20, 22),
        ticker("DELUSDT", 1, 0.8),
        ticker("EPSUSDT", 2, 1.7),
        ticker("ZETUSDT", 4, 3.6),
        ticker("BTCUSDC", 100, 125),
        ticker("USDCUSDT", 1, 1.01),
        ticker("THETAUSDT", 3, 4, 99_000),
        ticker("BADUSDT", 0, 10),
      ],
      tokens,
      { minQuoteVolume: 100_000 },
    );

    expect(result.gainers.map((item) => [item.pairSymbol, item.change24h])).toEqual([
      ["ALPUSDT", 20],
      ["BETUSDT", 15],
      ["GAMUSDT", 10],
    ]);
    expect(result.losers.map((item) => [item.pairSymbol, item.change24h])).toEqual([
      ["DELUSDT", -20],
      ["EPSUSDT", -15],
      ["ZETUSDT", -10],
    ]);
    expect(result.totalTracked).toBe(6);
  });

  it("links a Binance symbol to the highest-market-cap TokenRadar match", () => {
    const result = selectBinanceLiveMovers(
      [ticker("DUPUSDT", 1, 1.25)],
      [
        { id: "small-duplicate", name: "Small Duplicate", symbol: "DUP", marketCap: 10_000, rank: 2000 },
        { id: "large-duplicate", name: "Large Duplicate", symbol: "DUP", marketCap: 2_000_000, rank: 500 },
      ],
      { minQuoteVolume: 100_000 },
    );

    expect(result.gainers[0]).toMatchObject({
      baseSymbol: "DUP",
      tokenId: "large-duplicate",
      tokenName: "Large Duplicate",
    });
  });
});

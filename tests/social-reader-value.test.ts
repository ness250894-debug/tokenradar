import { describe, expect, it } from "vitest";
import { buildReaderMarketNote, reportedTurnoverPercent } from "../src/lib/social-reader-value";
import { validateSocialContent } from "../src/lib/social-content-validator";

const facts = {
  tokenName: "Uniswap", symbol: "UNI", priceChange24h: -11.57, marketCap: 4_000_000_000,
  volume24h: 883_250_000, marketCapRank: 26, readerValueRequired: true,
  marketDataSource: "coingecko-live", marketDataAsOf: "2026-10-29T22:56:00Z",
};
const attribution = "CoinGecko snapshot, 2026-10-29 22:56 UTC";

describe("reader-focused market notes", () => {
  it("keeps every lesson grounded and retains the source within each platform budget", () => {
    const lessons = new Set<string>();
    for (const platform of ["x", "threads", "telegram"] as const) {
      for (let seed = 0; seed < 24; seed++) {
        const maxChars = platform === "x" ? 230 : 460;
        const note = buildReaderMarketNote({ symbol: "UNI", facts, platform, maxChars, attribution, seed: String(seed) });
        expect(note).toBeDefined();
        lessons.add(note!.lessonKey);
        expect(note!.text.length).toBeLessThanOrEqual(maxChars);
        expect(note!.text.endsWith(attribution)).toBe(true);
        expect(validateSocialContent(note!.text, facts)).toEqual({ ok: true, issues: [] });
        if (platform === "threads") expect(note!.text).toContain("?");
      }
    }
    expect(lessons.size).toBe(4);
  });

  it("validates turnover against the underlying fields, without accepting an invented ratio or price trend", () => {
    expect(reportedTurnoverPercent(facts)).toBeCloseTo(22.08125);
    expect(validateSocialContent(`$UNI reported 24h turnover: 22.1%. Turnover compares reported volume with market cap.\n${attribution}`, facts).ok).toBe(true);
    for (const claim of ["$UNI reported 24h turnover: 88.0%.", "$UNI turnover rose 22.1%.", "$UNI: +22.1% over 24h."]) {
      expect(validateSocialContent(`${claim}\n${attribution}`, facts).ok).toBe(false);
    }
    expect(reportedTurnoverPercent({ marketCap: 0, volume24h: 10 })).toBeUndefined();
    expect(reportedTurnoverPercent({ marketCap: 10, volume24h: -1 })).toBeUndefined();
    expect(reportedTurnoverPercent({ marketCap: 10, volume24h: 0 })).toBe(0);
  });

  it("holds notes that cannot fit a whole explanation and source, and blocks unsupported interpretations", () => {
    expect(buildReaderMarketNote({ symbol: "UNI", facts: {}, platform: "x", maxChars: 230 })).toBeUndefined();
    expect(buildReaderMarketNote({ symbol: "UNI", facts, platform: "x", maxChars: 50, attribution })).toBeUndefined();
    for (const text of ["$UNI moved -11.57%. The snapshot shows movement, not durability.",
      "$UNI turnover indicates a structural shift.", "$UNI turnover [spoiler]macro correlation[/spoiler].",
      "$UNI turnover confirms order-book depth is rising."]) {
      expect(validateSocialContent(`${text}\n${attribution}`, facts).ok).toBe(false);
    }
  });
});

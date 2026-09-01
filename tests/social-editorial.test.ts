import { describe, expect, it } from "vitest";

import {
  findUnsafeSocialPhrases,
  sanitizeSocialEditorialText,
  UnsafeSocialEditorialError,
} from "../src/lib/social-editorial";

describe("social editorial policy", () => {
  it("preserves neutral data-led social copy", () => {
    const text = "$BTC is +2.40% over 24h. Watch liquidity and risk score before treating the move as durable.";

    expect(sanitizeSocialEditorialText(text)).toBe(text);
  });

  it("allows risk-management tags while still blocking promotional gem tags", () => {
    expect(findUnsafeSocialPhrases("#RiskManagement #MarketStructure")).toEqual([]);
    expect(findUnsafeSocialPhrases("#HiddenGem #CryptoGems"))
      .toContain("gem hashtag");
    expect(findUnsafeSocialPhrases("This token is a hidden gem."))
      .toContain("gem language");
  });

  it("cleans typography without changing editorial meaning", () => {
    expect(sanitizeSocialEditorialText("Price moved +2.40%  ,  with confirmation.\n\n\nRisk remains."))
      .toBe("Price moved +2.40%, with confirmation.\n\nRisk remains.");
  });

  it("fails closed instead of euphemistically rewriting investment instructions", () => {
    const text = "Buy now before entry, then accumulate and commit capital.";

    expect(() => sanitizeSocialEditorialText(text)).toThrow(UnsafeSocialEditorialError);
    expect(sanitizeSocialEditorialText(text, { unsafeBehavior: "preserve" })).toBe(text);
    expect(findUnsafeSocialPhrases(text)).toEqual(expect.arrayContaining([
      "investment instruction",
      "entry instruction",
      "accumulation instruction",
      "capital instruction",
    ]));
  });

  it("does not turn missing safety into softer investment vocabulary", () => {
    const text = "Risk-on buying becomes accumulation before making a move.";

    expect(() => sanitizeSocialEditorialText(text)).toThrow(UnsafeSocialEditorialError);
    expect(sanitizeSocialEditorialText(text, { unsafeBehavior: "preserve" }))
      .toBe("Risk-on buying becomes accumulation before making a move.");
  });

  it("preserves PUMP and Pump.fun entity names exactly", () => {
    const text = "$PUMP (Pump.fun) Explained: Is This 17% Move Real?";

    expect(sanitizeSocialEditorialText(text, {
      protectedEntities: [
        { value: "PUMP", caseSensitive: true },
        { value: "Pump.fun", caseSensitive: false },
      ],
    })).toBe(text);
    expect(findUnsafeSocialPhrases(text, {
      protectedEntities: [
        { value: "PUMP", caseSensitive: true },
        { value: "Pump.fun", caseSensitive: false },
      ],
    })).toEqual([]);
  });

  it("does not auto-mask dotted text that contains an unsafe claim", () => {
    expect(findUnsafeSocialPhrases("Setup.Guaranteed returns")).toContain("guaranteed claim");
    expect(() => sanitizeSocialEditorialText("Setup.Guaranteed returns"))
      .toThrow(UnsafeSocialEditorialError);
  });

  it("still blocks lowercase pump hype beside a protected PUMP ticker", () => {
    const text = "$PUMP could pump after this candle.";

    expect(findUnsafeSocialPhrases(text, {
      protectedEntities: [{ value: "PUMP", caseSensitive: true }],
    })).toContain("pump hype");
    expect(() => sanitizeSocialEditorialText(text, {
      protectedEntities: [{ value: "PUMP", caseSensitive: true }],
    })).toThrow(UnsafeSocialEditorialError);
  });

  it("preserves neutral signal grammar instead of rewriting the word globally", () => {
    const text = "Speculative tokens signal broad retail FOMO.";
    const sanitized = sanitizeSocialEditorialText(text);

    expect(sanitized).toBe(text);
    expect(sanitized).not.toContain("research read");
  });

  it("permits a negative educational disclaimer", () => {
    const text = "Educational research only. Not financial advice.";

    expect(sanitizeSocialEditorialText(text)).toBe(text);
    expect(findUnsafeSocialPhrases(text)).toEqual([]);
  });
});

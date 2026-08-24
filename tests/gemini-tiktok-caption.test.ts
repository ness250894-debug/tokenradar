import { describe, expect, it } from "vitest";
import { prepareTikTokCaptionForPublishing } from "../src/lib/gemini";
import { UnsafeSocialEditorialError } from "../src/lib/social-editorial";

describe("TikTok caption preparation", () => {
  it("removes generic reach tags and enforces the three-tag publishing policy", () => {
    const caption = [
      "Solana crypto market update",
      "",
      "+4.20% in 24h | Risk score: 5/10",
      "",
      "@tokenradarco #FYP #Crypto #Viral #DeFi #SOL #TokenRadar #Altcoins #Crypto",
    ].join("\n");

    const prepared = prepareTikTokCaptionForPublishing(caption, "sol");
    const hashtags = prepared.match(/#[a-zA-Z0-9_]+/g) || [];

    expect(prepared).not.toMatch(/#FYP|#Viral/i);
    expect(hashtags).toEqual(["#SOL", "#Crypto", "#TokenRadar"]);
  });

  it("preserves complete hashtags when truncating", () => {
    const caption = `${"Momentum ".repeat(40)}\n\n#FYP #Crypto #TokenRadar #Altcoins`;
    const prepared = prepareTikTokCaptionForPublishing(caption, "btc", 140);

    expect(prepared.length).toBeLessThanOrEqual(140);
    expect(prepared).toContain("#BTC #Crypto #TokenRadar");
    expect(prepared).not.toMatch(/#[A-Za-z0-9_]*\.\.\./);
  });

  it("blocks advice and hype language instead of rewriting it", () => {
    expect(() => prepareTikTokCaptionForPublishing(
      "Buy now before this moonshot goes 100x. Guaranteed returns. #Crypto",
      "sol",
    )).toThrow(UnsafeSocialEditorialError);
  });

  it("blocks trade-signal wording instead of publishing euphemisms", () => {
    expect(() => prepareTikTokCaptionForPublishing(
      "TokenRadar signal: STRONG BUY setup with an entry price and price prediction. #Crypto",
      "eth",
    )).toThrow(UnsafeSocialEditorialError);
  });
});

import { describe, it, expect } from "vitest";
import {
  calculateXPostSimilarity,
  diversifyXPostText,
  getMissingXCredentialNames,
  isTooSimilarForXPost,
  normalizeForXSimilarity,
  sanitizeCashtags,
  stripHtmlForX,
  truncateForX,
} from "../src/lib/x-client";

describe("stripHtmlForX", () => {
  it("converts <a> tags to text: url format", () => {
    const html = '<a href="https://example.com">Click here</a>';
    expect(stripHtmlForX(html)).toBe("Click here: https://example.com");
  });

  it("strips <b> and <i> tags", () => {
    const html = "<b>Bold</b> and <i>italic</i>";
    expect(stripHtmlForX(html)).toBe("Bold and italic");
  });

  it("handles multiple links", () => {
    const html = '<a href="https://a.com">A</a> | <a href="https://b.com">B</a>';
    expect(stripHtmlForX(html)).toBe("A: https://a.com | B: https://b.com");
  });

  it("handles plain text passthrough", () => {
    expect(stripHtmlForX("No HTML here")).toBe("No HTML here");
  });
});

describe("truncateForX", () => {
  it("returns text unchanged if under 280 chars", () => {
    const short = "Hello world";
    expect(truncateForX(short)).toBe(short);
  });

  it("returns text unchanged at exactly 280 chars", () => {
    const exact = "A".repeat(280);
    expect(truncateForX(exact)).toBe(exact);
  });

  it("truncates long text and ends with ...", () => {
    const long = Array(20).fill("This is a test line that is fairly long").join(" ");
    const result = truncateForX(long);
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("preserves complete trailing hashtags when shortening X copy", () => {
    const text = [
      "Watchlist: Aztec ($AZTEC - 0.02).",
      "At 0.023629 (-7.24%), this 70M MC token is a newly-published privacy pioneer.",
      "Its team invented PLONK and Noir, building foundational tech.",
      "Given its 5/10 risk and institutional backing, can Aztec define the future of Web3 privacy?",
      "#Privacy #Web3",
    ].join(" ");

    const result = truncateForX(text, 260);

    expect(result.length).toBeLessThanOrEqual(260);
    expect(result).toMatch(/\.\.\. #Privacy #Web3$/);
    expect(result).not.toContain("#P...");
  });

  it("does not emit partial hashtag fragments", () => {
    const text = `${"market structure ".repeat(18)}#PricePrediction`;
    const result = truncateForX(text, 180);

    expect(result.length).toBeLessThanOrEqual(180);
    expect(result).toContain("#PricePrediction");
    expect(result).not.toMatch(/#[A-Za-z0-9_]*\.\.\./);
  });

  it("preserves header and footer lines", () => {
    const lines = [
      "🚀 HEADER LINE 1",
      "💰 HEADER LINE 2",
      "📊 HEADER LINE 3",
      "STAT LINE 4",
      "MIDDLE 1",
      "MIDDLE 2",
      "MIDDLE 3",
      "MIDDLE 4",
      "🔗 FOOTER 1",
      "🐦 FOOTER 2",
      "👥 FOOTER 3",
      "#HASHTAG 4",
      "LAST FOOTER 5",
    ];
    const text = lines.join("\n");
    const result = truncateForX(text);
    // Should preserve header lines
    expect(result).toContain("HEADER LINE 1");
    // Should preserve footer lines
    expect(result).toContain("LAST FOOTER 5");
  });
});

describe("X post similarity helpers", () => {
  it("normalizes cashtags and hashtags before comparison", () => {
    const normalized = normalizeForXSimilarity("$BTC breakout watch. #Crypto https://example.com");
    expect(normalized).toBe("$token breakout watch #tag");
  });

  it("detects near-duplicate market posts even when the token changes", () => {
    const first = "$BTC Bitcoin: +4.2% over 24h, price 64000, market cap 1.2T. Does the data support more upside from here? #Crypto";
    const second = "$ETH Ethereum: +4.0% over 24h, price 3200, market cap 380B. Does the data support more upside from here? #Crypto";

    expect(calculateXPostSimilarity(first, second)).toBeGreaterThan(0.68);
    expect(isTooSimilarForXPost(second, [first])).toBe(true);
  });

  it("adds a short diversity line when recent structure is too similar", () => {
    const recent = "$BTC Bitcoin: +4.2% over 24h, price 64000, market cap 1.2T. Does the data support more upside from here? #Crypto";
    const candidate = "$ETH Ethereum: +4.0% over 24h, price 3200, market cap 380B. Does the data support more upside from here? #Crypto";

    const diversified = diversifyXPostText(candidate, [recent], "2026-05-11:ethereum");

    expect(diversified).not.toBe(candidate);
    expect(diversified.length).toBeLessThanOrEqual(260);
    expect((diversified.match(/\$[A-Z]+/g) || []).length).toBeLessThanOrEqual(1);
  });
});

describe("sanitizeCashtags", () => {
  it("keeps only the first valid X cashtag and leaves invalid digit symbols alone", () => {
    expect(sanitizeCashtags("$btc and $Sol.US and $PEPE2 are moving")).toBe(
      "$btc and Sol.US and $PEPE2 are moving",
    );
  });
});

describe("X credential requirements", () => {
  it("does not require a client secret for PKCE public-client posting flows", () => {
    expect(
      getMissingXCredentialNames({
        X_OAUTH2_CLIENT_ID: "client-id",
        X_OAUTH2_REFRESH_TOKEN: "refresh-token",
      }),
    ).toEqual([]);
  });
});

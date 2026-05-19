import { describe, expect, it } from "vitest";

import { sanitizeSocialEditorialText } from "../src/lib/social-editorial";

describe("social editorial policy", () => {
  it("removes advice, hype, and certainty phrases from generated social copy", () => {
    const sanitized = sanitizeSocialEditorialText(
      "Buy now before this moonshot goes 100x. Guaranteed returns. This is financial advice.",
    );

    expect(sanitized.toLowerCase()).not.toContain("buy now");
    expect(sanitized.toLowerCase()).not.toContain("moonshot");
    expect(sanitized.toLowerCase()).not.toContain("100x");
    expect(sanitized.toLowerCase()).not.toContain("guaranteed returns");
    expect(sanitized.toLowerCase()).not.toContain("financial advice");
    expect(sanitized).toContain("Review the data");
  });

  it("preserves neutral data-led social copy", () => {
    const text = "$BTC is +2.40% over 24h. Watch liquidity and risk score before treating the move as durable.";

    expect(sanitizeSocialEditorialText(text)).toBe(text);
  });

  it("does not rewrite neutral long-term or short-form wording", () => {
    const text = "Long-term context matters more than one short-form clip about a volatile move.";

    expect(sanitizeSocialEditorialText(text)).toBe(text);
  });

  it("rewrites moon-bound wording used by short social surfaces", () => {
    const sanitized = sanitizeSocialEditorialText("Moon bound if volume keeps building.");

    expect(sanitized.toLowerCase()).not.toContain("moon bound");
    expect(sanitized).toContain("Needs confirmation");
  });

  it("rewrites trade-signal vocabulary into research-safe wording", () => {
    const sanitized = sanitizeSocialEditorialText(
      "TokenRadar signal: strong buy with an entry price and price prediction.",
    );

    expect(sanitized).not.toMatch(/\b(?:signal|strong buy|entry price|price prediction)\b/i);
    expect(sanitized).toContain("TokenRadar research read");
    expect(sanitized).toContain("research read");
  });
});

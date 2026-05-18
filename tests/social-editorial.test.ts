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
});

import { describe, expect, it } from "vitest";

import { getHomeMarketTokens } from "../src/lib/home-market-data";

describe("homepage market data payload", () => {
  it("publishes the complete compact comparison dataset without intent payload fields", async () => {
    const tokens = await getHomeMarketTokens();
    const ids = new Set(tokens.map((token) => token.id));
    const serialized = JSON.stringify(tokens);

    expect(tokens.length).toBeGreaterThan(400);
    expect(ids.size).toBe(tokens.length);
    expect(tokens[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      symbol: expect.any(String),
      price: expect.any(Number),
      marketCap: expect.any(Number),
      riskScore: expect.any(Number),
      category: expect.any(String),
    }));
    expect(serialized).not.toContain("searchIntentAttentionScore");
    expect(Buffer.byteLength(serialized)).toBeLessThan(200_000);
  });
});

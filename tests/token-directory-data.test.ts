import { describe, expect, it } from "vitest";

import { getTokenDirectoryData } from "../src/lib/token-directory-data";

describe("token directory deferred payload", () => {
  it("publishes the complete compact card dataset", async () => {
    const { cards } = await getTokenDirectoryData();
    const ids = new Set(cards.map((token) => token.id));
    const serialized = JSON.stringify(cards);

    expect(cards.length).toBeGreaterThan(400);
    expect(ids.size).toBe(cards.length);
    expect(cards[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      name: expect.any(String),
      symbol: expect.any(String),
      price: expect.any(Number),
      marketCap: expect.any(Number),
      riskScore: expect.any(Number),
      category: expect.any(String),
    }));
    expect(Buffer.byteLength(serialized)).toBeLessThan(400_000);
  });
});

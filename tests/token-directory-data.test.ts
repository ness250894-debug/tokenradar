import { afterEach, describe, expect, it, vi } from "vitest";

import * as contentLoader from "../src/lib/content-loader";
import { getIndexableTokenProfiles, getTokenDirectoryData } from "../src/lib/token-directory-data";

describe("token directory deferred payload", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("lists only exported profiles in directory cards and A-Z links", async () => {
    vi.spyOn(contentLoader, "getTokenIds").mockResolvedValue(["bitcoin"]);
    const [{ cards }, profiles] = await Promise.all([getTokenDirectoryData(), getIndexableTokenProfiles()]);
    expect(cards.map((token) => token.id)).toEqual(["bitcoin"]);
    expect(profiles.map((token) => token.id)).toEqual(["bitcoin"]);
    const suppliedProfiles = await getIndexableTokenProfiles(await contentLoader.getAllTokens());
    expect(suppliedProfiles.map((token) => token.id)).toEqual(["bitcoin"]);
  });

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

import { describe, expect, it } from "vitest";

import { TGE_RSS_FEEDS } from "../src/lib/tge-rss-feeds";

describe("TGE RSS feeds", () => {
  it("uses free reachable feeds and excludes The Block", () => {
    expect(TGE_RSS_FEEDS).toContainEqual({
      name: "CoinDesk",
      url: "https://www.coindesk.com/arc/outboundfeeds/rss",
    });

    expect(TGE_RSS_FEEDS.some((feed) => feed.url.includes("theblock.co"))).toBe(false);
  });

  it("keeps feed URLs unique", () => {
    const urls = TGE_RSS_FEEDS.map((feed) => feed.url);

    expect(new Set(urls).size).toBe(urls.length);
  });
});

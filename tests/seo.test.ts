import * as fs from "fs";
import * as path from "path";

import { getArticle, getTokenDetail, type Article, type TokenDetail } from "../src/lib/content-loader";
import { canonicalPath, canonicalUrl, isTokenOverviewIndexable } from "../src/lib/seo";

function makeTokenDetail(volume24h: number): TokenDetail {
  return {
    id: "test-token",
    symbol: "test",
    name: "Test Token",
    description: "",
    categories: [],
    genesisDate: null,
    links: {
      website: null,
      github: null,
      reddit: null,
      explorer: null,
    },
    market: {
      price: 1,
      marketCap: 1,
      marketCapRank: 999,
      volume24h,
      high24h: 1,
      low24h: 1,
      priceChange24h: 0,
      priceChange7d: 0,
      priceChange30d: 0,
      priceChange1y: 0,
      ath: 1,
      athChangePercentage: 0,
      athDate: "2026-01-01T00:00:00.000Z",
      atl: 1,
      atlDate: "2026-01-01T00:00:00.000Z",
      circulatingSupply: 1,
      totalSupply: null,
      maxSupply: null,
      fdv: null,
    },
    community: {
      twitterFollowers: null,
      redditSubscribers: null,
    },
    developer: {
      githubStars: null,
      githubForks: null,
      commits4Weeks: null,
    },
    fetchedAt: "2026-01-01T00:00:00.000Z",
  };
}

function makeArticle(wordCount: number): Article {
  return {
    tokenId: "test-token",
    tokenName: "Test Token",
    type: "overview",
    title: "Test Token Overview",
    slug: "overview",
    content: "",
    wordCount,
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

describe("SEO helpers", () => {
  it("normalizes canonical paths and URLs", () => {
    expect(canonicalPath("bitcoin/")).toBe("/bitcoin");
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalUrl("/bitcoin")).toBe("https://tokenradar.co/bitcoin");
  });

  it("uses one token overview indexability rule", () => {
    expect(isTokenOverviewIndexable(makeTokenDetail(100_001), null)).toBe(true);
    expect(isTokenOverviewIndexable(makeTokenDetail(5_000), makeArticle(501))).toBe(true);
    expect(isTokenOverviewIndexable(makeTokenDetail(5_000), makeArticle(100))).toBe(false);
  });
});

describe("generated sitemaps", () => {
  it("does not emit ignored priority or changefreq fields", () => {
    const sitemap = fs.readFileSync(path.join(process.cwd(), "public/sitemap-tokens.xml"), "utf-8");
    expect(sitemap).not.toContain("<priority>");
    expect(sitemap).not.toContain("<changefreq>");
  });

  it("submits only indexable token overview URLs", async () => {
    const sitemap = fs.readFileSync(path.join(process.cwd(), "public/sitemap-tokens.xml"), "utf-8");
    const tokenOverviewIds = extractLocs(sitemap)
      .map((url) => new URL(url).pathname.split("/").filter(Boolean))
      .filter((segments) => segments.length === 1)
      .map(([tokenId]) => tokenId);

    for (const tokenId of tokenOverviewIds) {
      const detail = await getTokenDetail(tokenId);
      expect(detail, `${tokenId} should resolve from token data`).not.toBeNull();
      if (!detail) continue;

      const overview = await getArticle(tokenId, "overview");
      expect(isTokenOverviewIndexable(detail, overview), `${tokenId} should be indexable if it is in sitemap-tokens.xml`).toBe(true);
    }
  });
});

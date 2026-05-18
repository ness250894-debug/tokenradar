import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

import { normalizeArticleMarkdown } from "../src/lib/article-formatting";
import { type Article, type TokenDetail } from "../src/lib/content-loader";
import {
  canonicalPath,
  canonicalUrl,
  filterIndexableArticleTokenIds,
  isArticleIndexable,
  isTokenOverviewIndexable,
} from "../src/lib/seo";

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
  const requiredText = [
    "Test Token overview uses market data, liquidity, and historical context to frame the asset as a research fixture.",
    "| Editorial Check | How to Use It |\n| :--- | :--- |\n| Price | Compare the $1.00 fixture price with volatility and volume. |\n| Change | Treat the 2.00% move as context, not a signal. |\n| Supply | Review the 1,000 unit supply figure with market depth. |",
    "## Market Context",
    "The fixture article stays neutral, cites numeric context, and avoids recommendation language.",
    "## FAQ",
    "**What is Test Token?**\n\nTest Token is a research fixture for SEO quality tests.\n\n**How should readers use this page?**\n\nReaders should compare the data points with liquidity, volatility, and source quality.\n\n**What risks matter for Test Token?**\n\nLiquidity, stale market data, and unsupported claims are the main test risks.",
    "---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*",
  ].join("\n\n");
  const requiredWordCount = requiredText.split(/\s+/).filter(Boolean).length;
  const fillerWords = [
    "market",
    "liquidity",
    "volatility",
    "context",
    "history",
    "supply",
    "ranking",
    "volume",
    "sector",
    "activity",
    "research",
    "comparison",
    "metric",
    "trend",
    "scenario",
    "drawdown",
    "cycle",
    "participation",
    "depth",
    "signal",
  ];
  const filler = Array.from({ length: Math.max(0, wordCount - requiredWordCount) }, (_, index) => fillerWords[index % fillerWords.length]).join(" ");
  const content = requiredText.replace(
    "The fixture article stays neutral, cites numeric context, and avoids recommendation language.",
    `The fixture article stays neutral, cites numeric context, and avoids recommendation language. ${filler}`.trim(),
  );

  return {
    tokenId: "test-token",
    tokenName: "Test Token",
    type: "overview",
    title: "Test Token Overview",
    slug: "overview",
    content,
    wordCount: content.split(/\s+/).filter(Boolean).length,
    generatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function extractLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

function loadTokenDetails(): Record<string, TokenDetail> {
  const filePath = path.join(process.cwd(), "data/_tokens_blob.json");
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, TokenDetail>;
}

function loadOverviewArticle(tokenId: string): Article | null {
  const filePath = path.join(process.cwd(), "content/tokens", tokenId, "overview.json");
  if (!fs.existsSync(filePath)) return null;

  const article = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Article;
  const normalizedContent = normalizeArticleMarkdown(article.content || "");
  const wordCount = normalizedContent.split(/\s+/).filter(Boolean).length;

  return {
    ...article,
    content: normalizedContent,
    wordCount,
  };
}

describe("SEO helpers", () => {
  it("normalizes canonical paths and URLs", () => {
    expect(canonicalPath("bitcoin/")).toBe("/bitcoin");
    expect(canonicalPath("/")).toBe("/");
    expect(canonicalUrl("/bitcoin")).toBe("https://tokenradar.co/bitcoin");
  });

  it("requires liquid market data and quality-passing overview content before indexing", () => {
    expect(isTokenOverviewIndexable(makeTokenDetail(100_001), null)).toBe(false);
    expect(isTokenOverviewIndexable(makeTokenDetail(5_000), makeArticle(900))).toBe(false);
    expect(isTokenOverviewIndexable(makeTokenDetail(100_001), makeArticle(100))).toBe(false);
    expect(isTokenOverviewIndexable(makeTokenDetail(100_001), makeArticle(900))).toBe(true);
  });

  it("uses the shared article quality rule for secondary article indexability", () => {
    expect(isArticleIndexable(makeArticle(900))).toBe(true);
    expect(isArticleIndexable(makeArticle(100))).toBe(false);
    expect(isArticleIndexable({ ...makeArticle(900), content: "analysis ".repeat(900) })).toBe(false);
  });

  it("filters static article routes to quality-passing articles", async () => {
    const tokenIds = ["good", "thin", "missing"];
    const articles: Record<string, Article | null> = {
      good: makeArticle(900),
      thin: makeArticle(100),
      missing: null,
    };

    await expect(filterIndexableArticleTokenIds(tokenIds, async (tokenId) => articles[tokenId])).resolves.toEqual([
      "good",
    ]);
  });
});

describe("generated sitemaps", () => {
  it("does not emit ignored priority or changefreq fields", () => {
    const sitemap = fs.readFileSync(path.join(process.cwd(), "public/sitemap-tokens.xml"), "utf-8");
    expect(sitemap).not.toContain("<priority>");
    expect(sitemap).not.toContain("<changefreq>");
  });

  it("submits only indexable token overview URLs", () => {
    const sitemap = fs.readFileSync(path.join(process.cwd(), "public/sitemap-tokens.xml"), "utf-8");
    const tokenOverviewIds = extractLocs(sitemap)
      .map((url) => new URL(url).pathname.split("/").filter(Boolean))
      .filter((segments) => segments.length === 1)
      .map(([tokenId]) => tokenId);
    const detailsById = loadTokenDetails();

    for (const tokenId of tokenOverviewIds) {
      const detail = detailsById[tokenId];
      expect(detail, `${tokenId} should resolve from token data`).toBeDefined();
      if (!detail) continue;

      const overview = loadOverviewArticle(tokenId);
      expect(isTokenOverviewIndexable(detail, overview), `${tokenId} should be indexable if it is in sitemap-tokens.xml`).toBe(true);
    }
  });
});

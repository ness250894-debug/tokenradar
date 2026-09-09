import { describe, it, expect } from "vitest";
import { transformCoinDetail } from "../src/lib/coingecko";
import { TokenDetailDataSchema } from "../src/lib/schemas";
import type { CoinGetIDResponse } from "@coingecko/coingecko-typescript/resources/coins/coins";

describe("CoinGecko data transformation", () => {
  const baseMockDetail: CoinGetIDResponse = {
    id: "bitcoin",
    symbol: "btc",
    name: "Bitcoin",
    description: { en: "Bitcoin is a cryptocurrency." },
    categories: ["Cryptocurrency", "Layer 1"],
    genesis_date: "2009-01-03",
    image: {
      thumb: "https://assets.coingecko.com/thumb.png",
      small: "https://assets.coingecko.com/small.png",
      large: "https://assets.coingecko.com/large.png",
    },
    links: {
      homepage: ["https://bitcoin.org"],
      blockchain_site: ["https://mempool.space"],
      repos_url: {
        github: ["https://github.com/bitcoin/bitcoin"],
      },
      subreddit_url: "https://reddit.com/r/bitcoin",
    },
    market_data: {
      current_price: { usd: 65000 },
      market_cap: { usd: 1300000000000 },
      market_cap_rank: 1,
      total_volume: { usd: 25000000000 },
      high_24h: { usd: 66000 },
      low_24h: { usd: 64000 },
      price_change_percentage_24h: 1.5,
      price_change_percentage_7d: 3.2,
      price_change_percentage_30d: 10.0,
      price_change_percentage_1y: 120.0,
      ath: { usd: 73000 },
      ath_change_percentage: { usd: -10.9 },
      ath_date: { usd: "2024-03-14T07:10:34.000Z" },
      atl: { usd: 67.81 },
      atl_date: { usd: "2013-07-06T00:00:00.000Z" },
      circulating_supply: 19700000,
      total_supply: 19700000,
      max_supply: 21000000,
      fully_diluted_valuation: { usd: 1365000000000 },
    },
    last_updated: "2026-09-09T08:00:00.000Z",
  } as unknown as CoinGetIDResponse;

  it("handles CoinGecko v8 response with omitted community_data and developer_data", () => {
    // In SDK v8, community_data and developer_data are completely absent
    const transformed = transformCoinDetail(baseMockDetail, "bitcoin");

    expect(transformed.id).toBe("bitcoin");
    expect(transformed.symbol).toBe("btc");
    expect(transformed.name).toBe("Bitcoin");
    expect(transformed.community).toEqual({
      twitterFollowers: null,
      redditSubscribers: null,
    });
    expect(transformed.developer).toEqual({
      githubStars: null,
      githubForks: null,
      commits4Weeks: null,
    });

    const parsed = TokenDetailDataSchema.safeParse(transformed);
    expect(parsed.success).toBe(true);
  });

  it("safely extracts community_data and developer_data when present in raw response", () => {
    const detailWithRawMetadata = {
      ...baseMockDetail,
      community_data: {
        twitter_followers: 5500000,
        reddit_subscribers: 6100000,
      },
      developer_data: {
        stars: 75000,
        forks: 36000,
        commit_count_4_weeks: 142,
      },
    } as unknown as CoinGetIDResponse;

    const transformed = transformCoinDetail(detailWithRawMetadata, "bitcoin");

    expect(transformed.community).toEqual({
      twitterFollowers: 5500000,
      redditSubscribers: 6100000,
    });
    expect(transformed.developer).toEqual({
      githubStars: 75000,
      githubForks: 36000,
      commits4Weeks: 142,
    });

    const parsed = TokenDetailDataSchema.safeParse(transformed);
    expect(parsed.success).toBe(true);
  });

  it("handles sparse or partially null fields gracefully", () => {
    const minimalDetail = {
      id: "unknown-coin",
      last_updated: "2026-09-09T08:00:00.000Z",
    } as unknown as CoinGetIDResponse;

    const transformed = transformCoinDetail(minimalDetail, "unknown-coin");

    expect(transformed.id).toBe("unknown-coin");
    expect(transformed.symbol).toBe("");
    expect(transformed.name).toBe("");
    expect(transformed.market.price).toBe(0);
    expect(transformed.market.totalSupply).toBeNull();
    expect(transformed.community.twitterFollowers).toBeNull();
    expect(transformed.developer.githubStars).toBeNull();

    const parsed = TokenDetailDataSchema.safeParse(transformed);
    expect(parsed.success).toBe(true);
  });
});

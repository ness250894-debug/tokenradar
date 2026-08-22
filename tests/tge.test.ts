import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  getTgeContractQueries,
  isLikelyStaleExpectedTge,
  isTgeVerificationStale,
  normalizeTge,
  shouldPublishTgePreview,
  type UpcomingTge,
} from "../src/lib/tge";

const baseTge: UpcomingTge = {
  id: "example-protocol",
  name: "Example Protocol",
  symbol: "TBD",
  category: "Infrastructure",
  expectedTge: "Funding Stage",
  narrativeStrength: 80,
  dataSource: "https://cointelegraph.com/news/example-raises-series-a",
  discoveredAt: "2026-05-01T00:00:00.000Z",
};

describe("TGE lifecycle normalization", () => {
  it("uses external market evidence for the graduated Doge Strategy record", () => {
    const records = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data/upcoming-tges.json"), "utf-8"),
    ) as UpcomingTge[];
    const dogeStrategy = records.find((record) => record.id === "doge-strategy");

    expect(dogeStrategy?.dataSource).toBe("https://www.coingecko.com/en/coins/doge-strategy");
    expect(dogeStrategy?.signals).toContainEqual(expect.objectContaining({
      type: "aggregator_listing",
      sourceType: "aggregator",
      url: "https://www.coingecko.com/en/coins/doge-strategy",
    }));
  });

  it("keeps funding-only news as a non-publishable candidate", () => {
    const tge = normalizeTge(baseTge);

    expect(tge.lifecycleStatus).toBe("candidate");
    expect(tge.confidence).toBeLessThan(45);
    expect(shouldPublishTgePreview(tge)).toBe(false);
  });

  it("promotes explicit airdrop evidence into the publishable watchlist", () => {
    const tge = normalizeTge({
      ...baseTge,
      symbol: "EXAMPLE",
      expectedTge: "Confirmed airdrop campaign in Q3 2026",
      dataSource: "https://airdropalert.com/blogs/example-airdrop-guide/",
    });

    expect(["watchlist", "confirmed_tge"]).toContain(tge.lifecycleStatus);
    expect(shouldPublishTgePreview(tge, new Date("2026-05-15T00:00:00.000Z"))).toBe(true);
  });

  it("marks old quarter windows as stale", () => {
    expect(isLikelyStaleExpectedTge("Q2 2025", new Date("2026-05-11T00:00:00.000Z"))).toBe(true);
  });

  it("blocks confirmed launch previews when their verification evidence is stale", () => {
    const staleTge = normalizeTge({
      ...baseTge,
      symbol: "EXAMPLE",
      lifecycleStatus: "confirmed_tge",
      confidence: 75,
      lastVerifiedAt: "2026-04-11T00:00:00.000Z",
    });
    const now = new Date("2026-08-13T00:00:00.000Z");

    expect(isTgeVerificationStale(staleTge, now)).toBe(true);
    expect(shouldPublishTgePreview(staleTge, now)).toBe(false);
  });

  it("blocks generic product-news watchlists without explicit token-launch evidence", () => {
    const productWatchlist = normalizeTge({
      ...baseTge,
      name: "Traditional Prediction Market Product",
      expectedTge: "Watchlist",
      lifecycleStatus: "watchlist",
      confidence: 60,
      lastVerifiedAt: "2026-08-01T00:00:00.000Z",
      signals: [{
        type: "Product Launch (potential token)" as never,
        sourceType: "News Article" as never,
        url: "https://cointelegraph.com/news/traditional-product",
        title: "Institution plans a prediction-market product",
        observedAt: "2026-08-01T00:00:00.000Z",
      }],
    });

    expect(productWatchlist.signals?.[0]?.type).toBe("product");
    expect(productWatchlist.signals?.[0]?.sourceType).toBe("news");
    expect(shouldPublishTgePreview(productWatchlist, new Date("2026-08-13T00:00:00.000Z"))).toBe(false);
  });

  it("blocks generic-symbol giveaways without contract or market evidence", () => {
    const giveaway = normalizeTge({
      ...baseTge,
      name: "Stablecoin Giveaway",
      expectedTge: "Airdrop ongoing",
      lifecycleStatus: "confirmed_tge",
      confidence: 90,
      lastVerifiedAt: "2026-08-01T00:00:00.000Z",
      signals: [{
        type: "Airdrop Announcement" as never,
        sourceType: "news_article" as never,
        url: "https://airdropalert.com/blogs/stablecoin-giveaway/",
        title: "How to claim the USDC giveaway",
        observedAt: "2026-08-01T00:00:00.000Z",
      }],
    });

    expect(shouldPublishTgePreview(giveaway, new Date("2026-08-13T00:00:00.000Z"))).toBe(false);
  });

  it("blocks already-listed claims until market evidence is verified", () => {
    const alreadyListed = normalizeTge({
      ...baseTge,
      symbol: "LISTED",
      expectedTge: "Q3 2026",
      lifecycleStatus: "confirmed_tge",
      confidence: 90,
      lastVerifiedAt: "2026-08-06T00:00:00.000Z",
      signals: [{
        type: "Exchange listing announcements" as never,
        sourceType: "news_article" as never,
        url: "https://airdropalert.com/blogs/already-listed/",
        title: "The first meme coin listed on Robinhood",
        observedAt: "2026-08-06T00:00:00.000Z",
      }],
    });

    expect(shouldPublishTgePreview(alreadyListed, new Date("2026-08-13T00:00:00.000Z"))).toBe(false);
  });

  it("only allows contract queries for valid EVM addresses", () => {
    const queries = getTgeContractQueries({
      ...baseTge,
      contracts: [
        { chain: "ethereum", address: "0x0000000000000000000000000000000000000000" },
        { chain: "solana", address: "not-an-evm-address" },
      ],
    });

    expect(queries).toEqual(["0x0000000000000000000000000000000000000000"]);
  });

  it("normalizes date-only signal observation dates into ISO timestamps", () => {
    const tge = normalizeTge({
      ...baseTge,
      signals: [
        {
          type: "tge",
          sourceType: "official",
          url: "https://example.com/tge",
          observedAt: "2026-06-02",
        },
      ],
    });

    expect(tge.signals?.[0]?.observedAt).toBe("2026-06-02T00:00:00.000Z");
  });
});

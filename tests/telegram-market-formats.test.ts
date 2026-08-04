import { describe, expect, it } from "vitest";

import { SOCIAL_PLATFORM_LIMITS, getTelegramFooter } from "../src/lib/config";
import {
  buildTelegramMarketPost,
  getRadarDivergenceRead,
  parseTelegramMarketFormat,
  type TelegramMarketContext,
  type TelegramMarketToken,
} from "../src/lib/telegram-market-formats";
import { renderTelegramMarketImage } from "../src/lib/telegram-market-image";
import { buildTelegramMediaCaption, getTelegramHtmlTextLength } from "../src/lib/telegram";

const sampleToken: TelegramMarketToken = {
  id: "ethereum",
  name: "Ethereum",
  symbol: "eth",
  price: 3842.12,
  priceChange24h: 2.34,
  marketCap: 461_000_000_000,
  volume24h: 18_400_000_000,
  marketCapRank: 2,
  riskScore: 3,
  selectionReason: "trending-coingecko",
};

const sampleContext: TelegramMarketContext = {
  globalStats: "$3.42T Total Cap (+1.2% 24h), BTC Dominance: 52.4%",
  sectorPerformance: "AI Agents (+8.4%), DeFi (+3.1%), Layer 2 (+2.8%)",
  generatedAt: new Date("2026-05-26T12:00:00.000Z"),
};

describe("Telegram market formats", () => {
  it("parses supported Telegram market post formats", () => {
    expect(parseTelegramMarketFormat(undefined)).toBe("market-brief");
    expect(parseTelegramMarketFormat("market-brief")).toBe("market-brief");
    expect(parseTelegramMarketFormat("market-pulse")).toBe("market-pulse");
    expect(parseTelegramMarketFormat("radar-divergence")).toBe("radar-divergence");
    expect(parseTelegramMarketFormat("watchlist-check")).toBe("watchlist-check");
    expect(() => parseTelegramMarketFormat("daily-alpha")).toThrow("Invalid --format value");
  });

  it("builds a Radar Divergence read from price, participation, and risk", () => {
    const token = {
      ...sampleToken,
      priceChange24h: 8.6,
      volume24h: 18_000_000_000,
      marketCap: 500_000_000_000,
    };
    const read = getRadarDivergenceRead(token);
    const post = buildTelegramMarketPost({
      format: "radar-divergence",
      token,
      context: sampleContext,
    });

    expect(read.label).toBe("Price leads participation");
    expect(post.image.kind).toBe("market-pulse");
    expect(post.captionBody).toContain("<b>Radar Divergence: $ETH</b>");
    expect(post.captionBody).toContain("Price leads participation");
    expect(post.captionBody).toContain("What changes the read:");
    expect(post.captionBody).not.toMatch(/\b(?:buy|sell|entry|target|price prediction)\b/i);
  });

  it("builds a useful market pulse with an image data card", () => {
    const post = buildTelegramMarketPost({
      format: "market-pulse",
      token: sampleToken,
      context: sampleContext,
    });
    const finalCaption = buildTelegramMediaCaption(post.captionBody, getTelegramFooter(sampleToken.symbol), {
      maxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT,
      bodyMaxLength: SOCIAL_PLATFORM_LIMITS.TELEGRAM.PHOTO_AI_SUMMARY_CHARS,
    });

    expect(post.image.kind).toBe("market-pulse");
    expect(post.captionBody).toContain("<b>Market Pulse</b>");
    expect(post.captionBody).toContain("Total Cap");
    expect(post.captionBody).toContain("AI Agents");
    expect(post.captionBody).toContain("$ETH");
    expect(getTelegramHtmlTextLength(finalCaption)).toBeLessThanOrEqual(SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT);
  });

  it("builds a watchlist check that avoids trade-signal wording", () => {
    const post = buildTelegramMarketPost({
      format: "watchlist-check",
      token: sampleToken,
      context: sampleContext,
    });

    expect(post.image.kind).toBe("token-card");
    expect(post.captionBody).toContain("<b>Watchlist Check</b>");
    expect(post.captionBody).toContain("Risk:");
    expect(post.captionBody).toContain("Invalidation:");
    expect(post.captionBody).not.toMatch(/\b(?:buy|sell|entry|target|price prediction)\b/i);
  });

  it("renders the market pulse image locally as a PNG", async () => {
    const post = buildTelegramMarketPost({
      format: "market-pulse",
      token: sampleToken,
      context: sampleContext,
    });

    expect(post.image.kind).toBe("market-pulse");
    if (post.image.kind !== "market-pulse") return;

    const image = await renderTelegramMarketImage(post.image.data);

    expect(image.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(image.length).toBeGreaterThan(10_000);
  });
});

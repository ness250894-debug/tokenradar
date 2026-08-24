import { describe, expect, it } from "vitest";

import { SOCIAL_PLATFORM_LIMITS, getTelegramFooter } from "../src/lib/config";
import {
  buildTelegramMarketPost,
  getRadarDivergenceRead,
  parseTelegramMarketFormat,
  resolveTelegramMarketBriefCaption,
  type TelegramMarketContext,
  type TelegramMarketToken,
} from "../src/lib/telegram-market-formats";
import { renderTelegramMarketImage } from "../src/lib/telegram-market-image";
import { buildTelegramMediaCaption, getTelegramHtmlTextLength } from "../src/lib/telegram";
import { validateSocialContent } from "../src/lib/social-content-validator";

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

    expect(read.label).toBe("Point-in-time field comparison");
    expect(post.image.kind).toBe("market-pulse");
    expect(post.captionBody).toContain("<b>$ETH: price move vs reported participation</b>");
    expect(post.captionBody).toContain("What this proves:");
    expect(post.captionBody).toContain("24h volume (reported): $18.00B");
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
    expect(post.captionBody).toContain("<b>$ETH in one screen</b>");
    expect(post.captionBody).not.toContain("Total Cap");
    expect(post.captionBody).not.toContain("AI Agents");
    expect(post.captionBody).toContain("$ETH");
    if (post.image.kind === "market-pulse") {
      expect(post.image.data.globalStats).toContain("Total Cap");
      expect(post.image.data.sectorLines.join(" ")).toContain("AI Agents");
    }
    expect(getTelegramHtmlTextLength(finalCaption)).toBeLessThanOrEqual(SOCIAL_PLATFORM_LIMITS.TELEGRAM.CAPTION_LIMIT);
  });

  it("builds a watchlist check that avoids trade-signal wording", () => {
    const post = buildTelegramMarketPost({
      format: "watchlist-check",
      token: sampleToken,
      context: sampleContext,
    });

    expect(post.image.kind).toBe("token-card");
    expect(post.captionBody).toContain("<b>Why $ETH made today's watchlist</b>");
    expect(post.captionBody).toContain("Risk score: 3/10");
    expect(post.captionBody).toContain("Market cap: $461.00B");
    expect(post.captionBody).not.toMatch(/\b(?:buy|sell|entry|target|price prediction)\b/i);
  });

  it("uses the local factual market brief when generated copy was quarantined or missing", () => {
    const deterministic = buildTelegramMarketPost({
      format: "market-brief",
      token: sampleToken,
      context: sampleContext,
    }).captionBody;

    expect(deterministic).toContain("<b>$ETH: the move and the participation field</b>");
    expect(deterministic).toContain("CoinGecko trending list");
    expect(deterministic).toContain("24h volume (reported): $18.40B");
    expect(validateSocialContent(
      `${deterministic}\nCoinGecko snapshot, 2026-05-26 12:00 UTC`,
      {
        tokenName: sampleToken.name,
        symbol: sampleToken.symbol,
        price: sampleToken.price,
        priceChange24h: sampleToken.priceChange24h,
        marketCap: sampleToken.marketCap,
        marketCapRank: sampleToken.marketCapRank,
        volume24h: sampleToken.volume24h,
        riskScore: sampleToken.riskScore,
        marketDataSource: "coingecko-live",
        marketDataAsOf: "2026-05-26T12:00:00.000Z",
      },
    ).ok).toBe(true);
    expect(resolveTelegramMarketBriefCaption({
      generatedCaption: "<b>Unsupported AI copy</b>",
      deterministicCaption: deterministic,
      generatedCaptionQuarantined: true,
    })).toBe(deterministic);
    expect(resolveTelegramMarketBriefCaption({
      generatedCaption: "   ",
      deterministicCaption: deterministic,
    })).toBe(deterministic);
    expect(resolveTelegramMarketBriefCaption({
      generatedCaption: " <b>Validated generated copy</b> ",
      deterministicCaption: deterministic,
    })).toBe("<b>Validated generated copy</b>");
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

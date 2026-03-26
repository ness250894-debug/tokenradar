import { describe, it, expect } from "vitest";
import {
  getPollTypeForToday,
  buildSentimentPoll,
  buildPredictionPoll,
  buildNarrativePoll,
  buildCommunityPoll,
  type PollType,
} from "../scripts/post-interactive-daily";

// ── Mock token data ───────────────────────────────────────────

const mockToken = {
  id: "solana",
  symbol: "sol",
  name: "Solana",
  rank: 5,
  market: {
    price: 145.23,
    priceChange24h: 3.47,
    marketCap: 70_000_000_000,
  },
};

const mockTokenCheap = {
  id: "pepe",
  symbol: "pepe",
  name: "Pepe",
  rank: 30,
  market: {
    price: 0.00001234,
    priceChange24h: -5.2,
    marketCap: 5_000_000_000,
  },
};

const mockMetric = {
  riskScore: 3,
  riskLevel: "Low",
  growthPotentialIndex: 72,
};

// ── getPollTypeForToday ───────────────────────────────────────

describe("getPollTypeForToday", () => {
  it("returns a valid poll type", () => {
    const validTypes: PollType[] = ["sentiment", "prediction", "narrative", "community"];
    const result = getPollTypeForToday();
    expect(validTypes).toContain(result);
  });
});

// ── buildSentimentPoll ────────────────────────────────────────

describe("buildSentimentPoll", () => {
  it("includes the token symbol as a cashtag", () => {
    const poll = buildSentimentPoll(mockToken, mockMetric);
    expect(poll.text).toContain("$SOL");
  });

  it("includes risk score when metric is provided", () => {
    const poll = buildSentimentPoll(mockToken, mockMetric);
    expect(poll.text).toContain("Risk: 3/10");
  });

  it("omits risk score when no metric", () => {
    const poll = buildSentimentPoll(mockToken);
    expect(poll.text).not.toContain("Risk:");
  });

  it("has exactly 4 options", () => {
    const poll = buildSentimentPoll(mockToken);
    expect(poll.options).toHaveLength(4);
  });

  it("has correct duration", () => {
    const poll = buildSentimentPoll(mockToken);
    expect(poll.durationMinutes).toBe(1440);
  });

  it("shows green emoji for positive change", () => {
    const poll = buildSentimentPoll(mockToken);
    expect(poll.text).toContain("🟢");
    expect(poll.text).toContain("+3.5%");
  });

  it("shows red emoji for negative change", () => {
    const poll = buildSentimentPoll(mockTokenCheap);
    expect(poll.text).toContain("🔴");
    expect(poll.text).toContain("-5.2%");
  });
});

// ── buildPredictionPoll ───────────────────────────────────────

describe("buildPredictionPoll", () => {
  it("includes the current price", () => {
    const poll = buildPredictionPoll(mockToken);
    expect(poll.text).toContain("$145.23");
  });

  it("generates price range options around ±5%", () => {
    const poll = buildPredictionPoll(mockToken);
    const low = (145.23 * 0.95).toFixed(2);
    const high = (145.23 * 1.05).toFixed(2);
    expect(poll.options[0]).toContain(low);
    expect(poll.options[2]).toContain(high);
  });

  it("handles very small prices correctly", () => {
    const poll = buildPredictionPoll(mockTokenCheap);
    // Should use 6-decimal formatting for sub-cent prices
    expect(poll.text).toContain("$0.000012");
  });

  it("has 4 options including moon bound", () => {
    const poll = buildPredictionPoll(mockToken);
    expect(poll.options).toHaveLength(4);
    expect(poll.options[3]).toContain("Moon");
  });
});

// ── buildNarrativePoll ────────────────────────────────────────

describe("buildNarrativePoll", () => {
  it("includes all 4 narrative categories", () => {
    const poll = buildNarrativePoll();
    expect(poll.options).toContain("AI Tokens");
    expect(poll.options).toContain("Layer 2s");
    expect(poll.options).toContain("RWA");
    expect(poll.options).toContain("DeFi");
  });

  it("includes the site URL", () => {
    const poll = buildNarrativePoll();
    expect(poll.text).toContain("tokenradar.co");
  });

  it("includes the hashtag", () => {
    const poll = buildNarrativePoll();
    expect(poll.text).toContain("#TokenRadarCo");
  });
});

// ── buildCommunityPoll ────────────────────────────────────────

describe("buildCommunityPoll", () => {
  it("uses top 4 tokens by 24h change", () => {
    const candidates = [
      { ...mockToken, id: "a", symbol: "aaa", market: { ...mockToken.market, priceChange24h: 10 } },
      { ...mockToken, id: "b", symbol: "bbb", market: { ...mockToken.market, priceChange24h: 8 } },
      { ...mockToken, id: "c", symbol: "ccc", market: { ...mockToken.market, priceChange24h: 6 } },
      { ...mockToken, id: "d", symbol: "ddd", market: { ...mockToken.market, priceChange24h: 4 } },
      { ...mockToken, id: "e", symbol: "eee", market: { ...mockToken.market, priceChange24h: 2 } },
    ];
    const poll = buildCommunityPoll(candidates);
    expect(poll.options).toHaveLength(4);
    expect(poll.options[0]).toBe("$AAA");
    expect(poll.options[3]).toBe("$DDD");
  });

  it("falls back to narrative poll when fewer than 2 candidates", () => {
    const poll = buildCommunityPoll([mockToken]);
    // Should fall back — check for narrative-style content
    expect(poll.text).toContain("narrative");
  });
});

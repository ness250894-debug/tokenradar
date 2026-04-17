import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the AI call before importing the module under test
vi.mock("../src/lib/gemini", () => ({
  generatePollHook: vi.fn().mockResolvedValue("What's your move today?"),
}));

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
    marketCapRank: 5,
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
    marketCapRank: 30,
  },
};

const mockMetric = {
  riskScore: 3,
  riskLevel: "Low",
  growthPotentialIndex: 72,
};

beforeEach(() => {
  vi.clearAllMocks();
});

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
  it("includes the token symbol as a cashtag", async () => {
    const poll = await buildSentimentPoll(mockToken, mockMetric);
    expect(poll.text).toContain("$SOL");
  });

  it("has exactly 4 options", async () => {
    const poll = await buildSentimentPoll(mockToken);
    expect(poll.options).toHaveLength(4);
  });

  it("has correct duration", async () => {
    const poll = await buildSentimentPoll(mockToken);
    expect(poll.durationMinutes).toBe(1440);
  });

  it("includes the hashtag", async () => {
    const poll = await buildSentimentPoll(mockToken);
    expect(poll.text).toContain("#TokenRadarCo");
  });
});

// ── buildPredictionPoll ───────────────────────────────────────

describe("buildPredictionPoll", () => {
  it("includes the token cashtag", async () => {
    const poll = await buildPredictionPoll(mockToken);
    expect(poll.text).toContain("$SOL");
  });

  it("generates price range options", async () => {
    const poll = await buildPredictionPoll(mockToken);
    // Should have options containing formatted price values
    expect(poll.options).toHaveLength(4);
    expect(poll.options[3]).toContain("Moon");
  });

  it("handles very small prices correctly", async () => {
    const poll = await buildPredictionPoll(mockTokenCheap);
    // Should have 4 options for cheap tokens too
    expect(poll.options).toHaveLength(4);
    expect(poll.text).toContain("$PEPE");
  });

  it("has 4 options including moon bound", async () => {
    const poll = await buildPredictionPoll(mockToken);
    expect(poll.options).toHaveLength(4);
    expect(poll.options[3]).toContain("Moon");
  });
});

// ── buildNarrativePoll ────────────────────────────────────────

describe("buildNarrativePoll", () => {
  it("includes all 4 narrative categories", async () => {
    const poll = await buildNarrativePoll();
    expect(poll.options).toContain("AI Tokens");
    expect(poll.options).toContain("Layer 2s");
    expect(poll.options).toContain("RWA");
    expect(poll.options).toContain("DeFi");
  });


  it("includes the hashtag", async () => {
    const poll = await buildNarrativePoll();
    expect(poll.text).toContain("#TokenRadarCo");
  });
});

// ── buildCommunityPoll ────────────────────────────────────────

describe("buildCommunityPoll", () => {
  it("uses top 4 tokens by 24h change", async () => {
    const candidates = [
      { ...mockToken, id: "a", symbol: "aaa", market: { ...mockToken.market, priceChange24h: 10, marketCapRank: 1 } },
      { ...mockToken, id: "b", symbol: "bbb", market: { ...mockToken.market, priceChange24h: 8, marketCapRank: 2 } },
      { ...mockToken, id: "c", symbol: "ccc", market: { ...mockToken.market, priceChange24h: 6, marketCapRank: 3 } },
      { ...mockToken, id: "d", symbol: "ddd", market: { ...mockToken.market, priceChange24h: 4, marketCapRank: 4 } },
      { ...mockToken, id: "e", symbol: "eee", market: { ...mockToken.market, priceChange24h: 2, marketCapRank: 5 } },
    ];
    const poll = await buildCommunityPoll(candidates);
    expect(poll.options).toHaveLength(4);
    expect(poll.options[0]).toBe("$AAA");
    expect(poll.options[3]).toBe("$DDD");
  });

  it("falls back to narrative poll when fewer than 2 candidates", async () => {
    const poll = await buildCommunityPoll([mockToken]);
    // Should fall back — check for narrative-style content
    expect(poll.options).toContain("AI Tokens");
  });
});

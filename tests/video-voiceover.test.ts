import { describe, expect, it } from "vitest";

import { buildVideoVoiceoverScript, generateHookText } from "../src/lib/social-content-generator";
import { getVideoFormat } from "../src/lib/video-formats";

describe("video voiceover script", () => {
  it("turns token data into natural narration without reading raw dashboard metrics", () => {
    const script = buildVideoVoiceoverScript(
      "Solana",
      "SOL",
      {
        priceChange24h: 6.42,
        marketCap: 89_000_000_000,
        volume24h: 3_890_000_000,
        marketCapRank: 5,
        riskScore: 4.8,
        growthPotentialIndex: 67,
        trendingContext: "Solana is currently trending on CoinGecko (rank #3 by search momentum).",
        selectionReason: "top-gainer",
      },
      getVideoFormat("volume_spike_check"),
    );

    expect(script).toContain("SOL moved +6.4%");
    expect(script).toContain("4.4% of market cap");
    expect(script).toContain("risk score is 4.8/10");
    expect(script).toMatch(/snapshot, not a forecast/i);
    expect(script).not.toMatch(/\b(buy|sell|hold|entry|target|100x|moon|guaranteed|strong buy|signal)\b/i);
    expect(script.split(/\s+/).length).toBeLessThanOrEqual(52);
  });

  it("builds TikTok-native narration without stretching into monetization filler", () => {
    const script = buildVideoVoiceoverScript(
      "Solana",
      "SOL",
      {
        priceChange24h: 6.42,
        marketCap: 89_000_000_000,
        marketCapRank: 5,
        volume24h: 4_200_000_000,
        riskScore: 4.8,
        growthPotentialIndex: 67,
        selectionReason: "top-gainer",
      },
      getVideoFormat("volume_spike_check"),
      { targetDurationSeconds: 42, style: "tiktok_native" },
    );

    const words = script.split(/\s+/).filter(Boolean);
    expect(words.length).toBeGreaterThan(15);
    expect(words.length).toBeLessThanOrEqual(45);
    expect(script).toContain("SOL moved +6.4%");
    expect(script).toContain("Reported volume was 4.7% of market cap");
    expect(script).toContain("risk score is 4.8/10");
    expect(script).toMatch(/turnover or risk/i);
    expect(script).not.toMatch(/\b(buy|sell|hold|entry|target|100x|moon|guaranteed|strong buy|signal)\b/i);
  });

  it("names the ticker and supplied move in the first-frame hook", async () => {
    const hook = await generateHookText("Solana", "sol", { priceChange24h: 6.42 });

    expect(hook).toBe("SOL +6.4%: WHAT'S THE CATCH?");
    expect(hook.length).toBeLessThanOrEqual(40);
  });
});

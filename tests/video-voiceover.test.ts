import { describe, expect, it } from "vitest";

import { buildVideoVoiceoverScript, generateHookText } from "../src/lib/social-content-generator";
import { validateSocialContent } from "../src/lib/social-content-validator";
import { buildEvidenceLedVideoHook, buildEvidenceLedVoiceover } from "../src/lib/video-evidence";
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
    expect(script).toContain("Reported daily volume was $3.89B");
    expect(script).toContain("Risk score: 4.8/10");
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
    expect(script).toContain("Reported daily volume was $4.20B");
    expect(script).toContain("Risk score: 4.8/10");
    expect(script).toMatch(/turnover or risk/i);
    expect(script).not.toMatch(/\b(buy|sell|hold|entry|target|100x|moon|guaranteed|strong buy|signal)\b/i);
  });

  it("names the ticker and supplied move in the first-frame hook", async () => {
    const hook = await generateHookText("Solana", "sol", { priceChange24h: 6.42 });

    expect(hook).toBe("SOL +6.4%: WHAT'S THE CATCH?");
    expect(hook.length).toBeLessThanOrEqual(40);
  });

  it.each([
    { priceChange24h: 0.51164, volume24h: 28_100_442_440, marketCap: 1_579_215_351_390 },
    { priceChange24h: 0.50216, volume24h: 27_695_723_213, marketCap: 1_581_914_401_762 },
  ])("keeps deterministic Bitcoin fallbacks grounded for %#", (facts) => {
    const input = {
      tokenName: "Bitcoin",
      symbol: "BTC",
      ...facts,
      riskScore: 4,
    };
    const context = {
      tokenName: input.tokenName,
      symbol: input.symbol,
      priceChange24h: input.priceChange24h,
      volume24h: input.volume24h,
      marketCap: input.marketCap,
      riskScore: input.riskScore,
    };

    const hook = buildEvidenceLedVideoHook(input);
    const voiceover = buildEvidenceLedVoiceover(input, "youtube");

    expect(validateSocialContent(hook, context)).toEqual({ ok: true, issues: [] });
    expect(validateSocialContent(voiceover, context)).toEqual({ ok: true, issues: [] });
  });
});

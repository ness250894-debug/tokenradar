import { describe, expect, it } from "vitest";

import { buildVideoVoiceoverScript } from "../src/lib/social-content-generator";
import { getVideoFormat } from "../src/lib/video-formats";

describe("video voiceover script", () => {
  it("turns token data into natural narration without reading raw dashboard metrics", () => {
    const script = buildVideoVoiceoverScript(
      "Solana",
      "SOL",
      {
        priceChange24h: 6.42,
        marketCap: 89_000_000_000,
        marketCapRank: 5,
        riskScore: 4.8,
        growthPotentialIndex: 67,
        trendingContext: "Solana is currently trending on CoinGecko (rank #3 by search momentum).",
        selectionReason: "top-gainer",
      },
      getVideoFormat("volume_spike_check"),
    );

    expect(script).toContain("Solana");
    expect(script).toMatch(/attention|story|confirmation/i);
    expect(script).not.toMatch(/\$\d/);
    expect(script).not.toMatch(/\b\d+(\.\d+)?\/10\b/);
    expect(script).not.toMatch(/\bvolume:\s*\$/i);
    expect(script).not.toMatch(/\b(buy|sell|hold|entry|target|100x|moon|guaranteed|strong buy|signal)\b/i);
    expect(script.split(/\s+/).length).toBeLessThanOrEqual(72);
  });
});

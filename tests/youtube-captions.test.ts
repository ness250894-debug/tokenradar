import { describe, expect, it } from "vitest";

import { buildWebVttCaptionTrack, buildYouTubeShortsMetadata } from "../src/lib/youtube";

describe("YouTube caption tracks", () => {
  it("turns narration into timed, readable WebVTT cues", () => {
    const track = buildWebVttCaptionTrack(
      "Alpha beta gamma delta epsilon zeta eta theta iota kappa.",
      10,
    );

    expect(track).toMatch(/^WEBVTT/);
    expect(track).toContain("00:00:00.000 --> 00:00:07.000");
    expect(track).toContain("Alpha beta gamma delta epsilon zeta eta");
    expect(track).toContain("00:00:07.000 --> 00:00:10.000");
    expect(track).toContain("theta iota kappa.");
  });

  it("removes markup and prevents cue injection", () => {
    const track = buildWebVttCaptionTrack("<b>Risk</b> --> context", 4);

    expect(track).toContain("Risk → context");
    expect(track).not.toContain("<b>");
    expect((track.match(/-->/g) || [])).toHaveLength(1);
  });

  it("carries rounded milliseconds into the next second", () => {
    const track = buildWebVttCaptionTrack("one two three four five six seven eight nine ten eleven twelve thirteen fourteen", 1.9998);

    expect(track).toContain("00:00:01.000 --> 00:00:02.000");
    expect(track).not.toMatch(/\.1000\b/);
  });

  it("builds grounded, searchable Shorts packaging with source and direct research link", () => {
    const metadata = buildYouTubeShortsMetadata({
      tokenName: "Solana",
      symbol: "sol",
      priceChange24h: 6.42,
      volume24h: 3_890_000_000,
      marketCap: 89_000_000_000,
      riskScore: 4.8,
      marketDataSource: "coingecko",
      marketDataAsOf: "2026-08-24T18:00:00.000Z",
      researchUrl: "https://tokenradar.co/solana?utm_source=youtube",
      formatLabel: "Volume and Market-Cap Snapshot",
      generatedTitle: "A generic market update",
    });

    expect(metadata.title).toBe("Solana (SOL) +6.4%: Risk Check");
    expect(metadata.title.length).toBeLessThanOrEqual(60);
    expect(metadata.description).toContain("reported turnover 4.4% of market cap");
    expect(metadata.description).toContain("Source: CoinGecko · Data as of 24 Aug 2026 18:00 UTC");
    expect(metadata.description).toContain("Research: https://tokenradar.co/solana?utm_source=youtube");
    expect(metadata.description).toContain("#Shorts #Crypto #SOL");
    expect(metadata.tags).toContain("SOL crypto");
    expect(metadata.categoryId).toBe("28");
  });
});

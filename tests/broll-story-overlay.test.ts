import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("remotion", async () => {
  const ReactModule = await import("react");

  return {
    AbsoluteFill: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement("div", null, children),
    AnimatedImage: () => ReactModule.createElement("div"),
    Audio: () => ReactModule.createElement("audio"),
    Html5Video: () => ReactModule.createElement("video"),
    Img: () => ReactModule.createElement("img"),
    Sequence: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement("section", null, children),
    interpolate: () => 1,
    staticFile: (src: string) => src,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      durationInFrames: 540,
      fps: 30,
      width: 1080,
      height: 1920,
    }),
  };
});

import { BrollStoryOverlay } from "../src/video/components/BrollStoryOverlay";
import { TikTokNativeStory } from "../src/video/TikTokNativeStory";

describe("BrollStoryOverlay", () => {
  it("does not headline a near-zero move as +0.00% today", () => {
    const markup = renderToStaticMarkup(
      React.createElement(BrollStoryOverlay, {
        tokenName: "Little Pepe",
        symbol: "LILPEPE",
        price: 12.09,
        priceChange24h: 0.004,
        riskScore: 5,
        riskLevel: "medium",
        marketCap: 120_000_000,
        marketCapRank: 412,
        volume24h: 8_000_000,
        growthPotentialIndex: 52,
        hookText: "Little Pepe is back on the radar",
        videoFormatKey: "catalyst_explainer",
        videoThesis: "Little Pepe has a fresh article catalyst, but price action still needs confirmation.",
      }),
    );

    expect(markup).not.toContain("+0.00%");
    expect(markup.toLowerCase()).toContain("fresh article catalyst");
  });

  it("uses editorial story beats instead of raw dashboard rows on primary b-roll", () => {
    const markup = renderToStaticMarkup(
      React.createElement(BrollStoryOverlay, {
        tokenName: "Solana",
        symbol: "SOL",
        price: 184.22,
        priceChange24h: 6.42,
        riskScore: 4.8,
        riskLevel: "medium",
        marketCap: 89_000_000_000,
        marketCapRank: 5,
        volume24h: 3_890_000_000,
        growthPotentialIndex: 67,
        hookText: "WHY SOL IS BACK",
        videoFormatKey: "volume_spike_check",
        videoThesis: "Solana is getting fresh ecosystem attention, but confirmation still matters more than the first move.",
      }),
    );

    expect(markup).not.toMatch(/Volume:/i);
    expect(markup).not.toMatch(/\bRisk\s+\d/i);
    expect(markup).not.toMatch(/\|\s*(MEDIUM|LOW|HIGH)?\s*Risk/i);
    expect(markup).toMatch(/attention|confirmation|story/i);
  });

  it("renders the TikTok path as an explicit data-check story instead of a metric dashboard", () => {
    const markup = renderToStaticMarkup(
      React.createElement(TikTokNativeStory, {
        tokenName: "Solana",
        symbol: "SOL",
        price: 184.22,
        priceChange24h: 6.42,
        riskScore: 4.8,
        riskLevel: "medium",
        marketCap: 89_000_000_000,
        marketCapRank: 5,
        volume24h: 3_890_000_000,
        growthPotentialIndex: 67,
        hookText: "THIS MOVE NEEDS PROOF",
        videoFormatKey: "volume_spike_check",
        videoThesis: "Solana is getting fresh ecosystem attention, but confirmation still matters more than the first move.",
      }),
    );

    expect(markup).toMatch(/TokenRadar data check/i);
    expect(markup).not.toMatch(/replying\s+to\s+comment|viewer\s+(?:comment|request)/i);
    expect(markup).toContain("SOL moved +6.4% / 24h");
    expect(markup).toContain("4.4% reported vol/cap");
    expect(markup).toMatch(/turnover or risk/i);
    expect(markup).not.toMatch(/@tokenradar|scroll stop|receipt/i);
    expect(markup).not.toMatch(/Growth Potential|Market Cap Rank|Volume:/i);
    expect(markup).not.toMatch(/Educational data only|risk check/i);
  });
});

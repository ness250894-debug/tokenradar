import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("remotion", async () => {
  const ReactModule = await import("react");

  return {
    AbsoluteFill: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement("div", null, children),
    Sequence: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement("section", null, children),
    interpolate: () => 1,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      durationInFrames: 900,
      fps: 30,
      width: 1080,
      height: 1920,
    }),
  };
});

import { BrollStoryOverlay } from "../src/video/components/BrollStoryOverlay";

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
    expect(markup.toLowerCase()).toContain("fresh catalyst");
  });
});

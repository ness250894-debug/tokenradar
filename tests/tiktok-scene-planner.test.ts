import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("remotion", async () => {
  const ReactModule = await import("react");

  return {
    AbsoluteFill: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement("div", null, children),
    Audio: () => ReactModule.createElement("audio"),
    Sequence: ({ children }: { children?: React.ReactNode }) =>
      ReactModule.createElement("section", null, children),
    interpolate: () => 1,
    staticFile: (src: string) => src,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({
      durationInFrames: 1260,
      fps: 30,
      width: 1080,
      height: 1920,
    }),
  };
});

import { buildTikTokInVideoScenePlan } from "../src/lib/tiktok-scene-planner";
import { TikTokNativeStory } from "../src/video/TikTokNativeStory";

const baseProps = {
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
  videoFormatKey: "volume_spike_check" as const,
  videoThesis:
    "Solana is getting fresh ecosystem attention, but confirmation still matters more than the first move.",
};

describe("TikTok InVideo-style scene planner", () => {
  it("builds a five-scene local video plan with unique visual briefs", () => {
    const plan = buildTikTokInVideoScenePlan({
      ...baseProps,
      contextText: "Solana is moving through a liquidity check.",
      durationSeconds: 42,
      seedParts: ["2026-05-23", "tiktok", "solana"],
    });

    expect(plan.style).toBe("invideo_local");
    expect(plan.totalDurationSeconds).toBe(42);
    expect(plan.scenes).toHaveLength(5);
    expect(plan.scenes.map((scene) => [scene.fromSeconds, scene.toSeconds])).toEqual([
      [0, 6],
      [6, 14],
      [14, 23],
      [23, 33],
      [33, 42],
    ]);
    expect(plan.scenes.map((scene) => scene.intent)).toEqual([
      "comment_reply",
      "pattern_interrupt",
      "proof_check",
      "breakpoint",
      "watch_next",
    ]);
    expect(new Set(plan.scenes.map((scene) => scene.visualQuery)).size).toBe(5);

    const planText = JSON.stringify(plan);
    expect(planText).toMatch(/viewer asked|two-check/i);
    expect(planText).not.toMatch(/\+\d+(?:\.\d+)?%|\$\d|Volume:/);
  });

  it("renders the TikTok story from the generated scene plan", () => {
    const tiktokScenePlan = buildTikTokInVideoScenePlan({
      ...baseProps,
      contextText: "Solana is moving through a liquidity check.",
      durationSeconds: 42,
      seedParts: ["2026-05-23", "tiktok", "solana"],
    });

    const markup = renderToStaticMarkup(
      React.createElement(TikTokNativeStory, {
        ...baseProps,
        tiktokScenePlan,
      }),
    );

    expect(markup).toContain(tiktokScenePlan.scenes[0].prompt);
    expect(markup).toContain(tiktokScenePlan.scenes[2].subtitle);
    expect(markup).toContain(tiktokScenePlan.scenes[4].subtitle);
    expect(markup).not.toMatch(/Growth Potential|Market Cap Rank|Volume:/i);
    expect(markup).not.toMatch(/\+\d+(?:\.\d+)?%|\$\d/);
  });
});

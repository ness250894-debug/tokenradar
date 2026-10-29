import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildVideoVoiceoverScript, generateHookText } from "../src/lib/social-content-generator";
import { validateSocialContent } from "../src/lib/social-content-validator";
import {
  buildEvidenceLedVideoHook,
  buildEvidenceLedVoiceover,
  formatVideoCompactCurrency,
  selectVideoDataTension,
} from "../src/lib/video-evidence";
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

  it("protects token tickers colliding with safety patterns in generateHookText (e.g. PUMP)", async () => {
    const hook = await generateHookText("Pump.fun", "PUMP", { priceChange24h: 15.5 });

    expect(hook).toBe("PUMP +15.5%: WHAT'S THE CATCH?");
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

  it.each([
    { value: 2_063_369, expected: "$2.06M" },
    { value: 1_376_653, expected: "$1.38M" },
    { value: 1_740.33, expected: "$1.74K" },
    { value: 1.4, expected: "$1.4" },
  ])("adds compact-currency precision when $value would round out of tolerance", ({ value, expected }) => {
    expect(formatVideoCompactCurrency(value)).toBe(expected);
  });

  it("ranks distinct data-tension angles and validates all derived narrative fields", () => {
    const turnoverTension = selectVideoDataTension({
      tokenName: "Pepe",
      symbol: "PEPE",
      priceChange24h: 11.4,
      volume24h: 1_250_000_000,
      marketCap: 4_500_000_000,
      riskScore: 5.2,
      allowDerivedContext: true,
    });
    expect(turnoverTension.kind).toBe("turnover_spike");
    expect(turnoverTension.verdictLabel).toBe("27.8% VOL / CAP");
    expect(turnoverTension.hookText.length).toBeLessThanOrEqual(40);

    const fdvTension = selectVideoDataTension({
      tokenName: "Arbitrum",
      symbol: "ARB",
      priceChange24h: 4.6,
      volume24h: 180_000_000,
      marketCap: 2_100_000_000,
      fdv: 6_300_000_000,
      riskScore: 4.4,
      allowDerivedContext: true,
    });
    expect(fdvTension.kind).toBe("fdv_overhang");
    expect(fdvTension.verdictLabel).toBe("33.3% FLOAT / FDV");

    const riskTension = selectVideoDataTension({
      tokenName: "Dogwifhat",
      symbol: "WIF",
      priceChange24h: 9.8,
      volume24h: 190_000_000,
      marketCap: 1_900_000_000,
      riskScore: 7.4,
      allowDerivedContext: true,
    });
    expect(riskTension.kind).toBe("move_vs_risk");
    expect(riskTension.hookText).toBe("WIF +9.8%: RISK 7.4/10?");
    expect(riskTension.verdictLabel).toBe("RISK 7.4/10");
  });

  it("keeps deterministic fallbacks grounded across the tracked token corpus", () => {
    const tokens = JSON.parse(
      readFileSync(path.join(process.cwd(), "data", "tokens.json"), "utf8"),
    ) as Array<{
      id: string;
      name: string;
      symbol: string;
      market?: {
        priceChange24h?: number;
        volume24h?: number;
        marketCap?: number;
      };
    }>;
    const failures: Array<{ id: string; output: "hook" | "voiceover"; issues: unknown[] }> = [];

    for (const token of tokens) {
      const input = {
        tokenName: token.name,
        symbol: token.symbol,
        priceChange24h: token.market?.priceChange24h,
        volume24h: token.market?.volume24h,
        marketCap: token.market?.marketCap,
      };
      const context = { ...input };
      const outputs = {
        hook: buildEvidenceLedVideoHook(input),
        voiceover: buildEvidenceLedVoiceover(input, "youtube"),
      };

      for (const [output, content] of Object.entries(outputs) as Array<
        ["hook" | "voiceover", string]
      >) {
        const result = validateSocialContent(content, context);
        if (!result.ok) failures.push({ id: token.id, output, issues: result.issues });
      }
    }

    expect(failures).toEqual([]);
  });

  it("keeps data-tension hooks, theses, and voiceovers grounded across detailed token files", { timeout: 30000 }, () => {

    const tokensDir = path.join(process.cwd(), "data", "tokens");
    const files = readdirSync(tokensDir).filter((file) => file.endsWith(".json"));
    const failures: Array<{ id: string; output: string; issues: unknown[] }> = [];

    for (const file of files) {
      const token = JSON.parse(readFileSync(path.join(tokensDir, file), "utf8")) as {
        id: string;
        name: string;
        symbol: string;
        market?: {
          price?: number;
          priceChange24h?: number;
          volume24h?: number;
          marketCap?: number;
          marketCapRank?: number;
          fdv?: number | null;
          athChangePercentage?: number | null;
        };
      };
      const input = {
        tokenName: token.name,
        symbol: token.symbol,
        price: token.market?.price,
        priceChange24h: token.market?.priceChange24h,
        volume24h: token.market?.volume24h,
        marketCap: token.market?.marketCap,
        marketCapRank: token.market?.marketCapRank,
        riskScore: 6.8,
        fdv: token.market?.fdv ?? undefined,
        athChangePercentage: token.market?.athChangePercentage ?? undefined,
        formatKey: "contrarian_signal",
        allowDerivedContext: true,
      };
      const tension = selectVideoDataTension(input);
      const facts = {
        tokenName: token.name,
        symbol: token.symbol,
        price: token.market?.price,
        priceChange24h: token.market?.priceChange24h,
        volume24h: token.market?.volume24h,
        marketCap: token.market?.marketCap,
        marketCapRank: token.market?.marketCapRank,
        riskScore: 6.8,
        suppliedContext: tension.suppliedContextLines,
      };
      const outputs = {
        hook: buildEvidenceLedVideoHook(input),
        thesis: tension.thesis,
        voiceover: buildEvidenceLedVoiceover(input, "youtube"),
      };

      for (const [output, content] of Object.entries(outputs)) {
        const result = validateSocialContent(content, facts);
        if (!result.ok) {
          failures.push({ id: token.id, output, issues: result.issues });
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

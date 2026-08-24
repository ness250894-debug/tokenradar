import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { buildMarketSocialPlan } from "../scripts/lib/market-social-plan";
import {
  requireLegacyMarketExternalId,
  selectLegacyMarketEvidence,
} from "../scripts/post-market-updates";
import { resolveComparisonPlatforms, resolveStoredPair } from "../scripts/post-token-comparison";
import type { SocialPostEvidence } from "../src/lib/ops-ledger";
import {
  buildComparisonCaptions,
  buildComparisonVisualVerdict,
  findSharedComparisonCategory,
  selectTokenComparisonPair,
  type TokenComparisonPair,
  type TokenComparisonToken,
} from "../src/lib/token-comparison";

function makeDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-market-plan-"));
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function legacyMarketEvidence(
  contentKey: string,
  details?: Record<string, unknown>,
  externalId: string | undefined = "public-id",
): SocialPostEvidence {
  return {
    platform: "x",
    contentKey,
    externalId,
    postedAt: "2026-08-23T12:00:00.000Z",
    details,
  };
}

function comparisonToken(
  overrides: Partial<TokenComparisonToken> & Pick<TokenComparisonToken, "id" | "symbol" | "name">,
): TokenComparisonToken {
  const { id, symbol, name, ...rest } = overrides;
  return {
    id,
    symbol,
    name,
    categories: ["Layer 1 (L1)"],
    price: 10,
    change24h: 2,
    change7d: 5,
    marketCap: 1_000_000_000,
    volume24h: 100_000_000,
    rank: 30,
    marketDataSource: "coingecko-live",
    marketDataAsOf: "2026-08-23T12:23:00.000Z",
    metrics: {
      riskScore: 5,
      growthPotentialIndex: 60,
      marketDataAsOf: "2026-08-23T10:00:00.000Z",
      inputDataAsOf: "2026-08-23T10:00:00.000Z",
      computedAt: "2026-08-23T12:00:00.000Z",
    },
    ...rest,
  };
}

describe("market social plan", () => {
  it("selects an archetype and variant that respect recent history", () => {
    const dataDir = makeDataDir();
    writeJson(path.join(dataDir, "posted", "2026-06-04", "bitcoin-x.json"), {
      platform: "x",
      variantSurface: "market-update",
      variantKey: "risk_filter",
      archetypeKey: "risk_lab",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
    });

    const plan = buildMarketSocialPlan({
      dataDir,
      platform: "x",
      today: "2026-06-05",
      tokenId: "ethereum",
      reason: "top-gainer",
      date: new Date("2026-06-05T12:00:00.000Z"),
    });

    expect(plan.surface).toBe("market-update");
    expect(plan.variant.key).not.toBe("risk_filter");
    expect(plan.archetype.key).not.toBe("risk_lab");
    expect(plan.archetype.key).not.toBe("two_token_comparison");
    expect(plan.archetype.key).not.toBe("watchlist_shortlist");
    expect(plan.archetype.key).not.toBe("poll_result_recap");
    expect(plan.archetype.key).not.toBe("weekly_scoreboard");
    expect(plan.hookFamily).toBe(plan.archetype.hookFamily);
    expect(plan.ctaFamily).toBe(plan.archetype.ctaFamily);
  });
});

describe("token comparison social plan", () => {
  it("prefers a useful same-category matchup with comparable market caps and contrasting data", () => {
    const alpha = comparisonToken({
      id: "alpha",
      symbol: "alp",
      name: "Alpha",
      change24h: 18,
      change7d: 24,
      metrics: { riskScore: 8, growthPotentialIndex: 82 },
    });
    const beta = comparisonToken({
      id: "beta",
      symbol: "bet",
      name: "Beta",
      change24h: -11,
      change7d: -18,
      marketCap: 1_200_000_000,
      metrics: { riskScore: 3, growthPotentialIndex: 38 },
    });
    const unrelated = comparisonToken({
      id: "unrelated",
      symbol: "unr",
      name: "Unrelated",
      categories: ["Gaming (GameFi)"],
      change24h: 2.5,
      marketCap: 1_100_000_000,
    });

    const pair = selectTokenComparisonPair([alpha, beta, unrelated], { dateKey: "2026-08-06" });

    expect(new Set([pair.left.id, pair.right.id])).toEqual(new Set(["alpha", "beta"]));
    expect(pair.context).toBe("Layer 1 (L1)");
  });

  it("respects cooldowns and ignores broad ecosystem labels", () => {
    const old = comparisonToken({
      id: "old",
      symbol: "old",
      name: "Old",
      categories: ["Ethereum Ecosystem"],
    });
    const freshA = comparisonToken({ id: "fresh-a", symbol: "fra", name: "Fresh A", change24h: 9 });
    const freshB = comparisonToken({ id: "fresh-b", symbol: "frb", name: "Fresh B", change24h: -7 });

    const pair = selectTokenComparisonPair([old, freshA, freshB], {
      recentlyPosted: ["old"],
      dateKey: "2026-08-06",
    });

    expect(new Set([pair.left.id, pair.right.id])).toEqual(new Set(["fresh-a", "fresh-b"]));
    expect(findSharedComparisonCategory(
      old,
      comparisonToken({
        id: "other",
        symbol: "oth",
        name: "Other",
        categories: ["Ethereum Ecosystem"],
      }),
    )).toBeNull();
  });

  it("excludes dynamically detected stablecoins from ordinary comparisons", () => {
    const usdgo = comparisonToken({
      id: "usdgo",
      symbol: "USDGO",
      name: "USDGO",
      categories: ["Payment Solutions"],
      price: 1,
      change24h: 0,
      change7d: 0,
      marketCap: 1_100_000_000,
    });
    const dash = comparisonToken({
      id: "dash",
      symbol: "DASH",
      name: "Dash",
      categories: ["Payment Solutions"],
      change24h: 7,
      marketCap: 1_000_000_000,
    });
    const alpha = comparisonToken({
      id: "alpha",
      symbol: "ALP",
      name: "Alpha",
      categories: ["Layer 1 (L1)"],
      change24h: 5,
      marketCap: 900_000_000,
    });
    const beta = comparisonToken({
      id: "beta",
      symbol: "BET",
      name: "Beta",
      categories: ["Layer 1 (L1)"],
      change24h: -4,
      marketCap: 1_000_000_000,
    });

    const pair = selectTokenComparisonPair([usdgo, dash, alpha, beta], { dateKey: "2026-08-23" });

    expect([pair.left.id, pair.right.id]).not.toContain("usdgo");
  });

  it("builds platform-native comparison copy and resolves CLI routes", () => {
    const pair: TokenComparisonPair = {
      left: comparisonToken({ id: "alpha", symbol: "alp", name: "Alpha", change24h: 8.2 }),
      right: comparisonToken({ id: "beta", symbol: "bet", name: "Beta", change24h: -3.1 }),
      context: "Layer 1 (L1)",
    };
    const captions = buildComparisonCaptions(pair);

    expect(captions.telegram).toContain("ALP vs BET");
    expect(captions.x.length).toBeLessThanOrEqual(280);
    expect(captions.instagram.length).toBeLessThanOrEqual(2200);
    expect(captions.threads.length).toBeLessThanOrEqual(500);
    expect(captions.x).toContain("supplied Risk");
    expect(captions.x).not.toContain("#");
    expect(captions.x).toContain("CoinGecko 12:23 UTC");
    expect(captions.telegram).toContain("Risk/Growth metrics as of 2026-08-23");
    expect(captions.threads).toContain("Volume/cap:");
    expect(resolveComparisonPlatforms("telegram")).toEqual(["telegram"]);
    expect(resolveComparisonPlatforms("meta")).toEqual(["instagram", "threads"]);
    expect(resolveComparisonPlatforms("all")).toEqual(["telegram", "x", "instagram", "threads"]);
    expect(() => resolveComparisonPlatforms("youtube")).toThrow("Invalid --platform");
  });

  it("keeps visual tie verdicts honest and preserves the full X attribution line", () => {
    const tiePair: TokenComparisonPair = {
      left: comparisonToken({ id: "alpha", symbol: "fartcoin", name: "Fartcoin", change7d: 5 }),
      right: comparisonToken({ id: "beta", symbol: "virtual", name: "Virtuals Protocol", change7d: 5 }),
      context: "Artificial Intelligence Applications and Decentralized Compute Infrastructure",
    };

    expect(buildComparisonVisualVerdict(tiePair)).toBe(
      "7D change is effectively tied · supplied Risk is tied at 5/10",
    );
    const xCaption = buildComparisonCaptions(tiePair).x;
    expect(xCaption.length).toBeLessThanOrEqual(280);
    expect(xCaption).toMatch(/Data: CoinGecko 12:23 UTC · Metrics 2026-08-23 oldest inputs$/);
    expect(xCaption).not.toMatch(/\.\.\.$/);
  });

  it("does not declare a 7D leader when either refreshed value is unavailable", () => {
    const unavailablePair: TokenComparisonPair = {
      left: comparisonToken({ id: "alpha", symbol: "alp", name: "Alpha", change7d: null }),
      right: comparisonToken({ id: "beta", symbol: "bet", name: "Beta", change7d: 5 }),
      context: "Layer 1 (L1)",
    };

    expect(buildComparisonVisualVerdict(unavailablePair)).toBe(
      "7D data unavailable for one or both tokens · supplied Risk is tied at 5/10",
    );
    for (const caption of Object.values(buildComparisonCaptions(unavailablePair))) {
      expect(caption).toContain("7D data unavailable for one or both tokens");
      expect(caption).not.toMatch(/(?:ALP|BET) leads 7D change/i);
    }
  });

  it("rejects stored comparison pairs that no longer pass refreshed guardrails", () => {
    const dataDir = makeDataDir();
    const trackerFile = path.join(dataDir, "pair.json");
    writeJson(trackerFile, { tokenIds: ["alpha", "beta"], context: "Stale context" });

    const alphaWithoutSevenDay = comparisonToken({ id: "alpha", symbol: "alp", name: "Alpha", change7d: null });
    const regularBeta = comparisonToken({ id: "beta", symbol: "bet", name: "Beta" });
    expect(resolveStoredPair(trackerFile, [alphaWithoutSevenDay, regularBeta])).toBeNull();

    const validAlpha = comparisonToken({ id: "alpha", symbol: "alp", name: "Alpha" });
    const validBeta = comparisonToken({ id: "beta", symbol: "bet", name: "Beta" });
    const incomparableBeta = comparisonToken({
      id: "beta",
      symbol: "bet",
      name: "Beta",
      marketCap: 10_000_000_000,
    });
    expect(resolveStoredPair(trackerFile, [validAlpha, incomparableBeta])).toBeNull();
    expect(resolveStoredPair(trackerFile, [validAlpha, validBeta])).toMatchObject({
      left: { id: "alpha" },
      right: { id: "beta" },
      context: "Layer 1 (L1)",
    });
  });

  it("labels mixed market-data sources instead of claiming CoinGecko-only data", () => {
    const pair: TokenComparisonPair = {
      left: comparisonToken({ id: "alpha", symbol: "alp", name: "Alpha" }),
      right: comparisonToken({
        id: "beta",
        symbol: "bet",
        name: "Beta",
        marketDataSource: "local-cache",
      }),
      context: "Layer 1 (L1)",
    };

    const captions = buildComparisonCaptions(pair);

    expect(captions.telegram).toContain("mixed-source market data snapshot");
    expect(captions.x).not.toContain("Data: CoinGecko");
  });

  it("selects exact legacy X slot evidence instead of the first row", () => {
    const selected = selectLegacyMarketEvidence("x", [
      legacyMarketEvidence("other", { socialSlot: "x-token-comparison" }, "other-id"),
      legacyMarketEvidence("exact", { socialSlot: "x-market-update" }, "exact-id"),
    ], "x-market-update", "market-brief");

    expect(selected?.contentKey).toBe("exact");
    expect(selected?.externalId).toBe("exact-id");
  });

  it("ignores legacy X evidence explicitly assigned to another slot", () => {
    expect(selectLegacyMarketEvidence("x", [
      legacyMarketEvidence("other", { socialSlot: "x-token-comparison" }),
    ], "x-market-update", "market-brief")).toBeNull();
  });

  it("accepts one unlabeled legacy X row but rejects ambiguous unlabeled rows", () => {
    const single = legacyMarketEvidence("single", undefined, "single-id");
    expect(selectLegacyMarketEvidence(
      "x",
      [single],
      "x-market-update",
      "market-brief",
    )).toBe(single);

    expect(() => selectLegacyMarketEvidence("x", [
      single,
      legacyMarketEvidence("second", undefined, "second-id"),
    ], "x-market-update", "market-brief")).toThrow("ambiguous");
  });

  it("trims legacy public IDs and rejects whitespace-only evidence", () => {
    expect(requireLegacyMarketExternalId(
      "x",
      legacyMarketEvidence("trimmed", undefined, "  public-123  "),
    )).toBe("public-123");
    expect(() => requireLegacyMarketExternalId(
      "x",
      legacyMarketEvidence("blank", undefined, "   "),
    )).toThrow("has no external ID");
  });
});

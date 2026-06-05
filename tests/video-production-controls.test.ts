import { describe, expect, it } from "vitest";

import {
  buildGeneratedFallbackAssetId,
  buildVideoIdempotencyKey,
  buildVideoProductionAlert,
  classifyVideoPublishError,
  filterVideoCandidatesByFreshness,
  formatVideoMarketFreshnessIssueCounts,
  reconcilePlatformPublishState,
  shouldRefreshDerivedMetricsForVideo,
  validatePlatformCopyPackage,
  validateVideoMarketDataFreshness,
} from "../src/lib/video-production-controls";

const now = new Date("2026-05-18T18:00:00.000Z");

describe("video production market-data controls", () => {
  it("accepts fresh token and metric data with an as-of timestamp", () => {
    const result = validateVideoMarketDataFreshness({
      token: {
        id: "solana",
        market: {
          price: 170,
          priceChange24h: 2.4,
          marketCap: 80_000_000_000,
          volume24h: 4_000_000_000,
        },
        lastMarketUpdate: "2026-05-18T16:45:00.000Z",
      },
      metric: {
        computedAt: "2026-05-18T04:00:00.000Z",
      },
      now,
    });

    expect(result.ok).toBe(true);
    expect(result.asOf).toBe("2026-05-18T16:45:00.000Z");
    expect(result.issues).toEqual([]);
  });

  it("rejects stale or inconsistent market data before video copy can be generated", () => {
    const result = validateVideoMarketDataFreshness({
      token: {
        id: "stale-token",
        market: {
          price: 1,
          priceChange24h: Number.NaN,
          marketCap: 10_000_000,
          volume24h: 0,
        },
        fetchedAt: "2026-05-18T10:00:00.000Z",
      },
      metric: {
        computedAt: "2026-05-16T00:00:00.000Z",
      },
      now,
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual([
      "invalid-market-value",
      "stale-market-data",
      "stale-derived-metrics",
    ]);
  });

  it("filters candidates to the tokens safe for automated video publication", () => {
    const candidates = [
      {
        id: "fresh",
        market: { price: 1, priceChange24h: 1, marketCap: 1_000_000, volume24h: 100_000 },
        lastMarketUpdate: "2026-05-18T17:30:00.000Z",
      },
      {
        id: "stale",
        market: { price: 1, priceChange24h: 1, marketCap: 1_000_000, volume24h: 100_000 },
        lastMarketUpdate: "2026-05-18T12:00:00.000Z",
      },
    ];

    expect(filterVideoCandidatesByFreshness(candidates, { now }).map((token) => token.id)).toEqual(["fresh"]);
  });

  it("allows one metrics refresh only when stale derived metrics are the sole blocker", () => {
    expect(shouldRefreshDerivedMetricsForVideo({ "stale-derived-metrics": 3 }, 3)).toBe(true);
    expect(shouldRefreshDerivedMetricsForVideo({ "stale-derived-metrics": 2 }, 3)).toBe(false);
    expect(shouldRefreshDerivedMetricsForVideo({ "stale-derived-metrics": 3, "stale-market-data": 1 }, 3)).toBe(false);
    expect(formatVideoMarketFreshnessIssueCounts({ "stale-derived-metrics": 3 })).toBe("stale-derived-metrics=3");
  });
});

describe("video production platform controls", () => {
  it("validates platform copy, privacy, and disclaimers before publishing", () => {
    expect(
      validatePlatformCopyPackage({
        platform: "youtube",
        title: "A".repeat(61),
        description: "Shorts description without the required disclaimer.",
      }),
    ).toEqual({
      ok: false,
      issues: ["youtube-title-too-long", "missing-risk-disclaimer"],
    });

    expect(
      validatePlatformCopyPackage({
        platform: "threads",
        caption: "What invalidates this setup first?",
        topicTag: "crypto.market",
      }).issues,
    ).toEqual(["threads-topic-invalid"]);

    expect(
      validatePlatformCopyPackage({
        platform: "tiktok",
        caption: "TokenRadar market update\nNot financial advice.\n#Crypto #TokenRadar",
        privacyLevel: "PUBLIC_TO_EVERYONE",
      }).ok,
    ).toBe(true);
  });

  it("classifies publish failures without leaking secrets into diagnostics", () => {
    expect(classifyVideoPublishError(new Error("429 quota exceeded; token sk-secret")).status).toBe(
      "skipped_by_platform_quota",
    );
    expect(classifyVideoPublishError(new Error("Missing YouTube credentials")).status).toBe(
      "skipped_by_missing_credentials",
    );
    expect(classifyVideoPublishError(new Error("processing_failed from media container")).diagnostic).not.toContain(
      "sk-secret",
    );
  });
});

describe("video production state controls", () => {
  it("builds stable idempotency keys and generated fallback asset ids", () => {
    expect(
      buildVideoIdempotencyKey({
        date: "2026-05-18",
        format: "shorts",
        tokenId: "solana",
        platform: "tiktok",
      }),
    ).toBe("2026-05-18:shorts:solana:tiktok:normal");

    expect(
      buildGeneratedFallbackAssetId({
        date: "2026-05-18",
        platform: "youtube",
        tokenId: "solana",
        formatKey: "breakout_watch",
        recipeKey: "terminal_scan",
      }),
    ).toBe("generated-stage:2026-05-18:youtube:solana:breakout_watch:terminal_scan");
  });

  it("lets D1 terminal state and tracker evidence drive retry decisions", () => {
    expect(
      reconcilePlatformPublishState({
        platform: "youtube",
        d1HasPublishedState: true,
        tracker: null,
      }),
    ).toMatchObject({ shouldPublish: false, reason: "d1-terminal-state" });

    expect(
      reconcilePlatformPublishState({
        platform: "instagram",
        d1HasPublishedState: false,
        tracker: {
          status: "published",
          postId: "ig-1",
        },
      }),
    ).toMatchObject({ shouldPublish: false, reason: "tracker-terminal-with-evidence", shouldBackfillD1: true });

    expect(
      reconcilePlatformPublishState({
        platform: "threads",
        d1HasPublishedState: false,
        tracker: {
          status: "failed",
        },
      }),
    ).toMatchObject({ shouldPublish: true, reason: "tracker-non-terminal" });
  });

  it("builds severity-tagged alerts with runbook actions", () => {
    const alert = buildVideoProductionAlert({
      failureClass: "marketDataStale",
      workflowRunId: "12345",
      videoDate: "2026-05-18",
      format: "shorts",
      platform: "youtube",
    });

    expect(alert.severity).toBe("high");
    expect(alert.nextRunbookAction).toContain("metrics job");
    expect(alert.message).toContain("marketDataStale");
  });
});

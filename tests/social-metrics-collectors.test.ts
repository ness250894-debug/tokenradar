import { describe, expect, it, vi } from "vitest";

import { collectNativeSocialMetrics } from "../src/lib/social-metrics-collectors";

const target = {
  platform: "x",
  contentKey: "2026-08-20:market-update:bitcoin",
  externalId: "tweet-1",
  postedAt: "2026-08-20T03:17:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("native social metrics collectors", () => {
  it("maps X public metrics without inventing unavailable metrics", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      data: {
        public_metrics: {
          impression_count: 420,
          like_count: 8,
          reply_count: 2,
          retweet_count: 3,
          quote_count: 1,
        },
      },
    }));

    const result = await collectNativeSocialMetrics(target, {
      fetch: fetchMock as unknown as typeof fetch,
      env: { X_BEARER_TOKEN: "test-bearer" },
    });

    expect(result).toMatchObject({
      status: "collected",
      snapshot: {
        impressions: 420,
        likes: 8,
        replies: 2,
        reposts: 3,
        shares: 1,
      },
    });
    if (result.status === "collected") {
      expect(result.snapshot.linkClicks).toBeUndefined();
      expect(result.snapshot.unavailableMetrics).toContain("linkClicks");
    }
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer test-bearer" },
    });
  });

  it("collects YouTube public statistics with an API key", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      items: [{ statistics: { viewCount: "120", likeCount: "7", commentCount: "2" } }],
    }));

    const result = await collectNativeSocialMetrics({ ...target, platform: "youtube", externalId: "video-1" }, {
      fetch: fetchMock as unknown as typeof fetch,
      env: { YOUTUBE_API_KEY: "youtube-test-key" },
    });

    expect(result).toMatchObject({
      status: "collected",
      snapshot: { views: 120, likes: 7, comments: 2 },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("key=youtube-test-key");
  });

  it("explicitly skips Telegram instead of fabricating channel-post views", async () => {
    await expect(collectNativeSocialMetrics({ ...target, platform: "telegram" })).resolves.toEqual({
      status: "skipped",
      reason: "Telegram Bot API does not expose per-channel-post view metrics",
    });
  });
});

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

  it("collects the exact Telegram message view count from the public channel preview", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request) => new Response(`
      <div class="tgme_widget_message_wrap js-widget_message_wrap" data-post="Token_Radar_Official/407">
        <span class="tgme_widget_message_views">1.2K</span><span class="copyonly"> views</span>
      </div>
    `, { status: 200, headers: { "Content-Type": "text/html" } }));

    const result = await collectNativeSocialMetrics({ ...target, platform: "telegram", externalId: "407" }, {
      fetch: fetchMock as unknown as typeof fetch,
      env: { TELEGRAM_CHANNEL_USERNAME: "token_radar_official" },
    });

    expect(result).toMatchObject({
      status: "collected",
      snapshot: { views: 1200, source: "telegram-public-preview" },
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("t.me/s/token_radar_official/407");
  });

  it("routes Instagram Login metrics through graph.instagram.com", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      return url.endsWith("/insights?metric=views%2Creach%2Csaved%2Cshares%2Ctotal_interactions&access_token=ig-token")
        ? jsonResponse({ data: [{ name: "views", values: [{ value: 321 }] }] })
        : jsonResponse({ like_count: 9, comments_count: 2 });
    });

    const result = await collectNativeSocialMetrics(
      { ...target, platform: "instagram", externalId: "ig-media-1" },
      {
        fetch: fetchMock as unknown as typeof fetch,
        env: {
          IG_ACCESS_TOKEN: "ig-token",
          IG_AUTH_MODE: "instagram_login",
        },
      },
    );

    expect(result).toMatchObject({
      status: "collected",
      snapshot: { views: 321, likes: 9, comments: 2 },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [input] of fetchMock.mock.calls) {
      expect(String(input)).toMatch(/^https:\/\/graph\.instagram\.com\/v25\.0\/ig-media-1/);
    }
  });

  it("collects TikTok Display API counts when video.list credentials are available", async () => {
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse({
      data: {
        videos: [{ id: "video-1", view_count: 900, like_count: 12, comment_count: 3, share_count: 4 }],
      },
      error: { code: "ok", message: "" },
    }));

    const result = await collectNativeSocialMetrics({ ...target, platform: "tiktok", externalId: "video-1" }, {
      fetch: fetchMock as unknown as typeof fetch,
      env: { TIKTOK_ACCESS_TOKEN: "tiktok-test-token" },
    });

    expect(result).toMatchObject({
      status: "collected",
      snapshot: { views: 900, likes: 12, comments: 3, shares: 4 },
    });
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer tiktok-test-token",
        "Content-Type": "application/json",
      },
    });
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain("video-1");
  });

  it("prefers one cached TikTok refresh over a stale access-token secret for a metric batch", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("/oauth/token/")) {
        return jsonResponse({ access_token: "fresh-batch-token", expires_in: 86_400 });
      }
      const requestedId = JSON.parse(String(init?.body)) as { filters: { video_ids: string[] } };
      return jsonResponse({
        data: {
          videos: requestedId.filters.video_ids.map((id) => ({
            id,
            view_count: 10,
            like_count: 1,
            comment_count: 0,
            share_count: 0,
          })),
        },
        error: { code: "ok", message: "" },
      });
    });
    const dependencies = {
      fetch: fetchMock as unknown as typeof fetch,
      env: {
        TIKTOK_ACCESS_TOKEN: "stale-token",
        TIKTOK_REFRESH_TOKEN: "refresh-token",
        TIKTOK_CLIENT_KEY: "client-key",
        TIKTOK_CLIENT_SECRET: "client-secret",
      },
      tiktokAccessTokenCache: new Map<string, Promise<string | null>>(),
    };

    await collectNativeSocialMetrics({ ...target, platform: "tiktok", externalId: "video-1" }, dependencies);
    await collectNativeSocialMetrics({ ...target, platform: "tiktok", externalId: "video-2" }, dependencies);

    const tokenCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/oauth/token/"));
    const queryCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/video/query/"));
    expect(tokenCalls).toHaveLength(1);
    expect(queryCalls).toHaveLength(2);
    for (const [, init] of queryCalls) {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer fresh-batch-token" });
    }
  });
});

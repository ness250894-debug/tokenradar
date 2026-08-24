import { beforeEach, describe, expect, it, vi } from "vitest";

const d1Mocks = vi.hoisted(() => ({
  executeD1Query: vi.fn(),
  hasD1Config: vi.fn(() => true),
}));

vi.mock("../src/lib/d1-client", () => d1Mocks);

import {
  buildSocialPerformanceReport,
  normalizePerformanceRows,
  readPerformanceRows,
  renderSocialPerformanceMarkdown,
  type D1PerformanceRow,
  type SocialPerformanceRow,
} from "../scripts/report-social-performance";

const row = (overrides: Partial<SocialPerformanceRow>): SocialPerformanceRow => ({
  platform: "x",
  contentKey: "post-1",
  externalId: "external-1",
  postedAt: "2026-08-15T00:00:00.000Z",
  postDetails: { archetypeKey: "risk_lab", variantSurface: "market-update" },
  metricDetails: { collector: "native-api" },
  metricSource: "native-api",
  measuredAt: "2026-08-22T00:00:00.000Z",
  horizonHours: 168,
  impressions: 1_000,
  likes: 10,
  replies: 2,
  reposts: 1,
  ...overrides,
});

const d1Row = (overrides: Partial<D1PerformanceRow>): D1PerformanceRow => ({
  platform: "x",
  content_key: "post-1",
  external_id: "external-1",
  posted_at: "2026-08-20T00:00:00.000Z",
  post_details_json: "{}",
  measured_at: "2026-08-21T00:00:00.000Z",
  window_hours: 24,
  impressions: 1_000,
  views: null,
  likes: 10,
  replies: 2,
  comments: null,
  reposts: 1,
  shares: null,
  saves: null,
  link_clicks: null,
  profile_clicks: null,
  watch_time_seconds: null,
  completion_rate: null,
  metric_details_json: "{}",
  web_sessions: null,
  web_engaged_sessions: null,
  web_attribution_exported_at: null,
  ...overrides,
});

describe("weekly social performance report", () => {
  beforeEach(() => {
    d1Mocks.executeD1Query.mockReset();
    d1Mocks.executeD1Query.mockResolvedValue([{ success: true, results: [] }]);
  });

  it("normalizes engagement within platform, archetype, and surface", () => {
    const report = buildSocialPerformanceReport([
      row({}),
      row({ contentKey: "post-2", impressions: 500, likes: 2, replies: 0 }),
      row({
        platform: "youtube",
        contentKey: "video-1",
        impressions: undefined,
        views: 200,
        likes: 8,
        comments: 2,
        postDetails: { archetypeKey: "how_to_read_metric", variantSurface: "video" },
      }),
    ], { generatedAt: "2026-08-23T00:00:00.000Z", lookbackDays: 35 });

    expect(report.postsMeasured).toBe(3);
    expect(report.platformSummary.find((group) => group.key === "x")).toMatchObject({
      posts: 2,
      interactionPosts: 2,
      rateEligiblePosts: 2,
      exposure: 1_500,
      interactions: 16,
    });
    expect(report.archetypeSummary.map((group) => group.key)).toContain("youtube / how_to_read_metric");
    expect(renderSocialPerformanceMarkdown(report)).toContain("Interactions/1k");
  });

  it("renders unavailable click metrics as N/A instead of zero performance", () => {
    const report = buildSocialPerformanceReport([row({ linkClicks: undefined, profileClicks: undefined })], {
      generatedAt: "2026-08-23T00:00:00.000Z",
      lookbackDays: 35,
    });

    expect(report.platformSummary[0].clickThroughRate).toBeUndefined();
    expect(renderSocialPerformanceMarkdown(report)).toContain("| N/A | N/A |");
  });

  it("keeps Telegram view-only samples out of interaction rankings and shows actual sample age", () => {
    const report = buildSocialPerformanceReport([row({
      platform: "telegram",
      contentKey: "telegram-post-1",
      impressions: undefined,
      views: 1_200,
      likes: undefined,
      replies: undefined,
      comments: undefined,
      reposts: undefined,
      shares: undefined,
      saves: undefined,
      actualAgeHours: 31.4,
      postDetails: { archetypeKey: "market_brief", variantSurface: "market-update" },
    })], {
      generatedAt: "2026-08-23T00:00:00.000Z",
      lookbackDays: 35,
    });

    expect(report.platformSummary[0]).toMatchObject({
      posts: 1,
      interactionPosts: 0,
      exposure: 1_200,
      interactions: undefined,
      engagementPerThousand: undefined,
      averageActualAgeHours: 31.4,
    });
    expect(report.topPosts).toEqual([]);
    expect(report.recommendations).toContainEqual(expect.stringContaining("interaction metrics are unavailable"));
    expect(report.recommendations.join(" ")).not.toMatch(/rewrite or pause/i);
    const markdown = renderSocialPerformanceMarkdown(report);
    expect(markdown).toContain("| N/A | +31.4h |");
  });

  it("distinguishes measured interactions with no exposure denominator", () => {
    const report = buildSocialPerformanceReport([row({
      impressions: undefined,
      views: undefined,
      reach: undefined,
    })], {
      generatedAt: "2026-08-23T00:00:00.000Z",
      lookbackDays: 35,
    });

    expect(report.archetypeSummary[0]).toMatchObject({
      interactionPosts: 1,
      rateEligiblePosts: 0,
      exposure: 0,
      interactions: undefined,
      engagementPerThousand: undefined,
    });
    expect(report.recommendations).toContainEqual(
      expect.stringContaining("exposure is unavailable or zero"),
    );
    expect(report.recommendations.join(" ")).not.toContain("interaction metrics are unavailable");
  });

  it("excludes no-exposure interactions from the normalized engagement numerator and sample", () => {
    const report = buildSocialPerformanceReport([
      row({
        contentKey: "with-exposure",
        impressions: 100,
        likes: 10,
        replies: 0,
        reposts: 0,
      }),
      row({
        contentKey: "without-exposure",
        impressions: undefined,
        views: undefined,
        reach: undefined,
        likes: 90,
        replies: 0,
        reposts: 0,
      }),
    ], {
      generatedAt: "2026-08-23T00:00:00.000Z",
      lookbackDays: 35,
    });

    expect(report.platformSummary[0]).toMatchObject({
      posts: 2,
      interactionPosts: 2,
      rateEligiblePosts: 1,
      exposure: 100,
      interactions: 10,
      engagementPerThousand: 100,
    });
    expect(report.recommendations).toContainEqual(
      expect.stringContaining("1/5 rate-eligible posts; 2 interaction-measured"),
    );
    expect(renderSocialPerformanceMarkdown(report)).toContain("2 (2 / 1)");
  });

  it("reports persisted GA4 sessions separately from native link clicks", () => {
    const report = buildSocialPerformanceReport([row({
      linkClicks: undefined,
      webSessions: 7,
      webEngagedSessions: 5,
      webAttributionExportedAt: "2026-08-22T12:00:00.000Z",
    })], {
      generatedAt: "2026-08-23T00:00:00.000Z",
      lookbackDays: 35,
    });

    expect(report.platformSummary[0]).toMatchObject({
      webSessions: 7,
      webEngagedSessions: 5,
      linkClicks: undefined,
    });
    expect(renderSocialPerformanceMarkdown(report)).toContain("7 / 5");
  });

  it("excludes stale GA4 attribution totals and labels their age in the report", () => {
    const [normalized] = normalizePerformanceRows([
      d1Row({
        web_sessions: 9,
        web_engaged_sessions: 4,
        web_attribution_exported_at: "2026-08-18T00:00:00.000Z",
      }),
    ], 24, { nowMs: Date.parse("2026-08-23T12:00:00.000Z") });

    expect(normalized.webSessions).toBeUndefined();
    expect(normalized.webEngagedSessions).toBeUndefined();
    expect(normalized.webAttributionStale).toBe(true);

    const report = buildSocialPerformanceReport([normalized], {
      generatedAt: "2026-08-23T12:00:00.000Z",
      lookbackDays: 35,
    });
    const markdown = renderSocialPerformanceMarkdown(report);

    expect(report.webAttribution.staleRows).toBe(1);
    expect(report.platformSummary[0].webSessions).toBeUndefined();
    expect(markdown).toContain("1 stale matched rows excluded");
    expect(markdown).not.toContain("9 / 4");
  });

  it("queries only the requested measurement horizon", async () => {
    await expect(readPerformanceRows(35, 168)).resolves.toEqual([]);

    expect(d1Mocks.executeD1Query).toHaveBeenCalledTimes(1);
    expect(d1Mocks.executeD1Query.mock.calls[0]?.[0]).toContain("m.window_hours = ?");
    expect(d1Mocks.executeD1Query.mock.calls[0]?.[0]).not.toContain("m.window_hours IN");
    expect(d1Mocks.executeD1Query.mock.calls[0]?.[1]).toEqual([
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      168,
    ]);
  });
});

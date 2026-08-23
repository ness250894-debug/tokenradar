import { beforeEach, describe, expect, it, vi } from "vitest";

const d1Mocks = vi.hoisted(() => ({
  executeD1Query: vi.fn(),
  hasD1Config: vi.fn(() => true),
}));

vi.mock("../src/lib/d1-client", () => d1Mocks);

import { persistSocialAttributionMetrics } from "../scripts/export-engagement-baseline";

describe("social attribution persistence", () => {
  beforeEach(() => {
    d1Mocks.executeD1Query.mockReset();
    d1Mocks.hasD1Config.mockReturnValue(true);
  });

  it("aggregates a social creative and upserts its GA4 totals into D1", async () => {
    const payload = {
      exportedAt: "2026-08-23T12:00:00.000Z",
      ga4PropertyId: "properties/test",
      gscSiteUrl: "sc-domain:tokenradar.co",
      ranges: [{
        days: 28,
        startDate: "2026-07-26",
        endDate: "2026-08-22",
        ga4: {
          landingPages: [
            {
              dimensions: {
                landingPagePlusQueryString: "/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260820-x-market-bitcoin",
                sessionManualSource: "x",
                sessionManualMedium: "social",
                sessionManualCampaignName: "social_rotation",
                sessionManualAdContent: "20260820-x-market-bitcoin",
              },
              metrics: {
                sessions: 3,
                engagedSessions: 2,
                screenPageViews: 4,
                userEngagementDuration: 45,
                eventCount: 8,
              },
            },
            {
              dimensions: {
                landingPagePlusQueryString: "/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260820-x-market-bitcoin",
                sessionManualSource: "x",
                sessionManualMedium: "social",
                sessionManualCampaignName: "social_rotation",
                sessionManualAdContent: "20260820-x-market-bitcoin",
              },
              metrics: {
                sessions: 2,
                engagedSessions: 1,
                screenPageViews: 2,
                userEngagementDuration: 15,
                eventCount: 4,
              },
            },
          ],
          trackedEvents: [],
        },
        gsc: { pagesQueriesDevices: [] },
      }],
    } as Parameters<typeof persistSocialAttributionMetrics>[0];

    await expect(persistSocialAttributionMetrics(payload)).resolves.toBe(1);
    expect(d1Mocks.executeD1Query).toHaveBeenCalledTimes(1);
    expect(d1Mocks.executeD1Query.mock.calls[0]?.[0]).toContain("INSERT INTO social_attribution_metrics");
    expect(d1Mocks.executeD1Query.mock.calls[0]?.[1]).toEqual([
      "20260820-x-market-bitcoin",
      28,
      "2026-07-26",
      "2026-08-22",
      "2026-08-23T12:00:00.000Z",
      "x",
      "social",
      "social_rotation",
      5,
      3,
      6,
      60,
      12,
    ]);
    expect(d1Mocks.executeD1Query.mock.calls[0]?.[2]).toEqual({ required: true });
  });

  it("persists campaign totals in bounded multi-row requests", async () => {
    const payload = {
      exportedAt: "2026-08-23T12:00:00.000Z",
      ga4PropertyId: "properties/test",
      gscSiteUrl: "sc-domain:tokenradar.co",
      ranges: [{
        days: 28,
        startDate: "2026-07-26",
        endDate: "2026-08-22",
        ga4: {
          landingPages: Array.from({ length: 21 }, (_, index) => ({
            dimensions: {
              landingPagePlusQueryString: `/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=creative-${index}`,
              sessionManualSource: "x",
              sessionManualMedium: "social",
              sessionManualCampaignName: "social_rotation",
              sessionManualAdContent: `creative-${index}`,
            },
            metrics: {
              sessions: 1,
              engagedSessions: 1,
              screenPageViews: 1,
              userEngagementDuration: 1,
              eventCount: 1,
            },
          })),
          trackedEvents: [],
        },
        gsc: { pagesQueriesDevices: [] },
      }],
    } as Parameters<typeof persistSocialAttributionMetrics>[0];

    await expect(persistSocialAttributionMetrics(payload)).resolves.toBe(21);
    expect(d1Mocks.executeD1Query).toHaveBeenCalledTimes(3);
    for (const call of d1Mocks.executeD1Query.mock.calls) {
      expect(call[1]).toHaveLength(7 * 13);
      expect(call[1].length).toBeLessThanOrEqual(100);
      expect(call[2]).toEqual({ required: true });
    }
  });

  it("skips persistence when D1 is not configured", async () => {
    d1Mocks.hasD1Config.mockReturnValue(false);

    await expect(persistSocialAttributionMetrics({
      exportedAt: "2026-08-23T12:00:00.000Z",
      ga4PropertyId: "properties/test",
      gscSiteUrl: "sc-domain:tokenradar.co",
      ranges: [],
    })).resolves.toBe(0);
    await expect(persistSocialAttributionMetrics({
      exportedAt: "2026-08-23T12:00:00.000Z",
      ga4PropertyId: "properties/test",
      gscSiteUrl: "sc-domain:tokenradar.co",
      ranges: [],
    }, { required: true })).rejects.toThrow("D1 configuration is required");
    expect(d1Mocks.executeD1Query).not.toHaveBeenCalled();
  });
});

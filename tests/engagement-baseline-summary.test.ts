import { describe, expect, it } from "vitest";

import {
  type BaselineExport,
  normalizePagePath,
  renderSummaryMarkdown,
  summarizeBaselineExport,
} from "../scripts/summarize-engagement-baseline";

describe("engagement baseline summary", () => {
  it("normalizes paths across GA4 and GSC exports", () => {
    expect(normalizePagePath("/?fbclid=abc")).toBe("/");
    expect(normalizePagePath("https://tokenradar.co/iota/how-to-buy?utm_source=x")).toBe("/iota/how-to-buy");
    expect(normalizePagePath("(not set)")).toBe("(not set)");
  });

  it("aggregates engagement, weak pages, search opportunities, and event gaps", () => {
    const baseline: BaselineExport = {
      exportedAt: "2026-05-14T00:00:00.000Z",
      ga4PropertyId: "properties/test",
      gscSiteUrl: "sc-domain:tokenradar.co",
      ranges: [
        {
          days: 28,
          startDate: "2026-04-16",
          endDate: "2026-05-13",
          ga4: {
            landingPages: [
              {
                dimensions: {
                  landingPagePlusQueryString: "/foo?fbclid=1",
                  deviceCategory: "mobile",
                  sessionDefaultChannelGroup: "Organic Social",
                },
                metrics: {
                  sessions: 2,
                  engagedSessions: 1,
                  engagementRate: 0.5,
                  screenPageViews: 2,
                  userEngagementDuration: 20,
                  eventCount: 4,
                },
              },
              {
                dimensions: {
                  landingPagePlusQueryString: "/foo",
                  deviceCategory: "desktop",
                  sessionDefaultChannelGroup: "Direct",
                },
                metrics: {
                  sessions: 1,
                  engagedSessions: 0,
                  engagementRate: 0,
                  screenPageViews: 1,
                  userEngagementDuration: 0,
                  eventCount: 2,
                },
              },
              {
                dimensions: {
                  landingPagePlusQueryString: "/bar",
                  deviceCategory: "mobile",
                  sessionDefaultChannelGroup: "Organic Social",
                },
                metrics: {
                  sessions: 3,
                  engagedSessions: 0,
                  engagementRate: 0,
                  screenPageViews: 3,
                  userEngagementDuration: 0,
                  eventCount: 6,
                },
              },
            ],
            trackedEvents: [
              {
                dimensions: {
                  eventName: "scroll",
                  pagePathPlusQueryString: "/foo",
                  deviceCategory: "mobile",
                },
                metrics: { eventCount: 2, totalUsers: 1 },
              },
              {
                dimensions: {
                  eventName: "recirculation_click",
                  pagePathPlusQueryString: "/foo",
                  deviceCategory: "desktop",
                },
                metrics: { eventCount: 1, totalUsers: 1 },
              },
            ],
          },
          gsc: {
            pagesQueriesDevices: [
              {
                dimensions: {
                  page: "https://tokenradar.co/foo?ignored=1",
                  query: "foo token",
                  device: "MOBILE",
                },
                metrics: { clicks: 0, impressions: 5, ctr: 0, position: 10 },
              },
              {
                dimensions: {
                  page: "https://tokenradar.co/bar",
                  query: "bar token",
                  device: "DESKTOP",
                },
                metrics: { clicks: 1, impressions: 2, ctr: 0.5, position: 3 },
              },
            ],
          },
        },
      ],
    };

    const [range] = summarizeBaselineExport(baseline).ranges;

    expect(range.ga4.sessions).toBe(6);
    expect(range.topPages.find((page) => page.key === "/foo")).toMatchObject({
      sessions: 3,
      viewsPerSession: 1,
    });
    expect(range.weakLandingPages[0]?.key).toBe("/bar");
    expect(range.weakMobileSocialLandingPages[0]?.key).toBe("/bar");
    expect(range.searchOpportunities[0]).toMatchObject({
      key: "/foo",
      impressions: 5,
      clicks: 0,
      averagePosition: 10,
    });
    expect(range.missingEngagementEvents).toContain("next_action_click");
    expect(renderSummaryMarkdown(summarizeBaselineExport(baseline))).toContain("Weak landing pages:");
    expect(renderSummaryMarkdown(summarizeBaselineExport(baseline))).toContain("Weak mobile/social landing pages:");
  });
});

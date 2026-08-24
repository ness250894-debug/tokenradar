import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";

import {
  type BaselineExport,
  findLatestBaselineExport,
  normalizePagePath,
  renderSummaryMarkdown,
  summarizeBaselineExport,
} from "../scripts/summarize-engagement-baseline";

describe("engagement baseline summary", () => {
  it("selects the newest dated export instead of the newest checkout mtime", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-baseline-order-"));
    try {
      const older = path.join(dir, "engagement-baseline-2026-08-10.json");
      const newer = path.join(dir, "engagement-baseline-2026-08-22.json");
      fs.writeFileSync(older, "{}");
      fs.writeFileSync(newer, "{}");
      fs.utimesSync(older, new Date("2026-08-24T12:00:00.000Z"), new Date("2026-08-24T12:00:00.000Z"));
      fs.utimesSync(newer, new Date("2026-08-23T12:00:00.000Z"), new Date("2026-08-23T12:00:00.000Z"));

      expect(findLatestBaselineExport(dir)).toBe(newer);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

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
                  landingPagePlusQueryString: "/foo?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260513-x-market-risk-lab-bitcoin",
                  deviceCategory: "mobile",
                  sessionDefaultChannelGroup: "Organic Social",
                  sessionManualSource: "x",
                  sessionManualMedium: "social",
                  sessionManualCampaignName: "social_rotation",
                  sessionManualAdContent: "20260513-x-market-risk-lab-bitcoin",
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
    expect(range.socialCampaigns[0]).toMatchObject({
      utmContent: "20260513-x-market-risk-lab-bitcoin",
      source: "x",
      sessions: 2,
    });
    expect(range.missingEngagementEvents).toContain("next_action_click");
    expect(renderSummaryMarkdown(summarizeBaselineExport(baseline))).toContain("Weak landing pages:");
    expect(renderSummaryMarkdown(summarizeBaselineExport(baseline))).toContain("Weak mobile/social landing pages:");
    expect(renderSummaryMarkdown(summarizeBaselineExport(baseline))).toContain("Social creative attribution:");
  });
});

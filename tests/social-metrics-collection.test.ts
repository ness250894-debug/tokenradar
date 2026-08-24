import { describe, expect, it, vi } from "vitest";

import {
  collectDueSocialMetrics,
  metricWindowDueAt,
  parseCollectorOptions,
  type DueSocialMetricTarget,
} from "../scripts/collect-social-post-metrics";
import type { SocialPostMetricsRecord } from "../src/lib/ops-ledger";

describe("scheduled social metric collection", () => {
  it("uses the canonical +24h and +7d windows", () => {
    expect(parseCollectorOptions([]).windows).toEqual([24, 168]);
    expect(parseCollectorOptions(["--window", "24"]).windows).toEqual([24]);
    expect(parseCollectorOptions(["--window", "all"]).windows).toEqual([24, 168]);
    expect(() => parseCollectorOptions(["--window"])).toThrow("--window requires");
    expect(() => parseCollectorOptions(["--window", "--dry-run"])).toThrow("--window requires");
    expect(metricWindowDueAt("2026-08-20T03:17:00.000Z", 24).toISOString())
      .toBe("2026-08-21T03:17:00.000Z");
  });

  it("records collected metrics with horizon and attribution metadata", async () => {
    const due: DueSocialMetricTarget = {
      platform: "x",
      contentKey: "2026-08-20:market-update:bitcoin",
      externalId: "tweet-1",
      postedAt: "2026-08-20T03:17:00.000Z",
      horizonHours: 24,
      details: {
        plannedUrl: "https://tokenradar.co/bitcoin?utm_content=planned",
        publishedUrl: "https://tokenradar.co/bitcoin?utm_content=published",
        utmContent: "published",
      },
    };
    const records: SocialPostMetricsRecord[] = [];
    const collect = vi.fn(async () => ({
      status: "collected" as const,
      snapshot: {
        impressions: 500,
        likes: 10,
        source: "x-v2-public-metrics",
        unavailableMetrics: ["linkClicks"],
      },
    }));

    const summary = await collectDueSocialMetrics(
      { windows: [24], limit: 10, dryRun: false, strict: true },
      {
        now: new Date("2026-08-21T04:00:00.000Z"),
        listDueTargets: async () => [due],
        collect,
        record: async (record) => { records.push(record); },
      },
    );

    expect(summary).toMatchObject({ considered: 1, collected: 1, skipped: 0, failed: 0 });
    expect(records[0]).toMatchObject({
      platform: "x",
      horizonHours: 24,
      impressions: 500,
      likes: 10,
      details: {
        source: "x-v2-public-metrics",
        actualAgeHours: 24.72,
        latenessHours: 0.72,
        plannedUrl: expect.stringContaining("utm_content=planned"),
        publishedUrl: expect.stringContaining("utm_content=published"),
        utmContent: "published",
      },
    });
  });

  it("deduplicates requested windows before listing billable collection targets", async () => {
    const listDueTargets = vi.fn(async (_horizonHours: number) => []);

    await collectDueSocialMetrics(
      { windows: [24, 24, 168], limit: 10, dryRun: true, strict: true },
      { listDueTargets },
    );

    expect(listDueTargets).toHaveBeenCalledTimes(2);
    expect(listDueTargets.mock.calls.map((call) => call[0])).toEqual([24, 168]);
  });

  it("records a missed window once instead of mislabeling a late snapshot", async () => {
    const due: DueSocialMetricTarget = {
      platform: "x",
      contentKey: "late-post",
      externalId: "tweet-late",
      postedAt: "2026-08-20T03:00:00.000Z",
      horizonHours: 24,
      details: {},
    };
    const records: SocialPostMetricsRecord[] = [];
    const collect = vi.fn();

    const summary = await collectDueSocialMetrics(
      { windows: [24], limit: 10, dryRun: false, strict: true },
      {
        now: new Date("2026-08-21T16:30:00.000Z"),
        listDueTargets: async () => [due],
        collect,
        record: async (record) => { records.push(record); },
      },
    );

    expect(summary).toMatchObject({ collected: 0, skipped: 1, failed: 0 });
    expect(collect).not.toHaveBeenCalled();
    expect(records[0].details).toMatchObject({ status: "missed-window", maxLatenessHours: 12 });
  });
});

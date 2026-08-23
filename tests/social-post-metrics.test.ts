import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { parseMetricsRecords } from "../scripts/import-social-post-metrics";

function tempFile(name: string, content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-social-metrics-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content);
  return filePath;
}

describe("social post metrics import", () => {
  it("parses JSON metrics exports", () => {
    const filePath = tempFile("metrics.json", JSON.stringify([
      {
        platform: "x",
        contentKey: "2026-06-05:market-update:bitcoin",
        measuredAt: "2026-06-06T00:00:00.000Z",
        horizonHours: 24,
        impressions: 420,
        likes: 4,
        replies: 1,
        linkClicks: 2,
      },
    ]));

    expect(parseMetricsRecords(filePath)).toEqual([
      expect.objectContaining({
        platform: "x",
        contentKey: "2026-06-05:market-update:bitcoin",
        measuredAt: "2026-06-06T00:00:00.000Z",
        horizonHours: 24,
        impressions: 420,
        likes: 4,
        replies: 1,
        linkClicks: 2,
      }),
    ]);
  });

  it("parses CSV metrics exports with snake_case columns", () => {
    const filePath = tempFile(
      "metrics.csv",
      [
        "platform,content_key,measured_at,window_hours,impressions,link_clicks,profile_clicks",
        "instagram,2026-06-05:instagram-carousel,2026-06-06T00:00:00.000Z,168,1200,12,4",
      ].join("\n"),
    );

    expect(parseMetricsRecords(filePath)[0]).toMatchObject({
      platform: "instagram",
      contentKey: "2026-06-05:instagram-carousel",
      measuredAt: "2026-06-06T00:00:00.000Z",
      horizonHours: 168,
      impressions: 1200,
      linkClicks: 12,
      profileClicks: 4,
    });
  });

  it("accepts horizon_hours without leaking it into metric details", () => {
    const filePath = tempFile("metrics.json", JSON.stringify([{
      platform: "youtube",
      content_key: "2026-06-05:youtube:bitcoin",
      horizon_hours: 24,
      measured_at: "2026-06-06T00:00:00.000Z",
      views: 100,
    }]));

    expect(parseMetricsRecords(filePath)[0]).toMatchObject({
      horizonHours: 24,
      details: { collector: "manual-import" },
    });
  });

  it.each([
    { horizonHours: 7, views: 10 },
    { horizonHours: 24, views: -1 },
    { horizonHours: 24, likes: 1.5 },
    { horizonHours: 24, watchTimeSeconds: -0.1 },
    { horizonHours: 24, completionRate: 1.01 },
    { horizonHours: 24, measuredAt: "not-a-date", views: 1 },
  ])("rejects invalid decision metrics %#", (invalid) => {
    const filePath = tempFile("invalid.json", JSON.stringify([{
      platform: "youtube",
      contentKey: "2026-08-22:youtube:bitcoin",
      measuredAt: "2026-08-23T00:00:00.000Z",
      ...invalid,
    }]));

    expect(() => parseMetricsRecords(filePath)).toThrow();
  });
});

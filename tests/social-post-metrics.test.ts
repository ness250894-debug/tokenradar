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
        "platform,content_key,measured_at,impressions,link_clicks,profile_clicks",
        "instagram,2026-06-05:instagram-carousel,2026-06-06T00:00:00.000Z,1200,12,4",
      ].join("\n"),
    );

    expect(parseMetricsRecords(filePath)[0]).toMatchObject({
      platform: "instagram",
      contentKey: "2026-06-05:instagram-carousel",
      measuredAt: "2026-06-06T00:00:00.000Z",
      impressions: 1200,
      linkClicks: 12,
      profileClicks: 4,
    });
  });
});

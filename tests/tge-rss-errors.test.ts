import { describe, expect, it } from "vitest";

import {
  createTgeRssReportError,
  formatTgeRssErrorSource,
  isSkippableTgeRssFetchError,
} from "../src/lib/tge-rss-errors";

const feed = {
  name: "CoinDesk",
  url: "https://www.coindesk.com/arc/outboundfeeds/rss",
};

describe("TGE RSS error handling", () => {
  it("skips definitive feed blocks without system-report warnings", () => {
    expect(isSkippableTgeRssFetchError(new Error("Status code 403"))).toBe(true);
    expect(isSkippableTgeRssFetchError(new Error("HTTP Error: 410 Gone"))).toBe(true);
  });

  it("keeps unexpected parser failures reportable with feed context", () => {
    expect(isSkippableTgeRssFetchError(new Error("Invalid XML"))).toBe(false);
    expect(formatTgeRssErrorSource(feed)).toBe("discover-tges-rss:coindesk");

    const error = createTgeRssReportError(feed, new Error("Invalid XML"));

    expect(error.message).toContain("CoinDesk RSS fetch failed");
    expect(error.message).toContain(feed.url);
    expect(error.message).toContain("Invalid XML");
  });
});

import { describe, expect, it } from "vitest";

import {
  attachPublishedUrlToSocialTrackerPayload,
  buildSocialPostDetails,
  buildSocialTrackerPayload,
} from "../src/lib/social-post-tracker";

describe("social post tracker schema", () => {
  it("normalizes shared social metadata for local trackers and D1 details", () => {
    const payload = buildSocialTrackerPayload({
      postedAt: "2026-06-05T12:00:00.000Z",
      platform: "x",
      requestedPlatform: "all",
      surface: "market-update",
      tokenId: "bitcoin",
      tokenName: "Bitcoin",
      tokenSymbol: "BTC",
      reason: "top-gainer",
      archetypeKey: "risk_lab",
      archetypeLabel: "Risk Lab",
      variantKey: "risk_filter",
      variantLabel: "Risk Filter",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      text: "$BTC needs confirmation before the move matters.",
      externalId: "tweet-1",
      plannedUrl: "https://tokenradar.co/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260605-x-risk_lab-bitcoin",
      publishedUrl: "https://tokenradar.co/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260605-x-risk_lab-bitcoin",
    });

    expect(payload).toMatchObject({
      platform: "x",
      variantSurface: "market-update",
      archetypeKey: "risk_lab",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      xText: "$BTC needs confirmation before the move matters.",
      tweetId: "tweet-1",
      utmContent: "20260605-x-risk_lab-bitcoin",
      plannedUrl: expect.stringContaining("utm_content=20260605-x-risk_lab-bitcoin"),
      publishedUrl: expect.stringContaining("utm_content=20260605-x-risk_lab-bitcoin"),
    });

    expect(buildSocialPostDetails(payload)).toMatchObject({
      tokenId: "bitcoin",
      archetypeKey: "risk_lab",
      variantKey: "risk_filter",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      xText: "$BTC needs confirmation before the move matters.",
      publishedUrl: expect.stringContaining("utm_content=20260605-x-risk_lab-bitcoin"),
    });
  });

  it("does not claim that a planned link was published", () => {
    const payload = buildSocialTrackerPayload({
      postedAt: "2026-06-05T12:00:00.000Z",
      platform: "x",
      surface: "market-update",
      plannedUrl: "https://tokenradar.co/bitcoin?utm_source=x&utm_medium=social&utm_content=planned-only",
    });

    expect(payload.plannedUrl).toContain("planned-only");
    expect(payload.publishedUrl).toBeUndefined();
    expect(payload.utmContent).toBe("planned-only");
  });

  it("attaches the delivered URL without moving original post evidence", () => {
    const payload = buildSocialTrackerPayload({
      postedAt: "2026-06-05T12:00:00.000Z",
      platform: "x",
      surface: "market-update",
      externalId: "tweet-1",
      plannedUrl: "https://tokenradar.co/bitcoin?utm_source=x&utm_medium=social&utm_content=planned",
    });
    const updated = attachPublishedUrlToSocialTrackerPayload(
      payload,
      "https://tokenradar.co/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=published",
    );

    expect(updated).toMatchObject({
      postedAt: "2026-06-05T12:00:00.000Z",
      externalId: "tweet-1",
      tweetId: "tweet-1",
      publishedUrl: expect.stringContaining("utm_content=published"),
      utmContent: "published",
    });
    expect(updated.plannedUrl).toBe(payload.plannedUrl);
  });
});

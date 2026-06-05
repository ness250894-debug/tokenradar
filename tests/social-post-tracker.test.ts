import { describe, expect, it } from "vitest";

import {
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
      utmUrl: "https://tokenradar.co/bitcoin?utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260605-x-risk_lab-bitcoin",
    });

    expect(payload).toMatchObject({
      platform: "x",
      variantSurface: "market-update",
      archetypeKey: "risk_lab",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      xText: "$BTC needs confirmation before the move matters.",
      tweetId: "tweet-1",
    });

    expect(buildSocialPostDetails(payload)).toMatchObject({
      tokenId: "bitcoin",
      archetypeKey: "risk_lab",
      variantKey: "risk_filter",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      xText: "$BTC needs confirmation before the move matters.",
    });
  });
});

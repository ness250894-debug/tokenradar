import { describe, expect, it } from "vitest";

import { buildSocialUtmUrl, readSocialUtmAttribution } from "../src/lib/social-utm";

describe("social UTM URLs", () => {
  it("adds stable social rotation parameters without dropping existing params", () => {
    const url = buildSocialUtmUrl("https://tokenradar.co/bitcoin?view=research", {
      platform: "x",
      date: "2026-06-05",
      archetypeKey: "risk_lab",
      tokenId: "bitcoin",
      surface: "market-update",
    });

    expect(url).toBe("https://tokenradar.co/bitcoin?view=research&utm_source=x&utm_medium=social&utm_campaign=social_rotation&utm_content=20260605-x-market-update-risk-lab-bitcoin");
  });

  it("reads creative attribution without discarding utm_content", () => {
    expect(readSocialUtmAttribution(
      "https://tokenradar.co/bitcoin?utm_source=youtube&utm_medium=social&utm_campaign=social_rotation&utm_content=20260605-youtube-video-risk-lab-bitcoin",
    )).toEqual({
      source: "youtube",
      medium: "social",
      campaign: "social_rotation",
      content: "20260605-youtube-video-risk-lab-bitcoin",
    });
  });
});

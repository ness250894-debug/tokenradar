import { describe, expect, it } from "vitest";

import { buildSocialUtmUrl } from "../src/lib/social-utm";

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
});

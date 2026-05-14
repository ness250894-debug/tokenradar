import { describe, expect, it } from "vitest";

import { buildEngagementParams, getDeviceHint } from "../src/lib/engagement-analytics";

describe("engagement analytics helpers", () => {
  it("maps viewport widths to stable device hints", () => {
    expect(getDeviceHint(390)).toBe("mobile");
    expect(getDeviceHint(900)).toBe("tablet");
    expect(getDeviceHint(1280)).toBe("desktop");
  });

  it("normalizes engagement params to GA4-safe snake_case keys", () => {
    const params = buildEngagementParams(
      {
        pageType: "token_article",
        tokenId: "bitcoin",
        articleType: "price-prediction",
        moduleId: "article-end",
        modulePosition: "article_end",
        sourceSection: "Forecast Framework",
      },
      {
        destinationType: "learn",
        destinationPath: "/learn/fully-diluted-valuation-fdv",
        depth_percent: 75,
      },
    );

    expect(params).toMatchObject({
      page_type: "token_article",
      token_id: "bitcoin",
      article_type: "price-prediction",
      module_id: "article-end",
      module_position: "article_end",
      source_section: "Forecast Framework",
      destination_type: "learn",
      destination_path: "/learn/fully-diluted-valuation-fdv",
      depth_percent: 75,
    });
    expect(params.destinationType).toBeUndefined();
    expect(params.destinationPath).toBeUndefined();
  });
});

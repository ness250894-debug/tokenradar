import { describe, expect, it } from "vitest";

import { evaluateArticleQuality, getArticleQualityThresholds } from "../src/lib/content-quality";

function makeQualityArticle(type: string, targetWords: number): { type: string; content: string } {
  const requiredText = [
    "$1.00",
    "2.00%",
    "1,000",
    "## FAQ",
    "What is this asset?",
    "This is a research fixture.",
    "Disclaimer: This article is for informational purposes only and does not constitute financial advice.",
  ].join(" ");
  const requiredWords = requiredText.split(/\s+/).filter(Boolean).length;
  const filler = Array(Math.max(0, targetWords - requiredWords)).fill("analysis").join(" ");

  return {
    type,
    content: `${filler}\n\n${requiredText}`.trim(),
  };
}

describe("content quality thresholds", () => {
  it("requires stronger how-to-buy depth than launch previews", () => {
    expect(getArticleQualityThresholds("how-to-buy").minFailWords).toBe(700);
    expect(getArticleQualityThresholds("tge-preview").minFailWords).toBe(500);
  });

  it("fails thin how-to-buy articles before they can be indexed or published", () => {
    const thin = evaluateArticleQuality(makeQualityArticle("how-to-buy", 650));
    const acceptable = evaluateArticleQuality(makeQualityArticle("how-to-buy", 750));

    expect(thin.passed).toBe(false);
    expect(thin.issues.some((issue) => issue.includes("Word count too low"))).toBe(true);
    expect(acceptable.passed).toBe(true);
    expect(acceptable.warnings.some((warning) => warning.includes("Word count borderline"))).toBe(true);
  });

  it("warns on format and freshness drift without blocking otherwise valid content", () => {
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: `${makeQualityArticle("overview", 900).content}\n\n### Unsupported\n\nAs of May 13, 2026, the live price is {{LIVE_PRICE}}.`,
    });

    expect(result.passed).toBe(true);
    expect(result.warnings).toContain("Unsupported heading depth found: use ## section headings only");
    expect(result.warnings).toContain("Live market placeholders remain in article content");
    expect(result.warnings).toContain("Hardcoded live-date phrasing found; use live market date placeholders instead");
  });
});

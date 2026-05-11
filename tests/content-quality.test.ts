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
});

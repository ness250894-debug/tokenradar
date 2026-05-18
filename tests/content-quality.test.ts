import { describe, expect, it } from "vitest";

import { evaluateArticleQuality, getArticleQualityThresholds } from "../src/lib/content-quality";

function makeQualityArticle(type: string, targetWords: number): { type: string; content: string } {
  const requiredBlocks = [
    "This research fixture opens with market context, risk framing, and supply evidence before any section heading.",
    "| Metric | Value |\n| :--- | :--- |\n| Price | $1.00 |\n| Change | 2.00% |\n| Supply | 1,000 |",
    "## FAQ",
    "**What is this asset?**\n\nThis is a research fixture.",
    "**What data matters most?**\n\nPrice, market cap, volume, and supply data matter most.",
    "**Does this recommend buying?**\n\nNo. It is a neutral article quality fixture.",
    "**What should readers verify?**\n\nReaders should verify liquidity, risk, fees, and current market conditions.",
    "---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*",
  ];
  const requiredText = requiredBlocks.join("\n\n");
  const requiredWords = requiredText.split(/\s+/).filter(Boolean).length;
  const filler = Array(Math.max(0, targetWords - requiredWords)).fill("analysis").join(" ");

  return {
    type,
    content: [requiredBlocks[0], filler, ...requiredBlocks.slice(1)].filter(Boolean).join("\n\n").trim(),
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

  it("fails repeated filler paragraphs", () => {
    const paragraph =
      "This repeated local template paragraph explains liquidity, market cap, custody, tax records, and volume context without adding token-specific evidence.";
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: `${makeQualityArticle("overview", 900).content}\n\n${paragraph}\n\n${paragraph}`,
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toContain("Repeated filler paragraphs found: 1");
    expect(result.stats.repeatedParagraphCount).toBe(1);
  });

  it("fails malformed Markdown table blocks", () => {
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: `${makeQualityArticle("overview", 900).content}\n\n| Metric | Value |\n|\n---\n| Price | $1.00 |`,
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toContain("Malformed Markdown table block found");
    expect(result.stats.hasMalformedTable).toBe(true);
  });

  it("fails generated articles that do not expose an early summary table", () => {
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: makeQualityArticle("overview", 900).content.replace(/\n\n\| Metric \| Value \|[\s\S]*?\| Supply \| 1,000 \|/, ""),
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toContain("Missing early summary table");
  });

  it("fails generated articles with fewer than 3 FAQ questions", () => {
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: makeQualityArticle("overview", 900).content.replace(
        /\*\*What data matters most\?\*\*[\s\S]*?\*\*What should readers verify\?\*\*[\s\S]*?current market conditions\./,
        "**What data matters most?**\n\nPrice, market cap, volume, and supply data matter most.",
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toContain("FAQ section has too few questions: 2 (min 3)");
  });

  it("counts heading-style FAQ questions used by legacy generated articles", () => {
    const content = makeQualityArticle("tge-preview", 700).content.replace(
      /## FAQ[\s\S]*?---\n\*Disclaimer:/,
      [
        "## FAQ",
        "",
        "## What is the primary function?",
        "",
        "It explains the launch setup.",
        "",
        "## How is the project different?",
        "",
        "It uses the provided evidence.",
        "",
        "## What should readers verify?",
        "",
        "They should verify sources and contracts.",
        "",
        "---\n*Disclaimer:",
      ].join("\n"),
    );

    const result = evaluateArticleQuality({ type: "tge-preview", content });

    expect(result.passed).toBe(true);
    expect(result.stats.faqQuestionCount).toBe(3);
  });

  it("fails financial-advice phrasing outside the exact disclaimer", () => {
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: makeQualityArticle("overview", 900).content.replace(
        "This research fixture opens",
        "This is not financial advice. This research fixture opens",
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toContain('Prohibited phrases found: "financial advice outside disclaimer"');
  });

  it("flags promotional project slogans as blocking phrases", () => {
    const result = evaluateArticleQuality({
      ...makeQualityArticle("overview", 900),
      content: makeQualityArticle("overview", 900).content.replace(
        "This research fixture opens",
        "Forget What You Know. This research fixture opens",
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.issues).toContain('Prohibited phrases found: "forget what you know"');
  });
});

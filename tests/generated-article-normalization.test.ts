import { describe, expect, it } from "vitest";

import { evaluateArticleQuality } from "../src/lib/content-quality";
import {
  buildGenerationRetryFeedback,
  normalizeGeneratedArticleMarkdown,
} from "../src/lib/generated-article-normalization";

describe("generated article normalization", () => {
  it("enforces the regular article opening, live summary table, and FAQ heading contract", () => {
    const content = [
      "## Introduction to Example Token",
      "",
      "Example Token is being evaluated through current market structure, liquidity risk, circulating supply, and historical price context. The opening remains analytical and avoids promotional claims while giving readers enough evidence to understand the report.",
      "",
      "## Market Structure Analysis",
      "",
      "The supplied context supports a measured review of the asset.",
      "",
      "## FAQ",
      "",
      "### What should readers verify?",
      "",
      "Readers should verify liquidity and current market conditions.",
    ].join("\n");

    const normalized = normalizeGeneratedArticleMarkdown(content, { articleType: "overview" });

    expect(normalized).toMatch(/^Example Token is being evaluated/);
    expect(normalized.indexOf("| Price | {{LIVE_PRICE}} |")).toBeLessThan(
      normalized.indexOf("## Market Structure Analysis"),
    );
    expect(normalized).toContain("**What should readers verify?**");
    expect(normalized).not.toContain("### ");
  });

  it("replaces both formatted and headerless Gemini summary tables with one canonical table", () => {
    const content = [
      "Example Token opens with an analytical review of current liquidity, valuation, market structure, and the supplied evidence without making promotional claims.",
      "",
      "| Metric | Value |",
      "| --- | --- |",
      "| Price | {{LIVE_PRICE}} |",
      "| Market Cap | {{LIVE_MARKET_CAP}} |",
      "| 24h Change | {{LIVE_24H_CHANGE}} |",
      "| Market Rank | {{LIVE_RANK}} |",
      "",
      "| Price | {{LIVE_PRICE}} |",
      "| Market Cap | {{LIVE_MARKET_CAP}} |",
      "| 24h Change | {{LIVE_24H_CHANGE}} |",
      "| Market Rank | {{LIVE_RANK}} |",
      "",
      "## Market Review",
      "",
      "The supplied context supports a measured review.",
    ].join("\n");

    const normalized = normalizeGeneratedArticleMarkdown(content, { articleType: "overview" });

    expect(normalized.match(/^\| Metric \| Value \|$/gm)).toHaveLength(1);
    expect(normalized.match(/^\| Price \| \{\{LIVE_PRICE\}\} \|$/gm)).toHaveLength(1);
  });

  it("builds a deterministic early TGE evidence table with shared-countable data", () => {
    const content = [
      "This launch report opens with verification risk, source quality, custody uncertainty, and the current evidence available to TokenRadar readers before any section heading.",
      "",
      "## Launch Evidence Review",
      "",
      "The remaining claims must stay bounded by supplied evidence.",
      "",
      "## FAQ",
      "",
      "### What is verified?",
      "",
      "Only the supplied source evidence is verified.",
    ].join("\n");

    const normalized = normalizeGeneratedArticleMarkdown(content, {
      articleType: "tge-preview",
      tgeEvidence: {
        status: "upcoming",
        lifecycleStatus: "confirmed_tge",
        confidence: 68,
        sourceCount: 1,
        expectedLaunchWindow: "Q4 2026",
        category: "Infrastructure",
        lastChecked: "2026-08-13",
      },
    });
    const quality = evaluateArticleQuality({ type: "tge-preview", content: normalized });

    expect(normalized).toContain("| Verification Confidence | 68/100 |");
    expect(normalized).toContain("| Last Checked | 2026-08-13 |");
    expect(quality.stats.hasEarlySummaryTable).toBe(true);
    expect(quality.stats.dataPointCount).toBeGreaterThanOrEqual(3);
  });

  it("turns validation failures into explicit retry instructions", () => {
    const feedback = buildGenerationRetryFeedback("overview", [
      "Missing early summary table",
      "FAQ section has too few questions: 2 (min 3)",
    ]);

    expect(feedback).toContain("Missing early summary table");
    expect(feedback).toContain("Use ## FAQ once");
    expect(feedback).toContain("Never use ### headings");
  });
});

import { describe, expect, it } from "vitest";

import {
  findUnapprovedOutboundUrls,
  validateDataSchemaIntegrity,
  validateGeneratedArticleIntegrity,
} from "../scripts/validate-content";

describe("content outbound URL validation", () => {
  it("allows approved HTTPS hosts", () => {
    const blocked = findUnapprovedOutboundUrls(
      "Review the source at https://github.com/tokenradar/example.",
      new Set(["github.com"]),
    );

    expect(blocked).toEqual([]);
  });

  it("blocks unknown or non-HTTPS external URLs", () => {
    const blocked = findUnapprovedOutboundUrls(
      "Bad links: https://spam.example/path. Also http://github.com/tokenradar/example",
      new Set(["github.com"]),
    );

    expect(blocked).toEqual([
      "https://spam.example/path",
      "http://github.com/tokenradar/example",
    ]);
  });

  it("rejects empty generated article artifacts", () => {
    const errors = validateGeneratedArticleIntegrity("content/tokens/test-token/overview.json", {
      tokenId: "test-token",
      type: "overview",
      slug: "overview",
      title: "Test Token Overview",
      content: "",
      wordCount: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(errors).toContain("Generated article content is empty");
  });

  it("rejects generated article path mismatches", () => {
    const errors = validateGeneratedArticleIntegrity("content/tokens/test-token/how-to-buy.json", {
      tokenId: "other-token",
      type: "overview",
      slug: "overview",
      title: "How to Buy Test Token",
      content: "Article body",
      wordCount: 2,
      generatedAt: "not-a-date",
    });

    expect(errors).toEqual([
      'Article tokenId "other-token" does not match path token "test-token"',
      'Article type "overview" does not match filename "how-to-buy.json"',
      'Article slug "overview" does not match filename "how-to-buy.json"',
      "Generated article generatedAt must be a valid ISO date when present",
    ]);
  });

  it("rejects generated articles that violate blocking editorial quality gates", () => {
    const filler = Array(850).fill("analysis").join(" ");
    const content = [
      `This generated article has $1.00 price context, 2.00% volatility, and 1,000 supply units. ${filler}`,
      "## FAQ",
      "**What is this asset?**",
      "It is a validation fixture.",
      "**What data matters most?**",
      "Price, volume, and supply data matter.",
      "**Does this recommend buying?**",
      "No. It is research-only context.",
      "---",
      "*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*",
    ].join("\n\n");

    const errors = validateGeneratedArticleIntegrity("content/tokens/test-token/overview.json", {
      tokenId: "test-token",
      type: "overview",
      slug: "overview",
      title: "Test Token Overview",
      content,
      wordCount: content.split(/\s+/).length,
      generatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect(errors).toContain("Missing early summary table");
  });

  it("rejects invalid metric score payloads", () => {
    const errors = validateDataSchemaIntegrity("data/metrics/test-token.json", {
      tokenId: "test-token",
      tokenName: "Test Token",
      symbol: "test",
      riskScore: 5,
      riskLevel: "medium",
      growthPotentialIndex: 50,
      narrativeStrength: 50,
      valueVsAth: 120,
      volatilityIndex: 10,
      summary: "Test Token has moderate metrics.",
      computedAt: "2026-05-17T00:00:00.000Z",
    });

    expect(errors.join("; ")).toContain("data/metrics schema validation failed");
    expect(errors.join("; ")).toContain("valueVsAth");
  });
});

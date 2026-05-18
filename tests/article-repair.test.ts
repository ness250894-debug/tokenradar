import { describe, expect, it } from "vitest";

import {
  neutralizeHowToBuyVenueClaims,
  repairArticleMarkdown,
  unwrapAmbiguousInternalArticleLinks,
} from "../src/lib/article-repair";

describe("article repair helpers", () => {
  it("unwraps ambiguous internal token links while preserving specific links", () => {
    const repaired = unwrapAmbiguousInternalArticleLinks(
      "Risk [Score](/score), [Gate](/gatechain-token).io, and [Bitcoin](/bitcoin) are mentioned.",
    );

    expect(repaired).toContain("Risk Score");
    expect(repaired).toContain("Gate.io");
    expect(repaired).not.toContain("](/score)");
    expect(repaired).not.toContain("](/gatechain-token)");
    expect(repaired).toContain("[Bitcoin](/bitcoin)");
  });

  it("replaces unsupported how-to-buy exchange listing sections with verification guidance", () => {
    const repaired = neutralizeHowToBuyVenueClaims(
      [
        "Intro paragraph.",
        "",
        "## Where to Buy Example Token",
        "",
        "EXM is listed on major exchanges including Binance, Coinbase, and Bybit.",
        "",
        "- **Binance** - Deep liquidity",
        "- **Coinbase** - Regional availability varies",
        "",
        "## Storage",
        "",
        "Move a small test amount first.",
      ].join("\n"),
      { tokenName: "Example Token", symbol: "EXM" },
    );

    expect(repaired).toContain("## Market Availability Checks for EXM");
    expect(repaired).toContain("verify current EXM market availability");
    expect(repaired).not.toContain("Binance");
    expect(repaired).not.toContain("Coinbase");
    expect(repaired).toContain("## Storage");
  });

  it("normalizes and repairs how-to-buy copy in one pass", () => {
    const repaired = repairArticleMarkdown(
      "## FAQ **What is the Risk [Score](/score)?**\n\nA [score](/score) is a signal.",
      "how-to-buy",
      { tokenName: "Example Token", symbol: "EXM" },
    );

    expect(repaired).toContain("## FAQ\n\n**What is the Risk Score?**");
    expect(repaired).not.toContain("](/score)");
  });

  it("neutralizes leftover venue claim lines outside exchange sections", () => {
    const repaired = neutralizeHowToBuyVenueClaims(
      [
        "Intro paragraph.",
        "",
        "## Step-by-Step Guide",
        "",
        "1. Choose a reputable exchange like Binance, Coinbase, or Bybit that lists EXM.",
        "",
        "## FAQ",
        "",
        "**Is EXM available on Coinbase?**",
        "",
        "Yes, EXM is supported by major exchanges including Coinbase and Binance.",
      ].join("\n"),
      { tokenName: "Example Token", symbol: "EXM" },
    );

    expect(repaired).not.toContain("Binance");
    expect(repaired).not.toContain("Coinbase");
    expect(repaired).toContain("Verify current EXM market availability");
    expect(repaired).toContain("**How should I verify EXM market availability?**");
  });

  it("inserts an early editorial summary table when legacy content is missing one", () => {
    const repaired = repairArticleMarkdown(
      [
        "Example Token trades with $1.00 price context, 2.00% volatility, and 1,000 units of supply.",
        "",
        "## Market Position",
        "",
        "The article already has market details, but no table before the first section.",
        "",
        "## FAQ",
        "",
        "**What is Example Token?**",
        "",
        "It is a research fixture.",
        "",
        "**What data matters most?**",
        "",
        "Price, volume, and risk matter.",
        "",
        "**Does this recommend buying?**",
        "",
        "No. It is research only.",
        "",
        "---",
        "",
        "*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*",
      ].join("\n"),
      "overview",
      { tokenId: "example-token", tokenName: "Example Token", symbol: "EXM" },
    );

    expect(repaired).toContain("| Editorial Check | How to Use It |");
    expect(repaired.indexOf("| Editorial Check | How to Use It |")).toBeLessThan(repaired.indexOf("## Market Position"));
  });

  it("neutralizes upstream promotional slogans before rebuilding quality metadata", () => {
    const repaired = repairArticleMarkdown(
      [
        "Example Token is the DeFi ecosystem building financial freedom for everyone. Forget What You Know. This is Example Token.",
        "",
        "| Metric | Value |",
        "| :--- | :--- |",
        "| Price | $1.00 |",
        "",
        "## Market Position",
        "",
        "Market context stays neutral.",
        "",
        "## FAQ",
        "",
        "**What is Example Token?**",
        "",
        "Forget What You Know. This is Example Token.",
        "",
        "**What data matters most?**",
        "",
        "Price and liquidity.",
        "",
        "**Does this recommend buying?**",
        "",
        "No. It is research only.",
        "",
        "---",
        "",
        "*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*",
      ].join("\n"),
      "overview",
      { tokenId: "example-token", tokenName: "Example Token", symbol: "EXM" },
    );

    expect(repaired).not.toContain("financial freedom for everyone");
    expect(repaired).not.toContain("Forget What You Know");
    expect(repaired).toContain("reviewed through market data, liquidity, and risk context");
  });
});

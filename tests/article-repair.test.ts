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
});

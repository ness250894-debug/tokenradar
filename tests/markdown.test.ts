import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../src/lib/markdown";
import { isLinkableTokenName } from "../src/lib/internal-link-policy";

describe("markdownToHtml", () => {
  it("converts basic markdown to HTML", async () => {
    const html = await markdownToHtml("## Hello World\n\nThis is a paragraph.");
    expect(html).toMatch(/<h2[^>]*>/);
    expect(html).toContain("Hello World");
    expect(html).toContain("<p>");
  }, 10000);

  it("converts bold and italic", async () => {
    const html = await markdownToHtml("**bold** and *italic*");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
  });

  it("converts bullet lists", async () => {
    const html = await markdownToHtml("- Item A\n- Item B\n- Item C");
    expect(html).toContain("<li>");
    expect(html).toContain("Item A");
  });

  it("strips script tags from raw HTML", async () => {
    const malicious = "Hello <script>alert('xss')</script> World";
    const html = await markdownToHtml(malicious);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("alert");
    expect(html).toContain("Hello");
    expect(html).toContain("World");
  });

  it("strips event handler attributes", async () => {
    const malicious = '<img src="x" onerror="alert(1)" />';
    const html = await markdownToHtml(malicious);
    expect(html).not.toContain("onerror");
  });

  it("strips unsafe link protocols", async () => {
    const malicious = "[bad](javascript:alert(1))";
    const html = await markdownToHtml(malicious);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("alert");
  });

  it("injects token pill when tokenData is provided and Risk Score pattern exists", async () => {
    const md = "*   **Risk Score (7/10):** This token is risky.";
    const html = await markdownToHtml(md, {
      name: "Solana",
      symbol: "SOL",
      price: 145.23,
    });
    expect(html).toContain("token-ticker-pill");
    expect(html).toContain("Risk Score of 7/10");
    expect(html).toContain("SOLANA");
  });

  it("works correctly without tokenData", async () => {
    const html = await markdownToHtml("Simple text.");
    expect(html).toContain("Simple text.");
  });

  it("preserves zero-valued live placeholders instead of falling back to N/A", async () => {
    const html = await markdownToHtml(
      "| Metric | Value |\n| :--- | :--- |\n| Rank | {{LIVE_RANK}} |\n| 24h | {{LIVE_24H_CHANGE}} |",
      {
        name: "Zero",
        symbol: "ZERO",
        price: 0,
        marketCap: 0,
        marketCapRank: 0,
        priceChange24h: 0,
      },
    );

    expect(html).toContain("#0");
    expect(html).toContain("0.00%");
  });

  it("unwraps unsafe internal links while preserving valid learn links", async () => {
    const html = await markdownToHtml(
      "[Risk Score](/score) and [legacy token](/polymarket) should be text, but [staking](/learn/what-is-staking) should stay linked.",
    );

    expect(html).toContain("Risk Score");
    expect(html).toContain("legacy token");
    expect(html).not.toContain('href="/score"');
    expect(html).not.toContain('href="/polymarket"');
    expect(html).toContain('href="/learn/what-is-staking"');
  });

  it("unwraps common-word token links even when the token slug has a suffix", async () => {
    const html = await markdownToHtml("Bitcoin can work as peer-to-peer [cash](/cash-4).");

    expect(html).toContain("cash");
    expect(html).not.toContain('href="/cash-4"');
  });

  it("does not auto-link common English token names", async () => {
    const html = await markdownToHtml(
      "Gas would affect the Flow score and market cap, but real cross-market analysis should not show liquid momentum links.",
    );

    expect(html).not.toContain('href="/gas"');
    expect(html).not.toContain('href="/would"');
    expect(html).not.toContain('href="/flow"');
    expect(html).not.toContain('href="/score"');
    expect(html).not.toContain('href="/cap-4"');
    expect(html).not.toContain('href="/show-2"');
    expect(html).not.toContain('href="/liquid"');
    expect(html).not.toContain('href="/momentum-3"');
    expect(html).not.toContain('href="/cross-2"');
    expect(["cap", "cross", "liquid", "momentum", "real", "show"].every((name) =>
      !isLinkableTokenName(name)
    )).toBe(true);
  });

  it("unwraps ambiguous exchange, wallet, and risk links to token pages", async () => {
    const html = await markdownToHtml(
      "Use [Gate](/gatechain-token).io, verify [Trust Wallet](/trust-wallet-token), and read the [Risk Score](/score). [Bitcoin](/bitcoin) should stay linked.",
    );

    expect(html).toContain("Gate");
    expect(html).toContain("Trust Wallet");
    expect(html).toContain("Risk Score");
    expect(html).not.toContain('href="/gatechain-token"');
    expect(html).not.toContain('href="/trust-wallet-token"');
    expect(html).not.toContain('href="/score"');
    expect(html).toContain('href="/bitcoin"');
  });

  it("does not auto-link ambiguous single-word token names", async () => {
    const html = await markdownToHtml("Gate.io may render a request, but that story should stay as text.");

    expect(html).not.toContain('href="/gatechain-token"');
    expect(html).not.toContain('href="/render-token"');
    expect(html).not.toContain('href="/request-network"');
    expect(html).not.toContain('href="/story-2"');
  });

  it("auto-links each indexable token destination at most once", async () => {
    const tokenName = "Artificial Superintelligence Alliance";
    const html = await markdownToHtml(
      `${tokenName} leads. ${tokenName} liquidity matters. ${tokenName} remains relevant.`,
    );
    const tokenLinks = html.match(/href="\/fetch-ai"/g) || [];

    expect(tokenLinks).toHaveLength(1);
  });

  it("caps automatic token links to three destinations per article", async () => {
    const html = await markdownToHtml([
      "Artificial Superintelligence Alliance",
      "Rootstock Infrastructure Framework",
      "World Liberty Financial",
      "BNB Attestation Service",
      "Fidelity Digital Dollar",
    ].join(" all appear alongside "));
    const autoLinks = html.match(/href="\/(?:fetch-ai|rif-token|world-liberty-financial|bas|fidelity-digital-dollar)"/g) || [];

    expect(autoLinks).toHaveLength(3);
  });

  it("does not auto-link an indexable destination that is already linked", async () => {
    const tokenName = "Artificial Superintelligence Alliance";
    const html = await markdownToHtml(
      `[${tokenName}](/fetch-ai) is prelinked. ${tokenName} appears again as explanatory text.`,
    );
    const tokenLinks = html.match(/href="\/fetch-ai"/g) || [];

    expect(tokenLinks).toHaveLength(1);
  });

  it("does not auto-link token names inside bare URLs", async () => {
    const html = await markdownToHtml(
      "https://example.com/Bitcoin/docs\n\nBitcoin appears in prose.",
    );

    expect(html).toContain('href="https://example.com/Bitcoin/docs"');
    expect(html).toContain('<a href="/bitcoin">Bitcoin</a> appears in prose.');
    expect(html.match(/href="\/bitcoin"/g) || []).toHaveLength(1);
  });

  it("does not auto-link token names inside inline code", async () => {
    const html = await markdownToHtml("`Bitcoin` is code. Bitcoin appears in prose.");

    expect(html).toContain("<code>Bitcoin</code>");
    expect(html).toContain('<a href="/bitcoin">Bitcoin</a> appears in prose.');
    expect(html.match(/href="\/bitcoin"/g) || []).toHaveLength(1);
  });

  it("does not auto-link token names inside fenced code", async () => {
    const html = await markdownToHtml(
      "```text\nBitcoin\n```\n\nBitcoin appears in prose.",
    );

    expect(html).toContain("<pre><code");
    expect(html).toContain("Bitcoin\n</code></pre>");
    expect(html).toContain('<a href="/bitcoin">Bitcoin</a> appears in prose.');
    expect(html.match(/href="\/bitcoin"/g) || []).toHaveLength(1);
  });

  it("unwraps rendered links to noindex and broken internal destinations", async () => {
    const html = await markdownToHtml(
      "[market cap](/cap-4), [watchlist](/watchlist), and [missing](/definitely-missing-route) stay text; [Bitcoin](/bitcoin) stays linked.",
    );

    expect(html).not.toContain('href="/cap-4"');
    expect(html).not.toContain('href="/watchlist"');
    expect(html).not.toContain('href="/definitely-missing-route"');
    expect(html).toContain('href="/bitcoin"');
  });

  it("does not turn user-authored masked-link sentinels into undefined text", async () => {
    const html = await markdownToHtml("This literal __MASKED_LINK_999__ marker should stay readable.");

    expect(html).toContain("MASKED_LINK_999");
    expect(html).not.toContain("undefined");
  });

  it("unwraps token article links when that article route is not exported", async () => {
    const html = await markdownToHtml(
      "[BTY price scenarios](/definitely-missing-tokenradar-token/price-prediction) should not point to a 404.",
    );

    expect(html).toContain("BTY price scenarios");
    expect(html).not.toContain('href="/definitely-missing-tokenradar-token/price-prediction"');
  });
});

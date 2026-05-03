import { describe, it, expect } from "vitest";
import { markdownToHtml } from "../src/lib/markdown";

describe("markdownToHtml", () => {
  it("converts basic markdown to HTML", async () => {
    const html = await markdownToHtml("## Hello World\n\nThis is a paragraph.");
    expect(html).toMatch(/<h2[^>]*>/);
    expect(html).toContain("Hello World");
    expect(html).toContain("<p>");
  });

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

  it("strips script tags via DOMPurify", async () => {
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

  it("auto-links repeated token mentions without missing the first occurrence", async () => {
    const tokenName = "Apollo Diversified Credit Securitize Fund";
    const html = await markdownToHtml(
      `${tokenName} leads. ${tokenName} liquidity matters. [${tokenName}](/apollo-diversified-credit-securitize-fund) is prelinked.`,
    );
    const tokenLinks = html.match(/href="\/apollo-diversified-credit-securitize-fund"/g) || [];

    expect(tokenLinks.length).toBeGreaterThanOrEqual(3);
  });
});

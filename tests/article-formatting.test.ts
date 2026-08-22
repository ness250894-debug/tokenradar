import { describe, expect, it } from "vitest";
import { hydrateLiveMarketSummaryFields, normalizeArticleMarkdown } from "../src/lib/article-formatting";
import { getArticleFaqs } from "../src/lib/content-loader";

describe("normalizeArticleMarkdown", () => {
  it("splits inline FAQ headings and joins split dates", () => {
    const normalized = normalizeArticleMarkdown(
      "## FAQ **What is it?**\nAnswer\n\nATH was reached on March 23,\n\n2026.",
    );

    expect(normalized).toContain("## FAQ\n\n**What is it?**");
    expect(normalized).toContain("March 23, 2026");
  });

  it("repairs malformed nested internal links", () => {
    const normalized = normalizeArticleMarkdown(
      "Compare [[Ethena](/ethena) USDe](/[ethena](/ethena)-usde) here.",
    );

    expect(normalized).toContain("[Ethena USDe](/ethena)");
  });

  it("does not split valid title-case H2 headings", () => {
    const normalized = normalizeArticleMarkdown(
      "## Top Exchange Options for BTC\n\nCompare venue availability before depositing funds.",
    );

    expect(normalized).toContain("## Top Exchange Options for BTC");
    expect(normalized).not.toContain("## Top\n\nExchange Options for BTC");
  });

  it("joins split FAQ question headings", () => {
    const normalized = normalizeArticleMarkdown(
      "## FAQ\n\n## What is 0x\n\nProtocol primarily used for?\n0x Protocol provides swap infrastructure.",
    );

    expect(normalized).toContain("## What is 0x Protocol primarily used for?");
    expect(normalized).not.toContain("## What is 0x\n\nProtocol");
  });

  it("keeps numbered FAQ items split from the FAQ heading and disclaimer", () => {
    const normalized = normalizeArticleMarkdown(
      "## FAQ 1. Why does it matter? It matters.\n\n2. What next? Monitor it. --- *Disclaimer.*",
    );

    expect(normalized).toContain("## FAQ\n\n1. Why does it matter? It matters.");
    expect(normalized).toContain("2. What next? Monitor it.\n\n---\n\n*Disclaimer.*");
  });

  it("joins dangling numeric sentences that would otherwise become ordered lists", () => {
    const normalized = normalizeArticleMarkdown(
      "The project carries a medium risk assessment score of\n\n4. By fostering deep integrations, it keeps building.",
    );

    expect(normalized).toContain(
      "The project carries a medium risk assessment score of 4. By fostering deep integrations, it keeps building.",
    );
  });

  it("repairs malformed escaped table blocks", () => {
    const normalized = normalizeArticleMarkdown(
      "| Metric | Value |\n|\n---\n| Price | $1.00 |\n| Volume | $1,000 |",
    );

    expect(normalized).toContain("| Metric | Value |\n| :--- | :--- |\n| Price | $1.00 |");
    expect(normalized).not.toContain("\n|\n---");
  });

  it("removes exact repeated local-template paragraphs", () => {
    const paragraph =
      "This repeated local template paragraph explains liquidity, market cap, custody, tax records, and volume context without adding token-specific evidence.";
    const normalized = normalizeArticleMarkdown(`${paragraph}\n\n${paragraph}\n\nA final unique paragraph stays in place.`);

    expect(normalized.match(/repeated local template paragraph/g)?.length).toBe(1);
    expect(normalized).toContain("A final unique paragraph stays in place.");
  });

  it("uses neutral recovery-room language instead of forecast-like upside claims", () => {
    const normalized = normalizeArticleMarkdown(
      "The growth potential index is 80/100. This is a high growth potential asset, while another has limited upside.",
    );

    expect(normalized).toContain("recovery-room signal is 80/100");
    expect(normalized).toContain("high recovery-room signal asset");
    expect(normalized).toContain("limited recovery-room signal");
    expect(normalized).not.toMatch(/growth potential|limited upside/i);
  });
});

describe("getArticleFaqs", () => {
  it("extracts bold-question FAQs after normalization", () => {
    const faqs = getArticleFaqs("## FAQ **What is it?**\nIt is a token.");

    expect(faqs).toEqual([
      {
        question: "What is it?",
        answer: "It is a token.",
      },
    ]);
  });

  it("extracts numbered FAQs", () => {
    const faqs = getArticleFaqs("## FAQ\n1. What is it? It is a token.\n2. Why care? For testing.");

    expect(faqs[0]?.question).toBe("What is it?");
    expect(faqs[0]?.answer).toContain("It is a token.");
    expect(faqs[1]?.question).toBe("Why care?");
  });

  it("extracts numbered FAQs when the heading and first item share a line", () => {
    const faqs = getArticleFaqs("## FAQ 1. Why does it matter? It matters.\n2. What next? Monitor it.");

    expect(faqs[0]?.question).toBe("Why does it matter?");
    expect(faqs[0]?.answer).toContain("It matters.");
    expect(faqs[1]?.question).toBe("What next?");
  });
});

describe("hydrateLiveMarketSummaryFields", () => {
  it("replaces only standard summary-table market fields", () => {
    const content = [
      "Data snapshot date: May 13, 2026.",
      "",
      "| Metric | Value |",
      "| :--- | :--- |",
      "| Price | $1.23 |",
      "| Market [Cap](/cap-4) | $50M |",
      "| 24h Change | +4.50% |",
      "| Market Rank | #42 |",
      "| ATH Distance | -60% |",
    ].join("\n");

    const result = hydrateLiveMarketSummaryFields(content);
    expect(result).toContain("Article evidence snapshot: May 13, 2026.");
    expect(result).toContain(
      "Narrative figures and statements below refer to that evidence date unless explicitly labeled live.",
    );
    expect(result).toContain("| Price | {{LIVE_PRICE}} |");
    expect(result).toContain("| Market [Cap](/cap-4) | {{LIVE_MARKET_CAP}} |");
    expect(result).toContain("| 24h Change | {{LIVE_24H_CHANGE}} |");
    expect(result).toContain("| Market Rank | {{LIVE_RANK}} |");
    expect(result).toContain("| ATH Distance | -60% |");
  });
});

import { describe, expect, it } from "vitest";
import { normalizeArticleMarkdown } from "../src/lib/article-formatting";
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

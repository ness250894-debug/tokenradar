import { describe, expect, it } from "vitest";
import { parseFaqsFromMarkdown } from "../src/lib/seo";

describe("parseFaqsFromMarkdown utility", () => {
  it("returns empty array for empty or undefined content", () => {
    expect(parseFaqsFromMarkdown(undefined)).toEqual([]);
    expect(parseFaqsFromMarkdown("")).toEqual([]);
  });

  it("returns empty array if no FAQ section exists", () => {
    const markdown = `
# Some Token Overview

This is some content without any FAQ section.
`;
    expect(parseFaqsFromMarkdown(markdown)).toEqual([]);
  });

  it("correctly extracts FAQs when ## FAQ section is present", () => {
    const markdown = `
# Token Overview

Some text.

## FAQ

**What is TokenRadar?**

TokenRadar is a real-time cryptocurrency research and tracking platform.

**How does it work?**

It works by aggregating high-fidelity market data from multiple endpoints.

---
*Disclaimer: This is not financial advice.*
`;

    const expected = [
      {
        question: "What is TokenRadar?",
        answer: "TokenRadar is a real-time cryptocurrency research and tracking platform.",
      },
      {
        question: "How does it work?",
        answer: "It works by aggregating high-fidelity market data from multiple endpoints.",
      },
    ];

    expect(parseFaqsFromMarkdown(markdown)).toEqual(expected);
  });

  it("handles multi-paragraph answers and strips extra whitespace", () => {
    const markdown = `
## FAQ

**How do I buy this token?**

You can buy this token on Uniswap.
Simply connect your wallet.

Alternatively, you can buy it on Coinbase.

**Is it safe?**

Yes, but always DYOR.
`;

    const expected = [
      {
        question: "How do I buy this token?",
        answer: "You can buy this token on Uniswap. Simply connect your wallet. Alternatively, you can buy it on Coinbase.",
      },
      {
        question: "Is it safe?",
        answer: "Yes, but always DYOR.",
      },
    ];

    expect(parseFaqsFromMarkdown(markdown)).toEqual(expected);
  });

  it("converts Markdown links and inline emphasis to plain JSON-LD answer text", () => {
    const markdown = `
## FAQ

**How can I verify the token?**

Review the [official documentation](https://example.com/docs), **confirm** the *network*, and compare the \`contract address\`.
`;

    expect(parseFaqsFromMarkdown(markdown)).toEqual([
      {
        question: "How can I verify the token?",
        answer: "Review the official documentation, confirm the network, and compare the contract address.",
      },
    ]);
  });

  it("stops parsing at Disclaimer or next header", () => {
    const markdown = `
## FAQ

**What is 0x?**

0x is an open protocol.

---
*Disclaimer: Not advice.*
`;

    const expected = [
      {
        question: "What is 0x?",
        answer: "0x is an open protocol.",
      },
    ];

    expect(parseFaqsFromMarkdown(markdown)).toEqual(expected);
  });

  it("stops parsing at another section header", () => {
    const markdown = `
## FAQ

**What is 0x?**

0x is an open protocol.

## Next Section

**This should not be matched?**
No it should not.
`;

    const expected = [
      {
        question: "What is 0x?",
        answer: "0x is an open protocol.",
      },
    ];

    expect(parseFaqsFromMarkdown(markdown)).toEqual(expected);
  });
});

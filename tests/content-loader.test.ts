import { describe, it, expect } from "vitest";
import { formatPrice, formatCompact, formatSupply, getArticleFaqs } from "../src/lib/content-loader";

describe("formatPrice", () => {
  it("formats large prices (>= 1000) without decimals", () => {
    expect(formatPrice(50000)).toMatch(/^\$50,?000$/);
  });

  it("formats medium prices (>= 1) with 2 decimals", () => {
    expect(formatPrice(42.567)).toBe("$42.57");
  });

  it("formats small prices (>= 0.01) with 4 decimals", () => {
    expect(formatPrice(0.0567)).toBe("$0.0567");
  });

  it("formats micro prices (< 0.01) with 6 decimals", () => {
    expect(formatPrice(0.000456)).toBe("$0.000456");
  });

  it("handles zero", () => {
    expect(formatPrice(0)).toBe("$0.000000");
  });

  it("handles undefined", () => {
    expect(formatPrice(undefined)).toBe("$0.00");
  });

  it("handles null", () => {
    expect(formatPrice(null)).toBe("$0.00");
  });
});

describe("formatCompact", () => {
  it("formats trillions", () => {
    expect(formatCompact(2.5e12)).toBe("$2.50T");
  });

  it("formats billions", () => {
    expect(formatCompact(1.23e9)).toBe("$1.23B");
  });

  it("formats millions", () => {
    expect(formatCompact(456e6)).toBe("$456.00M");
  });

  it("formats thousands", () => {
    expect(formatCompact(78000)).toBe("$78.00K");
  });

  it("formats small values", () => {
    expect(formatCompact(42.5)).toBe("$42.50");
  });

  it("handles null", () => {
    expect(formatCompact(null)).toBe("$0.00");
  });
});

describe("formatSupply", () => {
  it("formats billions", () => {
    expect(formatSupply(21e9)).toBe("21.00B");
  });

  it("formats millions", () => {
    expect(formatSupply(100e6)).toBe("100.00M");
  });

  it("formats thousands", () => {
    expect(formatSupply(5000)).toBe("5K");
  });

  it("formats small values", () => {
    expect(formatSupply(42)).toBe("42");
  });

  it("handles null", () => {
    expect(formatSupply(null)).toBe("0");
  });
});

describe("getArticleFaqs", () => {
  it("parses inline FAQ headings and numbered question formats after normalization", () => {
    const faqs = getArticleFaqs(
      [
        "## FAQ 1. Is Bitcoin risky?",
        "Bitcoin risk depends on time horizon.",
        "",
        "2. Can Bitcoin go to zero?",
        "It is possible, but liquidity and adoption reduce that probability.",
      ].join("\n"),
    );

    expect(faqs).toEqual([
      {
        question: "Is Bitcoin risky?",
        answer: "Bitcoin risk depends on time horizon.",
      },
      {
        question: "Can Bitcoin go to zero?",
        answer: "It is possible, but liquidity and adoption reduce that probability.",
      },
    ]);
  });
});

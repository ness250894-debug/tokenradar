import { describe, it, expect } from "vitest";
import { stripHtmlForX, truncateForX } from "../src/lib/x-client";

describe("stripHtmlForX", () => {
  it("converts <a> tags to text: url format", () => {
    const html = '<a href="https://example.com">Click here</a>';
    expect(stripHtmlForX(html)).toBe("Click here: https://example.com");
  });

  it("strips <b> and <i> tags", () => {
    const html = "<b>Bold</b> and <i>italic</i>";
    expect(stripHtmlForX(html)).toBe("Bold and italic");
  });

  it("handles multiple links", () => {
    const html = '<a href="https://a.com">A</a> | <a href="https://b.com">B</a>';
    expect(stripHtmlForX(html)).toBe("A: https://a.com | B: https://b.com");
  });

  it("handles plain text passthrough", () => {
    expect(stripHtmlForX("No HTML here")).toBe("No HTML here");
  });
});

describe("truncateForX", () => {
  it("returns text unchanged if under 280 chars", () => {
    const short = "Hello world";
    expect(truncateForX(short)).toBe(short);
  });

  it("returns text unchanged at exactly 280 chars", () => {
    const exact = "A".repeat(280);
    expect(truncateForX(exact)).toBe(exact);
  });

  it("truncates long text and ends with ...", () => {
    const long = Array(20).fill("This is a test line that is fairly long").join("\n");
    const result = truncateForX(long);
    expect(result.length).toBeLessThanOrEqual(280);
    expect(result).toMatch(/\.\.\.$/);
  });

  it("preserves header and footer lines", () => {
    const lines = [
      "🚀 HEADER LINE 1",
      "💰 HEADER LINE 2",
      "📊 HEADER LINE 3",
      "STAT LINE 4",
      "MIDDLE 1",
      "MIDDLE 2",
      "MIDDLE 3",
      "MIDDLE 4",
      "🔗 FOOTER 1",
      "🐦 FOOTER 2",
      "👥 FOOTER 3",
      "#HASHTAG 4",
      "LAST FOOTER 5",
    ];
    const text = lines.join("\n");
    const result = truncateForX(text);
    // Should preserve header lines
    expect(result).toContain("HEADER LINE 1");
    // Should preserve footer lines
    expect(result).toContain("LAST FOOTER 5");
  });
});

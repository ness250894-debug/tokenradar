import { describe, expect, it } from "vitest";
import { formatPrice } from "../src/lib/formatters";

describe("formatPrice edge cases", () => {
  it("returns N/A for non-finite numbers", () => {
    expect(formatPrice(Number.NaN)).toBe("N/A");
    expect(formatPrice(Number.POSITIVE_INFINITY)).toBe("N/A");
    expect(formatPrice(Number.NEGATIVE_INFINITY)).toBe("N/A");
  });
});

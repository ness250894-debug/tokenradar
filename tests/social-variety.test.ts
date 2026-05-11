import { describe, expect, it } from "vitest";
import { formatVariantPromptLine, getSocialContentVariant } from "../src/lib/social-variety";

describe("social content variants", () => {
  it("is deterministic for the same date, platform, and seed", () => {
    const date = new Date("2026-05-11T00:00:00.000Z");
    const first = getSocialContentVariant("x", ["bitcoin", "top-gainer"], date);
    const second = getSocialContentVariant("x", ["bitcoin", "top-gainer"], date);

    expect(second).toEqual(first);
  });

  it("returns a usable prompt line", () => {
    const variant = getSocialContentVariant("instagram-carousel", ["2026-05-11"], new Date("2026-05-11T00:00:00.000Z"));
    const line = formatVariantPromptLine("instagram-carousel", variant);

    expect(line).toContain("instagram-carousel:");
    expect(line).toContain(variant.label);
    expect(line.length).toBeGreaterThan(40);
  });
});

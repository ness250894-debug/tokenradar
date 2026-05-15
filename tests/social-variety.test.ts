import { describe, expect, it } from "vitest";
import {
  PLATFORM_VARIANTS,
  formatVariantPromptLine,
  getSocialContentVariant,
  selectSocialContentVariant,
  selectSocialContentVariantsForSlots,
} from "../src/lib/social-variety";

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

  it("avoids recently used variants when eligible variants remain", () => {
    const used = PLATFORM_VARIANTS.x.slice(0, -1).map((variant) => variant.key);
    const variant = selectSocialContentVariant({
      platform: "x",
      usedVariantKeys: used,
      seedParts: ["2026-05-15", "bitcoin", "market-update"],
      date: new Date("2026-05-15T00:00:00.000Z"),
    });

    expect(variant.key).toBe(PLATFORM_VARIANTS.x[PLATFORM_VARIANTS.x.length - 1].key);
  });

  it("falls back to a valid variant when the cooldown pool is exhausted", () => {
    const used = PLATFORM_VARIANTS.telegram.map((variant) => variant.key);
    const variant = selectSocialContentVariant({
      platform: "telegram",
      usedVariantKeys: used,
      seedParts: ["2026-05-15", "ethereum"],
      date: new Date("2026-05-15T00:00:00.000Z"),
    });

    expect(PLATFORM_VARIANTS.telegram.map((candidate) => candidate.key)).toContain(variant.key);
  });

  it("selects variants for multiple slots with platform-specific histories", () => {
    const selections = selectSocialContentVariantsForSlots(["telegram", "x"] as const, {
      getPlatform: (slot) => slot,
      getUsedVariantKeys: (slot) => slot === "telegram" ? [PLATFORM_VARIANTS.telegram[0].key] : [],
      getSeedParts: (slot) => ["2026-05-15", slot, "solana"],
      date: new Date("2026-05-15T00:00:00.000Z"),
    });

    expect(selections.get("telegram")?.key).not.toBe(PLATFORM_VARIANTS.telegram[0].key);
    expect(selections.get("x")?.key).toBeTruthy();
  });
});

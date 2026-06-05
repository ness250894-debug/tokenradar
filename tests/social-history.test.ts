import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import {
  getRecentPlatformTexts,
  getRecentSocialArchetypeKeys,
  getRecentSocialCtaFamilies,
  getRecentSocialHookFamilies,
  getRecentSocialVariantKeys,
} from "../scripts/lib/social-history";

function makeDataDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-social-history-"));
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe("social variant history", () => {
  it("reads recent variant keys by platform and surface", () => {
    const dataDir = makeDataDir();

    writeJson(path.join(dataDir, "posted", "2026-05-14", "bitcoin-x.json"), {
      platform: "x",
      variantKey: "risk_filter",
      variantSurface: "market-update",
    });
    writeJson(path.join(dataDir, "posted", "2026-05-14", "daily-threads-text.json"), {
      variantKey: "regime_prompt",
      variantSurface: "threads-text",
    });
    writeJson(path.join(dataDir, "posted", "2026-05-10", "old-x.json"), {
      platform: "x",
      variantKey: "watchlist_signal",
      variantSurface: "market-update",
    });

    const keys = getRecentSocialVariantKeys(
      dataDir,
      "x",
      1,
      new Date("2026-05-15T12:00:00.000Z"),
      "market-update",
    );

    expect(keys).toEqual(new Set(["risk_filter"]));
  });

  it("supports legacy Instagram movers variant fields", () => {
    const dataDir = makeDataDir();

    writeJson(path.join(dataDir, "posted", "2026-05-15", "daily-instagram-movers.json"), {
      variant: "rotation_radar",
    });

    const keys = getRecentSocialVariantKeys(
      dataDir,
      "instagram-carousel",
      3,
      new Date("2026-05-15T12:00:00.000Z"),
      "instagram-carousel",
    );

    expect(keys).toEqual(new Set(["rotation_radar"]));
  });

  it("reads rich archetype metadata and nested video text", () => {
    const dataDir = makeDataDir();
    const now = new Date("2026-06-05T12:00:00.000Z");

    writeJson(path.join(dataDir, "posted", "2026-06-01", "bitcoin-x.json"), {
      platform: "x",
      variantKey: "risk_filter",
      archetypeKey: "risk_lab",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
      variantSurface: "market-update",
      xText: "$BTC is not interesting because it moved. It is interesting if volume holds. What invalidates it first? #Crypto",
    });
    writeJson(path.join(dataDir, "posted_video", "2026-06-02", "daily-video.json"), {
      tokenId: "avalanche-2",
      platforms: {
        tiktok: {
          postedAt: "2026-06-02T18:00:00.000Z",
          archetypeKey: "risk_lab",
          hookFamily: "risk-first",
          ctaFamily: "reply-with-filter",
          tiktokCaption: "avax got attention today\nrisk check first\nwhat's your read?\n@tokenradarco #AVAX #Crypto #TokenRadar",
        },
      },
    });

    expect(getRecentSocialArchetypeKeys(dataDir, "x", 7, now, "market-update")).toEqual(new Set(["risk_lab"]));
    expect(getRecentSocialHookFamilies(dataDir, "x", 7, now)).toEqual(new Set(["risk-first"]));
    expect(getRecentSocialCtaFamilies(dataDir, "tiktok", 7, now)).toEqual(new Set(["reply-with-filter"]));
    expect(getRecentPlatformTexts(dataDir, "tiktok", 7, now)[0]).toContain("avax got attention");
  });
});

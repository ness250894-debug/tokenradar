import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { describe, expect, it } from "vitest";

import { buildMarketSocialPlan } from "../scripts/lib/market-social-plan";

function makeDataDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tokenradar-market-plan-"));
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe("market social plan", () => {
  it("selects an archetype and variant that respect recent history", () => {
    const dataDir = makeDataDir();
    writeJson(path.join(dataDir, "posted", "2026-06-04", "bitcoin-x.json"), {
      platform: "x",
      variantSurface: "market-update",
      variantKey: "risk_filter",
      archetypeKey: "risk_lab",
      hookFamily: "risk-first",
      ctaFamily: "name-invalidation",
    });

    const plan = buildMarketSocialPlan({
      dataDir,
      platform: "x",
      today: "2026-06-05",
      tokenId: "ethereum",
      reason: "top-gainer",
      date: new Date("2026-06-05T12:00:00.000Z"),
    });

    expect(plan.surface).toBe("market-update");
    expect(plan.variant.key).not.toBe("risk_filter");
    expect(plan.archetype.key).not.toBe("risk_lab");
    expect(plan.archetype.key).not.toBe("two_token_comparison");
    expect(plan.archetype.key).not.toBe("watchlist_shortlist");
    expect(plan.archetype.key).not.toBe("poll_result_recap");
    expect(plan.archetype.key).not.toBe("weekly_scoreboard");
    expect(plan.hookFamily).toBe(plan.archetype.hookFamily);
    expect(plan.ctaFamily).toBe(plan.archetype.ctaFamily);
  });
});

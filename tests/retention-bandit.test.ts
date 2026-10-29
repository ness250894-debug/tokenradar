import { describe, expect, it } from "vitest";

import {
  calculateArmReward,
  recordArmFeedback,
  selectBanditArm,
  type ArmPerformance,
} from "../src/lib/retention-bandit";

describe("retention bandit for video format & visual selection", () => {
  it("calculates reward with 70% retention completion weight and 30% view scaling", () => {
    // 100% completion + 1000 views = 0.7 + 0.3 = 1.0
    expect(calculateArmReward(1000, 100)).toBe(1.0);

    // 50% completion + 0 views = 0.5 * 0.7 = 0.35
    expect(calculateArmReward(0, 50)).toBe(0.35);

    // 80% completion + 500 views = (0.8 * 0.7) + (0.5 * 0.3) = 0.56 + 0.15 = 0.71
    expect(calculateArmReward(500, 80)).toBe(0.71);
  });

  it("records arm performance feedback and maintains moving averages", () => {
    const stats = new Map<string, ArmPerformance>();
    recordArmFeedback(stats, "watchlist_battle", 400, 75);

    const arm1 = stats.get("watchlist_battle");
    expect(arm1).toBeDefined();
    expect(arm1?.impressions).toBe(1);
    expect(arm1?.totalViews).toBe(400);
    expect(arm1?.avgCompletionPercentage).toBe(75);

    // Record second run: 600 views, 85% completion
    recordArmFeedback(stats, "watchlist_battle", 600, 85);
    const arm2 = stats.get("watchlist_battle");
    expect(arm2?.impressions).toBe(2);
    expect(arm2?.totalViews).toBe(1000);
    expect(arm2?.avgCompletionPercentage).toBe(80); // (75 + 85) / 2
  });

  it("falls back deterministically on cold start when no stats are available", () => {
    const candidates = [
      { key: "breakout_watch" },
      { key: "watchlist_battle" },
      { key: "contrarian_signal" },
    ];

    const result1 = selectBanditArm(candidates, { seed: "2026-05-18:solana:run1" });
    const result2 = selectBanditArm(candidates, { seed: "2026-05-18:solana:run1" });

    expect(result1.strategy).toBe("deterministic-fallback");
    expect(result1.selected.key).toBe(result2.selected.key);
  });

  it("exploits the highest performing arm when sufficient impressions exist", () => {
    const candidates = [
      { key: "low_retention_arm" },
      { key: "high_retention_arm" },
    ];

    const stats = new Map<string, ArmPerformance>();
    // Arm 1: 50 impressions, 15% retention (poor performer)
    stats.set("low_retention_arm", {
      armKey: "low_retention_arm",
      impressions: 50,
      totalViews: 5000,
      avgCompletionPercentage: 15,
      totalRewardScore: 50 * calculateArmReward(100, 15),
    });

    // Arm 2: 50 impressions, 82% retention (high performer)
    stats.set("high_retention_arm", {
      armKey: "high_retention_arm",
      impressions: 50,
      totalViews: 25000,
      avgCompletionPercentage: 82,
      totalRewardScore: 50 * calculateArmReward(500, 82),
    });

    const result = selectBanditArm(candidates, { stats });
    expect(result.strategy).toBe("exploit");
    expect(result.selected.key).toBe("high_retention_arm");
  });

  it("explores unvisited candidate arms when other arms have been observed", () => {
    const candidates = [
      { key: "frequently_tested" },
      { key: "brand_new_format" },
    ];

    const stats = new Map<string, ArmPerformance>();
    // 20 impressions on the tested arm
    stats.set("frequently_tested", {
      armKey: "frequently_tested",
      impressions: 20,
      totalViews: 4000,
      avgCompletionPercentage: 50,
      totalRewardScore: 20 * calculateArmReward(200, 50),
    });
    // "brand_new_format" has 0 impressions

    const result = selectBanditArm(candidates, { stats });
    expect(result.strategy).toBe("explore");
    expect(result.selected.key).toBe("brand_new_format");
  });
});


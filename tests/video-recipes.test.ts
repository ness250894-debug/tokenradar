import { describe, expect, it } from "vitest";
import {
  VIDEO_CHART_PACKS,
  VIDEO_LAYOUT_PACKS,
  VIDEO_PACING_PROFILES,
  VIDEO_SCENE_ORDERS,
  getVideoSceneDurations,
  resolveVideoVisualRecipe,
  selectVideoVisualRecipe,
} from "../src/lib/video-recipes";

describe("video visual recipes", () => {
  it("selects deterministic recipes from the same seed", () => {
    const seedParts = ["2026-05-15", "youtube", "avalanche-2", "risk_alert"];
    const first = selectVideoVisualRecipe({ seedParts });
    const second = selectVideoVisualRecipe({ seedParts });

    expect(second).toEqual(first);
  });

  it("avoids recently used recipe keys when alternatives exist", () => {
    const seedParts = ["2026-05-15", "instagram", "avalanche-2", "momentum_cooling"];
    const used = selectVideoVisualRecipe({ seedParts });
    const next = selectVideoVisualRecipe({ seedParts, usedRecipeKeys: [used.key] });

    expect(next.key).not.toBe(used.key);
  });

  it("keeps scene orders complete and pacing at exactly 30 seconds", () => {
    const recipe = selectVideoVisualRecipe({
      seedParts: ["2026-05-15", "tiktok", "avalanche-2", "sector_rotation"],
    });
    const durations = getVideoSceneDurations(recipe);
    const sceneSet = new Set(recipe.sceneOrder);

    expect(recipe.sceneOrder).toHaveLength(5);
    expect(sceneSet).toEqual(new Set(["hook", "reveal", "metrics", "context", "verdict"]));
    expect(recipe.sceneOrder[0]).toBe("hook");
    expect(recipe.sceneOrder[recipe.sceneOrder.length - 1]).toBe("verdict");
    expect(Object.values(durations).reduce((total, value) => total + value, 0)).toBe(900);
  });

  it("normalizes malformed recipe input to a safe default", () => {
    const resolved = resolveVideoVisualRecipe({
      key: "",
      sceneOrder: ["hook"],
      layoutPack: "unknown",
      chartPack: "unknown",
      motionPack: "unknown",
      backgroundSystem: "unknown",
      colorTheme: "unknown",
      pacingProfile: "unknown",
    } as never);

    expect(VIDEO_SCENE_ORDERS).toContainEqual(resolved.sceneOrder);
    expect(VIDEO_LAYOUT_PACKS).toContain(resolved.layoutPack);
    expect(VIDEO_CHART_PACKS).toContain(resolved.chartPack);
    expect(Object.keys(VIDEO_PACING_PROFILES)).toContain(resolved.pacingProfile);
  });

  it("handles incomplete persisted recipe data", () => {
    const resolved = resolveVideoVisualRecipe({
      key: "legacy-partial",
      layoutPack: "center_card",
      chartPack: "spotlight_count",
      motionPack: "snap_zoom",
      backgroundSystem: "radar_grid",
      colorTheme: "electric_indigo",
      pacingProfile: "standard",
    } as never);

    expect(VIDEO_SCENE_ORDERS).toContainEqual(resolved.sceneOrder);
    expect(resolved.layoutPack).toBe("center_card");
  });
});

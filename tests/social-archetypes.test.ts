import { describe, expect, it } from "vitest";

import {
  SOCIAL_ARCHETYPES,
  formatArchetypePromptLine,
  isSocialArchetypeEligibleForAutomation,
  resolveSocialArchetype,
  selectSocialArchetype,
} from "../src/lib/social-archetypes";

describe("social content archetypes", () => {
  it("keeps enough editorial shapes to avoid ticker repetition", () => {
    expect(SOCIAL_ARCHETYPES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(SOCIAL_ARCHETYPES.map((item) => item.key)).size).toBe(SOCIAL_ARCHETYPES.length);
  });

  it("selects only archetypes compatible with a platform", () => {
    const selected = selectSocialArchetype({
      platform: "tiktok",
      seedParts: ["2026-06-05", "avalanche-2", "video"],
      date: new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(selected.platforms).toContain("tiktok");
    expect(selected.promptInstruction.length).toBeGreaterThan(40);
  });

  it("avoids recently used archetypes when candidates remain", () => {
    const selected = selectSocialArchetype({
      platform: "x",
      usedArchetypeKeys: ["single_token_snapshot", "two_token_comparison", "risk_lab"],
      seedParts: ["2026-06-05", "bitcoin", "market-update"],
      date: new Date("2026-06-05T00:00:00.000Z"),
    });

    expect(["single_token_snapshot", "two_token_comparison", "risk_lab"]).not.toContain(selected.key);
  });

  it("keeps poll-result copy out of automation until verified results are supplied", () => {
    const recap = SOCIAL_ARCHETYPES.find((archetype) => archetype.key === "poll_result_recap");
    expect(recap?.requiresVerifiedContext).toBe("poll-result");
    expect(recap && isSocialArchetypeEligibleForAutomation(recap, "instagram")).toBe(false);
    expect(selectSocialArchetype({
      platform: "instagram",
      allowedArchetypeKeys: ["poll_result_recap"],
      seedParts: ["forced-poll-recap"],
      date: new Date("2026-08-24T00:00:00.000Z"),
    }).key).not.toBe("poll_result_recap");
    expect(resolveSocialArchetype("poll_result_recap", "telegram").key).not.toBe("poll_result_recap");
    expect(resolveSocialArchetype("poll_result_recap").key).not.toBe("poll_result_recap");
  });

  it("formats prompt instructions with hook and CTA families", () => {
    const selected = selectSocialArchetype({
      platform: "telegram",
      seedParts: ["2026-06-05", "solana"],
      date: new Date("2026-06-05T00:00:00.000Z"),
    });

    const line = formatArchetypePromptLine("telegram", selected);
    expect(line).toContain("telegram:");
    expect(line).toContain(selected.label);
    expect(line).toContain(selected.hookFamily);
    expect(line).toContain(selected.ctaFamily);
  });
});

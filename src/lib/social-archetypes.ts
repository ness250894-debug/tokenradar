import type { SocialVariantPlatform } from "./social-variety";

export type SocialArchetypeKey =
  | "single_token_snapshot"
  | "two_token_comparison"
  | "sector_rotation"
  | "risk_lab"
  | "watchlist_shortlist"
  | "myth_vs_data"
  | "poll_result_recap"
  | "weekly_scoreboard"
  | "data_quality_warning"
  | "how_to_read_metric"
  | "community_question"
  | "behind_the_radar";

export interface SocialContentArchetype {
  key: SocialArchetypeKey;
  label: string;
  platforms: SocialVariantPlatform[];
  angle: string;
  hookFamily: string;
  ctaFamily: string;
  promptInstruction: string;
}

export const SOCIAL_ARCHETYPES: SocialContentArchetype[] = [
  {
    key: "single_token_snapshot",
    label: "Single Token Snapshot",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "tiktok"],
    angle: "one token, one concise research read, one invalidation condition",
    hookFamily: "data-first",
    ctaFamily: "verify-the-read",
    promptInstruction:
      "Use one token as the subject, but avoid a raw price ticker format. Name the condition that would make the read less useful.",
  },
  {
    key: "two_token_comparison",
    label: "Two Token Comparison",
    platforms: ["telegram", "x", "instagram", "threads", "tiktok", "instagram-carousel"],
    angle: "compare two assets or two market reads instead of presenting one mover alone",
    hookFamily: "contrast",
    ctaFamily: "choose-the-filter",
    promptInstruction:
      "Frame the post around the contrast between two tokens, sectors, or risk profiles. Ask which filter matters more.",
  },
  {
    key: "sector_rotation",
    label: "Sector Rotation",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "instagram-carousel"],
    angle: "show where momentum is concentrating across a sector or narrative",
    hookFamily: "map-the-market",
    ctaFamily: "watch-the-rotation",
    promptInstruction:
      "Make the sector or narrative the main story. Use token data as evidence, not as a standalone promotion.",
  },
  {
    key: "risk_lab",
    label: "Risk Lab",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "tiktok", "instagram-carousel"],
    angle: "explain the risk filter before the upside case",
    hookFamily: "risk-first",
    ctaFamily: "name-invalidation",
    promptInstruction:
      "Lead with liquidity, volatility, concentration, or confirmation risk. The post should teach the audience what can go wrong.",
  },
  {
    key: "watchlist_shortlist",
    label: "Watchlist Shortlist",
    platforms: ["telegram", "x", "instagram", "threads", "instagram-carousel"],
    angle: "shortlist several candidates with a reason each",
    hookFamily: "curated-list",
    ctaFamily: "pick-next-review",
    promptInstruction:
      "Use a compact list. Each item needs a reason and a filter, not just a gain percentage.",
  },
  {
    key: "myth_vs_data",
    label: "Myth vs Data",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "tiktok"],
    angle: "separate a common crypto claim from the measurable data",
    hookFamily: "belief-check",
    ctaFamily: "challenge-the-read",
    promptInstruction:
      "Open with a claim people might believe, then test it against data. Do not dunk on projects or holders.",
  },
  {
    key: "poll_result_recap",
    label: "Poll Result Recap",
    platforms: ["telegram", "x", "threads", "instagram"],
    angle: "turn a previous community vote into a follow-up insight",
    hookFamily: "community-recap",
    ctaFamily: "next-vote",
    promptInstruction:
      "Reference the audience choice and explain what the data says next. The follow-up must feel like a loop, not a new cold post.",
  },
  {
    key: "weekly_scoreboard",
    label: "Weekly Scoreboard",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "instagram-carousel"],
    angle: "recap winners, laggards, and lessons from the week",
    hookFamily: "scoreboard",
    ctaFamily: "save-the-recap",
    promptInstruction:
      "Group the week into clear takeaways. Include at least one lesson about risk or confirmation.",
  },
  {
    key: "data_quality_warning",
    label: "Data Quality Warning",
    platforms: ["telegram", "x", "instagram", "threads", "tiktok"],
    angle: "warn about noisy data, thin liquidity, or misleading headline moves",
    hookFamily: "warning-label",
    ctaFamily: "check-the-source",
    promptInstruction:
      "Use the post to protect the reader from overreacting. Avoid fear language; be specific about the weak data signal.",
  },
  {
    key: "how_to_read_metric",
    label: "How To Read Metric",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "tiktok", "instagram-carousel"],
    angle: "teach one TokenRadar metric using a live example",
    hookFamily: "explain-the-metric",
    ctaFamily: "apply-the-framework",
    promptInstruction:
      "Make this educational. The token is an example for reading the metric, not the reason to trade.",
  },
  {
    key: "community_question",
    label: "Community Question",
    platforms: ["telegram", "x", "threads", "tiktok"],
    angle: "ask the audience to choose the next research filter or deep dive",
    hookFamily: "open-question",
    ctaFamily: "reply-with-filter",
    promptInstruction:
      "Ask a specific question that can be answered in replies or poll choices. Avoid vague engagement bait.",
  },
  {
    key: "behind_the_radar",
    label: "Behind The Radar",
    platforms: ["telegram", "x", "youtube", "instagram", "threads", "tiktok"],
    angle: "show how TokenRadar evaluates a setup or rejects a noisy one",
    hookFamily: "process-note",
    ctaFamily: "show-your-checklist",
    promptInstruction:
      "Reveal the research process. Mention a filter, constraint, or decision rule the system uses.",
  },
];

function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getSocialArchetypeByKey(key: string | undefined | null): SocialContentArchetype | undefined {
  if (!key) return undefined;
  return SOCIAL_ARCHETYPES.find((archetype) => archetype.key === key);
}

export function resolveSocialArchetype(
  archetype: SocialContentArchetype | string | undefined | null,
  platform?: SocialVariantPlatform,
): SocialContentArchetype {
  const resolved = typeof archetype === "string"
    ? getSocialArchetypeByKey(archetype)
    : archetype?.key
      ? getSocialArchetypeByKey(archetype.key) || archetype
      : undefined;

  if (resolved && (!platform || resolved.platforms.includes(platform))) return resolved;

  return selectSocialArchetype({
    platform: platform || "x",
    seedParts: ["fallback"],
  });
}

export function selectSocialArchetype(options: {
  platform: SocialVariantPlatform;
  seedParts?: Array<string | number | undefined | null>;
  date?: Date;
  usedArchetypeKeys?: Iterable<string>;
}): SocialContentArchetype {
  const { platform, date = new Date() } = options;
  const used = new Set(options.usedArchetypeKeys || []);
  const compatible = SOCIAL_ARCHETYPES.filter((archetype) => archetype.platforms.includes(platform));
  const candidates = compatible.filter((archetype) => !used.has(archetype.key));
  const eligible = candidates.length > 0 ? candidates : compatible;
  const seed = [
    platform,
    utcDateKey(date),
    ...(options.seedParts || []).filter((part) => part !== undefined && part !== null),
  ]
    .join(":")
    .toLowerCase();

  return eligible[stableHash(seed) % eligible.length];
}

export function formatArchetypePromptLine(
  platform: SocialVariantPlatform,
  archetype: SocialContentArchetype,
): string {
  return `${platform}: ${archetype.label} - ${archetype.angle}. Hook family: ${archetype.hookFamily}. CTA family: ${archetype.ctaFamily}. ${archetype.promptInstruction}`;
}

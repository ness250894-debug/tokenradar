export type SocialVariantPlatform =
  | "telegram"
  | "x"
  | "youtube"
  | "instagram"
  | "threads"
  | "tiktok"
  | "instagram-carousel";

export interface SocialContentVariant {
  key: string;
  label: string;
  angle: string;
  promptInstruction: string;
  captionIntro?: string;
  carouselTitle?: string;
  carouselSubtitle?: string;
  riskSlideTitle?: string;
  riskSlideLines?: string[];
}

export const PLATFORM_VARIANTS: Record<SocialVariantPlatform, SocialContentVariant[]> = {
  telegram: [
    {
      key: "setup_invalidation",
      label: "Setup + Invalidation",
      angle: "lead with the market setup, then make the invalidation condition concrete",
      promptInstruction:
        "Make the Setup line the strongest part of the post. The Risk / invalidation line must name a concrete condition that would weaken the read.",
    },
    {
      key: "risk_filter",
      label: "Risk Filter",
      angle: "treat the token as a candidate that must pass liquidity and confirmation filters",
      promptInstruction:
        "Frame the post around what would make the read higher quality. Mention volatility, liquidity, or follow-through as the filter.",
    },
    {
      key: "narrative_check",
      label: "Narrative Check",
      angle: "connect the token to the broader narrative or sector context",
      promptInstruction:
        "Use the Why it matters line to connect the setup to narrative, sector, or macro context without sounding promotional.",
    },
    {
      key: "follow_through",
      label: "Follow-through Watch",
      angle: "focus on whether the move has durable follow-through",
      promptInstruction:
        "Make the read about follow-through quality. Avoid hype; say what must stay valid for the read to remain relevant.",
    },
  ],
  x: [
    {
      key: "regime_question",
      label: "Regime Question",
      angle: "macro and sector context first, token second",
      promptInstruction:
        "Open with market regime or sector context, then connect it to the token. End with a question about whether the regime supports continuation.",
    },
    {
      key: "risk_filter",
      label: "Risk Filter",
      angle: "ask what would invalidate the move",
      promptInstruction:
        "Lead with risk, liquidity, or volatility quality. End with a question about what would invalidate the setup.",
    },
    {
      key: "mover_quality",
      label: "Mover Quality",
      angle: "judge whether the move is supported by data quality",
      promptInstruction:
        "Focus on move quality: price change, market cap, volume context if available, and whether the move deserves attention.",
    },
    {
      key: "watchlist_signal",
      label: "Watchlist Read",
      angle: "frame the post as a watchlist note, not a call",
      promptInstruction:
        "Write like a concise watchlist note. Make it clear the token is being monitored, not recommended.",
    },
    {
      key: "contrarian_tension",
      label: "Contrarian Tension",
      angle: "surface one tension in the data instead of only the bullish point",
      promptInstruction:
        "Open with the tension in the setup: strong move versus risk score, market cap, liquidity, or broader market context.",
    },
  ],
  youtube: [
    {
      key: "why_now",
      label: "Why Now",
      angle: "make the title and description answer why this token matters today",
      promptInstruction:
        "Title should feel like a timely watchlist alert. Description should explain why the token is being watched now.",
    },
    {
      key: "risk_first",
      label: "Risk First",
      angle: "lead with confirmation and invalidation instead of pure upside",
      promptInstruction:
        "Title may be direct, but description must include a risk or confirmation filter before the site line.",
    },
    {
      key: "data_vs_hype",
      label: "Data vs Hype",
      angle: "contrast market data with social attention",
      promptInstruction:
        "Position TokenRadar as separating data from hype. Avoid promotional claims and focus on measurable evidence.",
    },
  ],
  instagram: [
    {
      key: "research_card",
      label: "Research Card",
      angle: "caption reads like an analyst note paired with a carousel or Reel",
      promptInstruction:
        "Start with an analyst-style observation, then list the cleanest data points. Avoid generic curiosity bait.",
    },
    {
      key: "risk_breakdown",
      label: "Risk Breakdown",
      angle: "make the caption useful by naming the risk filter",
      promptInstruction:
        "Lead with what traders should verify: liquidity, volatility, confirmation, or catalyst quality.",
    },
    {
      key: "rotation_watch",
      label: "Rotation Watch",
      angle: "connect the token to sector or narrative rotation",
      promptInstruction:
        "Frame the caption around rotation and sector context. Use data points as evidence, not decoration.",
    },
    {
      key: "mover_quality",
      label: "Mover Quality",
      angle: "separate clean momentum from noisy pumps",
      promptInstruction:
        "Explain why the move is or is not high quality using price change, market cap, and risk context.",
    },
  ],
  threads: [
    {
      key: "invalidation_prompt",
      label: "Invalidation Prompt",
      angle: "conversation starts with what would break the setup",
      promptInstruction:
        "Write as a text-native Threads post. Ask a specific invalidation question after the data point.",
    },
    {
      key: "regime_prompt",
      label: "Regime Prompt",
      angle: "ask whether the broader market regime supports the setup",
      promptInstruction:
        "Connect the token to broader market conditions and ask for a view on regime fit.",
    },
    {
      key: "contrarian_prompt",
      label: "Contrarian Prompt",
      angle: "surface the tension in the data",
      promptInstruction:
        "Lead with the strongest tension in the data, then invite replies about what matters most.",
    },
    {
      key: "filter_prompt",
      label: "Filter Prompt",
      angle: "turn the post into a research filter discussion",
      promptInstruction:
        "Ask which filter should matter most before the token deserves more attention.",
    },
  ],
  tiktok: [
    {
      key: "cold_open",
      label: "Cold Open",
      angle: "first line feels like the spoken hook of a short",
      promptInstruction:
        "Start with a punchy spoken hook under 8 words, then support it with concrete data.",
    },
    {
      key: "risk_first",
      label: "Risk First",
      angle: "hook starts with what could go wrong",
      promptInstruction:
        "Start with the risk or confirmation filter before mentioning the move.",
    },
    {
      key: "watchlist_verdict",
      label: "Watchlist Read",
      angle: "caption gives a quick research read without giving trade advice",
      promptInstruction:
        "Make the caption feel like a watchlist research read. Avoid buy/sell language and keep it specific.",
    },
  ],
  "instagram-carousel": [
    {
      key: "momentum_watchlist",
      label: "Momentum Watchlist",
      angle: "rank the strongest movers, then explain what to verify",
      promptInstruction:
        "Carousel should feel like a momentum scan with a quality filter, not a leaderboard alone.",
      captionIntro: "Momentum Watchlist",
      carouselTitle: "Momentum Watchlist",
      carouselSubtitle: "Top 5 clean movers by 24h follow-through",
      riskSlideTitle: "Before You Chase",
      riskSlideLines: [
        "Confirm liquidity and spread quality.",
        "Check whether volume supports the move.",
        "Treat the scan as research, not a trade command.",
      ],
    },
    {
      key: "volatility_filter",
      label: "Volatility Filter",
      angle: "show the move, but make risk control the point",
      promptInstruction:
        "Carousel should emphasize that high 24h moves need confirmation and risk discipline.",
      captionIntro: "Volatility Filter",
      carouselTitle: "Volatility Filter",
      carouselSubtitle: "Big movers that still need confirmation",
      riskSlideTitle: "Risk Filter",
      riskSlideLines: [
        "Large 24h candles can fade quickly.",
        "Watch liquidity before trusting the read.",
        "Use invalidation rules before sizing any idea.",
      ],
    },
    {
      key: "rotation_radar",
      label: "Rotation Radar",
      angle: "treat the movers as a rotation map",
      promptInstruction:
        "Carousel should read like a sector or narrative rotation snapshot.",
      captionIntro: "Rotation Radar",
      carouselTitle: "Rotation Radar",
      carouselSubtitle: "Where daily momentum is concentrating now",
      riskSlideTitle: "Rotation Check",
      riskSlideLines: [
        "One green day is not a trend.",
        "Compare each move against sector strength.",
        "Follow-through matters more than the headline gain.",
      ],
    },
    {
      key: "quality_movers",
      label: "Quality Movers",
      angle: "separate data-backed moves from noisy pumps",
      promptInstruction:
        "Carousel should judge momentum quality using market cap, liquidity, and ranking context.",
      captionIntro: "Quality Movers",
      carouselTitle: "Quality Movers",
      carouselSubtitle: "Daily gainers with context beyond the candle",
      riskSlideTitle: "Quality Checklist",
      riskSlideLines: [
        "Market cap gives the move context.",
        "Volume quality matters more than raw percent gain.",
        "Avoid treating filtered movers as automatic entries.",
      ],
    },
  ],
};

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

export function getSocialContentVariant(
  platform: SocialVariantPlatform,
  seedParts: Array<string | number | undefined | null> = [],
  date: Date = new Date(),
): SocialContentVariant {
  return selectSocialContentVariant({ platform, seedParts, date });
}

export function getSocialContentVariantByKey(
  platform: SocialVariantPlatform,
  key: string | undefined | null,
): SocialContentVariant | undefined {
  if (!key) return undefined;
  return PLATFORM_VARIANTS[platform].find((variant) => variant.key === key);
}

export function resolveSocialContentVariant(
  platform: SocialVariantPlatform,
  variant: SocialContentVariant | string | undefined | null,
): SocialContentVariant {
  if (typeof variant === "string") {
    return getSocialContentVariantByKey(platform, variant) || PLATFORM_VARIANTS[platform][0];
  }

  if (variant?.key) {
    return getSocialContentVariantByKey(platform, variant.key) || variant;
  }

  return PLATFORM_VARIANTS[platform][0];
}

export function selectSocialContentVariant(options: {
  platform: SocialVariantPlatform;
  seedParts?: Array<string | number | undefined | null>;
  date?: Date;
  usedVariantKeys?: Iterable<string>;
}): SocialContentVariant {
  const { platform, date = new Date() } = options;
  const variants = PLATFORM_VARIANTS[platform];
  const used = new Set(options.usedVariantKeys || []);
  const candidates = variants.filter((variant) => !used.has(variant.key));
  const eligible = candidates.length > 0 ? candidates : variants;
  const seed = [
    platform,
    utcDateKey(date),
    ...(options.seedParts || []).filter((part) => part !== undefined && part !== null),
  ]
    .join(":")
    .toLowerCase();

  return eligible[stableHash(seed) % eligible.length];
}

export function selectSocialContentVariantsForSlots<TSlot extends string>(
  slots: readonly TSlot[],
  options: {
    getPlatform: (slot: TSlot) => SocialVariantPlatform;
    getUsedVariantKeys?: (slot: TSlot) => Iterable<string>;
    getSeedParts?: (slot: TSlot) => Array<string | number | undefined | null>;
    date?: Date;
  },
): Map<TSlot, SocialContentVariant> {
  const selected = new Map<TSlot, SocialContentVariant>();

  for (const slot of slots) {
    selected.set(
      slot,
      selectSocialContentVariant({
        platform: options.getPlatform(slot),
        usedVariantKeys: options.getUsedVariantKeys?.(slot),
        seedParts: options.getSeedParts?.(slot) || [slot],
        date: options.date,
      }),
    );
  }

  return selected;
}

export function formatVariantPromptLine(platform: SocialVariantPlatform, variant: SocialContentVariant): string {
  return `${platform}: ${variant.label} - ${variant.angle}. ${variant.promptInstruction}`;
}

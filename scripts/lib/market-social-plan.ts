import {
  MARKET_UPDATE_ARCHETYPE_COOLDOWN_DAYS,
  MARKET_UPDATE_VARIANT_COOLDOWN_DAYS,
} from "../../src/lib/config";
import {
  type SocialContentArchetype,
  selectSocialArchetype,
} from "../../src/lib/social-archetypes";
import {
  type SocialContentVariant,
  selectSocialContentVariant,
} from "../../src/lib/social-variety";
import {
  getRecentSocialArchetypeKeys,
  getRecentSocialVariantKeys,
} from "./social-history";

export interface MarketSocialPlanOptions {
  dataDir: string;
  platform: "telegram" | "x";
  today: string;
  tokenId: string;
  reason: string;
  date?: Date;
  slot?: string;
  surface?: "market-update";
}

export interface MarketSocialPlan {
  surface: "market-update";
  platform: "telegram" | "x";
  variant: SocialContentVariant;
  archetype: SocialContentArchetype;
  hookFamily: string;
  ctaFamily: string;
}

export function buildMarketSocialPlan(options: MarketSocialPlanOptions): MarketSocialPlan {
  const {
    dataDir,
    platform,
    today,
    tokenId,
    reason,
    date = new Date(),
    slot,
    surface = "market-update",
  } = options;
  const seedParts = [today, platform, tokenId, reason, slot, surface];
  const variant = selectSocialContentVariant({
    platform,
    usedVariantKeys: getRecentSocialVariantKeys(
      dataDir,
      platform,
      MARKET_UPDATE_VARIANT_COOLDOWN_DAYS,
      date,
      surface,
    ),
    seedParts,
    date,
  });
  const archetype = selectSocialArchetype({
    platform,
    usedArchetypeKeys: getRecentSocialArchetypeKeys(
      dataDir,
      platform,
      MARKET_UPDATE_ARCHETYPE_COOLDOWN_DAYS,
      date,
      surface,
    ),
    seedParts,
    date,
  });

  return {
    surface,
    platform,
    variant,
    archetype,
    hookFamily: archetype.hookFamily,
    ctaFamily: archetype.ctaFamily,
  };
}

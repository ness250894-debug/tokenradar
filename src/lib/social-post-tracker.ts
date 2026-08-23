import { readSocialUtmAttribution } from "./social-utm";

export type SocialPublishPlatform = "telegram" | "x" | "instagram" | "threads" | "youtube" | "tiktok";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue | undefined>;

export interface SocialTrackerInput {
  postedAt: string;
  platform: SocialPublishPlatform;
  requestedPlatform?: string;
  surface: string;
  tokenId?: string | null;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  reason?: string | null;
  archetypeKey?: string;
  archetypeLabel?: string;
  variantKey?: string;
  variantLabel?: string;
  hookFamily?: string;
  ctaFamily?: string;
  text?: string;
  externalId?: string | number;
  /** Intended destination generated for this creative, whether or not it was delivered. */
  plannedUrl?: string;
  /** Destination that was actually included in a successfully published post or follow-up. */
  publishedUrl?: string;
  /** @deprecated Use plannedUrl and publishedUrl so delivery is not overstated. */
  utmUrl?: string;
  formatKey?: string;
  visualRecipeKey?: string;
  deliveryMode?: string;
  topicTag?: string;
  nativePoll?: boolean;
  details?: JsonRecord;
}

const PLATFORM_TEXT_FIELD: Record<SocialPublishPlatform, string> = {
  telegram: "telegramText",
  x: "xText",
  instagram: "instagramCaption",
  threads: "threadsText",
  youtube: "youtubeDescription",
  tiktok: "tiktokCaption",
};

const PLATFORM_EXTERNAL_ID_FIELD: Partial<Record<SocialPublishPlatform, string>> = {
  telegram: "messageId",
  x: "tweetId",
  instagram: "postId",
  threads: "postId",
  youtube: "videoId",
  tiktok: "publishId",
};

function compactRecord(record: JsonRecord): Record<string, JsonValue> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as Record<string, JsonValue>;
}

export function buildSocialTrackerPayload(input: SocialTrackerInput): Record<string, JsonValue> {
  const platformTextField = PLATFORM_TEXT_FIELD[input.platform];
  const externalIdField = PLATFORM_EXTERNAL_ID_FIELD[input.platform];
  const plannedUrl = input.plannedUrl || input.utmUrl;
  const publishedUrl = input.publishedUrl;
  const attribution = readSocialUtmAttribution(publishedUrl || plannedUrl);
  const payload = compactRecord({
    postedAt: input.postedAt,
    platform: input.platform,
    requestedPlatform: input.requestedPlatform,
    reason: input.reason ?? undefined,
    tokenId: input.tokenId ?? undefined,
    tokenName: input.tokenName ?? undefined,
    tokenSymbol: input.tokenSymbol ?? undefined,
    variantKey: input.variantKey,
    variantLabel: input.variantLabel,
    variantPlatform: input.platform,
    variantSurface: input.surface,
    archetypeKey: input.archetypeKey,
    archetypeLabel: input.archetypeLabel,
    hookFamily: input.hookFamily,
    ctaFamily: input.ctaFamily,
    text: input.text,
    [platformTextField]: input.text,
    externalId: input.externalId,
    ...(externalIdField ? { [externalIdField]: input.externalId } : {}),
    plannedUrl,
    publishedUrl,
    utmUrl: plannedUrl,
    utmSource: attribution.source,
    utmMedium: attribution.medium,
    utmCampaign: attribution.campaign,
    utmContent: attribution.content,
    formatKey: input.formatKey,
    visualRecipeKey: input.visualRecipeKey,
    deliveryMode: input.deliveryMode,
    topicTag: input.topicTag,
    nativePoll: input.nativePoll,
    ...(input.details || {}),
  });

  return payload;
}

export function attachPublishedUrlToSocialTrackerPayload(
  payload: Record<string, unknown>,
  publishedUrl: string,
): Record<string, unknown> {
  const attribution = readSocialUtmAttribution(publishedUrl);
  const updated: Record<string, unknown> = { ...payload, publishedUrl };
  const attributionFields: Array<[string, string | undefined]> = [
    ["utmSource", attribution.source],
    ["utmMedium", attribution.medium],
    ["utmCampaign", attribution.campaign],
    ["utmContent", attribution.content],
  ];
  for (const [field, value] of attributionFields) {
    if (value === undefined) delete updated[field];
    else updated[field] = value;
  }
  return updated;
}

function compactUnknownRecord(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

export function buildSocialPostDetails(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const details: Record<string, unknown> = {
    tokenId: payload.tokenId,
    tokenName: payload.tokenName,
    tokenSymbol: payload.tokenSymbol,
    requestedPlatform: payload.requestedPlatform,
    reason: payload.reason,
    variantKey: payload.variantKey,
    variantLabel: payload.variantLabel,
    variantSurface: payload.variantSurface,
    archetypeKey: payload.archetypeKey,
    archetypeLabel: payload.archetypeLabel,
    hookFamily: payload.hookFamily,
    ctaFamily: payload.ctaFamily,
    text: payload.text,
    telegramText: payload.telegramText,
    xText: payload.xText,
    instagramCaption: payload.instagramCaption,
    threadsText: payload.threadsText,
    youtubeDescription: payload.youtubeDescription,
    tiktokCaption: payload.tiktokCaption,
    plannedUrl: payload.plannedUrl,
    publishedUrl: payload.publishedUrl,
    utmUrl: payload.utmUrl,
    utmSource: payload.utmSource,
    utmMedium: payload.utmMedium,
    utmCampaign: payload.utmCampaign,
    utmContent: payload.utmContent,
    formatKey: payload.formatKey,
    visualRecipeKey: payload.visualRecipeKey,
    deliveryMode: payload.deliveryMode,
    topicTag: payload.topicTag,
    nativePoll: payload.nativePoll,
    socialSlot: payload.socialSlot,
    marketDataSource: payload.marketDataSource,
    marketDataAsOf: payload.marketDataAsOf,
    metricsAsOf: payload.metricsAsOf,
    telegramFormat: payload.telegramFormat,
    pollType: payload.pollType,
    theme: payload.theme,
    themeKey: payload.themeKey,
    options: payload.options,
    movers: payload.movers,
    slideCount: payload.slideCount,
    variant: payload.variant,
    tokenIds: payload.tokenIds,
    comparisonContext: payload.comparisonContext,
    leaders: payload.leaders,
    pullback: payload.pullback,
    volumeLeader: payload.volumeLeader,
  };

  return compactUnknownRecord(details);
}

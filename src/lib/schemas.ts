import { z } from "zod";

const IsoDateStringSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "Expected a valid ISO date string",
});

const Score0To100Schema = z.number().min(0).max(100);

export const ArticleQualitySnapshotSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.string()),
  warnings: z.array(z.string()),
  stats: z.object({
    wordCount: z.number().min(0),
    hasFaq: z.boolean(),
    hasDisclaimer: z.boolean(),
    dataPointCount: z.number().min(0),
    prohibitedPhrases: z.array(z.string()),
    avgSentenceLength: z.number().min(0),
    repeatedParagraphCount: z.number().min(0),
    hasMalformedTable: z.boolean(),
    hasContinuationLink: z.boolean(),
  }),
  checkedAt: IsoDateStringSchema,
});

export type ValidatedArticleQualitySnapshot = z.infer<typeof ArticleQualitySnapshotSchema>;

export const TokenMetricsSchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  symbol: z.string(),
  riskScore: z.number().min(1).max(10),
  riskLevel: z.enum(["low", "medium", "high"]),
  growthPotentialIndex: Score0To100Schema,
  narrativeStrength: Score0To100Schema,
  valueVsAth: Score0To100Schema,
  volatilityIndex: Score0To100Schema,
  summary: z.string(),
  computedAt: IsoDateStringSchema,
  holderConcentrationEstimate: z.enum(["low", "medium", "high", "unknown"]).optional(),
});

export type ValidatedTokenMetrics = z.infer<typeof TokenMetricsSchema>;

export const GeneratedArticleSchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  type: z.string(),
  title: z.string(),
  slug: z.string(),
  content: z.string(),
  wordCount: z.number().min(0),
  generatedAt: IsoDateStringSchema,
  model: z.string(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
  quality: ArticleQualitySnapshotSchema.optional(),
});

export type ValidatedGeneratedArticle = z.infer<typeof GeneratedArticleSchema>;

const NullableNumberSchema = z.number().nullable();
const NullableStringSchema = z.string().nullable();
const TokenImageSchema = z.union([
  z.string(),
  z.object({
    large: z.string().optional(),
    small: z.string().optional(),
    thumb: z.string().optional(),
  }),
]);

export const TokenDetailDataSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  imageUrl: z.string().optional(),
  image: TokenImageSchema.optional(),
  description: z.string(),
  categories: z.array(z.string()),
  genesisDate: NullableStringSchema,
  links: z.object({
    website: NullableStringSchema,
    github: NullableStringSchema,
    reddit: NullableStringSchema,
    explorer: NullableStringSchema,
  }),
  market: z.object({
    price: z.number(),
    marketCap: z.number(),
    marketCapRank: z.number(),
    volume24h: z.number(),
    high24h: z.number(),
    low24h: z.number(),
    priceChange24h: z.number(),
    priceChange7d: z.number(),
    priceChange30d: z.number(),
    priceChange1y: z.number(),
    ath: z.number(),
    athChangePercentage: z.number(),
    athDate: z.string(),
    atl: z.number(),
    atlDate: z.string(),
    circulatingSupply: z.number(),
    totalSupply: NullableNumberSchema,
    maxSupply: NullableNumberSchema,
    fdv: NullableNumberSchema,
  }),
  community: z.object({
    twitterFollowers: NullableNumberSchema,
    redditSubscribers: NullableNumberSchema,
  }),
  developer: z.object({
    githubStars: NullableNumberSchema,
    githubForks: NullableNumberSchema,
    commits4Weeks: NullableNumberSchema,
  }),
  chart30d: z.unknown().optional(),
  chart1y: z.unknown().optional(),
  fetchedAt: IsoDateStringSchema,
  lastMarketUpdate: IsoDateStringSchema.optional(),
});

export type ValidatedTokenDetailData = z.infer<typeof TokenDetailDataSchema>;

export const PricePointSchema = z.object({
  date: IsoDateStringSchema,
  price: z.number(),
});

export const PriceHistorySchema = z.object({
  id: z.string(),
  name: z.string(),
  chart30d: z.array(PricePointSchema),
  chart1y: z.array(PricePointSchema),
  fetchedAt: IsoDateStringSchema,
});

export type ValidatedPriceHistory = z.infer<typeof PriceHistorySchema>;

export const TgeSignalSchema = z.object({
  type: z.string(),
  sourceType: z.string(),
  url: z.string(),
  title: z.string().optional(),
  observedAt: IsoDateStringSchema,
  confidence: Score0To100Schema.optional(),
});

export const UpcomingTgeSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string(),
  symbol: z.string(),
  category: z.string(),
  expectedTge: z.string(),
  narrativeStrength: Score0To100Schema,
  dataSource: z.string(),
  discoveredAt: IsoDateStringSchema,
  status: z.enum(["upcoming", "released"]).optional(),
  lifecycleStatus: z
    .enum(["candidate", "watchlist", "confirmed_tge", "trading_on_dex", "listed_on_aggregator", "graduated", "rejected", "stale"])
    .optional(),
  confidence: Score0To100Schema.optional(),
  signals: z.array(TgeSignalSchema).optional(),
  officialLinks: z.record(z.string(), z.string().optional()).optional(),
  chains: z.array(z.string()).optional(),
  contracts: z.array(z.object({ chain: z.string(), address: z.string() })).optional(),
  tokenomics: z.record(z.string(), z.string().optional()).optional(),
  lastVerifiedAt: IsoDateStringSchema.optional(),
  rejectedReason: z.string().optional(),
  graduatedAt: IsoDateStringSchema.optional(),
  coingeckoRank: z.number().optional(),
  graduationEvidence: z.record(z.string(), z.unknown()).optional(),
});

export const UpcomingTgesSchema = z.array(UpcomingTgeSchema);

export type ValidatedUpcomingTge = z.infer<typeof UpcomingTgeSchema>;

const SearchIntentMixItemSchema = z.object({
  intent: z.string(),
  label: z.string(),
  score: Score0To100Schema,
  queries: z.array(z.string()),
});

const SearchIntentSnapshotSchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  symbol: z.string(),
  attentionScore: Score0To100Schema,
  attentionLabel: z.enum(["Quiet", "Watch", "Rising", "Hot"]),
  hypeScore: Score0To100Schema,
  fundamentalsScore: Score0To100Schema,
  supplyRiskScore: Score0To100Schema,
  classification: z.string(),
  primaryIntent: z.string(),
  intentMix: z.array(SearchIntentMixItemSchema),
  drivers: z.array(z.string()),
  cautions: z.array(z.string()),
  queryExamples: z.array(z.string()),
  sourceSignals: z.array(z.string()),
  computedAt: IsoDateStringSchema,
});

export const SearchIntentDatasetSchema = z.object({
  generatedAt: IsoDateStringSchema,
  version: z.literal(1),
  summary: z.object({
    generatedAt: IsoDateStringSchema,
    tokenCount: z.number().min(0),
    topIntents: z.array(
      z.object({
        intent: z.string(),
        label: z.string(),
        tokenCount: z.number().min(0),
        avgScore: Score0To100Schema,
      }),
    ),
    hotTokens: z.array(z.string()),
    watchTokens: z.array(z.string()),
    methodology: z.array(z.string()),
  }),
  tokens: z.record(z.string(), SearchIntentSnapshotSchema),
});

export type ValidatedSearchIntentDataset = z.infer<typeof SearchIntentDatasetSchema>;

export const SearchIntentHistoryDatasetSchema = z.object({
  version: z.literal(1),
  generatedAt: IsoDateStringSchema,
  entries: z.array(
    z.object({
      date: z.string(),
      generatedAt: IsoDateStringSchema,
      tokenCount: z.number().min(0),
      topIntents: SearchIntentDatasetSchema.shape.summary.shape.topIntents,
      hotTokens: z.array(z.string()),
      watchTokens: z.array(z.string()),
      tokens: z.record(
        z.string(),
        z.object({
          tokenId: z.string(),
          attentionScore: Score0To100Schema,
          hypeScore: Score0To100Schema,
          supplyRiskScore: Score0To100Schema,
          classification: z.string(),
          primaryIntent: z.string(),
        }),
      ),
    }),
  ),
});

export type ValidatedSearchIntentHistoryDataset = z.infer<typeof SearchIntentHistoryDatasetSchema>;

import { z } from "zod";

export const TokenMetricsSchema = z.object({
  tokenId: z.string(),
  tokenName: z.string(),
  symbol: z.string(),
  riskScore: z.number().min(1).max(10),
  riskLevel: z.enum(["low", "medium", "high"]),
  growthPotentialIndex: z.number().min(0).max(100),
  narrativeStrength: z.number().min(0).max(100),
  valueVsAth: z.number(),
  volatilityIndex: z.number().min(0),
  summary: z.string(),
  computedAt: z.string(),
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
  wordCount: z.number(),
  generatedAt: z.string(),
  model: z.string(),
  promptTokens: z.number().optional(),
  completionTokens: z.number().optional(),
});

export type ValidatedGeneratedArticle = z.infer<typeof GeneratedArticleSchema>;

const NullableNumberSchema = z.number().nullable();
const NullableStringSchema = z.string().nullable();

export const TokenDetailDataSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
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
  fetchedAt: z.string(),
});

export type ValidatedTokenDetailData = z.infer<typeof TokenDetailDataSchema>;

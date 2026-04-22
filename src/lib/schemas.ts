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

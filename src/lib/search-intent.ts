export type SearchIntentType =
  | "prediction"
  | "buying"
  | "risk"
  | "supply"
  | "airdrop"
  | "stablecoin"
  | "rwa"
  | "ai"
  | "meme"
  | "yield"
  | "news";

export type AttentionLabel = "Quiet" | "Watch" | "Rising" | "Hot";

export type HypeClassification =
  | "Organic Interest"
  | "FOMO Spike"
  | "Supply-Risk Spike"
  | "Narrative Rotation"
  | "Low-Quality Attention"
  | "Stablecoin Safety Check"
  | "Quiet Watch";

export interface TokenSearchIntentMixItem {
  intent: SearchIntentType;
  label: string;
  score: number;
  queries: string[];
}

export interface TokenSearchIntentSnapshot {
  tokenId: string;
  tokenName: string;
  symbol: string;
  attentionScore: number;
  attentionLabel: AttentionLabel;
  hypeScore: number;
  fundamentalsScore: number;
  supplyRiskScore: number;
  classification: HypeClassification;
  primaryIntent: SearchIntentType;
  intentMix: TokenSearchIntentMixItem[];
  drivers: string[];
  cautions: string[];
  queryExamples: string[];
  sourceSignals: string[];
  computedAt: string;
}

export interface MarketSearchIntentSummary {
  generatedAt: string;
  tokenCount: number;
  topIntents: Array<{
    intent: SearchIntentType;
    label: string;
    tokenCount: number;
    avgScore: number;
  }>;
  hotTokens: string[];
  watchTokens: string[];
  methodology: string[];
}

export interface SearchIntentDataset {
  generatedAt: string;
  version: 1;
  summary: MarketSearchIntentSummary;
  tokens: Record<string, TokenSearchIntentSnapshot>;
}

export interface SearchIntentHistoryTokenPoint {
  tokenId: string;
  attentionScore: number;
  hypeScore: number;
  supplyRiskScore: number;
  classification: HypeClassification;
  primaryIntent: SearchIntentType;
}

export interface SearchIntentHistoryEntry {
  date: string;
  generatedAt: string;
  tokenCount: number;
  topIntents: MarketSearchIntentSummary["topIntents"];
  hotTokens: string[];
  watchTokens: string[];
  tokens: Record<string, SearchIntentHistoryTokenPoint>;
}

export interface SearchIntentHistoryDataset {
  version: 1;
  generatedAt: string;
  entries: SearchIntentHistoryEntry[];
}

export interface TokenSearchIntentTrend {
  tokenId: string;
  currentDate: string;
  previousDate: string;
  attentionDelta: number;
  hypeDelta: number;
  supplyRiskDelta: number;
  previousClassification: HypeClassification;
  previousPrimaryIntent: SearchIntentType;
  classificationChanged: boolean;
  primaryIntentChanged: boolean;
}

export const SEARCH_INTENT_LABELS: Record<SearchIntentType, string> = {
  prediction: "Price prediction",
  buying: "Buying access",
  risk: "Risk check",
  supply: "Unlock / supply",
  airdrop: "Airdrop / launch",
  stablecoin: "Stablecoin safety",
  rwa: "RWA / tokenization",
  ai: "AI crypto",
  meme: "Meme attention",
  yield: "Yield / staking",
  news: "News catalyst",
};

export const SEARCH_INTENT_DESCRIPTIONS: Record<SearchIntentType, string> = {
  prediction: "Inferred prediction-research proxy based on forward scenarios, price context, and recent market structure.",
  buying: "Inferred access-research proxy based on venue checks, availability context, and purchase workflows.",
  risk: "Inferred risk-research proxy based on safety topics, liquidity, volatility, and low-quality attention signals.",
  supply: "Inferred supply-research proxy based on unlocks, circulating supply, FDV gaps, and tokenomics pressure.",
  airdrop: "Inferred launch-research proxy based on listing, TGE, eligibility, and airdrop-related signals.",
  stablecoin: "Inferred stablecoin-research proxy based on peg stability, reserves, issuer trust, yield, and depeg risk.",
  rwa: "Inferred RWA-research proxy based on tokenized assets, treasuries, credit, issuers, and redemption risk.",
  ai: "Inferred AI-token research proxy based on agent exposure, compute, category rotation, and narrative signals.",
  meme: "Inferred meme-attention proxy based on retail momentum, hype pressure, and market staying-power signals.",
  yield: "Inferred yield-research proxy based on staking rewards, APY, protocol revenue, and sustainability signals.",
  news: "Inferred catalyst-research proxy based on sharp moves, listings, ecosystem updates, and market narratives.",
};

export function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getAttentionLabel(score: number): AttentionLabel {
  if (score >= 75) return "Hot";
  if (score >= 55) return "Rising";
  if (score >= 35) return "Watch";
  return "Quiet";
}

export function buildSearchIntentCardFields(
  intent: TokenSearchIntentSnapshot | null | undefined,
  trend?: TokenSearchIntentTrend | null,
) {
  if (!intent) return {};

  return {
    searchIntentAttentionScore: intent.attentionScore,
    searchIntentAttentionLabel: intent.attentionLabel,
    searchIntentHypeScore: intent.hypeScore,
    searchIntentSupplyRiskScore: intent.supplyRiskScore,
    searchIntentClassification: intent.classification,
    searchIntentPrimaryIntent: intent.primaryIntent,
    searchIntentPrimaryLabel: SEARCH_INTENT_LABELS[intent.primaryIntent],
    searchIntentAttentionDelta: trend?.attentionDelta,
    searchIntentHypeDelta: trend?.hypeDelta,
    searchIntentSupplyRiskDelta: trend?.supplyRiskDelta,
  };
}

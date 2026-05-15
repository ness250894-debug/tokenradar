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
  prediction: "Users looking for forward scenarios, price targets, and market structure after recent moves.",
  buying: "Users trying to find access routes, exchange availability, and basic purchase workflow checks.",
  risk: "Users checking safety, scam risk, liquidity, volatility, and whether attention is low quality.",
  supply: "Users researching unlocks, circulating supply, FDV gaps, and tokenomics pressure.",
  airdrop: "Users searching for launch, listing, TGE, and eligibility signals around upcoming assets.",
  stablecoin: "Users checking peg stability, reserves, issuer trust, yield, and depeg risk.",
  rwa: "Users tracking tokenized assets, treasuries, private credit, and issuer or redemption risk.",
  ai: "Users looking for AI-token narratives, agent exposure, compute demand, and category rotation.",
  meme: "Users chasing retail momentum, meme attention, and whether a spike has any staying power.",
  yield: "Users comparing staking rewards, APY, protocol revenue, and yield sustainability.",
  news: "Users reacting to fresh catalysts, sharp moves, listings, ecosystem updates, or market rumors.",
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

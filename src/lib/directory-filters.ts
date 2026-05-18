export interface TokenDirectoryState {
  searchQuery: string;
  categoryFilter: string;
  riskFilter: string;
  intentFilter: string;
  attentionFilter: string;
  sortBy: string;
}

export interface TokenDirectoryItem {
  name: string;
  symbol: string;
  category: string;
  riskScore: number;
  marketCap?: number;
  priceChange24h?: number;
  searchIntentPrimaryIntent?: string;
  searchIntentAttentionScore?: number;
  searchIntentHypeScore?: number;
  searchIntentSupplyRiskScore?: number;
}

export interface TgeDirectoryState {
  searchQuery: string;
  statusFilter: string;
  categoryFilter: string;
  sortBy: string;
}

export interface TgeDirectoryItem {
  name: string;
  symbol: string;
  category: string;
  lifecycleStatus?: string;
  confidence?: number;
  discoveredAt: string;
  lastVerifiedAt?: string;
  signals?: unknown[];
  contracts?: unknown[];
  officialLinks?: {
    website?: unknown;
  };
}

export const DEFAULT_TOKEN_DIRECTORY_STATE: TokenDirectoryState = {
  searchQuery: "",
  categoryFilter: "all",
  riskFilter: "all",
  intentFilter: "all",
  attentionFilter: "all",
  sortBy: "market-cap-desc",
};

export const DEFAULT_TGE_DIRECTORY_STATE: TgeDirectoryState = {
  searchQuery: "",
  statusFilter: "all",
  categoryFilter: "all",
  sortBy: "confidence-desc",
};

const TGE_STATUS_LABELS: Record<string, string> = {
  confirmed_tge: "Confirmed TGE",
  watchlist: "Watchlist",
  candidate: "Research Candidate",
  trading_on_dex: "Trading on DEX",
  listed_on_aggregator: "Aggregator Listed",
  stale: "Needs Recheck",
  graduated: "Graduated",
  rejected: "Rejected",
};

function normalizedQuery(value: string): string {
  return value.trim().toLowerCase();
}

function joinFilterLabels(labels: string[]): string {
  if (labels.length <= 1) return labels[0] || "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function hasActiveTokenFilters(state: TokenDirectoryState): boolean {
  return (
    normalizedQuery(state.searchQuery).length > 0 ||
    state.categoryFilter !== DEFAULT_TOKEN_DIRECTORY_STATE.categoryFilter ||
    state.riskFilter !== DEFAULT_TOKEN_DIRECTORY_STATE.riskFilter ||
    state.intentFilter !== DEFAULT_TOKEN_DIRECTORY_STATE.intentFilter ||
    state.attentionFilter !== DEFAULT_TOKEN_DIRECTORY_STATE.attentionFilter ||
    state.sortBy !== DEFAULT_TOKEN_DIRECTORY_STATE.sortBy
  );
}

export function describeTokenFilters(state: TokenDirectoryState): string {
  const query = state.searchQuery.trim();
  const labels = [
    state.categoryFilter !== "all" ? "category" : "",
    state.riskFilter !== "all" ? "risk" : "",
    state.intentFilter !== "all" ? "intent" : "",
    state.attentionFilter !== "all" ? "signal" : "",
    state.sortBy !== DEFAULT_TOKEN_DIRECTORY_STATE.sortBy ? "sort" : "",
  ].filter(Boolean);

  if (query && labels.length > 0) {
    return `No tokens match "${query}" with the selected ${joinFilterLabels(labels)} filters.`;
  }
  if (query) return `No tokens match "${query}".`;
  if (labels.length > 0) return `No tokens match the selected ${joinFilterLabels(labels)} filters.`;
  return "No tokens found.";
}

export function filterAndSortTokens<T extends TokenDirectoryItem>(
  tokens: T[],
  state: TokenDirectoryState,
): T[] {
  const query = normalizedQuery(state.searchQuery);
  const filtered = tokens.filter((token) => {
    const matchesQuery =
      !query ||
      token.name.toLowerCase().includes(query) ||
      token.symbol.toLowerCase().includes(query) ||
      token.category.toLowerCase().includes(query);

    const matchesCategory = state.categoryFilter === "all" || token.category === state.categoryFilter;
    const matchesRisk =
      state.riskFilter === "all" ||
      (state.riskFilter === "low" && token.riskScore <= 3) ||
      (state.riskFilter === "medium" && token.riskScore > 3 && token.riskScore <= 6) ||
      (state.riskFilter === "high" && token.riskScore > 6);
    const matchesIntent = state.intentFilter === "all" || token.searchIntentPrimaryIntent === state.intentFilter;
    const attentionScore = token.searchIntentAttentionScore || 0;
    const hypeScore = token.searchIntentHypeScore || 0;
    const supplyRiskScore = token.searchIntentSupplyRiskScore || 0;
    const matchesAttention =
      state.attentionFilter === "all" ||
      (state.attentionFilter === "hot" && attentionScore >= 75) ||
      (state.attentionFilter === "rising" && attentionScore >= 55) ||
      (state.attentionFilter === "hype" && hypeScore >= 65) ||
      (state.attentionFilter === "supply-risk" && supplyRiskScore >= 60);

    return matchesQuery && matchesCategory && matchesRisk && matchesIntent && matchesAttention;
  });

  return [...filtered].sort((a, b) => {
    if (state.sortBy === "name-asc") return a.name.localeCompare(b.name);
    if (state.sortBy === "change-desc") return (b.priceChange24h || 0) - (a.priceChange24h || 0);
    if (state.sortBy === "change-asc") return (a.priceChange24h || 0) - (b.priceChange24h || 0);
    if (state.sortBy === "risk-asc") return a.riskScore - b.riskScore;
    if (state.sortBy === "risk-desc") return b.riskScore - a.riskScore;
    if (state.sortBy === "attention-desc") {
      return (b.searchIntentAttentionScore || 0) - (a.searchIntentAttentionScore || 0);
    }
    if (state.sortBy === "hype-desc") return (b.searchIntentHypeScore || 0) - (a.searchIntentHypeScore || 0);
    if (state.sortBy === "supply-risk-desc") {
      return (b.searchIntentSupplyRiskScore || 0) - (a.searchIntentSupplyRiskScore || 0);
    }
    return (b.marketCap || 0) - (a.marketCap || 0);
  });
}

export function hasActiveTgeFilters(state: TgeDirectoryState): boolean {
  return (
    normalizedQuery(state.searchQuery).length > 0 ||
    state.statusFilter !== DEFAULT_TGE_DIRECTORY_STATE.statusFilter ||
    state.categoryFilter !== DEFAULT_TGE_DIRECTORY_STATE.categoryFilter ||
    state.sortBy !== DEFAULT_TGE_DIRECTORY_STATE.sortBy
  );
}

export function describeTgeFilters(state: TgeDirectoryState): string {
  const query = state.searchQuery.trim();
  const labels = [
    state.statusFilter !== "all" ? "status" : "",
    state.categoryFilter !== "all" ? "category" : "",
    state.sortBy !== DEFAULT_TGE_DIRECTORY_STATE.sortBy ? "sort" : "",
  ].filter(Boolean);

  if (query && labels.length > 0) {
    return `No launches match "${query}" with the selected ${joinFilterLabels(labels)} filters.`;
  }
  if (query) return `No launches match "${query}".`;
  if (labels.length > 0) return `No launches match the selected ${joinFilterLabels(labels)} filters.`;
  return "No launches found.";
}

export function filterAndSortTges<T extends TgeDirectoryItem>(
  tges: T[],
  state: TgeDirectoryState,
): T[] {
  const query = normalizedQuery(state.searchQuery);
  const filtered = tges.filter((tge) => {
    const lifecycleStatus = tge.lifecycleStatus || "candidate";
    const statusLabel = TGE_STATUS_LABELS[lifecycleStatus] || lifecycleStatus;
    const matchesQuery =
      !query ||
      tge.name.toLowerCase().includes(query) ||
      tge.symbol.toLowerCase().includes(query) ||
      tge.category.toLowerCase().includes(query) ||
      statusLabel.toLowerCase().includes(query);

    const matchesStatus = state.statusFilter === "all" || lifecycleStatus === state.statusFilter;
    const matchesCategory = state.categoryFilter === "all" || tge.category === state.categoryFilter;
    return matchesQuery && matchesStatus && matchesCategory;
  });

  return [...filtered].sort((a, b) => {
    if (state.sortBy === "name-asc") return a.name.localeCompare(b.name);
    if (state.sortBy === "verified-desc") {
      return (
        new Date(b.lastVerifiedAt || b.discoveredAt).getTime() -
        new Date(a.lastVerifiedAt || a.discoveredAt).getTime()
      );
    }
    if (state.sortBy === "evidence-desc") return getEvidenceCount(b) - getEvidenceCount(a);
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });
}

function getEvidenceCount(tge: TgeDirectoryItem): number {
  return (
    (Array.isArray(tge.signals) ? tge.signals.length : 0) +
    (Array.isArray(tge.contracts) ? tge.contracts.length : 0) +
    (tge.officialLinks?.website ? 1 : 0)
  );
}

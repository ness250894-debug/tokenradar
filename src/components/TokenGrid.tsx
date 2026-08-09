"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, Filter, RotateCcw, Search } from "lucide-react";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { trackEvent } from "@/lib/analytics";
import { trackDirectoryFilter } from "@/lib/engagement-analytics";
import { SEARCH_INTENT_LABELS, type SearchIntentType } from "@/lib/search-intent";
import {
  DEFAULT_TOKEN_DIRECTORY_STATE,
  describeTokenFilters,
  filterAndSortTokens,
  hasActiveTokenFilters,
  type TokenDirectoryState,
} from "@/lib/directory-filters";

interface TokenGridProps {
  tokens: TokenCardData[];
  totalTokenCount?: number;
  deferredDataUrl?: string;
  initialVisibleCount?: number;
  searchPlaceholder?: string;
}

const DEFAULT_TOKENS_PER_PAGE = 6;

export function TokenGrid({
  tokens,
  totalTokenCount,
  deferredDataUrl,
  initialVisibleCount = DEFAULT_TOKENS_PER_PAGE,
  searchPlaceholder = "Search tokens by name or symbol (e.g., BTC, Injective)...",
}: TokenGridProps) {
  const [searchQuery, setSearchQuery] = useState(DEFAULT_TOKEN_DIRECTORY_STATE.searchQuery);
  const [categoryFilter, setCategoryFilter] = useState(DEFAULT_TOKEN_DIRECTORY_STATE.categoryFilter);
  const [riskFilter, setRiskFilter] = useState(DEFAULT_TOKEN_DIRECTORY_STATE.riskFilter);
  const [intentFilter, setIntentFilter] = useState(DEFAULT_TOKEN_DIRECTORY_STATE.intentFilter);
  const [attentionFilter, setAttentionFilter] = useState(DEFAULT_TOKEN_DIRECTORY_STATE.attentionFilter);
  const [sortBy, setSortBy] = useState(DEFAULT_TOKEN_DIRECTORY_STATE.sortBy);
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);
  const [availableTokens, setAvailableTokens] = useState(tokens);
  const [deferredLoadState, setDeferredLoadState] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const deferredRequestRef = useRef<Promise<TokenCardData[]> | null>(null);

  const resolvedTokens = deferredDataUrl ? availableTokens : tokens;
  const knownTotalTokenCount = Math.max(totalTokenCount ?? resolvedTokens.length, resolvedTokens.length);
  const hasCompleteDirectory = resolvedTokens.length >= knownTotalTokenCount;

  const loadDeferredTokens = useCallback(async (): Promise<TokenCardData[]> => {
    if (!deferredDataUrl || hasCompleteDirectory) return resolvedTokens;
    if (deferredRequestRef.current) return deferredRequestRef.current;

    setDeferredLoadState("loading");
    const request = fetch(deferredDataUrl)
      .then(async (response) => {
        if (!response.ok) throw new Error(`Token directory request failed (${response.status})`);
        const payload: unknown = await response.json();
        if (!Array.isArray(payload)) throw new Error("Token directory response was not an array");
        return payload as TokenCardData[];
      })
      .then((loadedTokens) => {
        setAvailableTokens(loadedTokens);
        setDeferredLoadState("loaded");
        return loadedTokens;
      })
      .catch(() => {
        setDeferredLoadState("error");
        return resolvedTokens;
      })
      .finally(() => {
        deferredRequestRef.current = null;
      });

    deferredRequestRef.current = request;
    return request;
  }, [deferredDataUrl, hasCompleteDirectory, resolvedTokens]);

  const directoryState: TokenDirectoryState = useMemo(() => ({
    searchQuery,
    categoryFilter,
    riskFilter,
    intentFilter,
    attentionFilter,
    sortBy,
  }), [attentionFilter, categoryFilter, intentFilter, riskFilter, searchQuery, sortBy]);

  const categories = useMemo(() => {
    return Array.from(new Set(resolvedTokens.map((token) => token.category).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [resolvedTokens]);

  const searchIntentOptions = useMemo(() => {
    const intents = new Set<SearchIntentType>();
    resolvedTokens.forEach((token) => {
      if (token.searchIntentPrimaryIntent) intents.add(token.searchIntentPrimaryIntent);
    });
    return Array.from(intents).sort((a, b) => SEARCH_INTENT_LABELS[a].localeCompare(SEARCH_INTENT_LABELS[b]));
  }, [resolvedTokens]);

  const filteredTokens = useMemo(
    () => filterAndSortTokens(resolvedTokens, directoryState),
    [directoryState, resolvedTokens],
  );
  const hasActiveFilters = hasActiveTokenFilters(directoryState);
  const reportedResultCount = !hasActiveFilters && !hasCompleteDirectory
    ? knownTotalTokenCount
    : filteredTokens.length;

  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2 || !hasCompleteDirectory) return;

    const timer = window.setTimeout(() => {
      trackEvent("site_search", {
        search_area: "tokens",
        search_term: term,
        results_count: filteredTokens.length,
        page_path: window.location.pathname,
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [filteredTokens.length, hasCompleteDirectory, searchQuery]);

  useEffect(() => {
    if (hasActiveFilters && !hasCompleteDirectory) return;
    trackDirectoryFilter(
      "tokens",
      "combined",
      `category:${categoryFilter}|risk:${riskFilter}|intent:${intentFilter}|attention:${attentionFilter}|sort:${sortBy}`,
      filteredTokens.length,
    );
  }, [attentionFilter, categoryFilter, filteredTokens.length, hasActiveFilters, hasCompleteDirectory, intentFilter, riskFilter, sortBy]);

  const handleLoadMore = async () => {
    const loadedTokens = await loadDeferredTokens();
    const loadedFilteredTokens = filterAndSortTokens(loadedTokens, directoryState);
    const nextVisibleCount = Math.min(visibleCount + initialVisibleCount, loadedFilteredTokens.length);

    setVisibleCount((previousCount) => previousCount + initialVisibleCount);
    trackEvent("load_more", {
      list_name: "tokens",
      visible_count: nextVisibleCount,
      total_count: loadedFilteredTokens.length,
      page_path: window.location.pathname,
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setVisibleCount(initialVisibleCount);
  };

  const handleFilterChange = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLSelectElement>) => {
    setter(event.target.value);
    setVisibleCount(initialVisibleCount);
  };

  const handleResetFilters = () => {
    setSearchQuery(DEFAULT_TOKEN_DIRECTORY_STATE.searchQuery);
    setCategoryFilter(DEFAULT_TOKEN_DIRECTORY_STATE.categoryFilter);
    setRiskFilter(DEFAULT_TOKEN_DIRECTORY_STATE.riskFilter);
    setIntentFilter(DEFAULT_TOKEN_DIRECTORY_STATE.intentFilter);
    setAttentionFilter(DEFAULT_TOKEN_DIRECTORY_STATE.attentionFilter);
    setSortBy(DEFAULT_TOKEN_DIRECTORY_STATE.sortBy);
    setVisibleCount(initialVisibleCount);
    trackEvent("directory_filters_reset", {
      list_name: "tokens",
      result_count: filteredTokens.length,
      page_path: window.location.pathname,
    });
  };

  const visibleTokens = filteredTokens.slice(0, visibleCount);
  const hasMore = !hasCompleteDirectory || visibleCount < filteredTokens.length;
  const emptyStateMessage = describeTokenFilters(directoryState);

  return (
    <div className="token-grid-container">
      {/* Search & Filters */}
      <div
        className="directory-filter-panel animate-in"
        onFocusCapture={() => void loadDeferredTokens()}
        onPointerEnter={() => void loadDeferredTokens()}
        aria-busy={deferredLoadState === "loading"}
      >
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <input
            type="search"
            className="search-input"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        <div className="directory-filter-grid">
          <label>
            <span><Filter size={13} /> Category</span>
            <select className="search-input themed-select" value={categoryFilter} onChange={handleFilterChange(setCategoryFilter)}>
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Filter size={13} /> Risk</span>
            <select className="search-input themed-select" value={riskFilter} onChange={handleFilterChange(setRiskFilter)}>
              <option value="all">All Risk Levels</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
          </label>
          <label>
            <span><Filter size={13} /> Intent</span>
            <select className="search-input themed-select" value={intentFilter} onChange={handleFilterChange(setIntentFilter)}>
              <option value="all">All Search Intents</option>
              {searchIntentOptions.map((intent) => (
                <option key={intent} value={intent}>{SEARCH_INTENT_LABELS[intent]}</option>
              ))}
            </select>
          </label>
          <label>
            <span><Filter size={13} /> Signal</span>
            <select className="search-input themed-select" value={attentionFilter} onChange={handleFilterChange(setAttentionFilter)}>
              <option value="all">All Signals</option>
              <option value="hot">Hot Attention</option>
              <option value="rising">Rising Attention</option>
              <option value="hype">High Hype Pressure</option>
              <option value="supply-risk">Supply-Risk Spike</option>
            </select>
          </label>
          <label>
            <span><ArrowUpDown size={13} /> Sort</span>
            <select className="search-input themed-select" value={sortBy} onChange={handleFilterChange(setSortBy)}>
              <option value="market-cap-desc">Market Cap</option>
              <option value="attention-desc">Search Attention</option>
              <option value="hype-desc">Hype Pressure</option>
              <option value="supply-risk-desc">Supply Risk</option>
              <option value="change-desc">Top 24h Gainers</option>
              <option value="change-asc">Worst 24h Moves</option>
              <option value="risk-asc">Lowest Risk</option>
              <option value="risk-desc">Highest Risk</option>
              <option value="name-asc">Name A-Z</option>
            </select>
          </label>
        </div>
        <div className="directory-filter-meta" role="status" aria-live="polite">
          <span>
            {deferredLoadState === "loading"
              ? `Loading all ${knownTotalTokenCount} directory entries...`
              : `${reportedResultCount} result${reportedResultCount === 1 ? "" : "s"} match the current directory view.`}
          </span>
          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {visibleTokens.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md" style={{ marginTop: "var(--space-2xl)" }}>
            {visibleTokens.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))}
          </div>
        ) : deferredLoadState === "loading" ? (
          <div className="no-results" role="status" style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
            <p style={{ color: "var(--text-secondary)" }}>Loading the complete token directory...</p>
          </div>
        ) : (
          <div className="no-results" style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
            <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>🔍</div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>No tokens found</h3>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              {emptyStateMessage}
            </p>
            {hasActiveFilters && (
              <button type="button" className="btn btn-secondary" onClick={handleResetFilters} style={{ marginTop: "var(--space-md)" }}>
                <RotateCcw size={16} aria-hidden="true" /> Reset filters
              </button>
            )}
          </div>
        )}

      {/* Load More & Status */}
      {(filteredTokens.length > 0 || !hasCompleteDirectory) && (
        <div style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
            Showing {visibleTokens.length} of {reportedResultCount} tracked tokens
          </p>

          {hasMore && (
            <button
              type="button"
              onClick={() => void handleLoadMore()}
              className="btn btn-secondary"
              disabled={deferredLoadState === "loading"}
            >
              {deferredLoadState === "loading"
                ? "Loading Directory..."
                : deferredLoadState === "error"
                  ? "Retry Loading Tokens"
                  : "Load More Tokens"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

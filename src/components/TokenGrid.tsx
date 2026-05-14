"use client";

import { useEffect, useState, useMemo } from "react";
import { ArrowUpDown, Filter, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { trackEvent } from "@/lib/analytics";
import { trackDirectoryFilter } from "@/lib/engagement-analytics";

interface TokenGridProps {
  tokens: TokenCardData[];
  initialVisibleCount?: number;
  searchPlaceholder?: string;
}

const DEFAULT_TOKENS_PER_PAGE = 6;

export function TokenGrid({
  tokens,
  initialVisibleCount = DEFAULT_TOKENS_PER_PAGE,
  searchPlaceholder = "Search tokens by name or symbol (e.g., BTC, Injective)...",
}: TokenGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [sortBy, setSortBy] = useState("market-cap-desc");
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  const categories = useMemo(() => {
    return Array.from(new Set(tokens.map((token) => token.category).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [tokens]);

  const filteredTokens = useMemo(() => {
    const query = searchQuery.toLowerCase();
    const filtered = tokens.filter((token) => {
      const matchesQuery =
        !query.trim() ||
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.category.toLowerCase().includes(query);

      const matchesCategory = categoryFilter === "all" || token.category === categoryFilter;
      const matchesRisk =
        riskFilter === "all" ||
        (riskFilter === "low" && token.riskScore <= 3) ||
        (riskFilter === "medium" && token.riskScore > 3 && token.riskScore <= 6) ||
        (riskFilter === "high" && token.riskScore > 6);

      return matchesQuery && matchesCategory && matchesRisk;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      if (sortBy === "change-desc") return (b.priceChange24h || 0) - (a.priceChange24h || 0);
      if (sortBy === "change-asc") return (a.priceChange24h || 0) - (b.priceChange24h || 0);
      if (sortBy === "risk-asc") return a.riskScore - b.riskScore;
      if (sortBy === "risk-desc") return b.riskScore - a.riskScore;
      return (b.marketCap || 0) - (a.marketCap || 0);
    });
  }, [categoryFilter, riskFilter, sortBy, tokens, searchQuery]);

  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) return;

    const timer = window.setTimeout(() => {
      trackEvent("site_search", {
        search_area: "tokens",
        search_term: term,
        results_count: filteredTokens.length,
        page_path: window.location.pathname,
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [filteredTokens.length, searchQuery]);

  useEffect(() => {
    trackDirectoryFilter(
      "tokens",
      "combined",
      `category:${categoryFilter}|risk:${riskFilter}|sort:${sortBy}`,
      filteredTokens.length,
    );
  }, [categoryFilter, filteredTokens.length, riskFilter, sortBy]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + initialVisibleCount);
    trackEvent("load_more", {
      list_name: "tokens",
      visible_count: Math.min(visibleCount + initialVisibleCount, filteredTokens.length),
      total_count: filteredTokens.length,
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

  const visibleTokens = filteredTokens.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTokens.length;

  return (
    <div className="token-grid-container">
      {/* Search & Filters */}
      <div className="directory-filter-panel animate-in">
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
            <span><ArrowUpDown size={13} /> Sort</span>
            <select className="search-input themed-select" value={sortBy} onChange={handleFilterChange(setSortBy)}>
              <option value="market-cap-desc">Market Cap</option>
              <option value="change-desc">Top 24h Gainers</option>
              <option value="change-asc">Worst 24h Moves</option>
              <option value="risk-asc">Lowest Risk</option>
              <option value="risk-desc">Highest Risk</option>
              <option value="name-asc">Name A-Z</option>
            </select>
          </label>
        </div>
      </div>

      {/* Grid */}
      <AnimatePresence mode="popLayout">
        {visibleTokens.length > 0 ? (
          <motion.div
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md"
            style={{ marginTop: "var(--space-2xl)" }}
          >
            {visibleTokens.map((token) => (
              <TokenCard key={token.id} token={token} />
            ))}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="no-results" 
            style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}
          >
            <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>🔍</div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>No tokens found</h3>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
              We couldn&apos;t find any tokens matching &quot;{searchQuery}&quot;.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load More & Status */}
      {filteredTokens.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
            Showing {visibleTokens.length} of {filteredTokens.length} tracked tokens
          </p>

          {hasMore && (
            <button onClick={handleLoadMore} className="btn btn-secondary">
              Load More Tokens
            </button>
          )}
        </div>
      )}
    </div>
  );
}

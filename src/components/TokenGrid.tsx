"use client";

import { useEffect, useState, useMemo } from "react";
import { Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";
import { trackEvent } from "@/lib/analytics";

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
  const [visibleCount, setVisibleCount] = useState(initialVisibleCount);

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;
    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

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

  const visibleTokens = filteredTokens.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTokens.length;

  return (
    <div className="token-grid-container">
      {/* Search Bar */}
      <div className="search-container animate-in">
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

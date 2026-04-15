"use client";

import { useState, useMemo } from "react";
import { Search, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";

interface TokenGridProps {
  tokens: TokenCardData[];
}

const TOKENS_PER_PAGE = 6;

export function TokenGrid({ tokens }: TokenGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(TOKENS_PER_PAGE);

  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;
    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + TOKENS_PER_PAGE);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setVisibleCount(TOKENS_PER_PAGE);
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
            placeholder="Search tokens by name or symbol (e.g., BTC, Injective)..."
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

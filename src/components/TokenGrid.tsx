"use client";

import { useState, useMemo } from "react";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";

interface TokenGridProps {
  tokens: TokenCardData[];
}

const TOKENS_PER_PAGE = 12;

export function TokenGrid({ tokens }: TokenGridProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(TOKENS_PER_PAGE);

  // Filter tokens based on search query
  const filteredTokens = useMemo(() => {
    if (!searchQuery.trim()) return tokens;

    const query = searchQuery.toLowerCase();
    return tokens.filter(
      (token) =>
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query)
    );
  }, [tokens, searchQuery]);

  // Handle Load More
  const handleLoadMore = () => {
    setVisibleCount((prev) => prev + TOKENS_PER_PAGE);
  };

  // Reset pagination when search changes
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
          <svg
            className="search-icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
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
      {visibleTokens.length > 0 ? (
        <div
          className="stats-grid"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            marginTop: "var(--space-2xl)",
          }}
        >
          {visibleTokens.map((token) => (
            <TokenCard key={token.id} token={token} />
          ))}
        </div>
      ) : (
        <div className="no-results" style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>🔍</div>
          <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>No tokens found</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>
            We couldn&apos;t find any tokens matching &quot;{searchQuery}&quot;.
          </p>
        </div>
      )}

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

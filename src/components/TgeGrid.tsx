"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { type UpcomingTge } from "@/lib/content-loader";
import { CardGlare } from "./CardGlare";

const TGES_PER_PAGE = 12;

export function TgeGrid({ tges }: { tges: UpcomingTge[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(TGES_PER_PAGE);

  const filteredTges = useMemo(() => {
    if (!searchQuery.trim()) return tges;
    const query = searchQuery.toLowerCase();
    return tges.filter(
      (tge) =>
        tge.name.toLowerCase().includes(query) ||
        tge.symbol.toLowerCase().includes(query) ||
        tge.category.toLowerCase().includes(query)
    );
  }, [tges, searchQuery]);

  const handleLoadMore = () => setVisibleCount((prev) => prev + TGES_PER_PAGE);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setVisibleCount(TGES_PER_PAGE);
  };

  const visibleTges = filteredTges.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTges.length;

  const upcomingCount = tges.filter(t => t.status !== "released").length;
  const releasedCount = tges.filter(t => t.status === "released").length;

  if (!tges || tges.length === 0) return null;

  return (
    <div className="token-grid-container">
      <div className="search-container animate-in">
        <div className="search-input-wrapper">
          <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            type="search"
            className="search-input"
            placeholder="Search upcoming launches (e.g., Berachain, L1)..."
            value={searchQuery}
            onChange={handleSearchChange}
          />
        </div>
        {(upcomingCount > 0 || releasedCount > 0) && (
          <div style={{ marginTop: "var(--space-sm)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
            {upcomingCount > 0 && <span>{upcomingCount} upcoming</span>}
            {upcomingCount > 0 && releasedCount > 0 && <span> · </span>}
            {releasedCount > 0 && <span>{releasedCount} released</span>}
          </div>
        )}
      </div>

      {visibleTges.length > 0 ? (
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", marginTop: "var(--space-2xl)" }}>
          {visibleTges.map((tge) => {
            const isReleased = tge.status === "released";
            const strengthColor = tge.narrativeStrength >= 80 ? "green" : tge.narrativeStrength >= 60 ? "yellow" : "red";
            const sourceHostname = (() => { try { return new URL(tge.dataSource).hostname.replace('www.', ''); } catch { return tge.dataSource; } })();
            return (
              <CardGlare key={tge.id} style={{ height: "100%" }}>
                <Link href={`/upcoming/${tge.id}`} className="card" style={{ display: "block", textDecoration: "none", opacity: isReleased ? 0.75 : 1, height: "100%" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)" }}>
                    <div className="token-name" style={{ minWidth: 0 }}>
                      <span>{tge.name} <span className="token-symbol">{tge.symbol.toUpperCase()}</span></span>
                    </div>
                    <span className={`badge badge-${strengthColor}`} style={{ fontSize: "0.7rem", padding: "3px 8px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {tge.narrativeStrength}/100 Hype
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "var(--space-lg)" }}>
                    <div>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                        {isReleased ? "Launched" : "Expected Launch"}
                      </div>
                      <div style={{ fontSize: "var(--text-lg)", fontWeight: 700, marginTop: "var(--space-xs)" }}>
                        {isReleased && tge.graduatedAt 
                          ? new Date(tge.graduatedAt).toLocaleDateString() 
                          : tge.expectedTge}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Category</div>
                      <div style={{ fontWeight: 600, marginTop: "var(--space-xs)" }}>{tge.category}</div>
                    </div>
                  </div>
                  <div style={{ marginTop: "var(--space-md)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)" }}>
                    <span className={`badge ${isReleased ? "badge-green" : "badge-accent"}`} style={{ fontSize: "0.7rem", padding: "3px 8px" }}>
                      {isReleased ? (tge.coingeckoRank ? `✓ Released #${tge.coingeckoRank}` : "✓ Released") : "Pre-Launch"}
                    </span>
                    <span style={{ fontSize: "0.65rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "140px" }}>
                      {sourceHostname}
                    </span>
                  </div>
                </Link>
              </CardGlare>
            );
          })}
        </div>
      ) : (
        <div className="no-results" style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>🔍</div>
          <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>No project found</h3>
          <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>We couldn&apos;t find any matching launches.</p>
        </div>
      )}

      {filteredTges.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
            Showing {visibleTges.length} of {filteredTges.length} curated launches
          </p>
          {hasMore && <button onClick={handleLoadMore} className="btn btn-secondary">Load More Launches</button>}
        </div>
      )}
    </div>
  );
}

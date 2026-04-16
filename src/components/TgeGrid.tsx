"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Flame, Calendar, Rocket, ExternalLink } from "lucide-react";
import { type UpcomingTge } from "@/lib/content-loader";
import { CardGlare } from "./CardGlare";

const TGES_PER_PAGE = 6;

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
          <Search className="search-icon" size={20} />
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

      <AnimatePresence mode="popLayout">
        {visibleTges.length > 0 ? (
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-md" 
            style={{ marginTop: "var(--space-2xl)" }}
          >
            {visibleTges.map((tge) => {
              const isReleased = tge.status === "released";
              const strengthColor = tge.narrativeStrength >= 80 ? "green" : tge.narrativeStrength >= 60 ? "yellow" : "red";
              const sourceHostname = (() => { try { return new URL(tge.dataSource).hostname.replace('www.', ''); } catch { return tge.dataSource; } })();
              
              return (
                <CardGlare key={tge.id} style={{ height: "100%" }}>
                  <Link href={`/upcoming/${tge.id}`} className="block h-full no-underline">
                    <motion.div 
                      className="card h-full flex flex-col"
                      whileHover={{ y: -5 }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ opacity: isReleased ? 0.75 : 1 }}
                    >
                      <div className="grid grid-cols-[1fr_auto] items-center gap-sm">
                        <div className="min-w-0" style={{ overflow: "hidden" }}>
                          <span className="text-truncate" style={{ display: "block" }}>
                            {tge.name} <span className="token-symbol" style={{ flexShrink: 0 }}>{tge.symbol.toUpperCase()}</span>
                          </span>
                        </div>
                        <span className={`badge badge-${strengthColor} flex-shrink-0 flex items-center gap-1`} style={{ fontSize: "0.7rem" }}>
                          <Flame size={12} />
                          {tge.narrativeStrength}/100 Hype
                        </span>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mt-lg gap-md sm:gap-sm">
                        <div className="flex-1">
                          <div className="stat-label flex items-center gap-1">
                            <Calendar size={12} />
                            {isReleased ? "Launched" : "Expected Launch"}
                          </div>
                          <div className="stat-value text-lg" style={{ marginTop: "4px" }}>
                            {isReleased && tge.graduatedAt 
                              ? new Date(tge.graduatedAt).toLocaleDateString() 
                              : tge.expectedTge}
                          </div>
                        </div>
                        <div className="sm:text-right">
                          <div className="stat-label flex items-center sm:justify-end gap-1">
                            <Rocket size={12} />
                            Category
                          </div>
                          <div className="stat-value text-base" style={{ marginTop: "4px" }}>{tge.category}</div>
                        </div>
                      </div>

                      <div className="mt-auto pt-md flex justify-between items-center gap-sm">
                        <span className={`badge ${isReleased ? "badge-green" : "badge-accent"} flex items-center gap-1`} style={{ fontSize: "0.7rem" }}>
                          {isReleased ? <Rocket size={12} /> : null}
                          {isReleased ? (tge.coingeckoRank ? `✓ Released #${tge.coingeckoRank}` : "✓ Released") : "Pre-Launch"}
                        </span>
                        <span className="flex items-center gap-1" style={{ fontSize: "0.65rem", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "120px" }}>
                          <ExternalLink size={10} />
                          {sourceHostname}
                        </span>
                      </div>
                    </motion.div>
                  </Link>
                </CardGlare>
              );
            })}
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="no-results" 
            style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}
          >
            <div style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>🔍</div>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 600 }}>No project found</h3>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>We couldn&apos;t find any matching launches.</p>
          </motion.div>
        )}
      </AnimatePresence>

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

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpDown, Calendar, CheckCircle2, ExternalLink, Filter, RotateCcw, Search, ShieldCheck } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { trackDirectoryFilter } from "@/lib/engagement-analytics";
import {
  DEFAULT_TGE_DIRECTORY_STATE,
  describeTgeFilters,
  filterAndSortTges,
  hasActiveTgeFilters,
  type TgeDirectoryState,
} from "@/lib/directory-filters";
import {
  getTgeEvidenceCount,
  getTgeSourceHost,
  getTgeStatusLabel,
  type TgeLifecycleStatus,
  type UpcomingTge,
} from "@/lib/tge";

const TGES_PER_PAGE = 9;

const STATUS_FILTERS: Array<{ value: "all" | TgeLifecycleStatus; label: string }> = [
  { value: "all", label: "All Statuses" },
  { value: "confirmed_tge", label: "Confirmed" },
  { value: "watchlist", label: "Watchlist" },
  { value: "candidate", label: "Candidates" },
  { value: "stale", label: "Needs Recheck" },
  { value: "graduated", label: "Graduated" },
];

function confidenceTone(confidence: number): "green" | "yellow" | "red" {
  if (confidence >= 70) return "green";
  if (confidence >= 45) return "yellow";
  return "red";
}

function formatDate(value: string | undefined): string {
  if (!value) return "Not checked";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not checked";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function TgeGrid({ tges }: { tges: UpcomingTge[] }) {
  const [searchQuery, setSearchQuery] = useState(DEFAULT_TGE_DIRECTORY_STATE.searchQuery);
  const [statusFilter, setStatusFilter] = useState<"all" | TgeLifecycleStatus>(
    DEFAULT_TGE_DIRECTORY_STATE.statusFilter as "all" | TgeLifecycleStatus,
  );
  const [categoryFilter, setCategoryFilter] = useState(DEFAULT_TGE_DIRECTORY_STATE.categoryFilter);
  const [sortBy, setSortBy] = useState(DEFAULT_TGE_DIRECTORY_STATE.sortBy);
  const [pagination, setPagination] = useState({ filterKey: "", visibleCount: TGES_PER_PAGE });

  const directoryState: TgeDirectoryState = useMemo(() => ({
    searchQuery,
    statusFilter,
    categoryFilter,
    sortBy,
  }), [categoryFilter, searchQuery, sortBy, statusFilter]);

  const categories = useMemo(() => {
    return Array.from(new Set(tges.map((tge) => tge.category).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [tges]);

  const filteredTges = useMemo(() => filterAndSortTges(tges, directoryState), [directoryState, tges]);

  const filterKey = `${searchQuery.trim().toLowerCase()}|${statusFilter}|${categoryFilter}|${sortBy}`;

  useEffect(() => {
    const term = searchQuery.trim();
    if (term.length < 2) return;

    const timer = window.setTimeout(() => {
      trackEvent("site_search", {
        search_area: "upcoming",
        search_term: term,
        results_count: filteredTges.length,
        page_path: window.location.pathname,
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [filteredTges.length, searchQuery]);

  useEffect(() => {
    trackDirectoryFilter(
      "upcoming",
      "combined",
      `status:${statusFilter}|category:${categoryFilter}|sort:${sortBy}`,
      filteredTges.length,
    );
  }, [categoryFilter, filteredTges.length, sortBy, statusFilter]);

  const visibleCount = pagination.filterKey === filterKey ? pagination.visibleCount : TGES_PER_PAGE;
  const visibleTges = filteredTges.slice(0, visibleCount);
  const hasMore = visibleCount < filteredTges.length;

  const handleLoadMore = () => {
    const nextVisibleCount = Math.min(visibleCount + TGES_PER_PAGE, filteredTges.length);
    setPagination({ filterKey, visibleCount: nextVisibleCount });
    trackEvent("load_more", {
      list_name: "upcoming",
      visible_count: nextVisibleCount,
      total_count: filteredTges.length,
      page_path: window.location.pathname,
    });
  };

  const handleResetFilters = () => {
    setSearchQuery(DEFAULT_TGE_DIRECTORY_STATE.searchQuery);
    setStatusFilter(DEFAULT_TGE_DIRECTORY_STATE.statusFilter as "all" | TgeLifecycleStatus);
    setCategoryFilter(DEFAULT_TGE_DIRECTORY_STATE.categoryFilter);
    setSortBy(DEFAULT_TGE_DIRECTORY_STATE.sortBy);
    setPagination({ filterKey: "", visibleCount: TGES_PER_PAGE });
    trackEvent("directory_filters_reset", {
      list_name: "upcoming",
      result_count: filteredTges.length,
      page_path: window.location.pathname,
    });
  };

  const hasActiveFilters = hasActiveTgeFilters(directoryState);
  const emptyStateMessage = describeTgeFilters(directoryState);

  if (!tges || tges.length === 0) return null;

  return (
    <div className="token-grid-container">
      <div className="card" style={{ padding: "var(--space-lg)", marginBottom: "var(--space-xl)" }}>
        <div className="search-input-wrapper">
          <Search className="search-icon" size={20} />
          <input
            type="search"
            className="search-input"
            placeholder="Search by project, symbol, category, or status"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 directory-filter-grid" style={{ marginTop: "var(--space-md)" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1"><Filter size={13} /> Status</span>
            <select className="search-input themed-select" value={statusFilter} onChange={(event) => {
              setStatusFilter(event.target.value as "all" | TgeLifecycleStatus);
              setPagination({ filterKey: "", visibleCount: TGES_PER_PAGE });
            }}>
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>{filter.label}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            <span>Category</span>
            <select className="search-input themed-select" value={categoryFilter} onChange={(event) => {
              setCategoryFilter(event.target.value);
              setPagination({ filterKey: "", visibleCount: TGES_PER_PAGE });
            }}>
              <option value="all">All Categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1"><ArrowUpDown size={13} /> Sort</span>
            <select className="search-input themed-select" value={sortBy} onChange={(event) => {
              setSortBy(event.target.value);
              setPagination({ filterKey: "", visibleCount: TGES_PER_PAGE });
            }}>
              <option value="confidence-desc">Highest Confidence</option>
              <option value="verified-desc">Recently Checked</option>
              <option value="evidence-desc">Most Evidence</option>
              <option value="name-asc">Name A-Z</option>
            </select>
          </label>

          <div className="stat-card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">Filtered Results</div>
            <div className="stat-value">{filteredTges.length}</div>
          </div>
        </div>
        <div className="directory-filter-meta" role="status" aria-live="polite">
          <span>
            {filteredTges.length} launch record{filteredTges.length === 1 ? "" : "s"} match the current tracker view.
          </span>
          {hasActiveFilters && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleResetFilters}>
              <RotateCcw size={14} aria-hidden="true" /> Reset
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="popLayout">
        {visibleTges.length > 0 ? (
          <motion.div layout className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
            {visibleTges.map((tge) => {
              const confidence = tge.confidence ?? 0;
              const tone = confidenceTone(confidence);
              const statusLabel = getTgeStatusLabel(tge);
              const evidenceCount = getTgeEvidenceCount(tge);
              const isGraduated = tge.lifecycleStatus === "graduated";
              const sourceHost = getTgeSourceHost(tge.dataSource);

              return (
                <motion.article
                  key={tge.id}
                  className="card h-full flex flex-col"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  whileHover={{ y: -4 }}
                  style={{ minHeight: 280, opacity: isGraduated ? 0.82 : 1 }}
                >
                  <Link href={`/upcoming/${tge.id}`} className="block h-full no-underline" style={{ color: "inherit" }}>
                    <div className="flex flex-col h-full">
                      <div className="flex justify-between gap-md items-start">
                        <div className="min-w-0">
                          <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, lineHeight: 1.2 }}>{tge.name}</h3>
                          <div style={{ marginTop: 4, color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                            {tge.symbol.toUpperCase()} / {tge.category}
                          </div>
                        </div>
                        <span className={`badge badge-${tone} flex-shrink-0`} style={{ fontSize: "0.7rem" }}>
                          {confidence}/100
                        </span>
                      </div>

                      <div style={{ marginTop: "var(--space-lg)", display: "grid", gap: "var(--space-sm)" }}>
                        <div className="flex justify-between gap-md">
                          <span className="stat-label flex items-center gap-1"><CheckCircle2 size={13} /> Status</span>
                          <strong style={{ fontSize: "var(--text-sm)", textAlign: "right" }}>{statusLabel}</strong>
                        </div>
                        <div className="flex justify-between gap-md">
                          <span className="stat-label flex items-center gap-1"><Calendar size={13} /> Window</span>
                          <strong style={{ fontSize: "var(--text-sm)", textAlign: "right" }}>{isGraduated && tge.graduatedAt ? formatDate(tge.graduatedAt) : tge.expectedTge}</strong>
                        </div>
                        <div className="flex justify-between gap-md">
                          <span className="stat-label flex items-center gap-1"><ShieldCheck size={13} /> Evidence</span>
                          <strong style={{ fontSize: "var(--text-sm)" }}>{evidenceCount} signal{evidenceCount === 1 ? "" : "s"}</strong>
                        </div>
                      </div>

                      <div className="mt-auto pt-md border-t border-color" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)" }}>
                        <span style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)" }}>
                          Checked {formatDate(tge.lastVerifiedAt || tge.discoveredAt)}
                        </span>
                        <span className="flex items-center gap-1" style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          <ExternalLink size={12} />
                          {sourceHost}
                        </span>
                      </div>
                    </div>
                  </Link>
                </motion.article>
              );
            })}
          </motion.div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card" style={{ textAlign: "center", padding: "var(--space-2xl)" }}>
            <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>No launches match these filters</h3>
            <p style={{ color: "var(--text-secondary)", marginTop: "var(--space-sm)" }}>{emptyStateMessage}</p>
            {hasActiveFilters && (
              <button type="button" className="btn btn-secondary" onClick={handleResetFilters} style={{ marginTop: "var(--space-md)" }}>
                <RotateCcw size={16} aria-hidden="true" /> Reset filters
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {filteredTges.length > 0 && (
        <div style={{ textAlign: "center", marginTop: "var(--space-2xl)" }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
            Showing {visibleTges.length} of {filteredTges.length} launch records
          </p>
          {hasMore && <button onClick={handleLoadMore} className="btn btn-secondary">Load More</button>}
        </div>
      )}
    </div>
  );
}

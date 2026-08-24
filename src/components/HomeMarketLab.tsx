"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  GitCompareArrows,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { trackEvent } from "@/lib/analytics";
import { formatCompact, formatPercent, formatPrice } from "@/lib/formatters";
import { getTgeEvidenceCount, getTgeStatusLabel, type UpcomingTge } from "@/lib/tge";
import { TokenIcon } from "@/components/TokenIcon";
import { WatchlistButton } from "@/components/WatchlistButton";
import type { HomeMarketToken } from "@/lib/home-market-data";

export interface NarrativeInsight {
  category: string;
  href?: string;
  tokenCount: number;
  avgRisk: number;
  avgChange24h: number;
  marketCap: number;
}

interface HomeMarketLabProps {
  tokens: HomeMarketToken[];
  narratives: NarrativeInsight[];
  launchTimeline: UpcomingTge[];
}

function riskTone(score: number): "green" | "yellow" | "red" {
  if (score <= 3) return "green";
  if (score <= 6) return "yellow";
  return "red";
}

function formatLaunchWindow(tge: UpcomingTge): string {
  if (tge.graduatedAt) {
    const date = new Date(tge.graduatedAt);
    if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  return tge.expectedTge || "Window pending";
}

function getHeatWidth(change: number, tokenCount: number): string {
  const width = Math.min(100, Math.max(18, Math.abs(change) * 8 + tokenCount * 2));
  return `${width}%`;
}

export function HomeMarketLab({ tokens, narratives, launchTimeline }: HomeMarketLabProps) {
  const [availableTokens, setAvailableTokens] = useState<HomeMarketToken[]>(tokens);
  const [isLoadingTokens, setIsLoadingTokens] = useState(false);
  const initialIds = tokens.slice(0, 3).map((token) => token.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [activeSlot, setActiveSlot] = useState(0);
  const [openSlot, setOpenSlot] = useState<number | null>(null);
  const [assetSearch, setAssetSearch] = useState("");
  const assetPickerRefs = useRef<Array<HTMLDivElement | null>>([]);

  const tokenMap = useMemo(() => new Map(availableTokens.map((token) => [token.id, token])), [availableTokens]);
  const selectedTokens = selectedIds
    .map((id) => tokenMap.get(id))
    .filter((token): token is HomeMarketToken => Boolean(token));
  const assetOptions = useMemo(() => {
    const query = assetSearch.trim().toLowerCase();
    const selectedInOtherSlots = new Set(selectedIds.filter((_, index) => index !== activeSlot));
    const matches = availableTokens.filter((token) => {
      if (selectedInOtherSlots.has(token.id)) return false;
      if (!query) return true;
      return (
        token.name.toLowerCase().includes(query) ||
        token.symbol.toLowerCase().includes(query) ||
        token.id.toLowerCase().includes(query) ||
        token.category.toLowerCase().includes(query)
      );
    });

    return matches.slice(0, 15);
  }, [activeSlot, assetSearch, availableTokens, selectedIds]);

  const loadAllTokens = () => {
    if (availableTokens.length > tokens.length || isLoadingTokens) return;
    setIsLoadingTokens(true);
    void fetch("/data/home-market-lab.json", { cache: "force-cache" })
      .then((response) => response.ok ? response.json() as Promise<HomeMarketToken[]> : [])
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) setAvailableTokens(items);
      })
      .catch(() => undefined)
      .finally(() => setIsLoadingTokens(false));
  };

  const handleSelect = (slotIndex: number, tokenId: string) => {
    const nextIds = [...selectedIds];
    nextIds[slotIndex] = tokenId;
    setSelectedIds(nextIds);
    setActiveSlot(slotIndex);
    setOpenSlot(null);
    setAssetSearch("");
    trackEvent("home_compare_select", {
      token_id: tokenId,
      compare_slot: slotIndex + 1,
      page_path: window.location.pathname,
    });
  };

  useEffect(() => {
    if (openSlot === null) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const activePicker = assetPickerRefs.current[openSlot];
      if (activePicker?.contains(target)) return;
      setOpenSlot(null);
      setAssetSearch("");
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenSlot(null);
      setAssetSearch("");
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openSlot]);

  if (!tokens.length) return null;

  return (
    <section className="section home-market-lab-section" id="market-lab">
      <div className="container">
        <div className="home-radar-heading">
          <div>
            <p className="eyebrow-text">Market Lab</p>
            <h2>
              Compare, scan, and <span className="gradient-text">follow the next signal</span>
            </h2>
            <p>Use the quick compare tool, narrative heatmap, and launch timeline before opening the full dashboards.</p>
          </div>
          <Link href="/tokens" className="home-preview-link">
            Browse all tokens <ArrowRight size={15} />
          </Link>
        </div>

        <div className="home-market-lab-grid">
          <div className="card home-compare-panel">
            <div className="home-market-lab-title">
              <GitCompareArrows size={18} />
              <h3>Token Compare Mini-Lab</h3>
            </div>

            <div className="home-compare-select-grid">
              {[0, 1, 2].map((slotIndex) => {
                const token = tokenMap.get(selectedIds[slotIndex]);
                const isActive = activeSlot === slotIndex;
                const isOpen = openSlot === slotIndex;

                return (
                  <div
                    key={slotIndex}
                    className={`home-compare-slot-wrap ${slotIndex === 1 ? "align-center" : ""} ${slotIndex === 2 ? "align-end" : ""}`}
                    ref={(element) => {
                      assetPickerRefs.current[slotIndex] = element;
                    }}
                  >
                    <button
                      type="button"
                      className={`home-compare-slot ${isActive ? "active" : ""}`}
                      onClick={() => {
                        setActiveSlot(slotIndex);
                        setOpenSlot(isOpen ? null : slotIndex);
                        setAssetSearch("");
                        if (!isOpen) loadAllTokens();
                      }}
                      aria-expanded={isOpen}
                      aria-haspopup="listbox"
                    >
                      <span className="home-compare-slot-label">Asset {slotIndex + 1}</span>
                      {token && (
                        <span className="home-compare-slot-token">
                          <TokenIcon
                            symbol={token.symbol}
                            name={token.name}
                            id={token.id}
                            imageUrl={token.imageUrl}
                            size={24}
                          />
                          <span>
                            <strong>{token.name}</strong>
                            <small>{token.symbol.toUpperCase()}</small>
                          </span>
                        </span>
                      )}
                    </button>

                    {isOpen && (
                      <div className="home-asset-picker" aria-label={`Choose asset ${slotIndex + 1}`}>
                        <input
                          type="search"
                          className="search-input home-asset-picker-search"
                          placeholder={`Search ${availableTokens.length.toLocaleString("en-US")} assets`}
                          value={assetSearch}
                          onChange={(event) => setAssetSearch(event.target.value)}
                          autoFocus
                        />
                        <div className="home-asset-picker-options" role="listbox">
                          {isLoadingTokens ? <p style={{ padding: "var(--space-sm)" }}>Loading full directory…</p> : null}
                          {assetOptions.map((token) => {
                            const isSelected = selectedIds[slotIndex] === token.id;

                            return (
                              <button
                                type="button"
                                className={`home-asset-picker-option ${isSelected ? "active" : ""}`}
                                key={token.id}
                                onClick={() => handleSelect(slotIndex, token.id)}
                                role="option"
                                aria-selected={isSelected}
                              >
                                <TokenIcon
                                  symbol={token.symbol}
                                  name={token.name}
                                  id={token.id}
                                  imageUrl={token.imageUrl}
                                  size={24}
                                />
                                <span>
                                  <strong>{token.name}</strong>
                                  <small>{token.symbol.toUpperCase()} / {token.category}</small>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="home-compare-matrix" role="table" aria-label="Token comparison matrix">
              <div className="home-compare-matrix-row home-compare-matrix-head" role="row">
                <span className="home-compare-metric-label" role="columnheader">Asset</span>
                {selectedTokens.map((token) => (
                  <div className="home-compare-token-head" key={token.id} role="columnheader">
                    <Link href={`/${token.id}`} className="home-compare-asset">
                      <TokenIcon
                        symbol={token.symbol}
                        name={token.name}
                        id={token.id}
                        imageUrl={token.imageUrl}
                        size={28}
                      />
                      <span>
                        <strong>{token.symbol.toUpperCase()}</strong>
                        <small>{token.name}</small>
                      </span>
                    </Link>
                    <WatchlistButton tokenId={token.id} tokenName={token.name} />
                  </div>
                ))}
              </div>

              <div className="home-compare-matrix-row" role="row">
                <span className="home-compare-metric-label" role="rowheader">Price</span>
                {selectedTokens.map((token) => (
                  <strong key={token.id} className="home-compare-matrix-cell" role="cell">{formatPrice(token.price)}</strong>
                ))}
              </div>

              <div className="home-compare-matrix-row" role="row">
                <span className="home-compare-metric-label" role="rowheader">24h</span>
                {selectedTokens.map((token) => {
                  const changeIsPositive = token.priceChange24h >= 0;
                  return (
                    <strong key={token.id} className={`home-compare-matrix-cell ${changeIsPositive ? "price-up" : "price-down"}`} role="cell">
                      {changeIsPositive ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                      {formatPercent(token.priceChange24h || 0)}
                    </strong>
                  );
                })}
              </div>

              <div className="home-compare-matrix-row" role="row">
                <span className="home-compare-metric-label" role="rowheader">Risk</span>
                {selectedTokens.map((token) => (
                  <strong key={token.id} className={`badge badge-${riskTone(token.riskScore)} home-compare-risk-cell`} role="cell">
                    <ShieldAlert size={12} />
                    {token.riskScore}/10
                  </strong>
                ))}
              </div>

              <div className="home-compare-matrix-row" role="row">
                <span className="home-compare-metric-label" role="rowheader">Market Cap</span>
                {selectedTokens.map((token) => (
                  <strong key={token.id} className="home-compare-matrix-cell" role="cell">{formatCompact(token.marketCap)}</strong>
                ))}
              </div>

              <div className="home-compare-matrix-row" role="row">
                <span className="home-compare-metric-label" role="rowheader">Category</span>
                {selectedTokens.map((token) => (
                  token.categoryHref ? (
                    <span key={token.id} className="home-compare-category-cell" role="cell">
                      <Link href={token.categoryHref} className="home-compare-category-link">
                        {token.category}
                      </Link>
                    </span>
                  ) : (
                    <span key={token.id} className="home-compare-category-cell" role="cell">{token.category}</span>
                  )
                ))}
              </div>
            </div>
          </div>

          <div className="card home-narrative-panel">
            <div className="home-market-lab-title">
              <BarChart3 size={18} />
              <h3>Narrative Heatmap</h3>
            </div>
            <div className="home-narrative-list">
              {narratives.slice(0, 5).map((narrative) => {
                const isPositive = narrative.avgChange24h >= 0;
                const heatWidth = getHeatWidth(narrative.avgChange24h, narrative.tokenCount);
                const content = (
                  <>
                    <div className="home-narrative-row-top">
                      <strong>{narrative.category}</strong>
                      <span className={isPositive ? "price-up" : "price-down"}>{formatPercent(narrative.avgChange24h)}</span>
                    </div>
                    <div className="home-narrative-bar" aria-hidden="true">
                      <span className={isPositive ? "positive" : "negative"} style={{ width: heatWidth }} />
                    </div>
                    <div className="home-narrative-row-meta">
                      <span>{narrative.tokenCount} tokens</span>
                      <span>Risk {narrative.avgRisk}/10</span>
                      <span>{formatCompact(narrative.marketCap)}</span>
                    </div>
                  </>
                );

                return narrative.href ? (
                  <Link href={narrative.href} className="home-narrative-row" key={narrative.category}>
                    {content}
                  </Link>
                ) : (
                  <div className="home-narrative-row" key={narrative.category}>
                    {content}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card home-launch-timeline-panel">
            <div className="home-market-lab-title">
              <CalendarDays size={18} />
              <h3>Launch Timeline</h3>
            </div>
            <div className="home-launch-timeline-list">
              {launchTimeline.slice(0, 4).map((tge) => (
                <Link href={`/upcoming/${tge.id}`} className="home-launch-timeline-item" key={tge.id}>
                  <span className="home-launch-timeline-dot" />
                  <span className="home-launch-timeline-copy">
                    <strong>{tge.name}</strong>
                    <small>{tge.symbol.toUpperCase()} / {formatLaunchWindow(tge)}</small>
                  </span>
                  <span className="home-launch-timeline-meta">
                    <span><CheckCircle2 size={12} /> {getTgeStatusLabel(tge)}</span>
                    <span>{getTgeEvidenceCount(tge)} signals</span>
                  </span>
                </Link>
              ))}
            </div>
            <Link href="/upcoming" className="home-radar-watchlist-link">
              Open launch watchlist <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

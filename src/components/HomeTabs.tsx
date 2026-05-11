"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Calendar, CheckCircle2, ExternalLink, Rocket, ShieldAlert, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { type TokenCardData } from "./TokenCard";
import { TokenIcon } from "./TokenIcon";
import { type UpcomingTge } from "@/lib/content-loader";
import { formatCompact, formatPercent, formatPrice } from "@/lib/formatters";
import { getTgeEvidenceCount, getTgeSourceHost, getTgeStatusLabel } from "@/lib/tge";
import { slugify } from "@/lib/shared-utils";
import { trackEvent } from "@/lib/analytics";

interface HomeTabsProps {
  trackedTokens: TokenCardData[];
  trackedTotal: number;
  upcomingTges: UpcomingTge[];
  upcomingTotal: number;
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function riskTone(score: number): "green" | "yellow" | "red" {
  if (score <= 3) return "green";
  if (score <= 6) return "yellow";
  return "red";
}

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

function MarketPreviewTable({ tokens, totalCount }: { tokens: TokenCardData[]; totalCount: number }) {
  return (
    <div className="home-preview-shell">
      <div className="home-market-scroll" role="region" aria-label="Featured token market risk preview" tabIndex={0}>
        <table className="home-market-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Price</th>
              <th>24h</th>
              <th>Risk</th>
              <th>Market Cap</th>
              <th>Category</th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const changeIsPositive = token.priceChange24h >= 0;
              const tone = riskTone(token.riskScore);

              return (
                <tr key={token.id}>
                  <td>
                    <Link href={`/${token.id}`} className="home-asset-link">
                      <TokenIcon
                        symbol={token.symbol}
                        name={token.name}
                        id={token.id}
                        imageUrl={token.imageUrl}
                        size={28}
                      />
                      <span className="home-asset-copy">
                        <strong>{token.name}</strong>
                        <span>{token.symbol.toUpperCase()}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="home-market-mono">{formatPrice(token.price)}</td>
                  <td className={changeIsPositive ? "price-up" : "price-down"}>
                    <span className="home-market-change">
                      {changeIsPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                      {formatPercent(token.priceChange24h || 0)}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${tone} home-risk-badge`}>
                      <ShieldAlert size={12} />
                      {token.riskScore}/10
                    </span>
                  </td>
                  <td className="home-market-mono">{formatCompact(token.marketCap)}</td>
                  <td>
                    <Link href={`/category/${slugify(token.category)}`} className="home-category-link">
                      {token.category}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="home-preview-footer">
        <span>Showing {formatInteger(tokens.length)} featured assets from {formatInteger(totalCount)} tracked tokens.</span>
        <Link href="/tokens" className="home-preview-link">
          Open full token directory <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

function LaunchPreviewList({ tges, totalCount }: { tges: UpcomingTge[]; totalCount: number }) {
  if (!tges.length) return null;

  return (
    <div className="home-preview-shell">
      <div className="home-launch-grid">
        {tges.map((tge) => {
          const confidence = tge.confidence ?? 0;
          const tone = confidenceTone(confidence);
          const evidenceCount = getTgeEvidenceCount(tge);
          const sourceHost = getTgeSourceHost(tge.dataSource);
          const checkedAt = formatDate(tge.lastVerifiedAt || tge.discoveredAt);

          return (
            <Link href={`/upcoming/${tge.id}`} key={tge.id} className="card home-launch-card">
              <div className="home-launch-topline">
                <div className="min-w-0">
                  <h3>{tge.name}</h3>
                  <p>{tge.symbol.toUpperCase()} / {tge.category}</p>
                </div>
                <span className={`badge badge-${tone}`}>{confidence}/100</span>
              </div>

              <div className="home-launch-metrics">
                <div>
                  <span><CheckCircle2 size={13} /> Status</span>
                  <strong>{getTgeStatusLabel(tge)}</strong>
                </div>
                <div>
                  <span><Calendar size={13} /> Window</span>
                  <strong>{tge.graduatedAt ? formatDate(tge.graduatedAt) : tge.expectedTge}</strong>
                </div>
                <div>
                  <span><ShieldCheck size={13} /> Evidence</span>
                  <strong>{evidenceCount} signal{evidenceCount === 1 ? "" : "s"}</strong>
                </div>
              </div>

              <div className="home-launch-source">
                <span>Checked {checkedAt}</span>
                <span><ExternalLink size={12} /> {sourceHost}</span>
              </div>
            </Link>
          );
        })}
      </div>
      <div className="home-preview-footer">
        <span>Showing {formatInteger(tges.length)} launch records from the {formatInteger(totalCount)}-project watchlist.</span>
        <Link href="/upcoming" className="home-preview-link">
          Open launch watchlist <ArrowRight size={15} />
        </Link>
      </div>
    </div>
  );
}

export function HomeTabs({ trackedTokens, trackedTotal, upcomingTges, upcomingTotal }: HomeTabsProps) {
  const [activeTab, setActiveTab] = useState<"tracked" | "upcoming">("tracked");
  const selectTab = (tab: "tracked" | "upcoming") => {
    setActiveTab(tab);
    trackEvent("tab_select", {
      tab_name: tab,
      page_path: window.location.pathname,
    });
  };

  return (
    <div className="container" style={{ marginTop: "var(--space-xl)" }}>
      <div className="tabs-container" role="tablist" aria-label="Home market views">
        <div
          className="tab-indicator"
          aria-hidden="true"
          style={{
            width: "calc(50% - 4px)",
            transform: activeTab === "tracked" ? "translateX(0)" : "translateX(100%)",
          }}
        />
        <button
          type="button"
          role="tab"
          id="home-tab-tracked"
          aria-selected={activeTab === "tracked"}
          aria-controls="home-panel-tracked"
          className={`tab-btn ${activeTab === "tracked" ? "active" : ""}`}
          onClick={() => selectTab("tracked")}
          data-analytics-id="home-tab-tracked"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <TrendingUp size={18} style={{ color: activeTab === "tracked" ? "var(--accent-primary)" : "var(--text-muted)" }} />
            <span>Market Risk</span>
          </div>
          <span className="badge badge-accent">{formatInteger(trackedTotal)}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="home-tab-upcoming"
          aria-selected={activeTab === "upcoming"}
          aria-controls="home-panel-upcoming"
          className={`tab-btn ${activeTab === "upcoming" ? "active" : ""}`}
          onClick={() => selectTab("upcoming")}
          data-analytics-id="home-tab-upcoming"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Rocket size={18} style={{ color: activeTab === "upcoming" ? "var(--accent-primary)" : "var(--text-muted)" }} />
            <span>Launch Signals</span>
          </div>
          <span className="badge badge-accent">{formatInteger(upcomingTotal)}</span>
        </button>
      </div>

      {activeTab === "tracked" ? (
        <div id="home-panel-tracked" role="tabpanel" aria-labelledby="home-tab-tracked" className="animate-in">
          <div className="section-header" style={{ textAlign: "center" }}>
            <h2>Market <span className="gradient-text">Risk Preview</span></h2>
            <p>Top tracked assets by market rank, condensed for fast comparison.</p>
          </div>
          <MarketPreviewTable tokens={trackedTokens} totalCount={trackedTotal} />
        </div>
      ) : (
        <div id="home-panel-upcoming" role="tabpanel" aria-labelledby="home-tab-upcoming" className="animate-in">
          <div className="section-header" style={{ textAlign: "center" }}>
            <h2>Launch <span className="gradient-text">Signal Preview</span></h2>
            <p>Evidence-weighted records for projects moving toward launch, listing, or graduation.</p>
          </div>
          <LaunchPreviewList tges={upcomingTges} totalCount={upcomingTotal} />
        </div>
      )}
    </div>
  );
}

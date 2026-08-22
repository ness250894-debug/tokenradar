"use client";
import Link from "next/link";
import { DollarSign, Radar, SearchCheck, ShieldAlert, TrendingDown, TrendingUp } from "lucide-react";
import { TokenTickerPill } from "./TokenTickerPill";
import { WatchlistButton } from "./WatchlistButton";
import { trackEvent } from "@/lib/analytics";
import type { AttentionLabel, HypeClassification, SearchIntentType } from "@/lib/search-intent";

export interface TokenCardData {
  id: string;
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  riskScore: number;
  category: string;
  categoryHref?: string;
  imageUrl?: string;
  searchIntentAttentionScore?: number;
  searchIntentAttentionLabel?: AttentionLabel;
  searchIntentHypeScore?: number;
  searchIntentSupplyRiskScore?: number;
  searchIntentClassification?: HypeClassification;
  searchIntentPrimaryIntent?: SearchIntentType;
  searchIntentPrimaryLabel?: string;
  searchIntentAttentionDelta?: number;
  searchIntentHypeDelta?: number;
  searchIntentSupplyRiskDelta?: number;
}

interface TokenCardProps {
  token: TokenCardData;
}

function formatCompact(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatDelta(value: number | undefined): string | null {
  if (typeof value !== "number") return null;
  if (value === 0) return "0 vs prev";
  return `${value > 0 ? "+" : ""}${value} vs prev`;
}

export function TokenCard({ token }: TokenCardProps) {
  const isPositive = token.priceChange24h >= 0;
  const riskLevel = token.riskScore <= 3 ? "green" : token.riskScore <= 6 ? "yellow" : "red";
  const hasSearchIntent = typeof token.searchIntentAttentionScore === "number";
  const attentionTone =
    (token.searchIntentAttentionScore || 0) >= 75
      ? "red"
      : (token.searchIntentAttentionScore || 0) >= 55
        ? "yellow"
        : "blue";
  const attentionDelta = formatDelta(token.searchIntentAttentionDelta);

  const handleCategoryClick = () => {
    trackEvent("category_click", {
      category: token.category,
      token_id: token.id,
      page_path: window.location.pathname,
    });
  };

  const handleSearchIntentClick = () => {
    trackEvent("search_intent_badge_click", {
      token_id: token.id,
      primary_intent: token.searchIntentPrimaryIntent,
      attention_score: token.searchIntentAttentionScore,
      page_path: window.location.pathname,
    });
  };

  return (
    <div style={{ height: "100%" }}>
      <article className="card token-card h-full flex flex-col relative">
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-start gap-2">
            <Link
              href={`/${token.id}`}
              className="token-card-link min-w-0 flex-1"
              aria-label={`Open ${token.name} research profile`}
            >
              <span style={{ overflow: "hidden", display: "block" }}>
                <TokenTickerPill 
                  name={token.name} 
                  symbol={token.symbol} 
                  id={token.id}
                  price={token.price} 
                  imageUrl={token.imageUrl} 
                />
              </span>
            </Link>
            <div className="token-card-actions">
              <WatchlistButton tokenId={token.id} tokenName={token.name} />
              <span className={`badge badge-${riskLevel} flex-shrink-0 relative z-10 flex items-center gap-1 mt-1`}>
                <ShieldAlert size={12} className="opacity-80" />
                Risk {token.riskScore}/10
              </span>
            </div>
          </div>
          <div className="min-w-0">
            {token.categoryHref ? (
              <Link
                href={token.categoryHref}
                onClick={handleCategoryClick}
                className="badge badge-accent hover-scale inline-block relative z-30 cursor-pointer"
                style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {token.category}
              </Link>
            ) : (
              <span
                className="badge badge-accent inline-block relative z-30"
                style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {token.category}
              </span>
            )}
          </div>
          {hasSearchIntent && (
            <div className="token-card-intent-row">
              <Link
                href={`/${token.id}#search-intent-radar`}
                onClick={handleSearchIntentClick}
                className={`badge badge-${attentionTone} token-card-intent-badge`}
                aria-label={`Open ${token.name} Research Intent Proxy`}
              >
                <Radar size={12} />
                Research {token.searchIntentAttentionScore}/100
              </Link>
              {attentionDelta && (
                <span className={`token-card-intent-delta ${token.searchIntentAttentionDelta && token.searchIntentAttentionDelta > 0 ? "price-up" : token.searchIntentAttentionDelta && token.searchIntentAttentionDelta < 0 ? "price-down" : ""}`}>
                  {attentionDelta}
                </span>
              )}
              {token.searchIntentPrimaryLabel && (
                <span className="token-card-intent-label">
                  <SearchCheck size={12} />
                  {token.searchIntentPrimaryLabel}
                </span>
              )}
            </div>
          )}
        </div>

        <Link href={`/${token.id}`} className="token-card-stats-link grid grid-cols-2 gap-md mt-xl pt-md border-t border-color mt-auto">
          <div>
            <div className="stat-label mb-1 flex items-center gap-1">
              {isPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
              24h Change
            </div>
            <div className={`stat-value text-lg flex items-center gap-1 ${isPositive ? "price-up" : "price-down"}`}>
              {isPositive ? "+" : ""}{(token.priceChange24h || 0).toFixed(2)}%
            </div>
          </div>
          <div className="text-right">
            <div className="stat-label mb-1 flex items-center gap-1 justify-end">
              <DollarSign size={10} />
              Market Cap
            </div>
            <div className="stat-value text-lg">{formatCompact(token.marketCap)}</div>
          </div>
        </Link>
      </article>
    </div>
  );
}

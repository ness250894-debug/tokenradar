"use client";

import Link from "next/link";
import { ArrowRight, Radar, SearchCheck, ShieldAlert } from "lucide-react";

import { TokenIcon } from "@/components/TokenIcon";
import type { TokenCardData } from "@/components/TokenCard";
import type { TokenSearchIntentSnapshot, TokenSearchIntentTrend } from "@/lib/search-intent";
import { trackEvent } from "@/lib/analytics";

interface HomeSearchIntentRadarProps {
  intents: TokenSearchIntentSnapshot[];
  tokens: TokenCardData[];
  trends?: Record<string, TokenSearchIntentTrend>;
}

function scoreTone(score: number): "green" | "yellow" | "red" | "blue" {
  if (score >= 75) return "red";
  if (score >= 55) return "yellow";
  if (score >= 35) return "blue";
  return "green";
}

function formatDelta(value: number | undefined): string | null {
  if (typeof value !== "number") return null;
  if (value === 0) return "0 vs prev";
  return `${value > 0 ? "+" : ""}${value} vs prev`;
}

export function HomeSearchIntentRadar({ intents, tokens, trends = {} }: HomeSearchIntentRadarProps) {
  if (!intents.length) return null;

  const tokenMap = new Map(tokens.map((token) => [token.id, token]));

  return (
    <section className="section home-search-intent-section" id="search-intent">
      <div className="container">
        <div className="home-radar-heading">
          <div>
            <p className="eyebrow-text">Search Intent Radar</p>
            <h2>
              Search intent <span className="gradient-text">mapped to market data</span>
            </h2>
            <p>Free-data attention signals mapped to price movement, risk, supply pressure, and narratives.</p>
          </div>
          <Link href="/tokens" className="home-preview-link">
            Open token directory <ArrowRight size={15} />
          </Link>
        </div>

        <div className="home-search-intent-grid">
          {intents.slice(0, 6).map((intent) => {
            const token = tokenMap.get(intent.tokenId);
            const tone = scoreTone(intent.attentionScore);
            const trend = trends[intent.tokenId];
            const attentionDelta = formatDelta(trend?.attentionDelta);
            const handleClick = () => {
              trackEvent("search_intent_card_click", {
                token_id: intent.tokenId,
                primary_intent: intent.primaryIntent,
                classification: intent.classification,
                attention_score: intent.attentionScore,
                source_section: "home_search_intent",
                page_path: window.location.pathname,
              });
            };

            return (
              <Link
                href={`/${intent.tokenId}#search-intent-radar`}
                className={`home-search-intent-card home-search-intent-${tone}`}
                key={intent.tokenId}
                onClick={handleClick}
              >
                <div className="home-search-intent-top">
                  <div className="home-search-intent-token">
                    <TokenIcon
                      symbol={intent.symbol}
                      name={intent.tokenName}
                      id={intent.tokenId}
                      imageUrl={token?.imageUrl}
                      size={34}
                    />
                    <span>
                      <strong>{intent.symbol.toUpperCase()}</strong>
                      <small>{intent.tokenName}</small>
                    </span>
                  </div>
                  <span className={`badge badge-${tone}`}>
                    <Radar size={12} />
                    {intent.attentionScore}
                  </span>
                </div>
                <div className="home-search-intent-body">
                  <span className="home-search-intent-classification">
                    <SearchCheck size={14} />
                    {intent.classification}
                  </span>
                  <strong>{intent.intentMix[0]?.label || "Search interest"}</strong>
                  <p>{intent.drivers[0]}</p>
                </div>
                <div className="home-search-intent-foot">
                  <span>
                    <ShieldAlert size={12} />
                    Supply {intent.supplyRiskScore}/100
                  </span>
                  <span>{attentionDelta || intent.attentionLabel}</span>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="home-search-intent-footer">
          <Link href="/search-intent" className="btn btn-secondary">
            Open Search Intent Radar <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

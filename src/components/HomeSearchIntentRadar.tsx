import Link from "next/link";
import { ArrowRight, Radar, SearchCheck, ShieldAlert } from "lucide-react";

import { TokenIcon } from "@/components/TokenIcon";
import type { TokenSearchIntentSnapshot, TokenSearchIntentTrend } from "@/lib/search-intent";

interface SearchIntentTokenReference {
  id: string;
  imageUrl?: string;
}

interface HomeSearchIntentRadarProps {
  intents: TokenSearchIntentSnapshot[];
  tokens: SearchIntentTokenReference[];
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
            <p className="eyebrow-text">Research Intent Proxy</p>
            <h2>
              Research themes <span className="gradient-text">mapped to market data</span>
            </h2>
            <p>Inferred attention signals from price movement, risk, supply pressure, and narratives—not measured search demand.</p>
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

            return (
              <Link
                href={`/${intent.tokenId}#search-intent-radar`}
                className={`home-search-intent-card home-search-intent-${tone}`}
                key={intent.tokenId}
                data-analytics-id={`home-search-intent-${intent.tokenId}`}
                data-analytics-label={`${intent.symbol.toUpperCase()} ${intent.classification}`}
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
                  <strong>{intent.intentMix[0]?.label || "Research theme"}</strong>
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
            Open Research Intent Proxy <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

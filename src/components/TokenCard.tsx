import Link from "next/link";
import { TokenTickerPill } from "./TokenTickerPill";
import { CardGlare } from "./CardGlare";

export interface TokenCardData {
  id: string;
  name: string;
  symbol: string;
  price: number;
  priceChange24h: number;
  marketCap: number;
  riskScore: number;
  category: string;
  imageUrl?: string;
}

interface TokenCardProps {
  token: TokenCardData;
}

/**
 * Formats a number as compact currency (e.g., $1.23B, $456M).
 */
function formatCompact(value: number): string {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

/**
 * Formats price with appropriate decimal places.
 */
function _formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

/**
 * Token summary card used in listings (homepage, search results).
 * Shows rank, name, price, 24h change, market cap, risk score, and category badge.
 */
export function TokenCard({ token }: TokenCardProps) {
  const isPositive = token.priceChange24h >= 0;
  const riskLevel = token.riskScore <= 3 ? "green" : token.riskScore <= 6 ? "yellow" : "red";

  return (
    <CardGlare style={{ height: "100%" }}>
      <Link href={`/${token.id}`} className="card" id={`token-card-${token.id}`} style={{ display: "block", textDecoration: "none", height: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-sm)" }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="token-name" style={{ minWidth: 0 }}>
              <TokenTickerPill 
                name={token.name} 
                symbol={token.symbol} 
                id={token.id}
                price={token.price} 
                imageUrl={token.imageUrl} 
              />
            </div>
            <div style={{ marginTop: "var(--space-sm)" }}>
              <span className="badge badge-accent">{token.category}</span>
            </div>
          </div>
          <span className={`badge badge-${riskLevel}`} style={{ flexShrink: 0 }}>
            Risk {token.riskScore}/10
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-md)", marginTop: "var(--space-xl)", paddingTop: "var(--space-md)", borderTop: "1px solid var(--border-color)" }}>
          <div>
            <div className="stat-label" style={{ marginBottom: "4px" }}>24h Change</div>
            <div className={`stat-value ${isPositive ? "price-up" : "price-down"}`} style={{ fontSize: "1.1rem" }}>
              {isPositive ? "▲" : "▼"} {Math.abs(token.priceChange24h).toFixed(2)}%
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="stat-label" style={{ marginBottom: "4px" }}>Market Cap</div>
            <div className="stat-value" style={{ fontSize: "1.1rem" }}>{formatCompact(token.marketCap)}</div>
          </div>
        </div>
      </Link>
    </CardGlare>
  );
}

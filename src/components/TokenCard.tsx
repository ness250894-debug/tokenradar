import Link from "next/link";

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
function formatPrice(price: number): string {
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
    <Link href={`/${token.id}`} className="card" id={`token-card-${token.id}`} style={{ display: "block", textDecoration: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div className="token-name">
            {token.imageUrl && (
              <img
                src={token.imageUrl}
                alt={`${token.name} logo`}
                width={28}
                height={28}
                style={{ borderRadius: "50%" }}
              />
            )}
            <span>
              {token.name} <span className="token-symbol">{token.symbol.toUpperCase()}</span>
            </span>
          </div>
        </div>
        <span className={`badge badge-${riskLevel}`}>
          Risk {token.riskScore}/10
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "var(--space-lg)" }}>
        <div>
          <div style={{ fontSize: "var(--text-2xl)", fontWeight: 700 }}>
            {formatPrice(token.price)}
          </div>
          <div className={`stat-change ${isPositive ? "price-up" : "price-down"}`}>
            {isPositive ? "▲" : "▼"} {Math.abs(token.priceChange24h).toFixed(2)}%
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Market Cap</div>
          <div style={{ fontWeight: 600 }}>{formatCompact(token.marketCap)}</div>
        </div>
      </div>

      <div style={{ marginTop: "var(--space-md)" }}>
        <span className="badge badge-accent">{token.category}</span>
      </div>
    </Link>
  );
}

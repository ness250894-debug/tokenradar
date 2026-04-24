interface AffiliateButtonProps {
  /** Token symbol (e.g., "INJ") */
  symbol: string;
  /** Token name for display */
  tokenName: string;
  /** Exchange name */
  exchange?: string;
}

import Link from "next/link";
import { REFERRAL_URLS } from "@/lib/config";

/**
 * Affiliate CTA button for "How to Buy" articles.
 * Links to major exchanges with proper disclosure.
 * Affiliate links will be added when partnerships are established.
 */
export function AffiliateButton({
  symbol,
  tokenName,
  exchange = "Binance",
}: AffiliateButtonProps) {
  // Referral links
  const exchangeUrl = REFERRAL_URLS[exchange.toLowerCase()];

  // Don't render a button for exchanges without a valid referral link
  if (!exchangeUrl) return null;

  return (
    <div
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        padding: "var(--space-lg)",
        marginTop: "var(--space-lg)",
        marginBottom: "var(--space-lg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-md)",
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>
            Buy {symbol.toUpperCase()} on {exchange}
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: "var(--space-xs)",
            }}
          >
            Trade {tokenName} on a trusted exchange
          </div>
        </div>
        <a
          href={exchangeUrl}
          target="_blank"
          rel="noopener noreferrer sponsored"
          className="btn btn-primary"
          id={`affiliate-btn-${exchange.toLowerCase()}-${symbol.toLowerCase()}`}
        >
          Trade on {exchange} →
        </a>
      </div>
      <div
        style={{
          fontSize: "var(--text-xs)",
          color: "var(--text-muted)",
          marginTop: "var(--space-md)",
          fontStyle: "italic",
        }}
      >
        This link may be an affiliate link. See our{" "}
          <Link href="/disclaimer" className="affiliate-disclaimer-link">
            Affiliate Disclaimer
          </Link>{" "}
        for details.
      </div>
    </div>
  );
}

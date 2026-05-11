interface AffiliateButtonProps {
  /** Token symbol (e.g., "INJ") */
  symbol: string;
  /** Token name for display */
  tokenName: string;
  /** Exchange name */
  exchange?: string;
}

import Link from "next/link";
import {
  getExchangePartners,
  getPartnerLinkAttributes,
  isRestrictedForUsAudience,
} from "@/lib/partners";

/**
 * Affiliate CTA button for "How to Buy" articles.
 * Links to configured exchange partners with disclosure and jurisdiction context.
 */
export function AffiliateButton({
  symbol,
  tokenName,
  exchange = "Binance",
}: AffiliateButtonProps) {
  const partner = getExchangePartners({ includeUsRestricted: true })
    .find((candidate) => candidate.name.toLowerCase() === exchange.toLowerCase());

  // Don't render a button for exchanges without a valid referral link
  if (!partner) return null;

  const restrictedForUs = isRestrictedForUsAudience(partner);

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
            Check {symbol.toUpperCase()} availability on {partner.name}
          </div>
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              marginTop: "var(--space-xs)",
            }}
          >
            Verify {tokenName} listings and regional eligibility before depositing
          </div>
        </div>
        <a
          href={partner.url}
          {...getPartnerLinkAttributes(partner, "affiliate-button")}
          className="btn btn-primary"
          id={`affiliate-btn-${partner.id}-${symbol.toLowerCase()}`}
        >
          {restrictedForUs ? `${partner.shortCta} (non-US) ->` : `${partner.cta} ->`}
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
        Paid link: TokenRadar may earn a commission. {partner.availability.note} See our{" "}
          <Link href="/disclaimer" className="affiliate-disclaimer-link">
            Affiliate Disclaimer
          </Link>{" "}
        for details.
      </div>
    </div>
  );
}

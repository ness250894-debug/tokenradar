import { AlertTriangle, ExternalLink, Info } from "lucide-react";

import {
  getExchangePartners,
  getPartnerLinkAttributes,
  isRestrictedForUsAudience,
} from "@/lib/partners";

interface ExchangeReferralPanelProps {
  symbol: string;
  tokenName: string;
}

function ExchangeCard({
  partner,
  symbol,
  placement,
}: {
  partner: ReturnType<typeof getExchangePartners>[number];
  symbol: string;
  placement: string;
}) {
  const restrictedForUs = isRestrictedForUsAudience(partner);

  return (
    <div
      className="card"
      style={{
        padding: "var(--space-lg)",
        border: restrictedForUs ? "1px solid rgba(234, 179, 8, 0.35)" : "1px solid var(--border-color)",
        background: restrictedForUs ? "rgba(234, 179, 8, 0.04)" : "var(--bg-card)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-md)", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>{partner.name}</div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginTop: "4px" }}>
            {partner.availability.label}
          </div>
        </div>
        {restrictedForUs ? (
          <AlertTriangle size={18} style={{ color: "#eab308", flexShrink: 0 }} />
        ) : (
          <Info size={18} style={{ color: "var(--accent-secondary)", flexShrink: 0 }} />
        )}
      </div>

      <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.6, marginTop: "var(--space-sm)" }}>
        {partner.description}
      </p>

      <p style={{ color: restrictedForUs ? "#eab308" : "var(--text-muted)", fontSize: "var(--text-xs)", lineHeight: 1.5, marginTop: "var(--space-sm)" }}>
        {partner.availability.note}
      </p>

      <a
        href={partner.url}
        {...getPartnerLinkAttributes(partner, placement)}
        className="btn btn-primary"
        style={{
          marginTop: "var(--space-md)",
          width: "100%",
          justifyContent: "center",
          background: partner.color,
          color: partner.textColor,
          border: "none",
        }}
      >
        {restrictedForUs ? `${partner.shortCta} (non-US)` : partner.cta}
        <ExternalLink size={14} />
      </a>

      <div style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", lineHeight: 1.5, marginTop: "var(--space-sm)" }}>
        Paid link: TokenRadar may earn a commission. Verify {symbol.toUpperCase()} availability before depositing.
      </div>
    </div>
  );
}

export function ExchangeReferralPanel({ symbol, tokenName }: ExchangeReferralPanelProps) {
  const partners = getExchangePartners({ includeUsRestricted: true });
  const primaryPartners = partners.filter((partner) => !isRestrictedForUsAudience(partner));
  const globalPartners = partners.filter(isRestrictedForUsAudience);

  return (
    <section style={{ marginTop: "var(--space-xl)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "var(--space-md)", flexWrap: "wrap", marginBottom: "var(--space-md)" }}>
        <div>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 800, marginBottom: "var(--space-xs)" }}>
            Where to Check {symbol.toUpperCase()} Markets
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", maxWidth: "760px" }}>
            Listings and regional access change. Confirm that {tokenName} is listed, verify the trading pair, and check local eligibility before opening an account or sending funds.
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-md)" }}>
        {primaryPartners.map((partner) => (
          <ExchangeCard key={partner.id} partner={partner} symbol={symbol} placement="how-to-buy-primary" />
        ))}
      </div>

      {globalPartners.length > 0 && (
        <div style={{ marginTop: "var(--space-lg)" }}>
          <h3 style={{ fontSize: "var(--text-base)", fontWeight: 800, marginBottom: "var(--space-sm)", color: "#eab308" }}>
            Global Partner Links
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "var(--text-xs)", lineHeight: 1.6, marginBottom: "var(--space-md)" }}>
            These paid links are for eligible non-US users only. They are kept separate so US readers do not confuse them with locally available options.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--space-md)" }}>
            {globalPartners.map((partner) => (
              <ExchangeCard key={partner.id} partner={partner} symbol={symbol} placement="how-to-buy-global" />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

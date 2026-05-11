import Link from 'next/link';
import { Calculator } from 'lucide-react';
import { getPartner, getPartnerLinkAttributes } from '@/lib/partners';

interface TaxGuideCTAProps {
  symbol: string;
  name: string;
  variant?: 'full' | 'sidebar' | 'inline';
}

export function TaxGuideCTA({ symbol, name, variant = 'full' }: TaxGuideCTAProps) {
  const koinly = getPartner("koinly");
  const coinledger = getPartner("coinledger");

  if (variant === 'sidebar') {
    return (
      <div className="card" style={{ padding: "var(--space-md)", background: "rgba(234, 179, 8, 0.05)", border: "1px solid rgba(234, 179, 8, 0.2)", marginBottom: "var(--space-md)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-xs)", color: "#eab308" }}>
          <Calculator size={16} />
          <h4 style={{ fontSize: "var(--text-xs)", fontWeight: 700, textTransform: "uppercase", margin: 0 }}>Tax Compliance</h4>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-xs)" }}>
          {koinly && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)" }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>1. {koinly.name}</span>
              <a href={koinly.url} {...getPartnerLinkAttributes(koinly, "tax-sidebar")} style={{ fontSize: "var(--text-xs)", color: "#eab308", textDecoration: "none" }}>Paid link</a>
            </div>
          )}
          {coinledger && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-sm)" }}>
              <span style={{ fontSize: "var(--text-xs)", fontWeight: 600 }}>2. {coinledger.name}</span>
              <a href={coinledger.url} {...getPartnerLinkAttributes(coinledger, "tax-sidebar")} style={{ fontSize: "var(--text-xs)", color: "#eab308", textDecoration: "none" }}>Paid link</a>
            </div>
          )}
        </div>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "var(--space-xs)", lineHeight: 1.4 }}>
          TokenRadar may earn a commission.
        </div>
        <Link 
          href="/crypto-tax-guide" 
          style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", textDecoration: "none", marginTop: "var(--space-sm)", display: "block" }}
        >
          View Guide &rarr;
        </Link>
      </div>
    );
  }

  if (variant === 'inline') {
    return (
      <div className="card-premium h-full" style={{ padding: "var(--space-md)", background: "rgba(234, 179, 8, 0.03)", border: "1px solid rgba(234, 179, 8, 0.2)", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "var(--space-sm)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--space-sm)" }}>
          <div style={{ padding: "8px", background: "rgba(234, 179, 8, 0.1)", borderRadius: "var(--radius-sm)", color: "#eab308", flexShrink: 0 }}>
            <Calculator size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.2, marginBottom: "4px" }}>Tax Guide 2026</div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.4 }}>
              Calculate {name} gains.
            </div>
          </div>
        </div>
        <Link href="/crypto-tax-guide" style={{ fontSize: "var(--text-xs)", color: "#eab308", fontWeight: 700, textDecoration: "none", padding: "8px 12px", border: "1px solid #eab308", borderRadius: "var(--radius-sm)", textAlign: "center", width: "100%", background: "rgba(234, 179, 8, 0.05)" }}>
          View Tax Help
        </Link>
      </div>
    );
  }

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(234, 179, 8, 0.1) 0%, var(--surface-color) 100%)",
      border: "1px solid rgba(234, 179, 8, 0.3)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-xl)",
      marginTop: "var(--space-2xl)",
      marginBottom: "var(--space-xl)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-md)",
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{ position: "absolute", top: "-20px", right: "-10px", opacity: 0.05, color: "#eab308", pointerEvents: "none" }}>
        <Calculator size={140} />
      </div>
      
      <div style={{ zIndex: 1 }}>
        <div style={{ color: "#eab308", fontWeight: 700, fontSize: "var(--text-sm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-xs)" }}>
          Crypto Tax Compliance
        </div>
        <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700, lineHeight: 1.3, marginBottom: "var(--space-sm)" }}>
          Made profit trading {name} ({symbol.toUpperCase()}) this year?
        </h3>
        <p style={{ color: "var(--text-secondary)", maxWidth: "600px", marginBottom: "var(--space-lg)" }}>
          Tax agencies increasingly expect accurate crypto records. Learn how to organize {symbol.toUpperCase()} trades, transfers, and taxable events before filing.
        </p>
        
        <Link 
          href="/crypto-tax-guide" 
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "12px 24px",
            background: "#eab308",
            color: "#111",
            fontWeight: 700,
            borderRadius: "var(--radius-md)",
            textDecoration: "none"
          }}
        >
          Read the 2026 Crypto Tax Guide &rarr;
        </Link>
      </div>
    </div>
  );
}

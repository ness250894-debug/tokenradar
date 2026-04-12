import Link from 'next/link';
import { Calculator } from 'lucide-react';

interface TaxGuideCTAProps {
  symbol: string;
  name: string;
}

export function TaxGuideCTA({ symbol, name }: TaxGuideCTAProps) {
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
          The IRS and global tax agencies have drastically increased crypto audits. Don&apos;t risk massive fines. Learn how to legally calculate and automatically report your {symbol.toUpperCase()} taxes before the deadline.
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

import Link from 'next/link';
import { Lock, ShieldAlert } from 'lucide-react';

interface HardwareWalletCTAProps {
  symbol: string;
  name: string;
}

export function HardwareWalletCTA({ symbol, name }: HardwareWalletCTAProps) {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, var(--surface-color) 100%)",
      border: "1px solid rgba(16, 185, 129, 0.3)",
      borderRadius: "var(--radius-lg)",
      padding: "var(--space-xl)",
      marginTop: "var(--space-xl)",
      marginBottom: "var(--space-md)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-md)",
      position: "relative",
      overflow: "hidden"
    }}>
      <div style={{ position: "absolute", top: "-20px", right: "-10px", opacity: 0.05, color: "#10b981", pointerEvents: "none" }}>
        <Lock size={140} />
      </div>
      
      <div style={{ zIndex: 1 }}>
        <div style={{ color: "#10b981", fontWeight: 700, fontSize: "var(--text-sm)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-xs)", display: "flex", alignItems: "center", gap: "6px" }}>
          <ShieldAlert size={16} /> Asset Security Warning
        </div>
        <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700, lineHeight: 1.3, marginBottom: "var(--space-sm)" }}>
          Don&apos;t leave your {name} ({symbol.toUpperCase()}) on an exchange.
        </h3>
        <p style={{ color: "var(--text-secondary)", maxWidth: "600px", marginBottom: "var(--space-lg)" }}>
          Over $2 billion was stolen from centralized crypto exchanges last year. &quot;Not your keys, not your coins.&quot; Learn how to securely store your {symbol.toUpperCase()} offline in cold storage before it&apos;s too late.
        </p>
        
        <Link 
          href="/best-crypto-hardware-wallets" 
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "12px 24px",
            background: "#10b981",
            color: "#fff",
            fontWeight: 700,
            borderRadius: "var(--radius-md)",
            textDecoration: "none"
          }}
        >
          View Top Hardware Wallets &rarr;
        </Link>
      </div>
    </div>
  );
}

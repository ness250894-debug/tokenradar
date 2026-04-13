import Link from "next/link";
import { ShieldCheck, Calculator, Zap, ArrowRight } from "lucide-react";
import { CardGlare } from "@/components/CardGlare";

export function EssentialCryptoToolkit() {
  const tools = [
    {
      title: "Stop Storing on Exchanges",
      description: "Secure your first $10,000 in Cold Storage. Compare the industry's most trusted hardware wallets based on our 2026 security audits.",
      link: "/best-crypto-hardware-wallets",
      linkLabel: "Secure My Assets",
      icon: ShieldCheck,
      color: "#10b981",
      bgHighlight: "rgba(16, 185, 129, 0.1)"
    },
    {
      title: "Automate Your 2026 Taxes",
      description: "Stop fearing the IRS. Our data-driven guide shows you how to automate your crypto tax reporting in under 10 minutes with 99.9% accuracy.",
      link: "/crypto-tax-guide",
      linkLabel: "Get Tax Ready",
      icon: Calculator,
      color: "#3b82f6",
      bgHighlight: "rgba(59, 130, 246, 0.1)"
    },
    {
      title: "Access the Inner Circle",
      description: "Get real-time TGE alerts, narrative deep-dives, and community alpha before the general market even notices the trend.",
      link: "https://t.me/TokenRadarCo",
      linkLabel: "Access Alpha",
      icon: Zap,
      color: "#f7931a",
      bgHighlight: "rgba(247, 147, 26, 0.1)"
    }
  ];

  return (
    <section style={{ marginTop: "var(--space-4xl)" }}>
      <div style={{ marginBottom: "var(--space-xl)", textAlign: "center" }}>
        <h2 style={{ fontSize: "var(--text-3xl)", fontWeight: 900, marginBottom: "var(--space-xs)" }}>
          Essential <span className="gradient-text">Crypto Toolkit</span>
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-lg)", maxWidth: "800px", margin: "0 auto" }}>
          High-intent resources for serious investors. Secure your assets, automate your compliance, and gain the technical edge.
        </p>
      </div>

      <div className="stats-grid">
        {tools.map((tool, idx) => (
          <CardGlare key={idx} style={{ height: "100%" }}>
            <Link href={tool.link} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
              <div className="card" style={{ height: "100%", transition: "all 0.3s", cursor: "pointer", position: "relative", overflow: "hidden" }}>
                <div className="feature-icon-wrapper" style={{ background: tool.bgHighlight }}>
                  <tool.icon className="feature-icon" size={32} style={{ color: tool.color }} />
                </div>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>{tool.title}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-md)", flex: 1 }}>
                  {tool.description}
                </p>
                <div style={{ color: tool.color, fontWeight: 700, fontSize: "var(--text-sm)", display: "flex", alignItems: "center", gap: "5px" }}>
                  {tool.linkLabel} &rarr;
                </div>
              </div>
            </Link>
          </CardGlare>
        ))}
      </div>
    </section>
  );
}

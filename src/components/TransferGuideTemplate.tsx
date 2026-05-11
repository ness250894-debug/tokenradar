import Link from "next/link";
import {
  ShieldCheck,
  Info,
  AlertTriangle,
  Lock,
  Globe,
  ArrowLeft,
} from "lucide-react";
import { CardGlare } from "./CardGlare";
import { MagneticEffect } from "./MagneticEffect";
import type { TokenTechnical } from "@/lib/token-technical-data";
import { getPartner, getPartnerLinkAttributes } from "@/lib/partners";

interface TransferGuideTemplateProps {
  tokenName: string;
  symbol: string;
  slug: string;
  technical: TokenTechnical;
}

const LEDGER_RECEIVE_GUIDE_URL = "https://support.ledger.com/article/4404389453841-zd";
const LEDGER_SUPPORTED_ASSETS_URL = "https://www.ledger.com/supported-crypto-assets";

function getExplorerUrl(technical: TokenTechnical): string | null {
  if (!technical.contractAddress) {
    return null;
  }

  const network = technical.network.toLowerCase();

  if (network.includes("solana")) {
    return `https://solscan.io/token/${technical.contractAddress}`;
  }

  if (network.includes("arbitrum")) {
    return `https://arbiscan.io/token/${technical.contractAddress}`;
  }

  if (network.includes("optimism")) {
    return `https://optimistic.etherscan.io/token/${technical.contractAddress}`;
  }

  if (network.includes("avalanche")) {
    return `https://snowtrace.io/token/${technical.contractAddress}`;
  }

  return `https://etherscan.io/token/${technical.contractAddress}`;
}

function getNetworkCaution(technical: TokenTechnical, symbol: string): string {
  const network = technical.network.toLowerCase();
  const symbolUpper = symbol.toUpperCase();

  if (network.includes("xrpl") || symbolUpper === "XRP") {
    return "Most personal Ledger XRP receives do not require a destination tag, but exchanges may still ask about tags. Read the exchange form carefully before submitting.";
  }

  if (network.includes("solana")) {
    return "For SPL tokens, confirm the token account appears in Ledger Live or the supported Solana wallet flow before withdrawing a large amount.";
  }

  if (technical.isSubtoken) {
    return `${symbolUpper} is managed through the ${technical.ledgerAppName} account. Keep ${technical.gasToken} available for future network fees.`;
  }

  return `Use the ${technical.ledgerAppName} app and verify the receive address on the physical Ledger screen before sending ${symbolUpper}.`;
}

export function TransferGuideTemplate({ tokenName, symbol, slug, technical }: TransferGuideTemplateProps) {
  const symbolUpper = symbol.toUpperCase();
  const explorerUrl = getExplorerUrl(technical);
  const ledgerPartner = getPartner("ledger");
  const networkCaution = getNetworkCaution(technical, symbol);

  return (
    <div className="transfer-guide">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-md)",
          padding: "var(--space-md) var(--space-lg)",
          background: "rgba(16, 185, 129, 0.05)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "var(--radius-md)",
          marginBottom: "var(--space-xl)",
        }}
      >
        <ShieldCheck size={20} style={{ color: "#10b981" }} />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "#10b981" }}>
          TokenRadar transfer checklist - cross-check in Ledger Live before sending
        </span>
      </div>

      <header style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>
          How to Transfer <span className="gradient-text">{tokenName} ({symbolUpper})</span> to Ledger
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-lg)" }}>
          A step-by-step checklist for moving assets from an exchange to a Ledger wallet,
          with network, fee-token, and address checks called out before withdrawal.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div
            style={{
              padding: "var(--space-xl)",
              background: "rgba(239, 68, 68, 0.05)",
              border: "1px solid rgba(239, 68, 68, 0.2)",
              borderRadius: "var(--radius-lg)",
              marginBottom: "var(--space-2xl)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "#ef4444", marginBottom: "var(--space-md)" }}>
              <AlertTriangle size={24} />
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0 }}>Critical Network Alert</h2>
            </div>
            <p style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: "var(--space-md)" }}>
              Only use the <span style={{ textDecoration: "underline", color: "#ef4444" }}>{technical.network}</span> network.
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
              Moving {symbolUpper} via the wrong blockchain can cause permanent asset loss. Exchange support may not be able to recover funds sent to an incompatible network.
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", marginTop: "var(--space-sm)" }}>
              {networkCaution}
            </p>
          </div>

          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>1</span>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Prepare Ledger Live</h2>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)" }}>
                Open Ledger Live, unlock the device with your PIN, and check for firmware or app updates before receiving {symbolUpper}.
              </div>
            </div>

            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>2</span>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Install the {technical.ledgerAppName} App</h2>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)" }}>
                Search for <strong>&quot;{technical.ledgerAppName}&quot;</strong> in the Ledger Live app catalog and install it.
                {technical.isSubtoken ? ` ${symbolUpper} is managed inside the ${technical.ledgerAppName} account rather than as a separate native app.` : ` This prepares a native ${symbolUpper} account on your Ledger device.`}
              </div>
            </div>

            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>3</span>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Generate and Verify the Receive Address</h2>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)", marginBottom: "var(--space-md)" }}>
                In Ledger Live, choose <strong>&quot;Receive&quot;</strong>, select the {tokenName} or {technical.ledgerAppName} account, and follow the prompts on the physical Ledger device.
              </div>
              <div style={{ marginLeft: "min(48px, 5vw)", padding: "var(--space-md)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--accent-primary)" }}>
                <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
                  <Info size={16} style={{ marginTop: "4px", color: "var(--accent-primary)" }} />
                  <span style={{ fontSize: "var(--text-sm)" }}>
                    <strong>Device-screen check:</strong> verify that the address on your computer exactly matches the address shown on the Ledger device before copying it to the exchange.
                  </span>
                </div>
              </div>
            </div>

            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>4</span>
                <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Withdraw from the Exchange</h2>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)" }}>
                Paste the Ledger receive address into the exchange withdrawal form, select <strong>{technical.network}</strong>, review the fee paid in {technical.gasToken}, and send a small test transfer before moving the full balance.
              </div>
            </div>

            <div
              style={{
                marginTop: "var(--space-2xl)",
                padding: "var(--space-2xl)",
                textAlign: "center",
                background: "linear-gradient(to bottom, transparent, rgba(16, 185, 129, 0.05))",
                borderRadius: "var(--radius-xl)",
                border: "1px dashed var(--border-color)",
              }}
            >
              <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
                Recheck the official Ledger receive flow and supported-asset list before making the final transfer.
              </p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-lg)" }}>
                <MagneticEffect>
                  <Link href={`/${slug}`} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 24px" }}>
                    <ArrowLeft size={18} /> Back to {tokenName} Overview
                  </Link>
                </MagneticEffect>

                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  TokenRadar checklist. Confirm final instructions in Ledger Live and official Ledger support.
                </p>
              </div>
            </div>
          </section>
        </div>

        <aside>
          <div style={{ position: "sticky", top: "100px" }}>
            <CardGlare color="rgba(0, 133, 77, 0.15)">
              <div className="card" style={{ padding: "var(--space-xl)" }}>
                <h3 style={{ fontSize: "var(--text-sm)", fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-lg)" }}>
                  Technical Specs
                </h3>

                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
                  <div className="tech-spec">
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Blockchain Network</div>
                    <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: "6px" }}>
                      <Globe size={14} style={{ color: "var(--accent-primary)" }} /> {technical.network}
                    </div>
                  </div>

                  <div className="tech-spec">
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Token Standard</div>
                    <div style={{ fontWeight: 700 }}>{technical.standard}</div>
                  </div>

                  <div className="tech-spec">
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Network Fee Token</div>
                    <div style={{ fontWeight: 700 }}>{technical.gasToken}</div>
                  </div>

                  {technical.contractAddress && explorerUrl && (
                    <div className="tech-spec">
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Contract to Verify</div>
                      <a
                        href={explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "var(--text-xs)", wordBreak: "break-all", color: "var(--accent-secondary)", textDecoration: "underline" }}
                      >
                        {technical.contractAddress.substring(0, 10)}...{technical.contractAddress.substring(technical.contractAddress.length - 8)}
                      </a>
                    </div>
                  )}

                  <hr style={{ border: "0", borderTop: "1px solid var(--border-color)", margin: "var(--space-md) 0" }} />

                  <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                    <a href={LEDGER_RECEIVE_GUIDE_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-secondary)", fontSize: "var(--text-sm)", fontWeight: 800 }}>
                      Ledger receive instructions
                    </a>
                    <a href={LEDGER_SUPPORTED_ASSETS_URL} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent-secondary)", fontSize: "var(--text-sm)", fontWeight: 800 }}>
                      Check Ledger asset support
                    </a>
                  </div>

                  {ledgerPartner && (
                    <div style={{ textAlign: "center" }}>
                      <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
                        Need a Ledger device? TokenRadar may earn a commission through this paid link.
                      </p>
                      <MagneticEffect>
                        <a
                          href={ledgerPartner.url}
                          {...getPartnerLinkAttributes(ledgerPartner, "transfer-guide-sidebar")}
                          className="btn btn-primary"
                          style={{ width: "100%", padding: "10px", fontSize: "0.85rem", background: ledgerPartner.color, color: ledgerPartner.textColor }}
                        >
                          {ledgerPartner.cta} &rarr;
                        </a>
                      </MagneticEffect>
                    </div>
                  )}
                </div>
              </div>
            </CardGlare>

            <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-md)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
              <Lock size={12} style={{ display: "inline", marginRight: "4px" }} />
              Verify every withdrawal on the device screen.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

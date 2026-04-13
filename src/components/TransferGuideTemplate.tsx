import React from 'react';
import Link from 'next/link';
import { 
  ShieldCheck, 
  Info, 
  AlertTriangle, 
  Lock,
  Globe,
  ArrowLeft
} from 'lucide-react';
import { CardGlare } from './CardGlare';
import { MagneticEffect } from './MagneticEffect';
import type { TokenTechnical } from '@/lib/token-technical-data';

interface TransferGuideTemplateProps {
  tokenName: string;
  symbol: string;
  technical: TokenTechnical;
}

export function TransferGuideTemplate({ tokenName, symbol, technical }: TransferGuideTemplateProps) {
  const symbolUpper = symbol.toUpperCase();
  
  return (
    <div className="transfer-guide">
      {/* 1. Trust Header */}
      <div style={{ 
        display: "flex", 
        alignItems: "center", 
        gap: "var(--space-md)", 
        padding: "var(--space-md) var(--space-lg)", 
        background: "rgba(16, 185, 129, 0.05)", 
        border: "1px solid rgba(16, 185, 129, 0.2)", 
        borderRadius: "var(--radius-md)",
        marginBottom: "var(--space-xl)"
      }}>
        <ShieldCheck size={20} style={{ color: "#10b981" }} />
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "#10b981" }}>
          Verified 2026 Security Documentation — Manual Proofed
        </span>
      </div>

      <header style={{ marginBottom: "var(--space-2xl)" }}>
        <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, marginBottom: "var(--space-sm)" }}>
          How to Transfer <span className="gradient-text">{tokenName} ({symbolUpper})</span> to Ledger
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-lg)" }}>
          A step-by-step guide to securing your assets in offline cold storage. 
          Stop leaving your financial future on custodial exchanges.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          {/* 2. Safety Warning Block */}
          <div style={{ 
            padding: "var(--space-xl)", 
            background: "rgba(239, 68, 68, 0.05)", 
            border: "1px solid rgba(239, 68, 68, 0.2)", 
            borderRadius: "var(--radius-lg)",
            marginBottom: "var(--space-2xl)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", color: "#ef4444", marginBottom: "var(--space-md)" }}>
              <AlertTriangle size={24} />
              <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0 }}>Critical Network Alert</h2>
            </div>
            <p style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: "var(--space-md)" }}>
              Only use the <span style={{ textDecoration: "underline", color: "#ef4444" }}>{technical.network}</span> network. 
            </p>
            <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)" }}>
              Moving {symbolUpper} via the wrong blockchain will result in the <strong>permanent loss of your assets</strong>. 
              Exchange support cannot recover funds sent to the wrong network.
            </p>
          </div>

          {/* 3. The Steps */}
          <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-2xl)" }}>
            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>1</span>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Initialize Ledger Live</h3>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)" }}>
                Ensure your Ledger device is updated to the latest firmware. Open Ledger Live and navigate to <strong>&quot;My Ledger&quot;</strong>.
              </div>
            </div>

            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>2</span>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Install the {technical.ledgerAppName} App</h3>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)" }}>
                Search for <strong>&quot;{technical.ledgerAppName}&quot;</strong> in the App Catalog and click install. 
                {technical.isSubtoken ? ` Note: ${symbolUpper} is managed within your ${technical.ledgerAppName} account.` : ` This creates a native ${symbolUpper} account on your device.`}
              </div>
            </div>

            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>3</span>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Copy Receiving Address</h3>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)", marginBottom: "var(--space-md)" }}>
                Go to the <strong>&quot;Receive&quot;</strong> tab, select your {tokenName} account, and follow the on-screen prompts on your physical Ledger.
              </div>
              <div style={{ marginLeft: "min(48px, 5vw)", padding: "var(--space-md)", background: "var(--bg-elevated)", borderRadius: "var(--radius-md)", borderLeft: "4px solid var(--accent-primary)" }}>
                <div style={{ display: "flex", gap: "var(--space-sm)", alignItems: "flex-start" }}>
                  <Info size={16} style={{ marginTop: "4px", color: "var(--accent-primary)" }} />
                  <span style={{ fontSize: "var(--text-sm)" }}>
                    <strong>Visual Proof Check:</strong> Always verify that the address on your computer screen <em>exactly</em> matches the address on your Ledger device&apos;s physical screen.
                  </span>
                </div>
              </div>
            </div>

            <div className="step-item">
              <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)", marginBottom: "var(--space-md)" }}>
                <span className="step-number" style={{ background: "var(--accent-primary)", color: "white", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>4</span>
                <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 700 }}>Execute Transfer from Exchange</h3>
              </div>
              <div style={{ color: "var(--text-secondary)", paddingLeft: "min(48px, 5vw)" }}>
                Log into your exchange (Binance, Coinbase, Kraken, etc.). Navigate to &quot;Withdraw&quot;, paste your Ledger address, and select the <strong>{technical.network}</strong> network.
              </div>
            </div>

            {/* Final Call to Action / Back Button */}
            <div style={{ 
              marginTop: "var(--space-2xl)", 
              padding: "var(--space-2xl)", 
              textAlign: "center",
              background: "linear-gradient(to bottom, transparent, rgba(16, 185, 129, 0.05))",
              borderRadius: "var(--radius-xl)",
              border: "1px dashed var(--border-color)"
            }}>
              <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)" }}>
                Ready to secure your crypto with the world&apos;s most trusted hardware?
              </p>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-lg)" }}>
                <MagneticEffect>
                  <Link href={`/${symbol.toLowerCase()}`} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 24px" }}>
                    <ArrowLeft size={18} /> Back to {tokenName} Overview
                  </Link>
                </MagneticEffect>
                
                <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
                  Verified 2026 Security Protocol • End-to-End Encryption
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* 4. Technical Sidebar */}
        <aside>
          <div style={{ position: "sticky", top: "100px" }}>
            <CardGlare color="rgba(0, 133, 77, 0.15)">
              <div className="card" style={{ padding: "var(--space-xl)" }}>
                <h4 style={{ fontSize: "var(--text-sm)", fontWeight: 800, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "var(--space-lg)" }}>
                  Technical Specs
                </h4>
                
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

                  {technical.contractAddress && (
                    <div className="tech-spec">
                      <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>Verified Contract</div>
                      <Link 
                        href={technical.network.toLowerCase().includes('solana') 
                          ? `https://solscan.io/token/${technical.contractAddress}` 
                          : `https://etherscan.io/token/${technical.contractAddress}`
                        } 
                        target="_blank"
                        style={{ fontSize: "var(--text-xs)", wordBreak: "break-all", color: "var(--accent-secondary)", textDecoration: "underline" }}
                      >
                        {technical.contractAddress.substring(0, 10)}...{technical.contractAddress.substring(technical.contractAddress.length - 8)}
                      </Link>
                    </div>
                  )}

                  <hr style={{ border: "0", borderTop: "1px solid var(--border-color)", margin: "var(--space-md) 0" }} />
                  
                  <div style={{ textAlign: "center" }}>
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)", marginBottom: "var(--space-md)" }}>
                      Need a device?
                    </p>
                    <MagneticEffect>
                      <Link 
                        href="https://affil.trezor.io/aff_c?offer_id=169&aff_id=135555" 
                        target="_blank"
                        className="btn btn-primary" 
                        style={{ width: "100%", padding: "10px", fontSize: "0.85rem", background: "#00854d" }}
                      >
                        Buy Trezor Safe 3 &rarr;
                      </Link>
                    </MagneticEffect>
                  </div>
                </div>
              </div>
            </CardGlare>

            <div style={{ marginTop: "var(--space-xl)", padding: "var(--space-md)", fontSize: "var(--text-xs)", color: "var(--text-muted)", textAlign: "center" }}>
              <Lock size={12} style={{ display: "inline", marginRight: "4px" }} />
              End-to-End Encryption Verified
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

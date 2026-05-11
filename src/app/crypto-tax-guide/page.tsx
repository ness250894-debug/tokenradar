import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { getPartner, getPartnerLinkAttributes } from '@/lib/partners';

export const metadata: Metadata = {
  title: 'The Ultimate 2026 Crypto Tax Guide',
  description: 'A comprehensive guide to understanding crypto taxes, reporting airdrops and DeFi income, and automating your tax returns with top-rated software.',
  alternates: {
    canonical: '/crypto-tax-guide',
  },
};

export default function CryptoTaxGuidePage() {
  const koinly = getPartner("koinly");
  const coinledger = getPartner("coinledger");

  return (
    <div className="container">
      <section className="section" style={{ minHeight: "80vh", paddingTop: "var(--space-xl)" }}>
        
        <nav style={{ marginBottom: "var(--space-2xl)" }}>
          <Link href="/" style={{ color: "var(--text-secondary)", display: "inline-flex", alignItems: "center", gap: "8px", textDecoration: "none", fontWeight: 600, fontSize: "var(--text-sm)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Back to Overview
          </Link>
        </nav>
        
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "var(--space-4xl)", maxWidth: "800px", margin: "0 auto var(--space-4xl)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)", background: "rgba(234, 179, 8, 0.1)", color: "#eab308", padding: "8px 16px", borderRadius: "99px", fontSize: "var(--text-sm)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-md)" }}>
            <AlertTriangle size={16} /> Update for 2026 Tax Season
          </div>
          <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, lineHeight: 1.1, marginBottom: "var(--space-md)" }}>
            The Ultimate Guide to <span className="gradient-text">Crypto Taxes</span> in 2026
          </h1>
          <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)" }}>
            Global revenue agencies continue to increase crypto reporting scrutiny. Learn the core rules for capital gains, DeFi, and airdrops, plus tools that can reduce manual recordkeeping.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Column */}
          <div className="lg:col-span-2">
            <div className="article-content" style={{ fontSize: "var(--text-lg)" }}>
              <h2>1. How is Cryptocurrency Taxed?</h2>
              <p>
                In most jurisdictions (including the US IRS, UK HMRC, and Australian ATO), cryptocurrency is treated as <strong>property</strong>, not currency. This means every time you dispose of crypto, it is a taxable event.
              </p>
              
              <h3>What triggers a taxable event?</h3>
              <ul>
                <li><strong>Selling crypto for fiat</strong> (e.g., selling BTC for USD)</li>
                <li><strong>Trading one crypto for another</strong> (e.g., swapping ETH for SOL)</li>
                <li><strong>Buying goods or services</strong> with cryptocurrency</li>
                <li><strong>Earning crypto income</strong> (Mining, Staking rewards, or Airdrops)</li>
              </ul>

              <h3>What is NOT a taxable event?</h3>
              <ul>
                <li>Buying crypto with fiat and holding it</li>
                <li>Transferring crypto between two wallets you own</li>
                <li>Donating crypto to a recognized tax-exempt charity</li>
              </ul>

              <hr />

              <h2>2. The Nightmare of DeFi and Airdrops</h2>
              <p>
                If you only buy and hold Bitcoin on a centralized exchange like Coinbase, calculating your taxes is relatively straightforward. However, modern crypto portfolios are incredibly complex:
              </p>
              <ul>
                <li><strong>Liquidity Pools (LPs):</strong> Depositing two tokens into a pool and receiving an LP token is considered a taxable swap in many jurisdictions.</li>
                <li><strong>Airdrops:</strong> When you receive an airdrop (e.g., JUP, STRK), it is generally taxed as ordinary income based on its fair market value on the day you received it.</li>
                <li><strong>Bridging:</strong> Bridging assets across networks can trigger taxable events depending on the specific smart contract mechanics.</li>
              </ul>
              <p>
                Manually calculating the cost basis for 5,000 decentralized transactions across Solana, Ethereum, and Arbitrum is extremely difficult with a spreadsheet. This is where <strong>Crypto Tax Software</strong> can reduce manual work and help catch missing transactions.
              </p>
            </div>
          </div>

          {/* Sidebar / Affiliate Conversion Column */}
          <div className="lg:col-span-1">
            <div style={{ position: "sticky", top: "100px" }}>
              <div className="card" style={{ border: "2px solid var(--accent-primary)", padding: "var(--space-lg)", background: "var(--bg-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", color: "var(--accent-primary)" }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0 }}>Crypto Tax Software Options</h3>
                </div>
                <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)", fontSize: "var(--text-sm)" }}>
                  Connect wallets and exchanges to organize transaction history, cost basis, gains, losses, and tax exports.
                </p>
                <p style={{ color: "var(--text-muted)", marginBottom: "var(--space-md)", fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                  Paid links: TokenRadar may earn a commission if you sign up through these links. Always confirm final tax reports with a qualified professional.
                </p>

                {/* Affiliate Offer 1 */}
                {koinly && (
                  <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-sm)", border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>1. {koinly.name}</span>
                      <span className="badge badge-accent" style={{ background: "#eab308", color: "#111", fontSize: "10px", padding: "2px 6px" }}>Paid link</span>
                    </div>
                    <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                      <li>Wallet and exchange imports</li>
                      <li>Capital gains and income reporting workflows</li>
                    </ul>
                    <a
                      href={koinly.url}
                      {...getPartnerLinkAttributes(koinly, "tax-guide-sidebar")}
                      className="btn btn-primary"
                      style={{ width: "100%", textAlign: "center", padding: "8px", fontSize: "13px" }}
                    >
                      {koinly.cta}
                    </a>
                  </div>
                )}

                {/* Affiliate Offer 2 */}
                {coinledger && (
                  <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>2. {coinledger.name}</span>
                      {coinledger.coupon && (
                        <span style={{ fontSize: "10px", padding: "2px 6px", background: "rgba(234, 179, 8, 0.1)", color: "#eab308", borderRadius: "10px", fontWeight: 700 }}>
                          CODE: {coinledger.coupon}
                        </span>
                      )}
                    </div>
                    <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                      <li>Tax software export workflows</li>
                      <li>Beginner-friendly transaction review</li>
                    </ul>
                    <a
                      href={coinledger.url}
                      {...getPartnerLinkAttributes(coinledger, "tax-guide-sidebar")}
                      className="btn"
                      style={{ width: "100%", textAlign: "center", background: "transparent", border: "1px solid var(--border-color)", borderBottom: "2px solid var(--border-color)", padding: "8px", fontSize: "13px" }}
                    >
                      {coinledger.coupon ? `${coinledger.cta} (${coinledger.coupon})` : coinledger.cta}
                    </a>
                  </div>
                )}

              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}

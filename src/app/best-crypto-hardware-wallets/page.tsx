import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, AlertTriangle, Key } from 'lucide-react';

export const metadata: Metadata = {
  title: 'The Best Crypto Hardware Wallets in 2026 | TokenRadar',
  description: 'Protect your crypto from exchange hacks. The definitive comparison of the best cold storage hardware wallets: Ledger vs Trezor.',
  alternates: {
    canonical: '/best-crypto-hardware-wallets',
  },
};

export default function HardwareWalletsPage() {
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
          <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-sm)", background: "rgba(16, 185, 129, 0.1)", color: "#10b981", padding: "8px 16px", borderRadius: "99px", fontSize: "var(--text-sm)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--space-md)" }}>
            <Key size={16} /> Asset Security Guide
          </div>
          <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, lineHeight: 1.1, marginBottom: "var(--space-md)" }}>
            The Best Crypto <span className="gradient-text">Hardware Wallets</span> to Protect Your Wealth
          </h1>
          <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)" }}>
            Over $2 Billion was stolen from centralized exchanges last year. Learn how cold storage works and secure your crypto offline.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Column */}
          <div className="lg:col-span-2">
            <div className="article-content" style={{ fontSize: "var(--text-lg)" }}>
              <h2>1. The Danger of Centralized Exchanges</h2>
              <p>
                If your cryptocurrency is sitting on an exchange like Binance or Coinbase, <strong>you do not actually own it.</strong> You own an IOU from that exchange. If the exchange goes bankrupt (like FTX) or gets hacked, your funds can disappear forever with zero legal recourse.
              </p>
              
              <div style={{ padding: "var(--space-md)", background: "rgba(239, 68, 68, 0.1)", borderLeft: "4px solid #ef4444", margin: "var(--space-lg) 0", borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}>
                <strong style={{ color: "#ef4444", display: "block", marginBottom: "var(--space-xs)" }}>Not Your Keys, Not Your Coins</strong>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-md)" }}>
                  A hardware wallet gives you exclusive ownership of your private keys. Without the physical device, nobody can move your funds—not even hackers.
                </span>
              </div>

              <h2>2. How a Hardware Wallet Works</h2>
              <p>
                A hardware wallet (or "cold storage") is an encrypted USB-like device that generates and stores your private keys completely offline. When you want to send crypto, you plug the device into your computer or phone and physically press a button to sign the transaction. 
              </p>
              <p>
                Because the private keys never touch your internet-connected computer, they are completely immune to malware, keyloggers, and remote hackers.
              </p>

              <hr />

              <h2>3. Ledger vs Trezor: Which is best?</h2>
              <p>
                Ledger and Trezor are the two undisputed titans of the hardware wallet industry. Both provide military-grade security, but they cater to slightly different types of users:
              </p>
              <ul>
                <li><strong>Ledger</strong> integrates a "Secure Element" chip, identical to the chips used in credit cards and passports. It also offers Bluetooth connectivity for mobile trading.</li>
                <li><strong>Trezor</strong> prides itself on being 100% open-source software, making it highly verifiable and trusted by privacy purists.</li>
              </ul>
            </div>
          </div>

          {/* Sidebar / Affiliate Conversion Column */}
          <div className="lg:col-span-1">
            <div style={{ position: "sticky", top: "100px" }}>
              <div className="card" style={{ border: "2px solid #10b981", padding: "var(--space-xl)", background: "var(--bg-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-md)", color: "#10b981" }}>
                  <ShieldCheck size={24} />
                  <h3 style={{ fontSize: "var(--text-xl)", fontWeight: 800, margin: 0 }}>Top Hardware Wallets</h3>
                </div>
                <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)", fontSize: "var(--text-sm)" }}>
                  Never buy a hardware wallet from Amazon or eBay! Always buy directly from the manufacturer to avoid tampered devices.
                </p>

                {/* Affiliate Offer 1 */}
                <div style={{ background: "var(--surface-color)", padding: "var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-md)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-sm)" }}>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>1. Ledger Nano X</span>
                    <span className="badge badge-accent" style={{ background: "#10b981", color: "#111" }}>Mobile Choice</span>
                  </div>
                  <ul style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-md)", paddingLeft: "20px" }}>
                    <li>Secure Element Chip</li>
                    <li>Bluetooth Connectivity</li>
                    <li>Supports 5,000+ coins</li>
                  </ul>
                  <a 
                    href="https://shop.ledger.com/?r=dc06a3bcc173" 
                    target="_blank" 
                    rel="noopener noreferrer sponsored" 
                    className="btn btn-primary" 
                    style={{ width: "100%", textAlign: "center", background: "#10b981", color: "#111", border: "none" }}
                  >
                    Buy Ledger Official
                  </a>
                </div>

                {/* Affiliate Offer 2 */}
                <div style={{ background: "var(--surface-color)", padding: "var(--space-md)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--space-sm)" }}>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>2. Trezor Safe 3</span>
                    <span className="badge badge-accent" style={{ background: "transparent", border: "1px solid var(--text-secondary)" }}>Privacy Choice</span>
                  </div>
                  <ul style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)", marginBottom: "var(--space-md)", paddingLeft: "20px" }}>
                    <li>100% Open Source</li>
                    <li>Dedicated Security Chip</li>
                    <li>Perfect for Bitcoin purists</li>
                  </ul>
                  <a 
                    href="https://trezor.io/?offer_id=YOUR_TREZOR_LINK" 
                    target="_blank" 
                    rel="noopener noreferrer sponsored" 
                    className="btn" 
                    style={{ width: "100%", textAlign: "center", background: "transparent", border: "1px solid var(--border-color)" }}
                  >
                    Buy Trezor Official
                  </a>
                </div>

              </div>
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}

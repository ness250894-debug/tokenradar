import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ShieldCheck, Key, ShieldAlert } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Ledger vs Trezor Review (2026): Best Cold Wallets to Secure Your Crypto',
  description: 'A comprehensive review of the best cold hardware wallets in 2026. Protect your Bitcoin and altcoins from exchange hacks with Ledger Nano X and Trezor Safe 3.',
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
              
              <p style={{ marginBottom: "var(--space-xl)", color: "var(--text-secondary)", fontSize: "var(--text-lg)", lineHeight: 1.6 }}>
              In the high-stakes world of cryptocurrency, where transactions are irreversible, security isn&apos;t just a feature — it&apos;s the bedrock of trust. If you are keeping your assets on an exchange like Coinbase or Binance, you don&apos;t actually own your crypto. You own a IOUs on a database that can be frozen, hacked, or seized at any moment.
            </p>

            <div style={{ background: "rgba(220, 38, 38, 0.05)", border: "1px solid rgba(220, 38, 38, 0.2)", borderRadius: "var(--radius-lg)", padding: "var(--space-xl)", marginBottom: "var(--space-2xl)" }}>
              <h3 style={{ color: "#ef4444", marginTop: 0, display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                <ShieldAlert size={24} />
                The &quot;Not Your Keys, Not Your Coins&quot; Rule
              </h3>
              <p style={{ color: "var(--text-secondary)", margin: 0 }}>
                When you use an exchange, <strong>they</strong> control the private keys. If the exchange goes bankrupt (like FTX or Celsius), your funds are gone. A hardware wallet (cold storage) moves your private keys offline, giving you 100% ownership. Even if the manufacturer disappears, your money remains safe on the blockchain, accessible only via your 24-word recovery phrase.
              </p>
            </div>

              <h2>2. How a Hardware Wallet Works</h2>
              <p>
                A hardware wallet (or &quot;cold storage&quot;) is an encrypted USB-like device that generates and stores your private keys completely offline. When you want to send crypto, you plug the device into your computer or phone and physically press a button to sign the transaction. 
              </p>

              <figure style={{ margin: "var(--space-xl) 0", borderRadius: "var(--radius-lg)", overflow: "hidden", border: "1px solid var(--border-color)", background: "var(--surface-color)" }}>
                <div style={{ position: "relative", width: "100%", height: "400px" }}>
                  <Image 
                    src="/images/hardware-wallet-guide.png" 
                    alt="Premium 3D render of a hardware wallet security confirmation showing a Bitcoin transaction being physically approved" 
                    fill
                    style={{ objectFit: "cover" }}
                    sizes="(max-width: 1024px) 100vw, 800px"
                  />
                </div>
                <figcaption style={{ padding: "var(--space-sm)", textAlign: "center", fontSize: "var(--text-sm)", color: "var(--text-muted)", borderTop: "1px solid var(--border-color)" }}>
                  The Trezor Safe 3 requires physical button presses to confirm transactions, preventing remote hardware attacks.
                </figcaption>
              </figure>

              <p>
                Because the private keys never touch your internet-connected computer, they are completely immune to malware, keyloggers, and remote hackers.
              </p>

              <hr />

              <h2>3. The Danger of &quot;Blind Signing&quot;</h2>
              <p>
                Did you know that the screen on a cheap device or a standard cryptocurrency wallet app can be a gateway for hackers? When you interact with DeFi apps or NFTs, you are often asked to approve complex smart contracts. 
              </p>
              <p>
                If your screen is not directly driven by a Secure Element chip, hackers can manipulate what is displayed. You might think you are approving a simple login, when you are actually signing a transaction that drains your entire wallet. This is called <strong>Blind Signing</strong>.
              </p>
              
              <div style={{ padding: "var(--space-md)", background: "rgba(16, 185, 129, 0.1)", borderLeft: "4px solid #10b981", margin: "var(--space-lg) 0", borderRadius: "0 var(--radius-md) var(--radius-md) 0" }}>
                <strong style={{ color: "#10b981", display: "block", marginBottom: "var(--space-xs)" }}>What You See Is What You Sign</strong>
                <span style={{ color: "var(--text-secondary)", fontSize: "var(--text-md)" }}>
                  Premium hardware wallets use Secure Screens wired directly to military-grade Secure Element chips (EAL6+). This guarantees that the transaction details displayed on the physical screen cannot be tampered with by malware.
                </span>
              </div>

              <hr />

              <h2>4. Ledger vs Trezor: Which is best?</h2>
              <p>
                Ledger and Trezor are the two undisputed titans of the hardware wallet industry. Both provide military-grade security, but they take two fundamentally different architectural approaches:
              </p>
              
              <div style={{ marginBottom: "var(--space-md)" }}>
                <h4 style={{ color: "#10b981", marginBottom: "var(--space-xs)" }}>The Ledger Approach (Security-First)</h4>
                <p style={{ margin: 0 }}>
                  Ledger uses a proprietary <strong>Secure Element chip</strong> (the same technology in credit cards and passports). Furthermore, Ledger is the only manufacturer whose screen is driven <em>directly</em> by the Secure Element. This means malware cannot alter what is displayed on the device. Ledger also employs a world-class white-hat hacker team known as <strong>The Donjon</strong>, who actively audit and find vulnerabilities in competitors (including Trezor).
                </p>
              </div>

              <div style={{ marginBottom: "var(--space-xl)" }}>
                <h4 style={{ color: "var(--text-primary)", marginBottom: "var(--space-xs)" }}>The Trezor Approach (Open-Source First)</h4>
                <p style={{ margin: 0, marginBottom: "var(--space-sm)" }}>
                  Trezor operates on the cypherpunk ethos of <strong>&quot;Don&apos;t Trust, Verify.&quot;</strong> While older models were purely open-source without a secure element, the <strong>Trezor Safe 3</strong> has changed the game. It features an <strong>EAL6+ certified Secure Element</strong> (the Optiga Trust M), proving that you can have military-grade hardware security without sacrificing the transparency of open-source firmware.
                </p>
                <div style={{ padding: "var(--space-sm)", background: "var(--bg-elevated)", borderLeft: "4px solid var(--text-primary)", borderRadius: "0 var(--radius-sm) var(--radius-sm) 0" }}>
                  <strong style={{ display: "block", marginBottom: "4px", fontSize: "var(--text-sm)" }}>The Ledger Recover Controversy</strong>
                  <span style={{ fontSize: "var(--text-sm)", color: "var(--text-secondary)" }}>
                    In 2023, Ledger launched an optional &quot;ledger recover&quot; feature that could back up seed phrases to the cloud. While optional, Trezor advocates pointed out this proved Ledger&apos;s firmware <em>was technically capable</em> of extracting private keys from the device. Trezor firmware is strictly hardcoded to never allow key extraction, making it the preferred choice for Bitcoin purists.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar / Affiliate Conversion Column */}
          <div className="lg:col-span-1">
            <div style={{ position: "sticky", top: "100px" }}>
              <div className="card" style={{ border: "2px solid #10b981", padding: "var(--space-lg)", background: "var(--bg-elevated)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", color: "#10b981" }}>
                  <ShieldCheck size={20} />
                  <h3 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0 }}>Top Hardware Wallets</h3>
                </div>
                <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-lg)", fontSize: "var(--text-sm)" }}>
                  Never buy a hardware wallet from Amazon or eBay! Always buy directly from the manufacturer to avoid tampered devices.
                </p>

                {/* Affiliate Offer 1 */}
                <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-sm)", border: "1px solid var(--border-color)", position: "relative", overflow: "hidden" }}>
                  <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-sm) 0", marginBottom: "var(--space-xs)", position: "relative", height: "120px" }}>
                    <Image 
                      src="https://cdn.shopify.com/s/files/1/2974/4858/files/Nano_black.png?v=1717592280" 
                      alt="Ledger Nano X hardware wallet - official device for secure Bitcoin and cryptocurrency cold storage" 
                      fill
                      style={{ objectFit: "contain", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.2))" }}
                      sizes="200px"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>1. Ledger Nano X</span>
                    <span className="badge badge-accent" style={{ background: "#10b981", color: "#111", fontSize: "9px", padding: "1px 5px" }}>Best Mobile</span>
                  </div>
                  <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                    <li>Secure Element Chip</li>
                    <li>Bluetooth Connectivity</li>
                  </ul>

                  {/* BTC Promo Badge */}
                  <div style={{ background: "rgba(247, 147, 26, 0.1)", border: "1px dashed rgba(247, 147, 26, 0.4)", borderRadius: "var(--radius-sm)", padding: "8px", marginBottom: "var(--space-md)", textAlign: "center" }}>
                    <span style={{ color: "#f7931a", fontWeight: 700, fontSize: "13px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      🎁 Limited Time: Get up to $100 in BTC
                    </span>
                  </div>

                  <a 
                    href="https://shop.ledger.com/?r=dc06a3bcc173" 
                    target="_blank" 
                    rel="noopener noreferrer sponsored" 
                    className="btn btn-primary" 
                    style={{ width: "100%", textAlign: "center", background: "#10b981", color: "#111", border: "none", fontWeight: 700, padding: "8px", fontSize: "13px" }}
                  >
                    Buy Ledger Official
                  </a>
                </div>

                {/* Affiliate Offer 2 */}
                <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-sm) 0", marginBottom: "var(--space-xs)", background: "linear-gradient(to top, rgba(255,255,255,0.02), transparent)", position: "relative", height: "120px" }}>
                    <Image 
                      src="https://static.trezor.io/2/4/24/55/Trezor_Safe_3_186404fdbd.png" 
                      alt="Trezor Safe 3 cold storage hardware wallet - open-source security element for crypto assets" 
                      fill
                      style={{ objectFit: "contain", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.2))", transform: "scale(1.1)" }}
                      sizes="200px"
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>2. Trezor Safe 3</span>
                    <span className="badge badge-accent" style={{ background: "#4c1d95", color: "#fff", fontSize: "9px", padding: "1px 5px", border: "none" }}>Privacy Choice</span>
                  </div>
                  <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                    <li>EAL6+ Secure Element</li>
                    <li>100% Open-Source</li>
                  </ul>

                  {/* Bitcoin-Only Callout */}
                  <a 
                    href="https://affil.trezor.io/aff_c?offer_id=239&aff_id=135555"
                    target="_blank"
                    rel="noopener noreferrer sponsored"
                    style={{ textDecoration: "none", display: "block", background: "rgba(247, 147, 26, 0.08)", border: "1px dashed rgba(247, 147, 26, 0.4)", borderRadius: "var(--radius-sm)", padding: "8px", marginBottom: "var(--space-md)", textAlign: "center", transition: "all 0.2s" }}
                  >
                    <span style={{ color: "#f7931a", fontWeight: 700, fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                      ⚡ Get Bitcoin-Only Version
                    </span>
                  </a>
                  <a 
                    href="https://affil.trezor.io/aff_c?offer_id=169&aff_id=135555" 
                    target="_blank" 
                    rel="noopener noreferrer sponsored" 
                    className="btn" 
                    style={{ width: "100%", textAlign: "center", background: "#4c1d95", color: "#fff", border: "none", fontWeight: 700, padding: "8px", fontSize: "13px" }}
                  >
                    Get Trezor Safe 3
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

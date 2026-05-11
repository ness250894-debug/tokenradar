import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  Key,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { getPartner, getPartnerLinkAttributes } from "@/lib/partners";
import { getSiteUrl } from "@/lib/seo";

const LAST_UPDATED = "2026-05-11T00:00:00.000Z";
const PAGE_PATH = "/best-crypto-hardware-wallets";

const sourceLinks = [
  {
    label: "Ledger: Secure Element model",
    href: "https://www.ledger.com/academy/security/the-secure-element",
  },
  {
    label: "Ledger: device comparison",
    href: "https://www.ledger.com/academy/topics/ledgersolutions/ledger-devices-which-is-best-for-me",
  },
  {
    label: "Trezor: Safe device secure elements",
    href: "https://trezor.io/learn/security-privacy/how-trezor-keeps-you-safe/secure-elements-in-trezor-safe-devices",
  },
  {
    label: "Trezor: Safe 7 specifications",
    href: "https://trezor.io/trezor-safe-7",
  },
  {
    label: "Chainalysis: 2026 Crypto Crime Report - scams",
    href: "https://www.chainalysis.com/blog/crypto-scams-2026/",
  },
  {
    label: "Google: high quality review guidance",
    href: "https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews",
  },
];

const walletRows = [
  {
    name: "Ledger Nano X",
    bestFor: "Mobile users and broad asset support",
    strengths: "Secure Element, Bluetooth, iOS/Android support, wide token coverage",
    tradeoff: "Closed-source OS and smaller non-touch display",
  },
  {
    name: "Ledger Flex / Stax / Nano Gen5",
    bestFor: "Frequent signing and clearer transaction review",
    strengths: "Larger secure E Ink screens, Clear Signing support, newer UX",
    tradeoff: "Higher price and still within Ledger's closed OS model",
  },
  {
    name: "Trezor Safe 3",
    bestFor: "Open-source buyers on a midrange budget",
    strengths: "Open-source design, EAL6+ Secure Element, PIN/passphrase support",
    tradeoff: "No wireless convenience; smaller monochrome screen",
  },
  {
    name: "Trezor Safe 5 / Safe 7",
    bestFor: "Open-source users who want larger screens",
    strengths: "Touchscreen models, open design, Safe 7 adds dual Secure Elements",
    tradeoff: "Safe 7 is newer, so independent field history is shorter",
  },
  {
    name: "Coldcard / Blockstream Jade",
    bestFor: "Bitcoin-only storage",
    strengths: "Focused attack surface, strong Bitcoin workflows, air-gapped options",
    tradeoff: "Not appropriate for broad altcoin or DeFi portfolios",
  },
  {
    name: "BitBox02 / Keystone",
    bestFor: "Users who want alternatives to Ledger and Trezor",
    strengths: "Different security models, backup workflows, and signing UX",
    tradeoff: "Smaller ecosystems and fewer mainstream tutorials",
  },
];

const checklist = [
  "Buy from the manufacturer or a verified authorized reseller, then run the device authenticity check.",
  "Generate the recovery phrase on the hardware wallet screen only. Never accept a pre-written seed card.",
  "Store the seed phrase offline, ideally on paper or metal, and never photograph it.",
  "Use a passphrase only if you understand the recovery risk; losing it can make funds unrecoverable.",
  "Test recovery with a small balance before moving meaningful funds.",
  "For large balances, consider multisig or splitting treasury controls across more than one device.",
];

export const metadata: Metadata = {
  title: "Best Crypto Hardware Wallets 2026: Ledger, Trezor, Coldcard, Jade",
  description:
    "A source-backed 2026 hardware wallet guide comparing Ledger, Trezor, Bitcoin-only wallets, custody risks, setup steps, affiliate disclosures, and security tradeoffs.",
  alternates: {
    canonical: PAGE_PATH,
  },
  openGraph: {
    title: "Best Crypto Hardware Wallets 2026",
    description:
      "Compare Ledger, Trezor, and Bitcoin-only hardware wallets with practical custody and setup guidance.",
    url: PAGE_PATH,
    type: "article",
    images: [
      {
        url: "/images/hardware-wallet-guide.png",
        width: 1200,
        height: 630,
        alt: "Hardware wallet transaction confirmation screen",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Crypto Hardware Wallets 2026",
    description:
      "Ledger vs Trezor plus Bitcoin-only hardware wallet alternatives and cold-storage setup guidance.",
    images: ["/images/hardware-wallet-guide.png"],
  },
};

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
      <ExternalLink size={12} style={{ display: "inline", marginLeft: "4px", verticalAlign: "-1px" }} />
    </a>
  );
}

function MetaPill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-full)",
        color: "var(--text-secondary)",
        fontSize: "var(--text-xs)",
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  );
}

export default function HardwareWalletsPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${PAGE_PATH}`;
  const ledger = getPartner("ledger");
  const trezorSafe3 = getPartner("trezor-safe-3");
  const trezorBitcoinOnly = getPartner("trezor-bitcoin-only");

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Best Crypto Hardware Wallets 2026",
    description: metadata.description,
    image: `${siteUrl}/images/hardware-wallet-guide.png`,
    datePublished: LAST_UPDATED,
    dateModified: LAST_UPDATED,
    author: {
      "@type": "Person",
      name: "Pavlo Nakonechnyi",
      url: siteUrl,
    },
    publisher: {
      "@type": "Organization",
      name: "TokenRadar",
      logo: {
        "@type": "ImageObject",
        url: `${siteUrl}/icon.png`,
      },
    },
    mainEntityOfPage: pageUrl,
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: siteUrl,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Best Crypto Hardware Wallets",
        item: pageUrl,
      },
    ],
  };

  const itemListJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "Crypto hardware wallet comparison",
    itemListElement: walletRows.map((wallet, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: wallet.name,
      description: `${wallet.bestFor}. ${wallet.strengths}.`,
    })),
  };

  return (
    <>
      <JsonLd id="hardware-wallet-article-jsonld" data={articleJsonLd} />
      <JsonLd id="hardware-wallet-breadcrumb-jsonld" data={breadcrumbJsonLd} />
      <JsonLd id="hardware-wallet-itemlist-jsonld" data={itemListJsonLd} />
      <div className="container">
        <section className="section" style={{ paddingTop: "var(--space-xl)" }}>
          <nav style={{ marginBottom: "var(--space-2xl)" }} aria-label="Breadcrumb">
            <Link
              href="/"
              style={{
                color: "var(--text-secondary)",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                textDecoration: "none",
                fontWeight: 600,
                fontSize: "var(--text-sm)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to Overview
            </Link>
          </nav>

          <header style={{ textAlign: "center", marginBottom: "var(--space-3xl)", maxWidth: "880px", marginInline: "auto" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-sm)",
                background: "rgba(16, 185, 129, 0.1)",
                color: "#10b981",
                padding: "8px 16px",
                borderRadius: "99px",
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "var(--space-md)",
              }}
            >
              <Key size={16} /> Asset Security Guide
            </div>
            <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, lineHeight: 1.1, marginBottom: "var(--space-md)" }}>
              Best Crypto <span className="gradient-text">Hardware Wallets</span> for 2026
            </h1>
            <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
              A practical cold-storage guide for choosing between Ledger, Trezor, Bitcoin-only wallets, and alternative signing devices without ignoring the tradeoffs.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-sm)" }}>
              <MetaPill>Updated May 11, 2026</MetaPill>
              <MetaPill>Paid links disclosed</MetaPill>
              <MetaPill>Source-backed review</MetaPill>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <article className="lg:col-span-2">
              <div className="article-content" style={{ fontSize: "var(--text-lg)" }}>
                <div
                  style={{
                    padding: "var(--space-lg)",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(16, 185, 129, 0.05)",
                    marginBottom: "var(--space-2xl)",
                  }}
                >
                  <strong style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-sm)" }}>
                    <ListChecks size={18} color="#10b981" /> Quick picks
                  </strong>
                  <ul style={{ marginBottom: 0 }}>
                    <li><strong>Most people:</strong> Ledger Nano X or Ledger Flex if mobile support and broad asset coverage matter.</li>
                    <li><strong>Open-source preference:</strong> Trezor Safe 3 for value, Safe 5 or Safe 7 for larger-screen workflows.</li>
                    <li><strong>Bitcoin-only storage:</strong> Coldcard or Blockstream Jade if altcoin support is intentionally unnecessary.</li>
                    <li><strong>Large balances:</strong> hardware wallet plus passphrase discipline or multisig, not a single device alone.</li>
                  </ul>
                </div>

                <h2>1. Why Cold Storage Still Matters</h2>
                <p>
                  A hardware wallet does not store coins. It stores the private keys that authorize blockchain transactions. That matters because exchange accounts, hot wallets, browser extensions, and DeFi approvals expose users to different failure modes: platform insolvency, phishing, compromised devices, and malicious contracts.
                </p>
                <p>
                  Chainalysis estimated that crypto scams and fraud stole about $17 billion in 2025, with impersonation and AI-enabled scams rising sharply. A hardware wallet will not stop every scam, but it can keep the signing key off your internet-connected phone or computer.
                </p>

                <div
                  style={{
                    background: "rgba(220, 38, 38, 0.06)",
                    border: "1px solid rgba(220, 38, 38, 0.25)",
                    borderRadius: "var(--radius-lg)",
                    padding: "var(--space-lg)",
                    margin: "var(--space-xl) 0",
                  }}
                >
                  <h3 style={{ color: "#ef4444", marginTop: 0, display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
                    <ShieldAlert size={22} />
                    Hardware wallets reduce key-theft risk, not user-error risk
                  </h3>
                  <p style={{ margin: 0 }}>
                    You can still lose funds by approving a malicious transaction, exposing the seed phrase, installing fake wallet software, using a tampered device, or sending funds to the wrong address. Treat the hardware wallet as one layer in a custody system.
                  </p>
                </div>

                <h2>2. Hardware Wallet Comparison</h2>
                <p>
                  The right device depends on what you actually do on-chain. A long-term Bitcoin holder, a Solana/NFT user, and a multisig treasury operator should not all optimize for the same hardware.
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Wallet</th>
                        <th>Best for</th>
                        <th>Strengths</th>
                        <th>Tradeoff</th>
                      </tr>
                    </thead>
                    <tbody>
                      {walletRows.map((row) => (
                        <tr key={row.name}>
                          <td><strong>{row.name}</strong></td>
                          <td>{row.bestFor}</td>
                          <td>{row.strengths}</td>
                          <td>{row.tradeoff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2>3. Ledger vs Trezor in Plain English</h2>
                <p>
                  Ledger and Trezor are both credible choices, but their philosophies differ. Ledger emphasizes a Secure Element, Ledger OS, a secure screen model, broad asset support, and newer secure touchscreen devices. Ledger says the Nano X uses an EAL5+ Secure Element, while Nano S Plus, Stax, and other newer devices use EAL6+ class chips.
                </p>
                <p>
                  Trezor emphasizes open-source design and public review. Trezor Safe 3 and Safe 5 use an EAL6+ Secure Element for physical protection, while Trezor Safe 7 adds a second, open auditable Secure Element called TROPIC01. If you value transparency over closed secure hardware, this matters.
                </p>
                <p>
                  A fair recommendation is not &quot;Ledger is safer&quot; or &quot;Trezor is safer.&quot; It is this: Ledger generally wins on mainstream asset coverage and mobile convenience; Trezor generally wins on open-source trust and privacy-oriented workflows. For Bitcoin-only custody, a dedicated Bitcoin wallet can beat both by reducing the asset and app surface.
                </p>

                <figure
                  style={{
                    margin: "var(--space-xl) 0",
                    borderRadius: "var(--radius-lg)",
                    overflow: "hidden",
                    border: "1px solid var(--border-color)",
                    background: "var(--surface-color)",
                  }}
                >
                  <div style={{ position: "relative", width: "100%", height: "360px" }}>
                    <Image
                      src="/images/hardware-wallet-guide.png"
                      alt="Hardware wallet transaction approval screen"
                      fill
                      style={{ objectFit: "cover" }}
                      sizes="(max-width: 1024px) 100vw, 800px"
                    />
                  </div>
                  <figcaption style={{ padding: "var(--space-sm)", textAlign: "center", fontSize: "var(--text-sm)", color: "var(--text-muted)", borderTop: "1px solid var(--border-color)" }}>
                    Always verify the address, amount, network, and contract action on the hardware wallet screen before approving.
                  </figcaption>
                </figure>

                <h2>4. What To Check Before Buying</h2>
                <p>
                  Google product review guidance asks reviewers to show decision factors, tradeoffs, and evidence rather than only ranking products. For hardware wallets, the most important factors are signing clarity, supply-chain controls, firmware model, supported assets, backup options, and recovery workflow.
                </p>
                <ul>
                  <li><strong>Screen and signing clarity:</strong> larger secure screens reduce address and contract-review mistakes.</li>
                  <li><strong>Firmware model:</strong> open-source firmware improves public review; closed systems can still be strong when audited and well isolated.</li>
                  <li><strong>Secure Element:</strong> useful for physical theft resistance, PIN enforcement, randomness, and authenticity checks.</li>
                  <li><strong>Asset support:</strong> check the exact chain and wallet app you plan to use before buying.</li>
                  <li><strong>Backup standard:</strong> understand 12-, 20-, and 24-word seed options, Shamir/multishare backups, and passphrase behavior.</li>
                  <li><strong>Reseller risk:</strong> manufacturer stores and authorized resellers are safer than anonymous marketplace listings.</li>
                </ul>

                <h2>5. Setup Checklist</h2>
                <ol>
                  {checklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>

                <h2>6. When Not To Use a Hardware Wallet Alone</h2>
                <p>
                  A single hardware wallet is not enough for every situation. If you hold a business treasury, shared DAO funds, or a portfolio that would materially damage your finances if lost, use multisig or a documented recovery plan. If you trade daily, keep only a working balance in hot wallets and move reserves to cold storage.
                </p>
                <p>
                  For DeFi users, revoke unused token approvals, separate minting/trading wallets from long-term vault wallets, and avoid signing transactions you cannot interpret. &quot;Blind signing&quot; is a workflow risk, not merely a device-brand problem.
                </p>

                <h2>Sources and Methodology</h2>
                <p>
                  This page was updated on May 11, 2026. Rankings are based on custody model, signing clarity, secure hardware claims, transparency, asset support, backup workflow, and practical user fit. TokenRadar may earn commissions from Ledger and Trezor links, but affiliate availability did not determine which alternatives were discussed.
                </p>
                <ul>
                  {sourceLinks.map((source) => (
                    <li key={source.href}>
                      <SourceLink href={source.href}>{source.label}</SourceLink>
                    </li>
                  ))}
                </ul>
              </div>
            </article>

            <aside className="lg:col-span-1">
              <div style={{ position: "sticky", top: "100px" }}>
                <div className="card" style={{ border: "2px solid #10b981", padding: "var(--space-lg)", background: "var(--bg-elevated)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", color: "#10b981" }}>
                    <ShieldCheck size={20} />
                    <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0 }}>Manufacturer Links</h2>
                  </div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
                    Paid links: TokenRadar may earn a commission if you buy through these links. Verify the exact model, price, reseller status, shipping, and promo terms before checkout.
                  </p>

                  <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-sm)", border: "1px solid var(--border-color)", position: "relative", overflow: "hidden" }}>
                    <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-sm) 0", marginBottom: "var(--space-xs)", position: "relative", height: "112px" }}>
                      <Image
                        src="https://cdn.shopify.com/s/files/1/2974/4858/files/Nano_black.png?v=1717592280"
                        alt="Ledger Nano X hardware wallet"
                        fill
                        style={{ objectFit: "contain", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.2))" }}
                        sizes="200px"
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "8px" }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>Ledger</span>
                      <span className="badge badge-accent" style={{ background: "#10b981", color: "#111", fontSize: "9px", padding: "1px 5px" }}>Paid link</span>
                    </div>
                    <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                      <li>Broad asset support</li>
                      <li>Mobile and touchscreen options</li>
                    </ul>
                    {ledger && (
                      <a
                        href={ledger.url}
                        {...getPartnerLinkAttributes(ledger, "hardware-wallet-sidebar")}
                        className="btn btn-primary"
                        style={{ width: "100%", textAlign: "center", background: "#10b981", color: "#111", border: "none", fontWeight: 700, padding: "8px", fontSize: "13px" }}
                      >
                        {ledger.cta}
                      </a>
                    )}
                  </div>

                  <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "center", padding: "var(--space-sm) 0", marginBottom: "var(--space-xs)", position: "relative", height: "112px" }}>
                      <Image
                        src="https://static.trezor.io/2/4/24/55/Trezor_Safe_3_186404fdbd.png"
                        alt="Trezor Safe 3 hardware wallet"
                        fill
                        style={{ objectFit: "contain", filter: "drop-shadow(0 10px 15px rgba(0,0,0,0.2))" }}
                        sizes="200px"
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "8px" }}>
                      <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>Trezor</span>
                      <span className="badge badge-accent" style={{ background: "#4c1d95", color: "#fff", fontSize: "9px", padding: "1px 5px", border: "none" }}>Paid link</span>
                    </div>
                    <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                      <li>Open-source design</li>
                      <li>Bitcoin-only option available</li>
                    </ul>
                    <div style={{ display: "grid", gap: "var(--space-sm)" }}>
                      <a
                        href={trezorBitcoinOnly?.url || "/disclaimer"}
                        {...(trezorBitcoinOnly ? getPartnerLinkAttributes(trezorBitcoinOnly, "hardware-wallet-sidebar") : {})}
                        style={{ textDecoration: "none", display: "block", background: "rgba(247, 147, 26, 0.08)", border: "1px dashed rgba(247, 147, 26, 0.4)", borderRadius: "var(--radius-sm)", padding: "8px", textAlign: "center" }}
                      >
                        <span style={{ color: "#f7931a", fontWeight: 700, fontSize: "12px" }}>
                          {trezorBitcoinOnly?.cta || "View Bitcoin-only Trezor"}
                        </span>
                      </a>
                      <a
                        href={trezorSafe3?.url || "/disclaimer"}
                        {...(trezorSafe3 ? getPartnerLinkAttributes(trezorSafe3, "hardware-wallet-sidebar") : {})}
                        className="btn"
                        style={{ width: "100%", textAlign: "center", background: "#4c1d95", color: "#fff", border: "none", fontWeight: 700, padding: "8px", fontSize: "13px" }}
                      >
                        {trezorSafe3?.cta || "View Trezor Safe 3"}
                      </a>
                    </div>
                  </div>

                  <div style={{ marginTop: "var(--space-md)", padding: "var(--space-sm)", border: "1px solid rgba(16, 185, 129, 0.25)", borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <CheckCircle2 size={14} color="#10b981" style={{ display: "inline", marginRight: "6px", verticalAlign: "-2px" }} />
                    Best practice: open the official app from the manufacturer website, run authenticity checks, and start with a small test transfer.
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { JsonLd } from "@/components/JsonLd";
import { getPartner, getPartnerLinkAttributes } from "@/lib/partners";
import { getSiteUrl } from "@/lib/seo";

const LAST_UPDATED = "2026-05-11T00:00:00.000Z";
const PAGE_PATH = "/crypto-tax-guide";

const sourceLinks = [
  {
    label: "IRS: Digital assets",
    href: "https://www.irs.gov/filing/digital-assets",
  },
  {
    label: "IRS: 2026 Form 1099-DA instructions",
    href: "https://www.irs.gov/instructions/i1099da",
  },
  {
    label: "IRS: Revenue Ruling 2023-14 on staking rewards",
    href: "https://www.irs.gov/pub/irs-drop/rr-23-14.pdf",
  },
  {
    label: "HMRC: cryptoasset airdrops",
    href: "https://www.gov.uk/hmrc-internal-manuals/cryptoassets-manual/crypto21250",
  },
  {
    label: "ATO: DeFi and wrapping crypto",
    href: "https://www.ato.gov.au/individuals-and-families/investments-and-assets/crypto-asset-investments/decentralised-finance-and-wrapping-crypto",
  },
  {
    label: "European Commission: DAC8 crypto reporting",
    href: "https://taxation-customs.ec.europa.eu/taxation/tax-transparency-cooperation/administrative-co-operation-and-mutual-assistance/directive-administrative-cooperation-dac/dac8_en",
  },
];

const taxableEvents = [
  {
    event: "Sell crypto for fiat",
    us: "Usually capital gain or loss",
    note: "Report proceeds, basis, date acquired, and date disposed.",
  },
  {
    event: "Swap one crypto for another",
    us: "Usually a disposal",
    note: "The IRS digital asset question includes exchanges for another digital asset.",
  },
  {
    event: "Use crypto for goods or services",
    us: "Usually a disposal",
    note: "A taxable gain or loss can exist even if the amount spent is small.",
  },
  {
    event: "Mining or staking rewards",
    us: "Usually ordinary income on receipt/control",
    note: "Later sale can create a separate capital gain or loss.",
  },
  {
    event: "Move crypto between wallets you own",
    us: "Usually not a sale",
    note: "Network fees paid in crypto can still require separate treatment.",
  },
  {
    event: "Deposit into DeFi, LP, wrap, bridge",
    us: "Depends on mechanics",
    note: "Beneficial ownership, receipt of a new token, and contract terms matter.",
  },
];

const recordChecklist = [
  "Exchange CSVs and account statements.",
  "Wallet addresses you control, including old wallets.",
  "Transaction hashes for swaps, bridges, NFT trades, and DeFi deposits.",
  "Fair market value in your tax currency at the time of receipt or disposal.",
  "Cost basis, acquisition date, disposal date, units, fees, and network.",
  "Airdrop, staking, mining, referral, and reward records.",
  "Evidence for stolen, lost, failed, or abandoned positions.",
];

export const metadata: Metadata = {
  title: "Crypto Tax Guide 2026: US, UK, AU, DeFi, Airdrops, 1099-DA",
  description:
    "A source-backed 2026 crypto tax guide covering taxable events, IRS Form 1099-DA, staking, airdrops, DeFi, bridging, recordkeeping, and tax software workflows.",
  alternates: {
    canonical: PAGE_PATH,
  },
  openGraph: {
    title: "Crypto Tax Guide 2026",
    description:
      "Understand crypto taxable events, DeFi recordkeeping, staking, airdrops, and new reporting rules.",
    url: PAGE_PATH,
    type: "article",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "TokenRadar crypto tax guide",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Crypto Tax Guide 2026",
    description:
      "Crypto taxable event matrix, IRS 1099-DA, DeFi, staking, airdrops, and recordkeeping guidance.",
    images: ["/og-image.png"],
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

export default function CryptoTaxGuidePage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${PAGE_PATH}`;
  const koinly = getPartner("koinly");
  const coinledger = getPartner("coinledger");

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Crypto Tax Guide 2026",
    description: metadata.description,
    image: `${siteUrl}/og-image.png`,
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
        name: "Crypto Tax Guide",
        item: pageUrl,
      },
    ],
  };

  return (
    <>
      <JsonLd id="crypto-tax-article-jsonld" data={articleJsonLd} />
      <JsonLd id="crypto-tax-breadcrumb-jsonld" data={breadcrumbJsonLd} />
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
                background: "rgba(234, 179, 8, 0.1)",
                color: "#eab308",
                padding: "8px 16px",
                borderRadius: "99px",
                fontSize: "var(--text-sm)",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "var(--space-md)",
              }}
            >
              <AlertTriangle size={16} /> 2026 Tax Season Update
            </div>
            <h1 style={{ fontSize: "var(--text-4xl)", fontWeight: 800, lineHeight: 1.1, marginBottom: "var(--space-md)" }}>
              Crypto <span className="gradient-text">Tax Guide</span> for 2026
            </h1>
            <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)", marginBottom: "var(--space-md)" }}>
              A practical guide to taxable events, DeFi records, airdrops, staking rewards, broker reporting, and software workflows. This is educational content, not tax advice.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "var(--space-sm)" }}>
              <MetaPill>Updated May 11, 2026</MetaPill>
              <MetaPill>US, UK, AU, EU notes</MetaPill>
              <MetaPill>Paid links disclosed</MetaPill>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <article className="lg:col-span-2">
              <div className="article-content" style={{ fontSize: "var(--text-lg)" }}>
                <div
                  style={{
                    padding: "var(--space-lg)",
                    border: "1px solid rgba(234, 179, 8, 0.3)",
                    borderRadius: "var(--radius-lg)",
                    background: "rgba(234, 179, 8, 0.06)",
                    marginBottom: "var(--space-2xl)",
                  }}
                >
                  <strong style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "var(--space-sm)" }}>
                    <FileText size={18} color="#eab308" /> Important scope
                  </strong>
                  <p style={{ marginBottom: 0 }}>
                    Tax rules vary by country, state, entity type, and transaction facts. Use this page to organize questions and records before filing. Confirm final treatment with a qualified tax professional in your jurisdiction.
                  </p>
                </div>

                <h2>1. The 2026 Crypto Tax Shift</h2>
                <p>
                  Revenue agencies are moving from voluntary disclosure toward structured reporting. In the US, the IRS digital asset page says digital assets are property for federal tax purposes and that taxpayers may need to report transactions involving crypto, stablecoins, and NFTs.
                </p>
                <p>
                  The major 2026 US change is Form 1099-DA. IRS instructions say that for 2026 and beyond, brokers must report gross proceeds for digital asset sales, and basis information is mandatory for covered securities. That does not mean your exchange forms will be complete for every wallet, bridge, or DeFi transaction.
                </p>

                <h2>2. Taxable Event Matrix</h2>
                <p>
                  The table below is a practical starting point for US taxpayers. Other countries can treat the same event differently, especially around airdrops, pooling, wrapping, and DeFi beneficial ownership.
                </p>
                <div style={{ overflowX: "auto" }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Activity</th>
                        <th>Common US treatment</th>
                        <th>Record to keep</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taxableEvents.map((row) => (
                        <tr key={row.event}>
                          <td><strong>{row.event}</strong></td>
                          <td>{row.us}</td>
                          <td>{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h2>3. Jurisdiction Notes</h2>
                <p>
                  Do not publish one global crypto tax answer as if every country agrees. The better approach is to clearly separate jurisdiction notes and link to official sources.
                </p>
                <h3>United States</h3>
                <p>
                  The IRS digital asset question generally expects &quot;Yes&quot; when a taxpayer received digital assets from payment, rewards, mining, staking, certain airdrops, or disposed of digital assets for another asset, fiat, goods, or services. The IRS also says taxpayers should maintain records showing purchase, receipt, sale, exchange, other disposition, fair market value, and basis.
                </p>
                <p>
                  Revenue Ruling 2023-14 says proof-of-stake validation rewards are included in gross income when the taxpayer gains dominion and control over the rewards, with fair market value determined at that date and time.
                </p>

                <h3>United Kingdom</h3>
                <p>
                  The HMRC cryptoassets manual is more nuanced on airdrops than many generic guides. Income Tax does not always apply to airdrops received in a personal capacity without doing anything in return. Airdrops provided in return for, or in expectation of, a service can be income.
                </p>

                <h3>Australia</h3>
                <p>
                  The ATO treats many crypto assets as CGT assets for investors. Its DeFi guidance warns that lending, liquidity pool deposits, and wrapping can trigger CGT events depending on the arrangement and whether beneficial ownership changes.
                </p>

                <h3>European Union</h3>
                <p>
                  DAC8 entered into application on January 1, 2026. Crypto-asset service providers serving EU users are expected to collect reportable transaction information for 2026 and report it in 2027, expanding tax transparency across member states.
                </p>

                <h2>4. DeFi, Bridges, LPs, and Wrapped Tokens</h2>
                <p>
                  DeFi is where spreadsheet-only tax workflows usually break down. The issue is not just transaction count. It is classification: did you dispose of an asset, receive a new asset, get income, pay a deductible or capitalized fee, or move assets between wallets you still control?
                </p>
                <ul>
                  <li><strong>Liquidity pools:</strong> deposits can look like swaps when you receive LP tokens or a claim on pooled assets.</li>
                  <li><strong>Bridges and wrappers:</strong> treatment depends on whether you still own the same asset or receive a new asset/right.</li>
                  <li><strong>Staking:</strong> rewards may be income on receipt/control, then have a new basis for later sale.</li>
                  <li><strong>Airdrops:</strong> jurisdiction and facts matter. &quot;Free token&quot; is not enough information.</li>
                  <li><strong>Failed transactions and gas:</strong> fees can still matter even when no intended swap completed.</li>
                </ul>

                <h2>5. Recordkeeping Checklist</h2>
                <p>
                  Tax software can organize data, but it cannot invent missing wallet history. Build a year-end folder before you file.
                </p>
                <ol>
                  {recordChecklist.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>

                <h2>6. Choosing Crypto Tax Software</h2>
                <p>
                  Choose software based on your activity pattern, not only the cheapest plan. A centralized-exchange-only investor needs different tooling than someone who used wallets, NFT marketplaces, perps, Solana, Base, and Ethereum DeFi.
                </p>
                <ul>
                  <li><strong>Exchange-only:</strong> prioritize clean CSV/API imports and Form 8949 export.</li>
                  <li><strong>DeFi-heavy:</strong> prioritize chain coverage, reconciliation tools, cost-basis warnings, and manual classification controls.</li>
                  <li><strong>Multi-country:</strong> verify your jurisdiction and accounting method support before paying.</li>
                  <li><strong>CPA workflow:</strong> look for exports your preparer can audit, not just a summary PDF.</li>
                </ul>

                <h2>7. Filing Workflow</h2>
                <ol>
                  <li>Export every exchange and wallet source before importing into tax software.</li>
                  <li>Connect wallets by public address where possible and compare imported balances to actual balances.</li>
                  <li>Resolve missing cost basis, duplicate transfers, mislabeled rewards, and spam tokens.</li>
                  <li>Review high-value transactions manually before trusting the final report.</li>
                  <li>Give your preparer the summary report, Form 8949 export, income report, and unresolved assumptions.</li>
                </ol>

                <h2>Sources and Methodology</h2>
                <p>
                  This page was updated on May 11, 2026 using official tax authority guidance where possible. TokenRadar may earn commissions from tax software links, but the educational sections are written to separate jurisdiction facts from software recommendations.
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
                <div className="card" style={{ border: "2px solid var(--accent-primary)", padding: "var(--space-lg)", background: "var(--bg-elevated)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", marginBottom: "var(--space-sm)", color: "var(--accent-primary)" }}>
                    <ShieldCheck size={20} />
                    <h2 style={{ fontSize: "var(--text-lg)", fontWeight: 800, margin: 0 }}>Tax Software Options</h2>
                  </div>
                  <p style={{ color: "var(--text-secondary)", marginBottom: "var(--space-md)", fontSize: "var(--text-sm)" }}>
                    Connect exchanges and wallets to organize transaction history, cost basis, gains, losses, income, and tax exports.
                  </p>
                  <p style={{ color: "var(--text-muted)", marginBottom: "var(--space-md)", fontSize: "var(--text-xs)", lineHeight: 1.5 }}>
                    Paid links: TokenRadar may earn a commission if you sign up through these links. Always confirm final reports with a qualified professional.
                  </p>

                  {koinly && (
                    <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", marginBottom: "var(--space-sm)", border: "1px solid var(--border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>{koinly.name}</span>
                        <span className="badge badge-accent" style={{ background: "#eab308", color: "#111", fontSize: "10px", padding: "2px 6px" }}>Paid link</span>
                      </div>
                      <ul style={{ fontSize: "var(--text-xs)", color: "var(--text-secondary)", marginBottom: "var(--space-sm)", paddingLeft: "16px" }}>
                        <li>Exchange and wallet imports</li>
                        <li>International tax workflow support</li>
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

                  {coinledger && (
                    <div style={{ background: "var(--surface-color)", padding: "var(--space-sm) var(--space-md)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-color)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", gap: "8px" }}>
                        <span style={{ fontWeight: 700, fontSize: "var(--text-base)" }}>{coinledger.name}</span>
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

                  <div style={{ marginTop: "var(--space-md)", padding: "var(--space-sm)", border: "1px solid rgba(234, 179, 8, 0.25)", borderRadius: "var(--radius-md)", fontSize: "var(--text-xs)", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                    <CheckCircle2 size={14} color="#eab308" style={{ display: "inline", marginRight: "6px", verticalAlign: "-2px" }} />
                    Best practice: review unresolved transactions and cost-basis warnings before exporting final tax forms.
                  </div>
                </div>

                <div className="card" style={{ marginTop: "var(--space-md)", padding: "var(--space-md)", background: "rgba(234, 179, 8, 0.04)" }}>
                  <strong style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "var(--text-sm)", marginBottom: "var(--space-xs)" }}>
                    <ListChecks size={16} color="#eab308" /> CPA handoff pack
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: "18px", color: "var(--text-secondary)", fontSize: "var(--text-xs)", lineHeight: 1.6 }}>
                    <li>Capital gains report</li>
                    <li>Income report</li>
                    <li>Unresolved assumptions</li>
                    <li>Exchange CSV backups</li>
                  </ul>
                </div>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </>
  );
}

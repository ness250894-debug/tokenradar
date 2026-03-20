import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "TokenRadar terms of service — usage rules, limitations, and legal information.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service | TokenRadar",
    description:
      "TokenRadar terms of service — usage rules, limitations, and legal information.",
  },
  twitter: {
    title: "Terms of Service | TokenRadar",
    description:
      "TokenRadar terms of service — usage rules, limitations, and legal information.",
  },
};

/**
 * Standard terms of service page covering usage, IP, limitations of liability.
 */
export default function TermsPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>Terms of Service</h1>

          <p>
            By accessing and using TokenRadar (tokenradar.co), you agree to the
            following terms. If you do not agree, please discontinue use
            immediately.
          </p>

          <h2>Use of Content</h2>
          <p>
            All content on TokenRadar is provided for informational purposes
            only. You may not reproduce, redistribute, or republish our content
            without written permission. Our proprietary metrics (Risk Score,
            Growth Index, etc.) and the methodologies behind them are the
            intellectual property of TokenRadar.
          </p>

          <h2>Accuracy</h2>
          <p>
            While we strive for accuracy, TokenRadar makes no warranties about
            the completeness, reliability, or availability of any information
            on this website. Market data is sourced from third-party APIs and
            may be delayed or contain errors.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            TokenRadar and its operators shall not be liable for any losses or
            damages arising from the use of this website or reliance on any
            information provided herein. This includes, but is not limited to,
            financial losses from cryptocurrency investments.
          </p>

          <h2>Third-Party Links</h2>
          <p>
            Our website may contain affiliate links to cryptocurrency exchanges
            and other services. These are clearly disclosed. We may earn a
            commission from qualifying interactions, at no extra cost to you.
            We only partner with reputable, regulated exchanges.
          </p>

          <h2>Modifications</h2>
          <p>
            We reserve the right to modify these terms at any time. Continued
            use of the website after changes constitutes acceptance of the
            revised terms.
          </p>

          <h2>Governing Law</h2>
          <p>
            These terms are governed by applicable international laws. Any
            disputes shall be resolved through arbitration.
          </p>

          <p style={{ marginTop: "var(--space-xl)", color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: March 2026
          </p>
        </div>
      </section>
    </div>
  );
}

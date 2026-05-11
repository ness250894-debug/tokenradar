import type { Metadata } from "next";

const lastUpdated = "May 11, 2026";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "TokenRadar terms of service - usage rules, limitations, and legal information.",
  alternates: {
    canonical: "/terms",
  },
  openGraph: {
    title: "Terms of Service",
    description:
      "TokenRadar terms of service - usage rules, limitations, and legal information.",
  },
  twitter: {
    title: "Terms of Service",
    description:
      "TokenRadar terms of service - usage rules, limitations, and legal information.",
  },
};

export default function TermsPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>Terms of Service</h1>
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: {lastUpdated}
          </p>

          <p>
            By accessing and using TokenRadar (tokenradar.co), you agree to the
            following Terms of Service. If you do not agree, do not use the
            website.
          </p>

          <h2>Informational Service Only</h2>
          <p>
            TokenRadar provides educational crypto research, market data
            summaries, automated analysis, affiliate disclosures, and related
            tools. TokenRadar is not a broker, exchange, investment adviser,
            commodity trading adviser, tax adviser, law firm, custodian, wallet
            provider, or financial institution. Nothing on the site creates a
            professional, fiduciary, advisory, or client relationship.
          </p>

          <h2>Eligibility</h2>
          <p>
            You must be at least 18 years old, or the age of majority where you
            live, to use TokenRadar. You are responsible for complying with laws
            and regulations that apply to you, including restrictions on crypto
            assets, exchanges, taxes, advertising, and financial products in
            your jurisdiction.
          </p>

          <h2>Use of Content</h2>
          <p>
            Unless otherwise stated, TokenRadar content, design, proprietary
            metrics, research format, scoring labels, and methodology summaries
            are owned by TokenRadar or licensed to us. You may view and share
            links to public pages for personal, non-commercial use. You may not
            scrape, reproduce, redistribute, republish, resell, frame, or create
            a competing database from our content without written permission.
          </p>

          <h2>Prohibited Conduct</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use TokenRadar for unlawful, deceptive, or abusive activity.</li>
            <li>Use automated scraping, crawling, data mining, or bulk extraction without permission.</li>
            <li>Attempt to bypass rate limits, security controls, robots rules, or access restrictions.</li>
            <li>Probe, scan, test, or attack the security or availability of the site.</li>
            <li>Submit malicious code, spam, false contact information, or abusive messages.</li>
            <li>Misrepresent TokenRadar data as investment advice, official exchange data, or guaranteed outcomes.</li>
          </ul>

          <h2>Data and Accuracy</h2>
          <p>
            We strive to present useful information, but crypto markets move
            quickly and data may be delayed, incomplete, unavailable, or wrong.
            Market data, token descriptions, prices, supply figures, social
            metrics, RSS items, exchange availability, and third-party claims
            may come from external sources such as CoinGecko, public websites,
            feeds, APIs, and partner pages. You must verify important
            information before relying on it.
          </p>

          <h2>No Trading Reliance</h2>
          <p>
            TokenRadar scores, rankings, price scenarios, alerts, guides,
            calculators, charts, social posts, and AI-assisted summaries are not
            recommendations to buy, sell, hold, stake, lend, borrow, or use any
            crypto asset or service. You are solely responsible for your own
            research, decisions, and losses.
          </p>

          <h2>Contact Submissions</h2>
          <p>
            If you send us feedback, corrections, partnership inquiries, or
            other messages, you grant TokenRadar permission to review, store,
            respond to, and use the submission to operate and improve the site.
            Do not send confidential, sensitive, private-key, seed-phrase, or
            regulated information through the contact form.
          </p>

          <h2>Affiliate and Third-Party Links</h2>
          <p>
            TokenRadar may contain paid links, affiliate links, sponsored links,
            or links to exchanges, wallets, tax software, charting tools, social
            platforms, project websites, and other third-party services. We may
            earn compensation if you click, sign up, subscribe, or buy through
            some links, at no extra cost to you.
          </p>
          <p>
            Third-party availability, listings, fees, promotions, legal status,
            risk controls, custody terms, and eligibility vary by country and
            can change without notice. Links are provided for research and do
            not constitute an endorsement or recommendation to use a service.
            Third-party sites are governed by their own terms and privacy
            policies.
          </p>

          <h2>Privacy</h2>
          <p>
            Our Privacy Policy explains how we collect, use, and share
            information. By using TokenRadar, you acknowledge the data practices
            described there.
          </p>

          <h2>Availability and Changes</h2>
          <p>
            We may update, remove, restrict, suspend, or discontinue any part of
            TokenRadar at any time. We may also update these Terms. Continued
            use of the site after an updated date is posted means you accept the
            revised Terms.
          </p>

          <h2>Disclaimer of Warranties</h2>
          <p>
            TokenRadar is provided &quot;as is&quot; and &quot;as
            available&quot; without warranties of any kind, whether express,
            implied, or statutory. We do not warrant that the site will be
            accurate, complete, uninterrupted, secure, error-free, or suitable
            for your purposes.
          </p>

          <h2>Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, TokenRadar and its
            operators, contributors, and service providers will not be liable for
            indirect, incidental, special, consequential, exemplary, punitive, or
            lost-profit damages, or for trading, investment, tax, custody,
            exchange, data, or business losses arising from your use of or
            reliance on the site.
          </p>

          <h2>Indemnity</h2>
          <p>
            You agree to indemnify and hold TokenRadar harmless from claims,
            losses, liabilities, damages, costs, and expenses arising from your
            misuse of the site, violation of these Terms, unlawful activity, or
            infringement of another person&apos;s rights.
          </p>

          <h2>Disputes</h2>
          <p>
            Any dispute will be handled by a court or other forum with competent
            jurisdiction under applicable law. Nothing in these Terms limits
            mandatory consumer-protection, privacy, or other rights that cannot
            legally be waived.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about these Terms can be sent to{" "}
            <a href="mailto:contact@tokenradar.co">contact@tokenradar.co</a>.
          </p>
        </div>
      </section>
    </div>
  );
}

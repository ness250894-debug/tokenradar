import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "TokenRadar privacy policy — how we collect, use, and protect your data. GDPR compliant.",
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy",
    description:
      "TokenRadar privacy policy — how we collect, use, and protect your data. GDPR compliant.",
  },
  twitter: {
    title: "Privacy Policy",
    description:
      "TokenRadar privacy policy — how we collect, use, and protect your data. GDPR compliant.",
  },
};

/**
 * GDPR-compliant privacy policy page.
 */
export default function PrivacyPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>Privacy Policy</h1>

          <p>
            Your privacy is important to us. This policy explains what data
            TokenRadar (tokenradar.co) collects, how we use it, and your rights.
          </p>

          <h2>Data We Collect</h2>
          <p>
            TokenRadar is a static website. We do not require user registration
            or collect personal data directly. However, the following third-party
            services may collect anonymous data:
          </p>
          <ul>
            <li>
              <strong>Analytics:</strong> We use privacy-focused analytics to
              understand page views and traffic sources. No personally
              identifiable information (PII) is collected.
            </li>
            <li>
              <strong>Google AdSense:</strong> If ads are displayed, Google may
              use cookies to serve personalized or non-personalized ads. See
              Google&apos;s{" "}
              <a
                href="https://policies.google.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent-secondary)" }}
              >
                Privacy Policy
              </a>
              .
            </li>
          </ul>

          <h2>Cookies</h2>
          <p>
            We use essential cookies only for site functionality (e.g., cookie
            consent preference). Third-party cookies from ad providers are
            optional and require your consent via our cookie banner.
          </p>

          <h2>Your Rights (GDPR)</h2>
          <p>If you are in the EU/EEA, you have the right to:</p>
          <ul>
            <li>Access any personal data we hold about you</li>
            <li>Request deletion of your data</li>
            <li>Withdraw consent for non-essential cookies</li>
            <li>Lodge a complaint with a supervisory authority</li>
          </ul>

          <h2>Contact</h2>
          <p>
            For privacy-related inquiries, email{" "}
            <a
              href="mailto:contact@tokenradar.co"
              style={{ color: "var(--accent-secondary)" }}
            >
              contact@tokenradar.co
            </a>
            .
          </p>

          <p style={{ marginTop: "var(--space-xl)", color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </p>
        </div>
      </section>
    </div>
  );
}

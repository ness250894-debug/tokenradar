import type { Metadata } from "next";
import { CookiePreferencesButton } from "@/components/CookiePreferencesButton";

const lastUpdated = "May 13, 2026";
const description =
  "Token Radar privacy policy - how the public TokenRadar website collects, uses, shares, and protects data.";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description,
  alternates: {
    canonical: "/privacy",
  },
  openGraph: {
    title: "Privacy Policy",
    description,
  },
  twitter: {
    title: "Privacy Policy",
    description,
  },
};

export default function PrivacyPage() {
  return (
    <div className="container">
      <section className="section">
        <div className="article-content">
          <h1>Privacy Policy</h1>
          <p style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
            Last updated: {lastUpdated}
          </p>

          <p>
            This Privacy Policy applies to Token Radar, also branded as
            TokenRadar, the public website at tokenradar.co. It explains how
            Token Radar collects, uses, shares, and protects information when
            you visit the site, use our contact form, click partner links,
            authorize a supported publishing integration, or interact with our
            content. Token Radar is a public educational market research site.
            We do not require visitor accounts, collect wallet private keys,
            custody assets, or process trades.
          </p>

          <h2>Information We Collect</h2>
          <p>
            We collect limited information needed to operate the site, measure
            performance, respond to inquiries, and maintain affiliate and
            advertising disclosures.
          </p>
          <ul>
            <li>
              <strong>Website and analytics data:</strong> With your consent
              where required, we use Google Analytics to understand page views,
              traffic sources, device/browser information, approximate location,
              and on-site interactions. Click events may include element type,
              normalized click text, sanitized link path or domain, partner ID,
              partner category, placement metadata, outbound status, and page
              path. We do not intentionally send names, email addresses, wallet
              addresses, or other directly identifying data to Google Analytics.
            </li>
            <li>
              <strong>Contact-form data:</strong> If you submit the contact
              form, we collect the name, email address, subject, and message you
              provide. Form submissions are processed by Formspree so we can
              receive and respond to your inquiry.
            </li>
            <li>
              <strong>Affiliate-link data:</strong> If you click a paid or
              partner link, the third-party destination may receive information
              about your visit according to its own privacy policy. TokenRadar
              may record limited click metadata to understand which partner
              placements are used.
            </li>
            <li>
              <strong>TikTok publishing authorization data:</strong> If an
              authorized creator connects TikTok for the Token Radar publishing
              workflow, we process TikTok OAuth tokens and operational
              publishing metadata such as publish ID, upload status, generated
              caption, topic, and timestamp. We use this only to upload public
              educational videos to the authorized creator&apos;s TikTok inbox
              or profile and to troubleshoot the publishing flow. We do not
              collect TikTok profile statistics, follower lists, comments, or
              video lists.
            </li>
            <li>
              <strong>Hosting and security logs:</strong> Our hosting, CDN, and
              infrastructure providers may process IP address, user-agent,
              request path, timestamps, and diagnostic logs to deliver pages,
              prevent abuse, and maintain security.
            </li>
          </ul>

          <h2>How We Use Information</h2>
          <ul>
            <li>Operate, maintain, secure, and debug the website.</li>
            <li>Respond to messages, correction requests, and partnership inquiries.</li>
            <li>Operate public content distribution and creator-authorized publishing workflows.</li>
            <li>Measure traffic, content performance, and partner-link usage.</li>
            <li>Improve site navigation, research quality, and disclosure placement.</li>
            <li>Comply with legal obligations and enforce our Terms of Service.</li>
          </ul>

          <h2>Legal Bases Where Applicable</h2>
          <p>
            Where GDPR, UK GDPR, or similar laws apply, our legal bases may
            include consent for non-essential analytics or advertising cookies,
            legitimate interests in operating and securing an informational
            website, performance of a request when you contact us, and compliance
            with legal obligations.
          </p>

          <h2>Cookies and Analytics Choices</h2>
          <p>
            TokenRadar does not require account cookies for site access.
            Non-essential Google Analytics tags are loaded only after you accept
            analytics cookies through our site banner. You may reject analytics
            cookies and continue using the site.
          </p>
          <p>
            If Google AdSense or other ads are enabled, Google and other ad
            technology providers may use cookies or similar identifiers to serve,
            measure, and personalize or limit ads according to applicable law and
            user consent requirements. For more information, see Google&apos;s{" "}
            <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            .
          </p>
          <CookiePreferencesButton />

          <h2>How We Share Information</h2>
          <p>We may share limited information with these categories of recipients:</p>
          <ul>
            <li>
              <strong>Analytics providers:</strong> Google Analytics, when
              enabled with user consent.
            </li>
            <li>
              <strong>Form processors:</strong> Formspree, for contact-form
              submissions.
            </li>
            <li>
              <strong>Hosting and security providers:</strong> infrastructure
              vendors that deliver and protect the website.
            </li>
            <li>
              <strong>Affiliate and advertising partners:</strong> when you
              click outbound links or when advertising is enabled.
            </li>
            <li>
              <strong>Social publishing providers:</strong> TikTok and other
              social platforms when an authorized creator uses a publishing
              integration to distribute public Token Radar content.
            </li>
            <li>
              <strong>Legal and safety recipients:</strong> when required to
              comply with law, enforce terms, respond to lawful requests, or
              protect users and the site.
            </li>
          </ul>
          <p>
            We do not sell mailing lists or user account profiles. If a privacy
            law treats certain advertising or cross-context tracking as a
            &quot;sale&quot; or &quot;sharing&quot; of personal information, we
            will provide the opt-out mechanisms required by that law before using
            those features.
          </p>

          <h2>International Transfers</h2>
          <p>
            TokenRadar is available globally. Our providers, including Google
            and Formspree, may process information in the United States or other
            countries where they operate. Those countries may have privacy laws
            different from those in your location.
          </p>

          <h2>Retention</h2>
          <p>
            We keep contact-form messages only as long as reasonably necessary
            to respond, maintain records of the request, resolve disputes, or
            comply with legal obligations. Analytics and log retention are
            controlled by our provider settings and operational needs. TikTok
            OAuth tokens are retained only while the creator-authorized
            publishing workflow remains connected, and publishing metadata may
            be retained for diagnostics and duplicate prevention. We aim to
            minimize data retained by Token Radar directly.
          </p>

          <h2>Your Rights</h2>
          <p>
            Depending on where you live and whether a specific privacy law
            applies, you may have rights to:
          </p>
          <ul>
            <li>Access or receive a copy of personal information we hold about you.</li>
            <li>Request correction or deletion of your personal information.</li>
            <li>Object to or restrict certain processing.</li>
            <li>Withdraw consent for analytics or advertising cookies.</li>
            <li>Opt out of sale, sharing, or targeted advertising where applicable.</li>
            <li>Appeal or complain to a privacy regulator where applicable.</li>
          </ul>
          <p>
            To exercise rights, email us at the contact address below. We may
            need to verify your request before acting on it.
          </p>

          <h2>Children</h2>
          <p>
            TokenRadar is not directed to children under 13, and we do not
            knowingly collect personal information from children. If you believe
            a child has submitted information to us, contact us and we will take
            appropriate steps.
          </p>

          <h2>Security</h2>
          <p>
            We use reasonable administrative and technical safeguards for the
            limited information we process. No website, analytics system, or
            form processor can guarantee perfect security.
          </p>

          <h2>Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy as the site, providers, legal
            requirements, or data practices change. When we make material
            changes, we will update the date shown at the top of this page.
          </p>

          <h2>Contact</h2>
          <p>
            For privacy-related inquiries, email{" "}
            <a href="mailto:contact@tokenradar.co">contact@tokenradar.co</a>.
          </p>
        </div>
      </section>
    </div>
  );
}

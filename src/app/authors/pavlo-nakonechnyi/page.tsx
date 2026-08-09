import type { Metadata } from "next";
import Link from "next/link";

import { JsonLd } from "@/components/JsonLd";
import { getSiteUrl } from "@/lib/seo";
import {
  buildAuthorPersonSchema,
  buildPublisherSchema,
  TOKENRADAR_AUTHOR_LINKEDIN,
  TOKENRADAR_AUTHOR_PATH,
} from "@/lib/schema-entities";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";

const PAGE_TITLE = "Pavlo Nakonechnyi, Founder & Lead Researcher";
const PAGE_DESCRIPTION =
  "Meet Pavlo Nakonechnyi, TokenRadar founder and lead researcher, and review his editorial responsibilities, research process, and corrections policy.";

export const metadata: Metadata = {
  title: "Pavlo Nakonechnyi, Founder & Researcher",
  description: PAGE_DESCRIPTION,
  alternates: { canonical: TOKENRADAR_AUTHOR_PATH },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

export default function PavloNakonechnyiAuthorPage() {
  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}${TOKENRADAR_AUTHOR_PATH}`;

  return (
    <div className="container" style={{ paddingBottom: "var(--space-4xl)" }}>
      <JsonLd
        id="pavlo-nakonechnyi-profile-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "@id": `${pageUrl}#profile-page`,
          url: pageUrl,
          name: PAGE_TITLE,
          description: PAGE_DESCRIPTION,
          dateModified: "2026-08-09",
          mainEntity: buildAuthorPersonSchema(siteUrl),
          publisher: buildPublisherSchema(siteUrl),
        }}
      />
      <JsonLd
        id="pavlo-nakonechnyi-breadcrumb-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
            { "@type": "ListItem", position: 2, name: "Authors", item: pageUrl },
            { "@type": "ListItem", position: 3, name: "Pavlo Nakonechnyi", item: pageUrl },
          ],
        }}
      />

      <nav aria-label="Breadcrumb" style={{ marginTop: "var(--space-xl)", fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
        <Link href="/">Home</Link> / <span>Authors</span> / Pavlo Nakonechnyi
      </nav>

      <header style={{ maxWidth: 880, margin: "var(--space-3xl) auto" }}>
        <p className="eyebrow-text">Author &amp; Reviewer</p>
        <h1 style={{ fontSize: "var(--text-4xl)", marginBottom: "var(--space-md)" }}>
          Pavlo Nakonechnyi
        </h1>
        <p style={{ fontSize: "var(--text-xl)", color: "var(--text-secondary)", lineHeight: 1.7 }}>
          Founder and lead researcher at TokenRadar, responsible for the site&apos;s research methodology,
          publication standards, data-source policy, and corrections process.
        </p>
        <div style={{ display: "flex", gap: "var(--space-md)", flexWrap: "wrap", marginTop: "var(--space-lg)" }}>
          <a href={TOKENRADAR_AUTHOR_LINKEDIN} target="_blank" rel="me noopener noreferrer" className="btn btn-secondary">
            LinkedIn profile
          </a>
          <Link href="/about#methodology" className="btn btn-primary">Read the methodology</Link>
        </div>
      </header>

      <main className="article-content" style={{ maxWidth: 880, margin: "0 auto" }}>
        <h2>Editorial responsibilities</h2>
        <p>
          Pavlo maintains the rules that determine which token and launch pages are publishable, how risk and
          market metrics are described, and when content must be corrected, refreshed, consolidated, or removed
          from search indexing. AI-assisted drafts are treated as inputs to a structured publishing workflow, not
          as independent sources.
        </p>

        <h2>Research approach</h2>
        <p>
          TokenRadar separates market observations from forecasts. Token profiles combine public market data with
          documented scoring rules; launch pages require attributable evidence; scenario articles state assumptions
          and risks. Dates and source context are shown so readers can judge whether a finding is still current.
        </p>

        <h2>Independence and commercial disclosures</h2>
        <p>
          Partner links are labeled and use sponsored-link attributes. Commercial relationships do not change the
          indexability rules, risk methodology, or conclusions on research pages. TokenRadar does not present its
          content as personalized investment, tax, or legal advice.
        </p>

        <h2>Corrections and contact</h2>
        <p>
          Readers can report inaccurate market context, broken sources, unclear disclosures, or outdated launch
          evidence through the <Link href="/contact">contact page</Link>. Substantive corrections are reviewed
          against the source data and reflected in the relevant page&apos;s updated date where appropriate.
        </p>

        <p>
          See also the <Link href="/about">TokenRadar methodology and data sources</Link>, the
          <Link href="/disclaimer"> financial disclaimer</Link>, and the <Link href="/learn">learning hub</Link>.
        </p>
      </main>
    </div>
  );
}

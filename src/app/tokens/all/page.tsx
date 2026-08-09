import type { Metadata } from "next";
import Link from "next/link";

import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";
import { getIndexableTokenProfiles } from "@/lib/token-directory-data";

const PAGE_TITLE = "All Crypto Token Profiles A-Z";
const PAGE_DESCRIPTION =
  "Browse every published TokenRadar cryptocurrency profile alphabetically, with direct links to market data, risk scores, and research.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/tokens/all",
  },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

export default async function AllTokenProfilesPage() {
  const profiles = await getIndexableTokenProfiles();

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <section className="section">
        <div className="section-header">
          <h1>
            All Crypto <span className="gradient-text">Profiles A-Z</span>
          </h1>
          <p>Every published TokenRadar profile in one crawlable alphabetical index.</p>
        </div>

        <nav
          className="card"
          aria-label="All published token profiles"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "var(--space-sm) var(--space-lg)",
            padding: "var(--space-lg)",
            fontSize: "var(--text-sm)",
          }}
        >
          {profiles.map((token) => (
            <Link href={`/${token.id}`} key={token.id}>
              {token.name} ({token.symbol.toUpperCase()})
            </Link>
          ))}
        </nav>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { Activity, DollarSign, TrendingUp } from "lucide-react";

import Link from "next/link";

import { TokenGrid } from "@/components/TokenGrid";
import { formatCompact } from "@/lib/content-loader";
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";
import { getIndexableTokenProfiles, getTokenDirectoryData } from "@/lib/token-directory-data";

const PAGE_TITLE = "Crypto Token Directory";
const PAGE_DESCRIPTION =
  "Browse every cryptocurrency token tracked by TokenRadar with direct links to market data, analysis, risk scores, and research guides.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/tokens",
  },
  openGraph: buildOpenGraphMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
  twitter: buildTwitterMetadata({ title: PAGE_TITLE, description: PAGE_DESCRIPTION }),
};

export default async function TokensPage() {
  const { tokens, cards: tokenCards } = await getTokenDirectoryData();
  const totalMarketCap = tokens.reduce((sum, token) => sum + (token.marketCap || 0), 0);
  const totalVolume = tokens.reduce((sum, token) => sum + (token.volume24h || 0), 0);
  const indexableProfiles = await getIndexableTokenProfiles(tokens);

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <section className="section">
        <div className="section-header">
          <h1>Crypto Token Directory</h1>
          <p style={{ fontSize: "var(--text-sm)" }}>
            Market data and risk research for {tokens.length} tokens.
          </p>
        </div>

        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-md)", marginBottom: "var(--space-3xl)" }}>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">Tokens Tracked</div>
            <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <Activity size={20} />
              {tokens.length}
            </div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">Combined Market Cap</div>
            <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <DollarSign size={20} />
              {formatCompact(totalMarketCap)}
            </div>
          </div>
          <div className="card" style={{ padding: "var(--space-md)" }}>
            <div className="stat-label">24h Volume</div>
            <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)" }}>
              <TrendingUp size={20} />
              {formatCompact(totalVolume)}
            </div>
          </div>
        </div>

        <TokenGrid
          tokens={tokenCards.slice(0, 6)}
          totalTokenCount={tokenCards.length}
          deferredDataUrl="/data/token-directory.json"
          initialVisibleCount={6}
          searchPlaceholder="Search the token directory by name or symbol..."
        />

        <div style={{ marginTop: "var(--space-2xl)", textAlign: "center" }}>
          <Link href="/tokens/all" className="btn btn-secondary">
            Browse all {indexableProfiles.length} published token profiles A-Z
          </Link>
        </div>
      </section>
    </main>
  );
}

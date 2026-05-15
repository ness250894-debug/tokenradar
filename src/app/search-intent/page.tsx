import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, Radar, SearchCheck, ShieldAlert } from "lucide-react";

import { TokenGrid } from "@/components/TokenGrid";
import type { TokenCardData } from "@/components/TokenCard";
import {
  getAllTokens,
  getCategoryIds,
  getPrimaryTokenCategory,
  getSearchIntentDataset,
  getSearchIntentHistoryDataset,
  getSearchIntentTrendMap,
  getTokenMetrics,
  getTopSearchIntentTokens,
} from "@/lib/content-loader";
import {
  buildSearchIntentCardFields,
  SEARCH_INTENT_DESCRIPTIONS,
  type TokenSearchIntentSnapshot,
} from "@/lib/search-intent";

export const metadata: Metadata = {
  title: "Crypto Search Intent Radar",
  description: "Browse free-data crypto search intent signals by attention, hype pressure, supply risk, and user research intent.",
  alternates: {
    canonical: "/search-intent",
  },
};

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function formatDate(value: string | undefined): string {
  if (!value) return "Not captured";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not captured";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function buildTokenCards(
  intents: TokenSearchIntentSnapshot[],
  trends: Awaited<ReturnType<typeof getSearchIntentTrendMap>>,
): Promise<TokenCardData[]> {
  const allTokens = await getAllTokens();
  const categoryIds = await getCategoryIds();
  const tokenById = new Map(allTokens.map((token) => [token.id, token]));

  return Promise.all(intents.map(async (intent) => {
    const token = tokenById.get(intent.tokenId);
    const metrics = await getTokenMetrics(intent.tokenId);
    const category = token ? getPrimaryTokenCategory(token.categories, categoryIds) : { name: "Crypto", href: "/tokens" };

    return {
      id: intent.tokenId,
      name: token?.name || intent.tokenName,
      symbol: token?.symbol || intent.symbol,
      imageUrl: token?.imageUrl || token?.image,
      price: token?.price || 0,
      priceChange24h: token?.priceChange24h || 0,
      marketCap: token?.marketCap || 0,
      riskScore: metrics?.riskScore || 5,
      category: category.name,
      categoryHref: category.href,
      ...buildSearchIntentCardFields(intent, trends[intent.tokenId]),
    };
  }));
}

export default async function SearchIntentPage() {
  const [dataset, history, topIntents, trendMap] = await Promise.all([
    getSearchIntentDataset(),
    getSearchIntentHistoryDataset(),
    getTopSearchIntentTokens(18),
    getSearchIntentTrendMap(),
  ]);

  const tokenCards = await buildTokenCards(topIntents, trendMap);
  const intentRows = dataset?.summary.topIntents || [];
  const latestEntry = history?.entries[0];
  const hotCount = Object.values(dataset?.tokens || {}).filter((token) => token.attentionLabel === "Hot").length;
  const highSupplyRiskCount = Object.values(dataset?.tokens || {}).filter((token) => token.supplyRiskScore >= 60).length;

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <section className="section">
        <div className="section-header">
          <p className="eyebrow-text">Search Intent Radar</p>
          <h1 className="search-intent-page-title">
            Crypto <span className="gradient-text">Search Intent</span>{" "}
            <span className="search-intent-title-tail">Dashboard</span>
          </h1>
          <p>Free-data attention signals grouped by what users are likely researching across tracked tokens.</p>
        </div>

        <div className="stats-grid search-intent-overview-stats">
          <div className="card search-intent-stat-card">
            <Radar size={22} />
            <span>Tokens Scored</span>
            <strong>{formatInteger(dataset?.summary.tokenCount || 0)}</strong>
          </div>
          <div className="card search-intent-stat-card">
            <SearchCheck size={22} />
            <span>Hot Attention</span>
            <strong>{formatInteger(hotCount)}</strong>
          </div>
          <div className="card search-intent-stat-card">
            <ShieldAlert size={22} />
            <span>Supply Risk 60+</span>
            <strong>{formatInteger(highSupplyRiskCount)}</strong>
          </div>
          <div className="card search-intent-stat-card">
            <CalendarClock size={22} />
            <span>Daily Snapshots</span>
            <strong>{formatInteger(history?.entries.length || 0)}</strong>
            <small>{formatDate(latestEntry?.generatedAt || dataset?.generatedAt)}</small>
          </div>
        </div>

        <div className="search-intent-topic-grid">
          {intentRows.map((intent) => (
            <Link href={`/search-intent/${intent.intent}`} className="card search-intent-topic-card" key={intent.intent}>
              <div>
                <span className="eyebrow-text">{formatInteger(intent.tokenCount)} tokens</span>
                <h2>{intent.label}</h2>
                <p>{SEARCH_INTENT_DESCRIPTIONS[intent.intent]}</p>
              </div>
              <div className="search-intent-topic-foot">
                <span>Avg {intent.avgScore}/100</span>
                <ArrowRight size={16} />
              </div>
            </Link>
          ))}
        </div>

        <div className="search-intent-method-card card">
          <h2>Methodology</h2>
          <ul className="search-intent-list">
            {(dataset?.summary.methodology || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="section-header" style={{ marginTop: "var(--space-3xl)" }}>
          <h2>
            Highest <span className="gradient-text">Attention</span> Tokens
          </h2>
          <p>Sorted by generated attention score, then hype pressure.</p>
        </div>

        <TokenGrid
          tokens={tokenCards}
          initialVisibleCount={12}
          searchPlaceholder="Search high-attention tokens by name, symbol, category, or intent..."
        />
      </section>
    </main>
  );
}

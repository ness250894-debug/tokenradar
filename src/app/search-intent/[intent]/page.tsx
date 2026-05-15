import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Radar } from "lucide-react";

import { TokenGrid } from "@/components/TokenGrid";
import type { TokenCardData } from "@/components/TokenCard";
import {
  getAllTokens,
  getCategoryIds,
  getPrimaryTokenCategory,
  getSearchIntentTrendMap,
  getSearchIntentTokensByIntent,
  getTokenMetrics,
} from "@/lib/content-loader";
import {
  buildSearchIntentCardFields,
  SEARCH_INTENT_DESCRIPTIONS,
  SEARCH_INTENT_LABELS,
  type SearchIntentType,
  type TokenSearchIntentSnapshot,
} from "@/lib/search-intent";

interface PageProps {
  params: Promise<{ intent: string }>;
}

const SEARCH_INTENTS = Object.keys(SEARCH_INTENT_LABELS) as SearchIntentType[];

const INTENT_SEO_COPY: Record<SearchIntentType, { title: string; description: string }> = {
  prediction: {
    title: "Crypto Price Prediction Search Intent",
    description: "Find crypto tokens where users are searching for forecasts, price targets, market scenarios, and trend confirmation.",
  },
  buying: {
    title: "Crypto Buying Access Search Intent",
    description: "Rank tokens by buying-intent demand, exchange-access research, purchase workflow checks, and user onboarding signals.",
  },
  risk: {
    title: "Crypto Risk Check Search Intent",
    description: "Track tokens where users are checking scam risk, volatility, liquidity, safety, and low-quality attention signals.",
  },
  supply: {
    title: "Crypto Unlock and Supply Search Intent",
    description: "Monitor tokens where search demand points to unlock schedules, FDV pressure, circulating supply, and tokenomics risk.",
  },
  airdrop: {
    title: "Crypto Airdrop and Launch Search Intent",
    description: "Rank launch, listing, TGE, eligibility, and airdrop-focused crypto search demand using TokenRadar free-data signals.",
  },
  stablecoin: {
    title: "Stablecoin Safety Search Intent",
    description: "Track stablecoins where users are researching peg stability, reserves, issuer trust, depeg risk, and yield safety.",
  },
  rwa: {
    title: "RWA Crypto Search Intent",
    description: "Find tokenized-asset and RWA crypto tokens with search demand around treasuries, credit, issuers, and redemption risk.",
  },
  ai: {
    title: "AI Crypto Search Intent",
    description: "Rank AI crypto tokens by search demand around agents, compute, infrastructure, category rotation, and narrative strength.",
  },
  meme: {
    title: "Meme Coin Search Intent",
    description: "Track meme-token attention spikes, retail momentum, hype pressure, and whether current search demand looks sustainable.",
  },
  yield: {
    title: "Crypto Yield and Staking Search Intent",
    description: "Compare tokens where users are searching staking rewards, APY, protocol revenue, yield sustainability, and risk.",
  },
  news: {
    title: "Crypto News Catalyst Search Intent",
    description: "Rank tokens with search demand tied to fresh catalysts, listings, ecosystem updates, sharp moves, and market rumors.",
  },
};

function isSearchIntentType(value: string): value is SearchIntentType {
  return SEARCH_INTENTS.includes(value as SearchIntentType);
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
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

export function generateStaticParams() {
  return SEARCH_INTENTS.map((intent) => ({ intent }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { intent } = await params;
  if (!isSearchIntentType(intent)) return { title: "Search Intent Not Found" };

  const copy = INTENT_SEO_COPY[intent];

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `/search-intent/${intent}`,
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      type: "website",
    },
    twitter: {
      title: copy.title,
      description: copy.description,
    },
  };
}

export default async function SearchIntentTopicPage({ params }: PageProps) {
  const { intent } = await params;
  if (!isSearchIntentType(intent)) notFound();

  const [matchingIntents, trendMap] = await Promise.all([
    getSearchIntentTokensByIntent(intent),
    getSearchIntentTrendMap(),
  ]);
  const tokenCards = await buildTokenCards(matchingIntents, trendMap);
  const averageAttention =
    matchingIntents.reduce((sum, item) => sum + item.attentionScore, 0) / Math.max(1, matchingIntents.length);
  const averageHype =
    matchingIntents.reduce((sum, item) => sum + item.hypeScore, 0) / Math.max(1, matchingIntents.length);

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-md)" }}>
      <section className="section">
        <nav className="search-intent-breadcrumb">
          <Link href="/search-intent">
            <ArrowLeft size={14} />
            Search Intent Radar
          </Link>
        </nav>

        <div className="section-header">
          <p className="eyebrow-text">Search Intent Radar</p>
          <h1>
            {SEARCH_INTENT_LABELS[intent]} <span className="gradient-text">Crypto Tokens</span>
          </h1>
          <p>{SEARCH_INTENT_DESCRIPTIONS[intent]}</p>
        </div>

        <div className="stats-grid search-intent-overview-stats">
          <div className="card search-intent-stat-card">
            <Radar size={22} />
            <span>Matching Tokens</span>
            <strong>{formatInteger(matchingIntents.length)}</strong>
          </div>
          <div className="card search-intent-stat-card">
            <span>Average Attention</span>
            <strong>{Math.round(averageAttention)}/100</strong>
          </div>
          <div className="card search-intent-stat-card">
            <span>Average Hype</span>
            <strong>{Math.round(averageHype)}/100</strong>
          </div>
        </div>

        <TokenGrid
          tokens={tokenCards}
          initialVisibleCount={12}
          searchPlaceholder={`Search ${SEARCH_INTENT_LABELS[intent].toLowerCase()} tokens...`}
        />
      </section>
    </main>
  );
}

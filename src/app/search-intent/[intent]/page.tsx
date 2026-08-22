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
import { buildOpenGraphMetadata, buildTwitterMetadata } from "@/lib/share-metadata";

interface PageProps {
  params: Promise<{ intent: string }>;
}

const SEARCH_INTENTS = Object.keys(SEARCH_INTENT_LABELS) as SearchIntentType[];

const INTENT_SEO_COPY: Record<SearchIntentType, { title: string; description: string }> = {
  prediction: {
    title: "Crypto Price Prediction Research Proxy",
    description: "An inferred prediction-research proxy built from market scenarios, price context, and trend signals—not observed search volume.",
  },
  buying: {
    title: "Crypto Buying Access Research Proxy",
    description: "An inferred buying-access proxy built from venue, availability, workflow, and onboarding signals—not observed query demand.",
  },
  risk: {
    title: "Crypto Risk Check Research Proxy",
    description: "An inferred risk-research proxy built from volatility, liquidity, safety topics, and low-quality attention signals.",
  },
  supply: {
    title: "Crypto Unlock and Supply Research Proxy",
    description: "An inferred supply-research proxy built from unlock topics, FDV pressure, circulating supply, and tokenomics risk.",
  },
  airdrop: {
    title: "Crypto Airdrop and Launch Research Proxy",
    description: "An inferred launch-research proxy built from listing, TGE, eligibility, and airdrop-related free-data signals.",
  },
  stablecoin: {
    title: "Stablecoin Safety Research Proxy",
    description: "An inferred stablecoin-research proxy built from peg, reserves, issuer, depeg-risk, and yield-safety signals.",
  },
  rwa: {
    title: "RWA Crypto Research Proxy",
    description: "An inferred RWA-research proxy built from tokenized-asset, treasury, credit, issuer, and redemption-risk signals.",
  },
  ai: {
    title: "AI Crypto Research Proxy",
    description: "An inferred AI-token research proxy built from agent, compute, infrastructure, category, and narrative signals.",
  },
  meme: {
    title: "Meme Coin Research Proxy",
    description: "An inferred meme-attention proxy built from retail momentum, hype pressure, and market staying-power signals.",
  },
  yield: {
    title: "Crypto Yield and Staking Research Proxy",
    description: "An inferred yield-research proxy built from staking, APY, protocol-revenue, sustainability, and risk signals.",
  },
  news: {
    title: "Crypto News Catalyst Research Proxy",
    description: "An inferred catalyst-research proxy built from listings, ecosystem updates, sharp moves, and market narratives.",
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
  if (!isSearchIntentType(intent)) return { title: "Research Intent Not Found" };

  const copy = INTENT_SEO_COPY[intent];

  return {
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `/search-intent/${intent}`,
    },
    openGraph: buildOpenGraphMetadata({
      title: copy.title,
      description: copy.description,
      url: `/search-intent/${intent}`,
    }),
    twitter: buildTwitterMetadata({ title: copy.title, description: copy.description }),
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
            Research Intent Proxy
          </Link>
        </nav>

        <div className="section-header">
          <p className="eyebrow-text">Research Intent Proxy</p>
          <h1>
            {SEARCH_INTENT_LABELS[intent]} <span className="gradient-text">Research Proxy</span>
          </h1>
          <p>{SEARCH_INTENT_DESCRIPTIONS[intent]}</p>
          <p>This classification is inferred from TokenRadar data and templates; it does not measure live queries or search volume.</p>
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

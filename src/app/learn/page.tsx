import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, CheckCircle2, Compass, ShieldCheck } from "lucide-react";

import { JsonLd } from "@/components/JsonLd";
import { LearnExplorer } from "@/components/LearnExplorer";
import { TopicClusterLinks } from "@/components/TopicClusterLinks";
import { canonicalUrl } from "@/lib/seo";
import { getLearnItems, type LearnItem } from "@/lib/learn";

const PAGE_TITLE = "Crypto Learning Hub & Glossary";
const PAGE_DESCRIPTION =
  "Learn crypto valuation, DeFi, tokenomics, liquidity, staking, and scam detection with practical TokenRadar research guides.";

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESCRIPTION,
  alternates: {
    canonical: "/learn",
  },
  openGraph: {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    url: "/learn",
    siteName: "TokenRadar",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "TokenRadar crypto learning hub",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

const CATEGORY_META: Record<string, { title: string; description: string }> = {
  Security: {
    title: "Security & Risk",
    description: "Detect rug pulls, review smart contract safety, and understand trade execution risk.",
  },
  Tokenomics: {
    title: "Tokenomics",
    description: "Understand supply mechanics, staking incentives, burns, unlocks, and dilution.",
  },
  "Market Metrics": {
    title: "Market Metrics",
    description: "Read market cap, FDV, liquidity depth, and valuation signals with more discipline.",
  },
  DeFi: {
    title: "DeFi",
    description: "Understand TVL, liquidity provision, yield, impermanent loss, and protocol-level risk.",
  },
  "Portfolio Risk": {
    title: "Portfolio Risk",
    description: "Evaluate stablecoins, concentration, runway, and defensive positioning during market stress.",
  },
};

const START_HERE = [
  {
    label: "Step 1",
    title: "Learn valuation basics",
    description: "Start with market cap before comparing token prices or growth potential.",
    href: "/learn/market-cap-explained",
  },
  {
    label: "Step 2",
    title: "Check future dilution",
    description: "Use FDV and supply gaps to understand how future unlocks may affect holders.",
    href: "/learn/fully-diluted-valuation-fdv",
  },
  {
    label: "Step 3",
    title: "Screen for avoidable risk",
    description: "Review rug-pull, liquidity, slippage, and smart-contract warning signs before trading.",
    href: "/learn/what-is-a-rug-pull",
  },
];

function getCategorySummaries(items: LearnItem[]) {
  return Object.entries(CATEGORY_META).map(([name, meta]) => ({
    name,
    ...meta,
    count: items.filter((item) => item.category === name).length,
  }));
}

function getLatestUpdate(items: LearnItem[]): string {
  return items
    .map((item) => item.updatedAt)
    .sort()
    .at(-1) || "2026-05-11";
}

export default async function LearnPage() {
  const items = await getLearnItems();
  const categories = getCategorySummaries(items);
  const latestUpdate = getLatestUpdate(items);
  const totalWords = items.reduce((sum, item) => sum + item.wordCount, 0);
  const explorerItems = items.map(
    ({ slug, title, description, category, readTime, updatedAt, level, wordCount }) => ({
      slug,
      title,
      description,
      category,
      readTime,
      updatedAt,
      level,
      wordCount,
    }),
  );

  return (
    <div className="container">
      <JsonLd
        id="learn-collection-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: PAGE_TITLE,
          description: PAGE_DESCRIPTION,
          url: canonicalUrl("/learn"),
          mainEntity: {
            "@type": "ItemList",
            numberOfItems: items.length,
            itemListElement: items.map((item, index) => ({
              "@type": "ListItem",
              position: index + 1,
              name: item.title,
              url: canonicalUrl(`/learn/${item.slug}`),
            })),
          },
        }}
      />
      <JsonLd
        id="learn-breadcrumb-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Home",
              item: canonicalUrl("/"),
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Learn",
              item: canonicalUrl("/learn"),
            },
          ],
        }}
      />

      <section className="learn-hero section" aria-labelledby="learn-title">
        <div className="learn-hero-copy">
          <p className="eyebrow-text">Crypto education for risk-aware investors</p>
          <h1 id="learn-title">
            Learn the metrics behind <span className="gradient-text">better token research</span>
          </h1>
          <p>
            Practical guides for reading valuation, liquidity, tokenomics, staking yield, and scam risk
            before you commit capital.
          </p>
          <div className="learn-hero-actions">
            <Link href="#learn-library-title" className="btn btn-primary">
              Browse Guides
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link href="/about#methodology" className="btn btn-secondary">
              Research Methodology
            </Link>
          </div>
        </div>

        <div className="learn-hero-panel" aria-label="Learn hub summary">
          <div>
            <BookOpen size={22} aria-hidden="true" />
            <span>{items.length}</span>
            <p>Guides and glossary explainers</p>
          </div>
          <div>
            <Compass size={22} aria-hidden="true" />
            <span>{categories.length}</span>
            <p>Core research categories</p>
          </div>
          <div>
            <ShieldCheck size={22} aria-hidden="true" />
            <span>{totalWords.toLocaleString("en-US")}</span>
            <p>Words of reviewed education</p>
          </div>
          <div>
            <CheckCircle2 size={22} aria-hidden="true" />
            <span>{latestUpdate}</span>
            <p>Latest editorial review</p>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="start-here-title">
        <div className="section-header" style={{ textAlign: "left", alignItems: "flex-start" }}>
          <p className="eyebrow-text">Start here</p>
          <h2 id="start-here-title">A simple research path</h2>
          <p>Follow these three guides first if you are new to TokenRadar&apos;s research framework.</p>
        </div>
        <div className="learn-path-grid">
          {START_HERE.map((step) => (
            <Link key={step.href} href={step.href} className="learn-path-card">
              <span>{step.label}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <LearnExplorer items={explorerItems} categories={categories} />

      <section className="section" style={{ textAlign: "center" }}>
        <div className="learn-suggestion-band">
          <BookOpen size={28} aria-hidden="true" />
          <h2>Need a concept covered?</h2>
          <p>
            Suggest a term, metric, or risk pattern and we will prioritize it for the Learn library.
          </p>
          <Link href="/contact" className="btn btn-primary">
            Suggest a Topic
          </Link>
        </div>
      </section>
      <TopicClusterLinks current="risk" />
    </div>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getAllCategories, getTokensByCategory, formatPrice, formatCompact, getTokenMetrics } from "@/lib/content-loader";
import { TokenCard, type TokenCardData } from "@/components/TokenCard";

interface PageProps {
  params: Promise<{ category: string }>;
}

export const dynamicParams = false;

export async function generateStaticParams() {
  return getAllCategories().map((cat) => ({ category: cat.id }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { category } = await params;
  const categories = getAllCategories();
  const cat = categories.find(c => c.id === category);
  if (!cat) return { title: "Category Not Found" };

  const title = `Top ${cat.name} Crypto Tokens — Market Cap & Analytics`;
  const description = `Discover the top ${cat.name} cryptocurrency tokens. Analyze price, risk score, market cap, and proprietary metrics for ${cat.name} projects on TokenRadar.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/category/${cat.id}`,
    },
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { category } = await params;
  const categories = getAllCategories();
  const cat = categories.find(c => c.id === category);
  
  if (!cat) notFound();

  const tokens = getTokensByCategory(cat.id);
  const totalMarketCap = tokens.reduce((sum, t) => sum + (t.marketCap || 0), 0);
  const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24h || 0), 0);
  
  // Format tokens for the TokenCard component
  const tokenCards: TokenCardData[] = tokens.map(t => {
    const metrics = getTokenMetrics(t.id);
    return {
      id: t.id,
      name: t.name,
      symbol: t.symbol,
      price: t.price,
      priceChange24h: t.priceChange24h,
      marketCap: t.marketCap,
      riskScore: metrics?.riskScore || 5,
      category: cat.name,
    };
  });

  return (
    <main className="container mx-auto px-4 py-8">
      {/* Header section */}
      <div className="mb-12 border-b border-gray-800 pb-8">
        <div className="flex items-center space-x-2 text-sm text-gray-400 mb-6">
          <Link href="/" className="hover:text-white transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-300">Category</span>
          <span>/</span>
          <span className="text-white font-medium">{cat.name}</span>
        </div>
        
        <h1 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">
            {cat.name}
          </span> Tokens
        </h1>
        
        <p className="text-lg text-gray-400 mb-8 max-w-2xl">
          Track the top tokens in the {cat.name} sector. View deep data analytics, price predictions, and risk scores to make informed decisions.
        </p>

        {/* Aggregate Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div>
            <div className="text-sm text-gray-500 mb-1">Total Tokens Tracker</div>
            <div className="text-xl font-bold text-white">{tokens.length}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500 mb-1">Sector Market Cap</div>
            <div className="text-xl font-bold text-white">{formatCompact(totalMarketCap)}</div>
          </div>
          <div className="hidden md:block">
            <div className="text-sm text-gray-500 mb-1">24h Volume</div>
            <div className="text-xl font-bold text-white">{formatCompact(totalVolume)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {tokenCards.map(token => (
          <TokenCard key={token.id} token={token} />
        ))}
      </div>
      
      {/* Category SEO Content / Footer */}
      <section className="mt-20 border-t border-gray-800 pt-10">
        <h2 className="text-2xl font-bold mb-4">Why monitor the {cat.name} ecosystem?</h2>
        <div className="prose prose-invert max-w-none text-gray-300">
          <p className="mb-4">
            The cryptocurrency landscape is vast, but paying attention to specific sectors like <strong>{cat.name}</strong> helps investors identify trends before they go mainstream. By tracking the collective market capitalization and daily trading volume of these projects, you can gauge overall sentiment and capital flow within the sector.
          </p>
          <p>
            TokenRadar provides proprietary Risk Scores and Growth Potential tracking for all major {cat.name} tokens, separating fundamentally strong projects from market noise. Click into any token above to read our data-driven breakdown and review current price Action.
          </p>
        </div>
      </section>
    </main>
  );
}

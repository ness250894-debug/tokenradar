
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Shield, TrendingUp, Cpu } from "lucide-react";

export const metadata: Metadata = {
  title: "Crypto Learning Hub & Glossary | TokenRadar",
  description: "Master the fundamentals of blockchain, tokenomics, and security with TokenRadar's deep-dive glossary and educational resources.",
};

const categories = [
  {
    title: "Security & Risk",
    icon: <Shield className="w-6 h-6 text-emerald-500" />,
    description: "Learn how to detect rug pulls, evaluate smart contract audits, and secure your assets.",
    links: [
      { name: "What is a Rug Pull?", slug: "what-is-a-rug-pull" },
      { name: "Understanding Slippage", slug: "understanding-slippage" },
      { name: "Smart Contract Safety", slug: "smart-contract-safety" }
    ]
  },
  {
    title: "Tokenomics",
    icon: <Cpu className="w-6 h-6 text-amber-500" />,
    description: "Deep dives into supply mechanics, inflation, burn rates, and utility models.",
    links: [
      { name: "Circulating vs Total Supply", slug: "circulating-vs-total-supply" },
      { name: "Token Burn Mechanics", slug: "token-burn-mechanics" },
      { name: "What is Staking?", slug: "what-is-staking" }
    ]
  },
  {
    title: "Market Metrics",
    icon: <TrendingUp className="w-6 h-6 text-blue-500" />,
    description: "Master the data points we use for our Risk and Growth potential scores.",
    links: [
      { name: "Market Cap Explained", slug: "market-cap-explained" },
      { name: "Fully Diluted Valuation (FDV)", slug: "fully-diluted-valuation-fdv" },
      { name: "Liquidity Depth Analysis", slug: "liquidity-depth" }
    ]
  }
];

export default function LearnPage() {
  return (
    <main className="min-h-screen pt-24 pb-16 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 gradient-text">
          Learning Hub
        </h1>
        <p className="text-xl text-gray-400 max-w-3xl mx-auto">
          Expert-led guides and deep-dive technical definitions to help you navigate the complex crypto landscape with data and logic.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {categories.map((category, idx) => (
          <div key={idx} className="glass-card hover:border-emerald-500/30 transition-all duration-300">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 rounded-xl bg-gray-900/50">
                {category.icon}
              </div>
              <h2 className="text-2xl font-semibold">{category.title}</h2>
            </div>
            <p className="text-gray-400 mb-8 leading-relaxed">
              {category.description}
            </p>
            <div className="space-y-4">
              {category.links.map((link, lIdx) => (
                <Link 
                  key={lIdx} 
                  href={`/learn/${link.slug}`}
                  className="flex items-center justify-between group p-3 rounded-lg hover:bg-emerald-500/5 transition-colors"
                >
                  <span className="text-gray-300 group-hover:text-emerald-400 font-medium">
                    {link.name}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-emerald-400 group-hover:translate-x-1 transition-all" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="mt-24 p-8 glass-card border-none bg-gradient-to-br from-emerald-500/10 to-transparent rounded-3xl text-center">
        <BookOpen className="w-12 h-12 text-emerald-500 mx-auto mb-6" />
        <h2 className="text-3xl font-bold mb-4">Can&apos;t find a term?</h2>
        <p className="text-gray-400 mb-8">
          Our AI analyst is constantly updating the glossary. If there&apos;s a technical term or concept you want us to cover, let us know.
        </p>
        <Link href="/contact" className="secondary-button inline-block">
          Suggest a Topic
        </Link>
      </section>
    </main>
  );
}

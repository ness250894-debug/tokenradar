import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Shield, TrendingUp, Cpu } from "lucide-react";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export const metadata: Metadata = {
  title: "Crypto Learning Hub & Glossary",
  description: "Master the fundamentals of blockchain, tokenomics, and security with TokenRadar's deep-dive glossary and educational resources.",
};

interface GlossaryItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  updatedAt: string;
}

// Fixed metadata for our root categories
const CATEGORY_META: Record<string, { title: string; icon: React.ReactNode; description: string }> = {
  "Security": {
    title: "Security & Risk",
    icon: <Shield size={32} style={{ color: "var(--accent-primary)" }} />,
    description: "Learn how to detect rug pulls, evaluate smart contract audits, and secure your assets."
  },
  "Tokenomics": {
    title: "Tokenomics",
    icon: <Cpu size={32} style={{ color: "var(--accent-primary)" }} />,
    description: "Deep dives into supply mechanics, inflation, burn rates, and utility models."
  },
  "Market Metrics": {
    title: "Market Metrics",
    icon: <TrendingUp size={32} style={{ color: "var(--accent-primary)" }} />,
    description: "Master the data points we use for our Risk and Growth potential scores."
  }
};

async function getCategorizedLinks() {
  const filePath = join(process.cwd(), "data/glossary.json");
  if (!existsSync(filePath)) return [];
  
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data: GlossaryItem[] = JSON.parse(raw);
    
    // Group by category string
    const map = new Map<string, { name: string; slug: string }[]>();
    for (const item of data) {
      if (!map.has(item.category)) map.set(item.category, []);
      map.get(item.category)?.push({
        name: item.title.split(":")[0], // Extract short name before colon if exists
        slug: item.slug
      });
    }

    // Merge with meta
    return Array.from(map.entries()).map(([catName, links]) => {
      const meta = CATEGORY_META[catName] || {
        title: catName,
        icon: <BookOpen size={32} style={{ color: "var(--text-muted)" }} />,
        description: `Explore all guides and articles related to ${catName}.`
      };
      return {
        ...meta,
        links
      };
    });
  } catch (error) {
    console.error("Failed to load glossary items", error);
    return [];
  }
}

export default async function LearnPage() {
  const categories = await getCategorizedLinks();

  return (
    <div className="container">
      <section className="section" style={{ paddingTop: "var(--space-4xl)" }}>
        {/* Section Header — matches homepage pattern */}
        <div className="section-header">
          <h1>
            <span className="gradient-text">Learning Hub</span>
          </h1>
          <p>
            Expert-led guides and deep-dive technical definitions to help you
            navigate the complex crypto landscape with data and logic.
          </p>
        </div>

        {/* Category Grid — uses .card pattern from homepage */}
        <div className="stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-2xl)" }}>
          {categories.map((category, idx) => (
            <div key={idx} className="card" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
              <div className="feature-icon-wrapper">
                {category.icon}
              </div>
              <h2 style={{ fontSize: "var(--text-xl)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
                {category.title}
              </h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-sm)", lineHeight: 1.7, marginBottom: "var(--space-lg)" }}>
                {category.description}
              </p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)", width: "100%", marginTop: "auto" }}>
                {category.links.map((link, lIdx) => (
                  <Link 
                    key={lIdx} 
                    href={`/learn/${link.slug}`}
                    className="learn-link"
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA — matches homepage card style */}
      <section className="section" style={{ textAlign: "center" }}>
        <div className="card" style={{ padding: "var(--space-3xl) var(--space-2xl)", display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div className="feature-icon-wrapper" style={{ marginBottom: "var(--space-lg)" }}>
            <BookOpen size={32} />
          </div>
          <h2 style={{ fontSize: "var(--text-2xl)", fontWeight: 700, marginBottom: "var(--space-sm)" }}>
            Can&apos;t find a term?
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "var(--text-base)", lineHeight: 1.7, maxWidth: "520px", marginBottom: "var(--space-xl)" }}>
            Our AI analyst is constantly updating the glossary. If there&apos;s a
            technical term or concept you want us to cover, let us know.
          </p>
          <Link href="/contact" className="btn btn-primary">
            Suggest a Topic
          </Link>
        </div>
      </section>
    </div>
  );
}

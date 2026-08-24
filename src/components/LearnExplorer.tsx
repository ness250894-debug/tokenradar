"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Clock,
  Cpu,
  Search,
  Shield,
  Tag,
  TrendingUp,
} from "lucide-react";

interface LearnExplorerItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  updatedAt: string;
  level: "Beginner" | "Intermediate";
  wordCount: number;
}

interface CategorySummary {
  name: string;
  title: string;
  description: string;
  count: number;
}

interface LearnExplorerProps {
  items: LearnExplorerItem[];
  categories: CategorySummary[];
}

function CategoryIcon({ category }: { category: string }) {
  if (category === "Security") return <Shield size={18} aria-hidden="true" />;
  if (category === "Tokenomics") return <Cpu size={18} aria-hidden="true" />;
  if (category === "DeFi") return <BookOpen size={18} aria-hidden="true" />;
  if (category === "Portfolio Risk") return <Tag size={18} aria-hidden="true" />;
  return <TrendingUp size={18} aria-hidden="true" />;
}

export function LearnExplorer({ items, categories }: LearnExplorerProps) {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeLevel, setActiveLevel] = useState("All");

  const levels = useMemo(() => ["All", ...Array.from(new Set(items.map((item) => item.level)))], [items]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return items.filter((item) => {
      const matchesQuery =
        !normalizedQuery ||
        item.title.toLowerCase().includes(normalizedQuery) ||
        item.description.toLowerCase().includes(normalizedQuery) ||
        item.category.toLowerCase().includes(normalizedQuery);
      const matchesCategory = activeCategory === "All" || item.category === activeCategory;
      const matchesLevel = activeLevel === "All" || item.level === activeLevel;

      return matchesQuery && matchesCategory && matchesLevel;
    });
  }, [activeCategory, activeLevel, items, query]);

  return (
    <section className="section" aria-labelledby="learn-library-title">
      <div className="learn-control-panel">
        <div>
          <p className="eyebrow-text">Research library</p>
          <h2 id="learn-library-title">Find the right crypto concept fast</h2>
        </div>

        <label className="learn-search" aria-label="Search crypto learning guides">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            placeholder="Search slippage, FDV, staking..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>

      <div className="learn-filters" aria-label="Learn filters">
        <button
          type="button"
          className={activeCategory === "All" ? "active" : ""}
          onClick={() => setActiveCategory("All")}
        >
          All topics
        </button>
        {categories.map((category) => (
          <button
            key={category.name}
            type="button"
            className={activeCategory === category.name ? "active" : ""}
            onClick={() => setActiveCategory(category.name)}
          >
            {category.title}
            <span>{category.count}</span>
          </button>
        ))}
      </div>

      <div className="learn-filters learn-level-filters" aria-label="Difficulty filters">
        {levels.map((level) => (
          <button
            key={level}
            type="button"
            className={activeLevel === level ? "active" : ""}
            onClick={() => setActiveLevel(level)}
          >
            {level === "All" ? "All levels" : level}
          </button>
        ))}
      </div>

      <div className="learn-results-meta" role="status">
        {filteredItems.length} {filteredItems.length === 1 ? "guide" : "guides"} found
      </div>

      <div className="learn-article-grid">
        {filteredItems.map((item) => (
          <article key={item.slug} className="learn-article-card">
            <div className="learn-card-topline">
              <span>
                <CategoryIcon category={item.category} />
                {item.category}
              </span>
              <span>{item.level}</span>
            </div>
            <h3>
              <Link href={`/learn/${item.slug}`}>{item.title}</Link>
            </h3>
            <p>{item.description}</p>
            <div className="learn-card-meta">
              <span>
                <Clock size={14} aria-hidden="true" />
                {item.readTime}
              </span>
              <span>
                <BookOpen size={14} aria-hidden="true" />
                {item.wordCount.toLocaleString("en-US")} words
              </span>
              <span>
                <Tag size={14} aria-hidden="true" />
                Updated {item.updatedAt}
              </span>
            </div>
            <Link className="learn-card-action" href={`/learn/${item.slug}`}>
              Read guide
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </article>
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="learn-empty-state">
          <h3>No matching guides yet</h3>
          <p>Try a broader term or suggest the topic so it can be added to the research queue.</p>
          <Link href="/contact" className="btn btn-primary">
            Suggest a Topic
          </Link>
        </div>
      )}
    </section>
  );
}

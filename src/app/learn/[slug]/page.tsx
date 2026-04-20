import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, Clock, Tag } from "lucide-react";
import ReactMarkdown from "react-markdown";

import { readFileSync, existsSync } from "fs";
import { join } from "path";

interface GlossaryItem {
  slug: string;
  title: string;
  description: string;
  category: string;
  readTime: string;
  updatedAt: string;
  content: string;
}

// Data loader for glossary items
async function getGlossaryItem(slug: string): Promise<GlossaryItem | null> {
  const filePath = join(process.cwd(), "data/glossary.json");
  if (!existsSync(filePath)) return null;
  
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data: GlossaryItem[] = JSON.parse(raw);
    return data.find((item) => item.slug === slug) || null;
  } catch (error) {
    console.error("Failed to load glossary item", error);
    return null;
  }
}

// Static Params for Programmatic SEO Export
export async function generateStaticParams() {
  const filePath = join(process.cwd(), "data/glossary.json");
  if (!existsSync(filePath)) return [];
  
  try {
    const raw = readFileSync(filePath, "utf-8");
    const data: GlossaryItem[] = JSON.parse(raw);
    return data.map((item) => ({
      slug: item.slug,
    }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = await getGlossaryItem(slug);
  if (!item) return { title: "Term Not Found" };
  return {
    title: `${item.title} | TokenRadar Learn`,
    description: item.description,
  };
}

export default async function GlossaryDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = await getGlossaryItem(slug);
  if (!item) notFound();

  return (
    <div className="container">
      <section className="section" style={{ paddingTop: "var(--space-4xl)" }}>
        <div className="article-content">
          {/* Back Link */}
          <Link 
            href="/learn" 
            style={{
              color: "var(--accent-primary)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-xs)",
              marginBottom: "var(--space-2xl)",
              textDecoration: "none",
              transition: "opacity 0.2s",
            }}
          >
            <ArrowLeft size={16} />
            Back to Learning Hub
          </Link>

          {/* Meta Badges */}
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "var(--space-md)",
            marginBottom: "var(--space-lg)",
            fontSize: "var(--text-xs)",
            color: "var(--text-muted)",
          }}>
            <span style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-xs)",
              background: "rgba(217, 119, 6, 0.1)",
              color: "var(--accent-primary)",
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              border: "1px solid rgba(217, 119, 6, 0.2)",
            }}>
              <Tag size={12} />
              {item.category}
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-xs)" }}>
              <Clock size={14} />
              {item.readTime}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", opacity: 0.6 }}>
              Updated: {item.updatedAt}
            </span>
          </div>

          {/* Title */}
          <h1>{item.title}</h1>

          {/* Markdown Content — inherits all .article-content styles from globals.css */}
          <ReactMarkdown>{item.content}</ReactMarkdown>

          {/* Divider */}
          <hr />

          {/* CTA Footer — uses .card pattern */}
          <div className="card" style={{
            textAlign: "center",
            padding: "var(--space-2xl)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}>
            <div className="feature-icon-wrapper" style={{ marginBottom: "var(--space-md)" }}>
              <BookOpen size={32} />
            </div>
            <h3 style={{
              fontSize: "var(--text-xl)",
              fontWeight: 700,
              marginBottom: "var(--space-sm)",
            }}>
              Continue Your Research
            </h3>
            <p style={{
              color: "var(--text-secondary)",
              fontSize: "var(--text-sm)",
              lineHeight: 1.7,
              maxWidth: "420px",
              marginBottom: "var(--space-lg)",
            }}>
              Apply this knowledge by checking the live Risk Scores for
              trending tokens on our dashboard.
            </p>
            <Link href="/" className="btn btn-primary">
              View Live Dashboard
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

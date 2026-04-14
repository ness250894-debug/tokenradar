import React from "react";
import { Metadata } from "next";
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

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const item = await getGlossaryItem(params.slug);
  if (!item) return { title: "Term Not Found" };
  return {
    title: `${item.title} | TokenRadar Learn`,
    description: item.description,
  };
}

export default async function GlossaryDetailPage({ params }: { params: { slug: string } }) {
  const item = await getGlossaryItem(params.slug);
  if (!item) notFound();

  return (
    <article className="min-h-screen pt-24 pb-16 px-4 md:px-8 max-w-4xl mx-auto">
      <Link 
        href="/learn" 
        className="flex items-center gap-2 text-emerald-500 hover:text-emerald-400 mb-12 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Learning Hub
      </Link>

      <header className="mb-12">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <span className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-500 rounded-full text-sm font-medium border border-emerald-500/20">
            <Tag className="w-3 h-3" />
            {item.category}
          </span>
          <span className="flex items-center gap-2 text-gray-500 text-sm">
            <Clock className="w-3 h-3" />
            {item.readTime}
          </span>
          <span className="text-gray-500 text-sm ml-auto">
            Updated: {item.updatedAt}
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-bold mb-6 leading-tight">
          {item.title}
        </h1>
      </header>

      <div className="glass-card p-8 md:p-12 border-none prose prose-invert prose-emerald max-w-none">
        <ReactMarkdown>{item.content}</ReactMarkdown>
      </div>

      <footer className="mt-16 pt-8 border-t border-gray-800">
        <div className="bg-gray-900/50 rounded-2xl p-8 border border-gray-800 flex flex-col md:flex-row items-center gap-8 shadow-2xl">
          <BookOpen className="w-12 h-12 text-emerald-500 shrink-0" />
          <div className="text-center md:text-left">
            <h3 className="text-xl font-bold mb-2 text-white">Continue Your Research</h3>
            <p className="text-gray-400">
              Apply this knowledge by checking the live Risk Scores for trending tokens on our dashboard.
            </p>
          </div>
          <Link href="/" className="primary-button whitespace-nowrap">
            View Live Dashboard
          </Link>
        </div>
      </footer>
    </article>
  );
}

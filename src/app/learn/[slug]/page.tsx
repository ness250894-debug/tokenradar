import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Clock, ShieldCheck, Tag, UserRound } from "lucide-react";

import { JsonLd } from "@/components/JsonLd";
import { ArticleEngagementTracker } from "@/components/ArticleEngagementTracker";
import { UnifiedTOC } from "@/components/UnifiedTOC";
import {
  LEARN_AUTHOR,
  LEARN_REVIEWER,
  getLearnItem,
  getLearnItems,
  getRelatedLearnItems,
  learnMarkdownToHtml,
} from "@/lib/learn";
import { buildSeoDescription, buildSeoTitle, canonicalUrl } from "@/lib/seo";

interface PageParams {
  slug: string;
}

interface PageProps {
  params: Promise<PageParams>;
}

export async function generateStaticParams() {
  const items = await getLearnItems();
  return items.map((item) => ({
    slug: item.slug,
  }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = await getLearnItem(slug);
  if (!item) return { title: "Learn Guide Not Found" };

  const title = buildSeoTitle(item.title);
  const description = buildSeoDescription(item.description);

  return {
    title,
    description,
    alternates: {
      canonical: `/learn/${item.slug}`,
    },
    openGraph: {
      title,
      description,
      url: `/learn/${item.slug}`,
      siteName: "TokenRadar",
      locale: "en_US",
      type: "article",
      publishedTime: item.updatedAt,
      modifiedTime: item.updatedAt,
      authors: [LEARN_AUTHOR.name],
      section: item.category,
      tags: item.tags,
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: item.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function GlossaryDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const [item, allItems] = await Promise.all([getLearnItem(slug), getLearnItems()]);
  if (!item) notFound();

  const relatedItems = getRelatedLearnItems(allItems, item);
  const html = await learnMarkdownToHtml(item.content);
  const articleUrl = canonicalUrl(`/learn/${item.slug}`);

  return (
    <div className="container">
      <JsonLd
        id="learn-article-jsonld"
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: item.title,
          description: item.description,
          image: [canonicalUrl("/og-image.png")],
          url: articleUrl,
          datePublished: item.updatedAt,
          dateModified: item.updatedAt,
          author: {
            "@type": "Organization",
            name: LEARN_AUTHOR.name,
            url: canonicalUrl(LEARN_AUTHOR.url),
          },
          reviewedBy: {
            "@type": "Person",
            name: LEARN_REVIEWER.name,
            url: canonicalUrl(LEARN_REVIEWER.url),
          },
          publisher: {
            "@type": "Organization",
            name: "TokenRadar",
            logo: {
              "@type": "ImageObject",
              url: canonicalUrl("/icon.png"),
            },
          },
          mainEntityOfPage: articleUrl,
          articleSection: item.category,
          keywords: item.tags.join(", "),
          wordCount: item.wordCount,
        }}
      />
      <JsonLd
        id="learn-article-breadcrumb-jsonld"
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
            {
              "@type": "ListItem",
              position: 3,
              name: item.title,
            },
          ],
        }}
      />

      <section className="section learn-article-shell">
        <ArticleEngagementTracker
          selector=".learn-article-main .article-content"
          pageType="learn_article"
          articleType={item.slug}
        />
        <div className="learn-breadcrumb" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/learn">Learn</Link>
          <span>/</span>
          <span>{item.title}</span>
        </div>

        <Link href="/learn" className="learn-back-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Back to Learning Hub
        </Link>

        <div className="learn-article-layout">
          <article className="learn-article-main">
            <header className="learn-article-header">
              <div className="learn-article-tags">
                <span>
                  <Tag size={12} aria-hidden="true" />
                  {item.category}
                </span>
                <span>{item.level}</span>
                <span>
                  <Clock size={14} aria-hidden="true" />
                  {item.readTime}
                </span>
              </div>
              <h1>{item.title}</h1>
              <p>{item.description}</p>
            </header>

            <div className="learn-review-card">
              <div>
                <UserRound size={18} aria-hidden="true" />
                <span>
                  Written by <Link href={LEARN_AUTHOR.url}>{LEARN_AUTHOR.name}</Link>
                </span>
              </div>
              <div>
                <ShieldCheck size={18} aria-hidden="true" />
                <span>
                  Reviewed by <Link href={LEARN_REVIEWER.url}>{LEARN_REVIEWER.name}</Link>
                </span>
              </div>
              <div>
                <Clock size={18} aria-hidden="true" />
                <span>Updated {item.updatedAt}</span>
              </div>
            </div>

            <div className="article-content" dangerouslySetInnerHTML={{ __html: html }} />

            <aside className="learn-disclaimer">
              <strong>Educational note:</strong> TokenRadar Learn is for general information and risk
              education only. It is not financial, legal, tax, or investment advice.
            </aside>

            <section className="learn-related" aria-labelledby="related-guides-title">
              <div className="section-header" style={{ textAlign: "left", alignItems: "flex-start" }}>
                <p className="eyebrow-text">Continue learning</p>
                <h2 id="related-guides-title">Related guides</h2>
              </div>
              <div className="learn-related-grid">
                {relatedItems.map((related) => (
                  <Link key={related.slug} href={`/learn/${related.slug}`} className="learn-related-card">
                    <BookOpen size={18} aria-hidden="true" />
                    <span>{related.category}</span>
                    <h3>{related.title}</h3>
                    <p>{related.description}</p>
                    <small>
                      {related.readTime}
                      <ArrowRight size={14} aria-hidden="true" />
                    </small>
                  </Link>
                ))}
              </div>
            </section>
          </article>

          <aside className="learn-article-sidebar">
            <div className="learn-sidebar-card">
              <p className="eyebrow-text">Guide details</p>
              <dl>
                <div>
                  <dt>Category</dt>
                  <dd>{item.category}</dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{item.level}</dd>
                </div>
                <div>
                  <dt>Length</dt>
                  <dd>{item.readTime}</dd>
                </div>
                <div>
                  <dt>Reviewed</dt>
                  <dd>{item.updatedAt}</dd>
                </div>
              </dl>
            </div>
            <UnifiedTOC
              selector=".learn-article-main .article-content"
              showMobile={false}
              pageType="learn_article"
              articleType={item.slug}
            />
          </aside>
        </div>

        <UnifiedTOC
          selector=".learn-article-main .article-content"
          showDesktop={false}
          pageType="learn_article"
          articleType={item.slug}
        />
      </section>
    </div>
  );
}

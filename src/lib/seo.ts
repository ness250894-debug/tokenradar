import type { Article, TokenDetail } from "@/lib/content-loader";
import { evaluateArticleQuality } from "@/lib/content-quality";

export const TOKEN_OVERVIEW_MIN_VOLUME_USD = 100_000;
export const TOKEN_OVERVIEW_MIN_WORDS = 500;

export function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://tokenradar.co").replace(/\/+$/, "");
}

export function canonicalPath(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.replace(/^\/+|\/+$/g, "")}`;
}

export function canonicalUrl(pathname: string): string {
  return `${getSiteUrl()}${canonicalPath(pathname) === "/" ? "" : canonicalPath(pathname)}`;
}

export function isTokenOverviewIndexable(detail: TokenDetail, overview?: Article | null): boolean {
  const volume24h = detail.market?.volume24h ?? 0;
  if (volume24h <= TOKEN_OVERVIEW_MIN_VOLUME_USD || !overview) return false;

  const quality = evaluateArticleQuality(overview);
  const wordCount = quality.stats.wordCount || overview.wordCount || 0;

  return (
    wordCount >= TOKEN_OVERVIEW_MIN_WORDS &&
    quality.stats.hasDisclaimer &&
    quality.stats.dataPointCount >= 3 &&
    quality.stats.prohibitedPhrases.length === 0
  );
}

export function isArticleIndexable(article?: Article | null): article is Article {
  if (!article) return false;
  const quality = evaluateArticleQuality(article);
  const wordCount = quality.stats.wordCount || article.wordCount || 0;
  const minWords = article.type === "how-to-buy" || article.type === "tge-preview" ? 500 : 500;

  return (
    wordCount >= minWords &&
    quality.stats.hasDisclaimer &&
    quality.stats.dataPointCount >= 3 &&
    quality.stats.prohibitedPhrases.length === 0
  );
}

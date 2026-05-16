import type { Article, TokenDetail } from "@/lib/content-loader";
import { evaluateArticleQuality } from "@/lib/content-quality";

export const TOKEN_OVERVIEW_MIN_VOLUME_USD = 100_000;
export const TOKEN_OVERVIEW_MIN_WORDS = 800;

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

export function isTokenOverviewIndexable(detail: TokenDetail, overview?: Article | null): overview is Article {
  const volume24h = detail.market?.volume24h ?? 0;
  if (volume24h <= TOKEN_OVERVIEW_MIN_VOLUME_USD || !overview) return false;

  const quality = evaluateArticleQuality(overview);
  const wordCount = quality.stats.wordCount || overview.wordCount || 0;

  return quality.passed && wordCount >= TOKEN_OVERVIEW_MIN_WORDS;
}

export function isArticleIndexable(article?: Article | null): article is Article {
  if (!article) return false;
  const quality = evaluateArticleQuality(article);
  return quality.passed;
}

export async function filterIndexableArticleTokenIds(
  tokenIds: string[],
  loadArticle: (tokenId: string) => Promise<Article | null>,
): Promise<string[]> {
  const result: string[] = [];

  for (const tokenId of tokenIds) {
    const article = await loadArticle(tokenId);
    if (isArticleIndexable(article)) {
      result.push(tokenId);
    }
  }

  return result;
}

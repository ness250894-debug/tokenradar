import type { Article, TokenDetail } from "@/lib/content-loader";

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
  const wordCount = overview?.wordCount ?? 0;

  return volume24h > TOKEN_OVERVIEW_MIN_VOLUME_USD || wordCount > TOKEN_OVERVIEW_MIN_WORDS;
}

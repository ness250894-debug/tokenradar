import type { Article, TokenDetail } from "@/lib/content-loader";
import { evaluateArticleQuality } from "@/lib/content-quality";
import {
  getTgeEvidenceCount,
  normalizeTge,
  shouldPublishTgePreview,
  type UpcomingTge,
} from "@/lib/tge";

export const TOKEN_OVERVIEW_MIN_VOLUME_USD = 100_000;
export const TOKEN_OVERVIEW_MIN_WORDS = 800;
export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;
export const SITE_NAME = "TokenRadar";

const TITLE_TEMPLATE_SUFFIX = ` | ${SITE_NAME}`;
const SEO_TITLE_SEGMENT_MAX_LENGTH = SEO_TITLE_MAX_LENGTH - TITLE_TEMPLATE_SUFFIX.length;

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

function truncateAtWord(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 1) return normalized.slice(0, Math.max(0, maxLength));

  const sliced = normalized.slice(0, maxLength - 1).trimEnd();
  const wordBoundary = sliced.lastIndexOf(" ");
  const truncated = wordBoundary >= Math.floor(maxLength * 0.6)
    ? sliced.slice(0, wordBoundary)
    : sliced;
  return `${truncated.replace(/[\s,:;\-–—]+$/g, "")}…`;
}

/**
 * Fits a page-title segment under the root layout's ` | TokenRadar` template.
 * Keep dynamic route metadata on one shared budget so rendered titles stay at
 * or below Google's commonly visible 60-character range.
 */
export function buildSeoTitle(value: string): string {
  return truncateAtWord(value, SEO_TITLE_SEGMENT_MAX_LENGTH);
}

export function buildEntitySeoTitle(input: {
  name: string;
  symbol?: string;
  before?: string;
  after?: string;
}): string {
  const before = input.before || "";
  const after = input.after || "";
  const symbol = input.symbol?.trim().toUpperCase();
  const symbolPart = symbol ? ` (${symbol})` : "";
  const full = `${before}${input.name}${symbolPart}${after}`;
  if (full.length <= SEO_TITLE_SEGMENT_MAX_LENGTH) return full;

  const reservedLength = before.length + symbolPart.length + after.length;
  const nameBudget = Math.max(8, SEO_TITLE_SEGMENT_MAX_LENGTH - reservedLength);
  const words = input.name.replace(/\s+/g, " ").trim().split(" ");
  const lastWord = words.length > 1 ? words.at(-1) || "" : "";
  const prefixBudget = nameBudget - lastWord.length - 1;
  const compactName = lastWord && prefixBudget >= 4
    ? `${input.name.slice(0, prefixBudget - 1).trimEnd().replace(/[\s,:;\-–—]+$/g, "")}…${lastWord}`
    : truncateAtWord(input.name, nameBudget);
  return buildSeoTitle(`${before}${compactName}${symbolPart}${after}`);
}

export function buildSeoDescription(value: string): string {
  return truncateAtWord(value, SEO_DESCRIPTION_MAX_LENGTH);
}

export function isTokenOverviewIndexable(detail: TokenDetail, overview?: Article | null): overview is Article {
  return isTokenOverviewIndexableFromVolume(detail.market?.volume24h ?? 0, overview);
}

export function isTokenOverviewIndexableFromVolume(
  volume24h: number,
  overview?: Article | null,
): overview is Article {
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

export interface TgeRouteCandidate {
  tge: UpcomingTge;
  article?: Article | null;
  hasLiveToken?: boolean;
}

export type TgeNoIndexReason =
  | "indexable"
  | "graduated-to-token"
  | "duplicate-record"
  | "unpublishable-status"
  | "missing-or-low-quality-preview";

export interface TgeIndexDecision {
  indexable: boolean;
  canonical: string;
  reason: TgeNoIndexReason;
}

function getTgeCandidateScore(candidate: TgeRouteCandidate): number {
  const tge = normalizeTge(candidate.tge);
  let score = 0;
  if (!candidate.hasLiveToken && isArticleIndexable(candidate.article)) score += 10_000;
  if (shouldPublishTgePreview(tge)) score += 1_000;
  score += (tge.confidence || 0) * 10;
  score += getTgeEvidenceCount(tge) * 20;
  const checkedAt = Date.parse(tge.lastVerifiedAt || tge.discoveredAt || "");
  if (Number.isFinite(checkedAt)) score += Math.floor(checkedAt / 86_400_000) / 100_000;
  return score;
}

export function getTgeDuplicateKey(tge: UpcomingTge): string {
  return tge.name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function choosePreferredTgeId(candidates: readonly TgeRouteCandidate[]): string | null {
  if (candidates.length === 0) return null;
  return [...candidates]
    .sort((a, b) => {
      const scoreDifference = getTgeCandidateScore(b) - getTgeCandidateScore(a);
      if (scoreDifference !== 0) return scoreDifference;
      return a.tge.id.localeCompare(b.tge.id);
    })[0]?.tge.id || null;
}

export function getTgeIndexDecision(
  candidate: TgeRouteCandidate,
  preferredTgeId = candidate.tge.id,
): TgeIndexDecision {
  const selfCanonical = canonicalPath(`/upcoming/${candidate.tge.id}`);
  if (candidate.hasLiveToken) {
    return {
      indexable: false,
      canonical: canonicalPath(`/${candidate.tge.id}`),
      reason: "graduated-to-token",
    };
  }
  if (preferredTgeId !== candidate.tge.id) {
    return {
      indexable: false,
      canonical: canonicalPath(`/upcoming/${preferredTgeId}`),
      reason: "duplicate-record",
    };
  }
  if (!shouldPublishTgePreview(candidate.tge)) {
    return { indexable: false, canonical: selfCanonical, reason: "unpublishable-status" };
  }
  if (!isArticleIndexable(candidate.article)) {
    return {
      indexable: false,
      canonical: selfCanonical,
      reason: "missing-or-low-quality-preview",
    };
  }
  return { indexable: true, canonical: selfCanonical, reason: "indexable" };
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

export interface FAQItem {
  question: string;
  answer: string;
}

export function parseFaqsFromMarkdown(content: string | undefined): FAQItem[] {
  if (!content) return [];

  const faqMatch = content.match(/(?:^|\n)##\s+FAQ\b([\s\S]*?)(?=\n---\s*\n\s*\*Disclaimer:|\n##\s+|$)/i);
  if (!faqMatch) return [];

  const faqBody = faqMatch[1];
  const regex = /\*\*([^*\n?]+\?)\*\*/g;
  const faqs: FAQItem[] = [];

  let match;
  let lastIndex = 0;
  let currentQuestion = "";

  while ((match = regex.exec(faqBody)) !== null) {
    if (currentQuestion) {
      const answer = faqBody.slice(lastIndex, match.index).trim();
      faqs.push({
        question: currentQuestion,
        answer: answer.replace(/\s+/g, " ").trim(),
      });
    }
    currentQuestion = match[1].trim();
    lastIndex = regex.lastIndex;
  }

  if (currentQuestion) {
    const answer = faqBody.slice(lastIndex).trim();
    faqs.push({
      question: currentQuestion,
      answer: answer.replace(/\s+/g, " ").trim(),
    });
  }

  return faqs;
}

import * as fs from "fs";
import * as path from "path";
import { marked, Renderer, type Tokens } from "marked";
import { formatPrice, formatCompact, getTokenIconCandidates } from "./formatters";
import { getAllCategories, getAllTokens, getArticle, getTokenDetail, getTokenIds, getTokenIdsWithArticle } from "./content-loader";
import { normalizeArticleMarkdown } from "./article-formatting";
import { getPilotTokenIds } from "./token-technical-data";
import { isLinkableTokenName, shouldUnwrapAmbiguousTokenLink } from "./internal-link-policy";
import {
  isTokenChildArticleIndexable,
  isTokenOverviewIndexable,
  isTokenOverviewIndexableFromVolume,
} from "./seo";

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
 * Drops raw HTML and validates rendered links/images to prevent XSS from malformed AI content.
 */
export interface TokenMarketData {
  id?: string;
  name: string;
  symbol: string;
  price: number;
  marketCap?: number;
  marketCapRank?: number;
  priceChange24h?: number;
  imageUrl?: string;
}

interface LinkableToken {
  id: string;
  name: string;
  nameLower: string;
}

interface GlossaryLinkSource {
  slug?: unknown;
}

const STATIC_INTERNAL_PATHS = [
  "/",
  "/about",
  "/authors/pavlo-nakonechnyi",
  "/best-crypto-hardware-wallets",
  "/contact",
  "/crypto-tax-guide",
  "/disclaimer",
  "/learn",
  "/privacy",
  "/research",
  "/search-intent",
  "/terms",
  "/tokens",
  "/tokens/all",
  "/upcoming",
];

const RISK_PILL_PLACEHOLDER = "TOKENRADAR_RISK_PILL_9B65D6E7";
const MAX_AUTO_LINKS_PER_ARTICLE = 3;

let linkableTokensPromise: Promise<LinkableToken[]> | null = null;
let indexableOverviewTokensPromise: Promise<LinkableToken[]> | null = null;
let validInternalPathsPromise: Promise<Set<string>> | null = null;

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripDangerousHtmlBlocks(md: string): string {
  return md
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?\s*>/gi, "");
}

function isSafeFragment(value: string): boolean {
  return /^#[A-Za-z0-9_-]+$/.test(value);
}

function sanitizeMarkdownHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  if (isSafeFragment(trimmed)) return trimmed;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function sanitizeMarkdownImageSrc(src: string): string | null {
  const safeSrc = sanitizeMarkdownHref(src);
  if (!safeSrc || safeSrc.startsWith("mailto:") || safeSrc.startsWith("#")) return null;
  return safeSrc;
}

function createSafeMarkdownRenderer(): Renderer {
  const renderer = new Renderer();

  renderer.html = () => "";

  renderer.link = function ({ href, title, tokens }: Tokens.Link): string {
    const label = String(renderer.parser.parseInline(tokens));
    const safeHref = sanitizeMarkdownHref(href);
    if (!safeHref) return label;

    const attrs = [`href="${escapeHtmlAttribute(safeHref)}"`];
    if (title) attrs.push(`title="${escapeHtmlAttribute(title)}"`);
    if (/^https?:\/\//i.test(safeHref)) {
      attrs.push('target="_blank"', 'rel="noopener noreferrer"');
    }

    return `<a ${attrs.join(" ")}>${label}</a>`;
  };

  renderer.image = function ({ href, title, text }: Tokens.Image): string {
    const safeSrc = sanitizeMarkdownImageSrc(href);
    if (!safeSrc) return "";

    const attrs = [
      `src="${escapeHtmlAttribute(safeSrc)}"`,
      `alt="${escapeHtmlAttribute(text || "")}"`,
    ];
    if (title) attrs.push(`title="${escapeHtmlAttribute(title)}"`);

    return `<img ${attrs.join(" ")}>`;
  };

  return renderer;
}

function normalizeInternalHref(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;

  let pathname: string;
  if (trimmed.startsWith("/")) {
    pathname = trimmed;
  } else {
    try {
      const url = new URL(trimmed);
      if (url.hostname !== "tokenradar.co" && url.hostname !== "www.tokenradar.co") return null;
      pathname = url.pathname;
    } catch {
      return null;
    }
  }

  const pathOnly = pathname.split(/[?#]/)[0].replace(/\/+$/, "");
  return pathOnly || "/";
}

function readGlossaryPaths(): string[] {
  if (typeof window !== "undefined") return [];

  try {
    const filePath = path.resolve(process.cwd(), "data/glossary.json");
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is GlossaryLinkSource & { slug: string } => typeof item?.slug === "string")
      .map((item) => `/learn/${item.slug}`);
  } catch {
    return [];
  }
}

async function getValidInternalPaths(): Promise<Set<string>> {
  if (!validInternalPathsPromise) {
    validInternalPathsPromise = (async () => {
      const paths = new Set(STATIC_INTERNAL_PATHS);

      try {
        const [overviewTokens, howToBuyTokenIds, pricePredictionTokenIds] = await Promise.all([
          getIndexableOverviewTokens(),
          getTokenIdsWithArticle("how-to-buy").then((tokenIdsWithArticle) =>
            getIndexableTokenChildIds(tokenIdsWithArticle, "how-to-buy"),
          ),
          getTokenIdsWithArticle("price-prediction").then((tokenIdsWithArticle) =>
            getIndexableTokenChildIds(tokenIdsWithArticle, "price-prediction"),
          ),
        ]);
        for (const token of overviewTokens) paths.add(`/${token.id}`);
        for (const id of howToBuyTokenIds) paths.add(`/${id}/how-to-buy`);
        for (const id of pricePredictionTokenIds) paths.add(`/${id}/price-prediction`);
        for (const id of getPilotTokenIds()) paths.add(`/${id}/transfer-to-ledger`);
      } catch (error) {
        console.warn("Failed to load token routes for internal-link validation.", error);
      }

      try {
        const categories = await getAllCategories();
        for (const category of categories) {
          paths.add(`/category/${category.id}`);
        }
      } catch (error) {
        console.warn("Failed to load category routes for internal-link validation.", error);
      }

      for (const glossaryPath of readGlossaryPaths()) {
        paths.add(glossaryPath);
      }

      return paths;
    })();
  }

  return validInternalPathsPromise;
}

async function getIndexableTokenChildIds(
  tokenIds: string[],
  articleSlug: "how-to-buy" | "price-prediction",
): Promise<string[]> {
  const evaluatedIds = await Promise.all(tokenIds.map(async (tokenId) => {
    const [detail, overview, article] = await Promise.all([
      getTokenDetail(tokenId),
      getArticle(tokenId, "overview"),
      getArticle(tokenId, articleSlug),
    ]);

    return detail && isTokenChildArticleIndexable(detail, overview, article)
      ? tokenId
      : null;
  }));

  return evaluatedIds.filter((tokenId): tokenId is string => tokenId !== null);
}

async function unwrapUnsafeInternalMarkdownLinks(md: string): Promise<string> {
  const validInternalPaths = await getValidInternalPaths();

  return md.replace(/(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (match, prefix, label, href) => {
    const internalPath = normalizeInternalHref(href);
    if (!internalPath) return match;

    if (
      shouldUnwrapAmbiguousTokenLink(label, internalPath) ||
      !validInternalPaths.has(internalPath)
    ) {
      return `${prefix}${label}`;
    }

    return match;
  });
}

async function getIndexableOverviewTokens(): Promise<LinkableToken[]> {
  if (!indexableOverviewTokensPromise) {
    indexableOverviewTokensPromise = Promise.all([getTokenIds(), getAllTokens()]).then(async ([tokenIds, summaries]) => {
      const summariesById = new Map(summaries.map((token) => [token.id, token]));
      const evaluatedTokens = await Promise.all(tokenIds.map(async (tokenId) => {
        const overview = await getArticle(tokenId, "overview");
        const summary = summariesById.get(tokenId);
        if (summary) {
          return {
            id: summary.id,
            name: summary.name,
            isIndexable: isTokenOverviewIndexableFromVolume(summary.volume24h, overview),
          };
        }

        const detail = await getTokenDetail(tokenId);

        return {
          id: detail?.id || tokenId,
          name: detail?.name || "",
          isIndexable: Boolean(detail && isTokenOverviewIndexable(detail, overview)),
        };
      }));

      return evaluatedTokens.flatMap(({ id, name, isIndexable }) => {
        if (!name || !isIndexable) return [];
        return [{ id, name, nameLower: name.toLowerCase() }];
      });
    });
  }

  return indexableOverviewTokensPromise;
}

async function getLinkableTokens(excludedName?: string): Promise<LinkableToken[]> {
  if (!linkableTokensPromise) {
    linkableTokensPromise = getIndexableOverviewTokens().then((tokens) =>
      tokens
        .filter((t) => isLinkableTokenName(t.name))
        .sort((a, b) => b.name.length - a.name.length),
    );
  }

  const excludedNameLower = excludedName?.toLowerCase();
  return (await linkableTokensPromise)
    .filter((t) => t.nameLower !== excludedNameLower)
    .slice(0, 250);
}

interface HtmlSegment {
  value: string;
  eligibleForAutoLink: boolean;
}

function autoLinkTokenMentionsInHtml(html: string, linkableTokens: LinkableToken[]): string {
  const linkedInternalPaths = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/gi)) {
    const internalPath = normalizeInternalHref(match[1]);
    if (internalPath) linkedInternalPaths.add(internalPath);
  }

  const excludedTags = new Set(["a", "code", "pre"]);
  const segments: HtmlSegment[] = [];
  let excludedDepth = 0;

  for (const value of html.split(/(<[^>]+>)/g)) {
    if (!value) continue;

    if (value.startsWith("<")) {
      segments.push({ value, eligibleForAutoLink: false });
      const closingTag = value.match(/^<\s*\/\s*([a-z0-9-]+)\b/i);
      const openingTag = value.match(/^<\s*([a-z0-9-]+)\b/i);
      if (closingTag && excludedTags.has(closingTag[1].toLowerCase())) {
        excludedDepth = Math.max(0, excludedDepth - 1);
      } else if (
        openingTag
        && excludedTags.has(openingTag[1].toLowerCase())
        && !/\/\s*>$/.test(value)
      ) {
        excludedDepth += 1;
      }
      continue;
    }

    segments.push({ value, eligibleForAutoLink: excludedDepth === 0 });
  }

  let autoLinkCount = 0;
  for (const token of linkableTokens) {
    if (autoLinkCount >= MAX_AUTO_LINKS_PER_ARTICLE) break;

    const targetPath = `/${token.id}`;
    if (linkedInternalPaths.has(targetPath)) continue;

    const escapedName = escapeHtmlText(token.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const tokenPattern = new RegExp(`\\b(${escapedName})\\b`, "i");

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      if (!segment.eligibleForAutoLink) continue;

      const match = tokenPattern.exec(segment.value);
      if (!match || match.index === undefined) continue;

      const before = segment.value.slice(0, match.index);
      const after = segment.value.slice(match.index + match[0].length);
      const replacement: HtmlSegment[] = [];
      if (before) replacement.push({ value: before, eligibleForAutoLink: true });
      replacement.push({
        value: `<a href="${escapeHtmlAttribute(targetPath)}">${match[0]}</a>`,
        eligibleForAutoLink: false,
      });
      if (after) replacement.push({ value: after, eligibleForAutoLink: true });
      segments.splice(index, 1, ...replacement);
      linkedInternalPaths.add(targetPath);
      autoLinkCount += 1;
      break;
    }
  }

  return segments.map((segment) => segment.value).join("");
}

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
 * Replaces live data placeholders ({{LIVE_PRICE}}, etc.) with real-time values.
 * Drops raw HTML and validates rendered links/images to prevent XSS from malformed AI content.
 */
export async function markdownToHtml(md: string, tokenData?: TokenMarketData): Promise<string> {
  let processedMd = normalizeArticleMarkdown(md);
  let riskPillHtml = "";

  if (tokenData) {
    // 1. Placeholder Substitutions (used by AI templates)
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const replacements: Record<string, string> = {
      "{{LIVE_PRICE}}": formatPrice(tokenData.price),
      "{{LIVE_MARKET_CAP}}": tokenData.marketCap != null ? formatPrice(tokenData.marketCap).replace('$', '$ ') : "N/A", // Basic format, improved below
      "{{LIVE_RANK}}": tokenData.marketCapRank != null ? `#${tokenData.marketCapRank}` : "N/A",
      "{{LIVE_DATE}}": dateStr,
      "{{LIVE_24H_CHANGE}}": tokenData.priceChange24h != null ? `${tokenData.priceChange24h > 0 ? '+' : ''}${tokenData.priceChange24h.toFixed(2)}%` : "N/A",
      "{{GLOBAL_MCAP}}": "latest available market data",
      "{{GLOBAL_TOTAL_MARKET_CAP}}": "latest available market data",
      "{{BTC_DOM}}": "latest available BTC dominance data",
      "{{GLOBAL_BTC_DOMINANCE}}": "latest available BTC dominance data",
    };

    // Use specific compact formatter for Market Cap if available
    if (tokenData.marketCap != null) {
      replacements["{{LIVE_MARKET_CAP}}"] = formatCompact(tokenData.marketCap);
    }

    Object.entries(replacements).forEach(([tag, val]) => {
      processedMd = processedMd.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), val);
    });

    // 2. Risk Score Injection (Pill)
    const safeImageUrl = getTokenIconCandidates({
      symbol: tokenData.symbol,
      id: tokenData.id,
      imageUrl: tokenData.imageUrl,
    })
      .map((src) => sanitizeMarkdownImageSrc(src))
      .find((src): src is string => Boolean(src));
    riskPillHtml = `
      <span class="token-ticker-pill pill-sm">
        ${safeImageUrl ? `<img src="${escapeHtmlAttribute(safeImageUrl)}" alt="${escapeHtmlAttribute(tokenData.name)}" class="pill-icon" width="16" height="16">` : ""}
        <span class="pill-text">
          <span class="pill-name">${escapeHtmlText(tokenData.name.toUpperCase())}</span>
          <span class="pill-divider">-</span>
          <span class="pill-price">${escapeHtmlText(formatPrice(tokenData.price))}</span>
        </span>
      </span>
    `;

    // Replace the standard AI-generated Risk Score pattern with the premium pill-linked sentence
    // Match: "*   **Risk Score (X/10):**" or similar
    processedMd = processedMd.replace(/\*?\s*\*\*Risk Score\s*\(\d+\/10\):\*\*/gi, (match) => {
      const scoreMatch = match.match(/\d+\/10/);
      const score = scoreMatch ? scoreMatch[0] : "N/A";
      return `Our AI assigned a **Risk Score of ${score}** to ${RISK_PILL_PLACEHOLDER}`;
    });
  }

  processedMd = await unwrapUnsafeInternalMarkdownLinks(processedMd);

  // Parse markdown with a renderer that drops raw HTML and validates URLs.
  let rawHtml = await marked.parse(stripDangerousHtmlBlocks(processedMd), {
    renderer: createSafeMarkdownRenderer(),
    gfm: true,
    breaks: true,
  });

  // Link only rendered prose text. Existing anchors, bare URLs, inline code,
  // fenced code, and HTML attributes are separate ineligible segments.
  try {
    rawHtml = autoLinkTokenMentionsInHtml(
      rawHtml,
      await getLinkableTokens(tokenData?.name),
    );
  } catch (error) {
    console.warn("Auto-linking failed, falling back to rendered Markdown.", error);
  }
  
  // Inject ID into h2 and h3 tags for the Table of Contents feature
  const htmlWithIds = rawHtml.replace(/<h([23])>(.*?)<\/h\1>/gi, (_match, level, innerHtml) => {
    // Create a slug from text content (stripping tags if any)
    const textContent = innerHtml.replace(/<[^>]*>?/gm, '');
    const id = textContent.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
    return `<h${level} id="${id}">${innerHtml}</h${level}>`;
  });

  return riskPillHtml
    ? htmlWithIds.replaceAll(RISK_PILL_PLACEHOLDER, riskPillHtml.trim())
    : htmlWithIds;
}

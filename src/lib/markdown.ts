import * as fs from "fs";
import * as path from "path";
import { marked, Renderer, type Tokens } from "marked";
import { formatPrice, formatCompact, getTokenIconCandidates } from "./formatters";
import { getAllCategories, getAllTokens, getTokenIds } from "./content-loader";
import { normalizeArticleMarkdown } from "./article-formatting";
import { getPilotTokenIds } from "./token-technical-data";

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

const BLOCKED_TOKEN_LINK_TERMS = new Set([
  "cash",
  "deep",
  "everything",
  "flow",
  "four",
  "gas",
  "home",
  "just",
  "movement",
  "safe",
  "score",
  "would",
]);

const STATIC_INTERNAL_PATHS = [
  "/",
  "/about",
  "/best-crypto-hardware-wallets",
  "/contact",
  "/crypto-tax-guide",
  "/disclaimer",
  "/learn",
  "/privacy",
  "/terms",
  "/upcoming",
];

const RISK_PILL_PLACEHOLDER = "TOKENRADAR_RISK_PILL_9B65D6E7";

let linkableTokensPromise: Promise<LinkableToken[]> | null = null;
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

function isLinkableTokenName(name: string): boolean {
  const normalized = name.trim().toLowerCase();
  if (normalized.length <= 2) return false;
  if (/^\d+$/.test(normalized)) return false;
  return !BLOCKED_TOKEN_LINK_TERMS.has(normalized);
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
        const tokenIds = await getTokenIds();
        const pilotIds = new Set(getPilotTokenIds());
        for (const id of tokenIds) {
          paths.add(`/${id}`);
          paths.add(`/${id}/how-to-buy`);
          paths.add(`/${id}/price-prediction`);
          if (pilotIds.has(id)) paths.add(`/${id}/transfer-to-ledger`);
        }
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

async function unwrapUnsafeInternalMarkdownLinks(md: string): Promise<string> {
  const validInternalPaths = await getValidInternalPaths();

  return md.replace(/(^|[^!])\[([^\]]+)\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g, (match, prefix, label, href) => {
    const internalPath = normalizeInternalHref(href);
    if (!internalPath) return match;

    const firstSegment = internalPath.split("/")[1] || "";
    const firstSegmentStem = firstSegment.split("-")[0] || firstSegment;
    const labelTerm = String(label).trim().toLowerCase();
    if (
      BLOCKED_TOKEN_LINK_TERMS.has(firstSegment) ||
      BLOCKED_TOKEN_LINK_TERMS.has(firstSegmentStem) ||
      BLOCKED_TOKEN_LINK_TERMS.has(labelTerm) ||
      !validInternalPaths.has(internalPath)
    ) {
      return `${prefix}${label}`;
    }

    return match;
  });
}


async function getLinkableTokens(excludedName?: string): Promise<LinkableToken[]> {
  if (!linkableTokensPromise) {
    linkableTokensPromise = getAllTokens().then((tokens) =>
      tokens
        .filter((t) => isLinkableTokenName(t.name))
        .map((t) => ({ id: t.id, name: t.name, nameLower: t.name.toLowerCase() }))
        .sort((a, b) => b.name.length - a.name.length),
    );
  }

  const excludedNameLower = excludedName?.toLowerCase();
  return (await linkableTokensPromise)
    .filter((t) => t.nameLower !== excludedNameLower)
    .slice(0, 250);
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

  // Programmatic Internal Linking
  try {
    const maskedLinks: string[] = [];
    processedMd = processedMd.replace(/!?\[([^\]]*)\]\(([^)]+)\)/g, (match) => {
      maskedLinks.push(match);
      return `__MASKED_LINK_${maskedLinks.length - 1}__`;
    });

    const linkableTokens = await getLinkableTokens(tokenData?.name);

    for (const t of linkableTokens) {
      const safeName = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Added 'g' flag to replace all occurrences, not just the first one
      const regex = new RegExp(`\\b(${safeName})\\b`, 'ig');
      processedMd = processedMd.replace(regex, (match) => {
        // Immediately mask the new link to prevent nested links matching later
        maskedLinks.push(`[${match}](/${t.id})`);
        return `__MASKED_LINK_${maskedLinks.length - 1}__`;
      });
    }

    processedMd = processedMd.replace(/__MASKED_LINK_(\d+)__/g, (_, idx) => maskedLinks[parseInt(idx)]);
  } catch (e) {
    console.warn("Auto-linking failed, falling back to raw md.", e);
  }

  // Parse markdown with a renderer that drops raw HTML and validates URLs.
  const rawHtml = await marked.parse(stripDangerousHtmlBlocks(processedMd), {
    renderer: createSafeMarkdownRenderer(),
    gfm: true,
    breaks: true,
  });
  
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

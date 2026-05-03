import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { formatPrice, formatCompact } from "./formatters";
import { getAllTokens } from "./content-loader";
import { normalizeArticleMarkdown } from "./article-formatting";

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
 * Sanitizes output via DOMPurify to prevent XSS from malformed AI content.
 */
export interface TokenMarketData {
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

let linkableTokensPromise: Promise<LinkableToken[]> | null = null;

async function getLinkableTokens(excludedName?: string): Promise<LinkableToken[]> {
  if (!linkableTokensPromise) {
    linkableTokensPromise = getAllTokens().then((tokens) =>
      tokens
        .filter((t) => t.name.length > 2)
        .map((t) => ({ id: t.id, name: t.name, nameLower: t.name.toLowerCase() }))
        .sort((a, b) => b.name.length - a.name.length),
    );
  }

  const excludedNameLower = excludedName?.toLowerCase();
  return (await linkableTokensPromise)
    .filter((t) => t.nameLower !== excludedNameLower)
    .slice(0, 250);
}

function stripUnsafeHtml(html: string): string {
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta|base)[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|xlink:href|formaction)\s*=\s*(["'])\s*(?:javascript|vbscript|data):[\s\S]*?\2/gi, "")
    .replace(/\s+(href|src|xlink:href|formaction)\s*=\s*(?:javascript|vbscript|data):[^\s>]*/gi, "");
}

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
 * Replaces live data placeholders ({{LIVE_PRICE}}, etc.) with real-time values.
 * Sanitizes output via DOMPurify to prevent XSS from malformed AI content.
 */
export async function markdownToHtml(md: string, tokenData?: TokenMarketData): Promise<string> {
  let processedMd = normalizeArticleMarkdown(md);

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
    };

    // Use specific compact formatter for Market Cap if available
    if (tokenData.marketCap != null) {
      replacements["{{LIVE_MARKET_CAP}}"] = formatCompact(tokenData.marketCap);
    }

    Object.entries(replacements).forEach(([tag, val]) => {
      processedMd = processedMd.replace(new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), val);
    });

    // 2. Risk Score Injection (Pill)
    const pillHtml = `
      <span class="token-ticker-pill pill-sm">
        ${tokenData.imageUrl ? `<img src="${tokenData.imageUrl}" alt="${tokenData.name}" class="pill-icon" width="16" height="16" />` : ""}
        <span class="pill-text">
          <span class="pill-name">${tokenData.name.toUpperCase()}</span>
          <span class="pill-divider">-</span>
          <span class="pill-price">${formatPrice(tokenData.price)}</span>
        </span>
      </span>
    `;

    // Replace the standard AI-generated Risk Score pattern with the premium pill-linked sentence
    // Match: "*   **Risk Score (X/10):**" or similar
    processedMd = processedMd.replace(/\*?\s*\*\*Risk Score\s*\(\d+\/10\):\*\*/gi, (match) => {
      const scoreMatch = match.match(/\d+\/10/);
      const score = scoreMatch ? scoreMatch[0] : "N/A";
      return `Our AI assigned a **Risk Score of ${score}** to ${pillHtml.trim()}`;
    });
  }

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

  // Parse the markdown using the modern API with explicit options
  const rawHtml = await marked.parse(processedMd, {
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

  try {
    const sanitized = DOMPurify.sanitize(htmlWithIds, {
      ADD_TAGS: ["a", "img", "table", "thead", "tbody", "tr", "th", "td"],
      ADD_ATTR: ["class", "width", "height", "alt", "src", "id", "href", "target", "rel"],
    });
    return stripUnsafeHtml(String(sanitized));
  } catch (e) {
    console.warn("DOMPurify sanitization failed, using fallback sanitizer:", e);
    return stripUnsafeHtml(htmlWithIds);
  }
}

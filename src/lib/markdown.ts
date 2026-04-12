import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { formatPrice } from "./formatters";
import { getAllTokens } from "./content-loader";

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

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
 * Replaces live data placeholders ({{LIVE_PRICE}}, etc.) with real-time values.
 * Sanitizes output via DOMPurify to prevent XSS from malformed AI content.
 */
export function markdownToHtml(md: string, tokenData?: TokenMarketData): string {
  let processedMd = md;

  if (tokenData) {
    // 1. Placeholder Substitutions (used by AI templates)
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", { year: 'numeric', month: 'long', day: 'numeric' });
    
    const replacements: Record<string, string> = {
      "{{LIVE_PRICE}}": formatPrice(tokenData.price),
      "{{LIVE_MARKET_CAP}}": tokenData.marketCap ? formatPrice(tokenData.marketCap).replace('$', '$ ') : "N/A", // Basic format, improved below
      "{{LIVE_RANK}}": tokenData.marketCapRank ? `#${tokenData.marketCapRank}` : "N/A",
      "{{LIVE_DATE}}": dateStr,
      "{{LIVE_24H_CHANGE}}": tokenData.priceChange24h ? `${tokenData.priceChange24h > 0 ? '+' : ''}${tokenData.priceChange24h.toFixed(2)}%` : "N/A",
    };

    // Use specific compact formatter for Market Cap if available
    if (tokenData.marketCap) {
      const { formatCompact } = require("./formatters"); 
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

    const allTokens = getAllTokens();
    const linkableTokens = allTokens
      .filter(t => t.name.toLowerCase() !== tokenData?.name?.toLowerCase())
      .sort((a, b) => b.name.length - a.name.length)
      .slice(0, 100);

    for (const t of linkableTokens) {
      const safeName = t.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b(${safeName})\\b`, 'i');
      if (regex.test(processedMd)) {
         processedMd = processedMd.replace(regex, `[$1](/${t.id})`);
      }
    }

    processedMd = processedMd.replace(/__MASKED_LINK_(\d+)__/g, (_, idx) => maskedLinks[parseInt(idx)]);
  } catch (e) {
    console.warn("Auto-linking failed, falling back to raw md.", e);
  }

  // Parse the markdown synchronously
  const rawHtml = marked.parse(processedMd, { async: false }) as string;
  
  // Inject ID into h2 and h3 tags for the Table of Contents feature
  const htmlWithIds = rawHtml.replace(/<h([23])>(.*?)<\/h\1>/gi, (match, level, innerHtml) => {
    // Create a slug from text content (stripping tags if any)
    const textContext = innerHtml.replace(/<[^>]*>?/gm, '');
    const id = textContext.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
    return `<h${level} id="${id}">${innerHtml}</h${level}>`;
  });

  return DOMPurify.sanitize(htmlWithIds, {
    ADD_TAGS: ["img"],
    ADD_ATTR: ["class", "width", "height", "alt", "src", "id"],
  });
}

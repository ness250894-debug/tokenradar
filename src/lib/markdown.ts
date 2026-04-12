import { marked } from "marked";
import DOMPurify from "isomorphic-dompurify";
import { formatPrice } from "./formatters";
import { getAllTokens } from "./content-loader";

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
 * Sanitizes output via DOMPurify to prevent XSS from malformed AI content.
 */
export function markdownToHtml(md: string, tokenData?: { name: string; symbol: string; price: number; imageUrl?: string }): string {
  let processedMd = md;

  if (tokenData) {
    // Generate the raw HTML for the pill (matches TokenTickerPill component)
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

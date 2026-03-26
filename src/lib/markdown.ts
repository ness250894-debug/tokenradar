import { marked } from "marked";
import { formatPrice } from "./formatters";

/**
 * Robust markdown → HTML converter for article content.
 * Injects stylized token pills for Risk Score mentions.
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

  // Parse the markdown synchronously
  return marked.parse(processedMd, { async: false }) as string;
}

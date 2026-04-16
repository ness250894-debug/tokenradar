/**
 * TokenRadar — OG Image Fetcher
 *
 * Fetches the pre-rendered OG image for a given token from the live site.
 * Used by social posting scripts to attach branded images to posts.
 *
 * @module og-fetcher
 */

import { SITE_URL } from "./config";

/**
 * Fetch a branded data card image for a token.
 * 
 * Strategy:
 * 1. If market data is provided, use the dynamic /api/og/token endpoint (GUARANTEED success).
 * 2. If only tokenId is provided, fallback to the static /opengraph-image route (requires page to exist).
 *
 * @param tokenId - Token slug (e.g., "solana")
 * @param data - Optional market data for dynamic generation
 * @returns PNG image as a Buffer, or null if fetch fails
 */
export async function fetchTokenImage(
  tokenId: string,
  data?: {
    symbol: string;
    name: string;
    price: string;
    change: number;
    risk: number;
    icon?: string;
  }
): Promise<Buffer | null> {
  let url: string;

  if (data) {
    // ── Dynamic Mode (Recommended) ──
    const params = new URLSearchParams({
      symbol: data.symbol,
      name: data.name,
      price: data.price,
      change: data.change.toString(),
      risk: data.risk.toString(),
    });
    if (data.icon) params.append('icon', data.icon);
    
    url = `${SITE_URL}/api/og/token?${params.toString()}`;
  } else {
    // ── Static Fallback (Requires pre-rendered page) ──
    url = `${SITE_URL}/${tokenId}/opengraph-image`;
  }

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15_000), // 15s timeout
    });

    if (!response.ok) {
      console.warn(`  ⚠ OG image fetch failed [HTTP ${response.status}]: ${url}`);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`  ⚠ OG image fetch error for ${url}: ${msg}`);
    return null;
  }
}

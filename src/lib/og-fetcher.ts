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
 * Fetch the OG image for a token from the production site.
 *
 * @param tokenId - Token slug (e.g., "solana", "bitcoin")
 * @returns PNG image as a Buffer, or null if fetch fails
 */
export async function fetchTokenImage(tokenId: string): Promise<Buffer | null> {
  const url = `${SITE_URL}/${tokenId}/opengraph-image`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(10_000), // 10s timeout
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

/**
 * TokenRadar - OG Image Fetcher
 *
 * Renders a branded OG data card in-memory with live market data.
 * No static files read, no files saved to disk.
 *
 * Strategy:
 * 1. If live token data is provided, render in-memory via satori + resvg (preferred).
 * 2. Fallback: read a pre-rendered static PNG from public/og/token/ (legacy).
 */

import * as fs from "fs";
import * as path from "path";

import { renderOgImage } from "./og-renderer";

const LOCAL_OG_DIR = path.resolve(process.cwd(), "public", "og", "token");

/**
 * Fetch a branded data card image for a token.
 *
 * @param tokenId - The token slug (e.g. "bitcoin")
 * @param data - Live market data to render on the card
 * @returns PNG Buffer ready for social posting, or null on failure
 */
export async function fetchTokenImage(
  tokenId: string,
  data?: {
    symbol: string;
    name: string;
    marketCap: number;
    volume24h: number;
    rank: number;
    risk: number;
  }
): Promise<Buffer | null> {
  // Strategy 1: Render in-memory with live data (preferred)
  if (data) {
    try {
      const buf = await renderOgImage({
        name: data.name,
        symbol: data.symbol,
        marketCap: data.marketCap,
        volume24h: data.volume24h,
        rank: data.rank,
        risk: data.risk,
      });
      return buf;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`  [warn] In-memory OG render failed for ${tokenId}: ${msg}`);
      // Fall through to static fallback
    }
  }

  // Strategy 2: Fallback to pre-rendered static PNG
  const localPath = path.join(LOCAL_OG_DIR, `${tokenId}.png`);
  try {
    return await fs.promises.readFile(localPath);
  } catch {
    // Expected on cache miss, ignore
  }

  return null;
}

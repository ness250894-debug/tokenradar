import * as fs from "fs";
import * as path from "path";
import { getMarketDataQualityIssues } from "../src/lib/market-data-quality";
import { writeFileAtomic } from "../src/lib/utils";

/**
 * Consolidate individual token/metric/price files into single optimized blobs.
 * This script runs during prebuild/pretest to minimize disk I/O during SSG and tests.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PRICES_DIR = path.join(DATA_DIR, "prices");

const OUTPUT_TOKENS_BLOB = path.join(DATA_DIR, "_tokens_blob.json");
const OUTPUT_METRICS_BLOB = path.join(DATA_DIR, "_metrics_blob.json");
const OUTPUT_PRICES_BLOB = path.join(DATA_DIR, "_prices_blob.json");
const OUTPUT_REGISTRY = path.join(DATA_DIR, "_registry.json");

const LEGACY_PUBLIC_DATA_BLOBS = [
  "_tokens_blob.json",
  "_metrics_blob.json",
  "_prices_blob.json",
  "_registry.json",
  "upcoming-tges.json",
  "glossary.json",
  "keywords.json",
  "search-intent.json",
  "search-intent-history.json",
  "tokens.json",
];

type TokenContent = {
  id?: string;
  name?: string;
  symbol?: string;
  imageUrl?: string;
  image?: string | {
    large?: string;
    small?: string;
    thumb?: string;
  };
  categories?: string[];
  market?: {
    price?: number;
    marketCap?: number;
    marketCapRank?: number;
    volume24h?: number;
    priceChange24h?: number;
    ath?: number;
    athDate?: string;
    atl?: number;
    atlDate?: string;
    circulatingSupply?: number;
    totalSupply?: number | null;
    maxSupply?: number | null;
  };
  fetchedAt?: string;
  lastMarketUpdate?: string;
  [key: string]: unknown;
};

type RegistryEntry = {
  id: string;
  name: string;
  symbol: string;
  image?: string;
  categories: string[];
  rank: number;
  price: number;
  marketCap: number;
  volume24h: number;
  priceChange24h: number;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  circulatingSupply: number;
  totalSupply: number | null;
  maxSupply: number | null;
};

function getTokenImageUrl(content: TokenContent): string | undefined {
  if (typeof content.imageUrl === "string" && content.imageUrl.trim()) {
    return content.imageUrl;
  }

  if (typeof content.image === "string" && content.image.trim()) {
    return content.image;
  }

  if (content.image && typeof content.image === "object") {
    return content.image.large || content.image.small || content.image.thumb || undefined;
  }

  return undefined;
}

async function consolidate() {
  console.log("Starting data consolidation...");

  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith(".json")).sort();
  const metricFiles = fs
    .readdirSync(METRICS_DIR)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_") && f !== "api-usage-history.json")
    .sort();
  const priceFiles = fs.readdirSync(PRICES_DIR).filter((f) => f.endsWith(".json")).sort();

  const tokensBlob: Record<string, TokenContent> = {};
  const registry: RegistryEntry[] = [];
  const metricsBlob: Record<string, unknown> = {};
  const pricesBlob: Record<string, unknown> = {};

  // 1. Consolidate token details and build registry.
  console.log(`Processing ${tokenFiles.length} tokens...`);
  for (const file of tokenFiles) {
    const tokenId = file.replace(".json", "");
    try {
      const raw = await fs.promises.readFile(path.join(TOKENS_DIR, file), "utf-8");
      const content = JSON.parse(raw) as TokenContent;

      const marketIssues = getMarketDataQualityIssues(content);
      if (marketIssues.length > 0) {
        console.warn(`Skipping ${tokenId} during consolidation: Untrusted market data (${marketIssues.join(", ")}).`);
        continue;
      }

      tokensBlob[tokenId] = content;
      const market = content.market || {};

      // Extract registry data (minimal set for list pages).
      registry.push({
        id: content.id ?? tokenId,
        name: content.name ?? tokenId,
        symbol: content.symbol ?? "",
        image: getTokenImageUrl(content),
        categories: content.categories || [],
        rank: market.marketCapRank ?? 9999,
        price: market.price ?? 0,
        marketCap: market.marketCap ?? 0,
        volume24h: market.volume24h ?? 0,
        priceChange24h: market.priceChange24h ?? 0,
        ath: market.ath ?? 0,
        athDate: market.athDate ?? "",
        atl: market.atl ?? 0,
        atlDate: market.atlDate ?? "",
        circulatingSupply: market.circulatingSupply ?? 0,
        totalSupply: market.totalSupply ?? null,
        maxSupply: market.maxSupply ?? null,
      });
    } catch (error) {
      console.error(`Error parsing token ${tokenId}:`, error);
    }
  }

  // Sort registry by rank and ID for deterministic blob output.
  registry.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id, "en-US"));

  // 2. Consolidate metrics.
  console.log(`Processing ${metricFiles.length} metric files...`);
  for (const file of metricFiles) {
    const tokenId = file.replace(".json", "");
    if (!tokensBlob[tokenId]) {
      continue;
    }

    try {
      const raw = await fs.promises.readFile(path.join(METRICS_DIR, file), "utf-8");
      metricsBlob[tokenId] = JSON.parse(raw);
    } catch (error) {
      console.error(`Error parsing metrics for ${tokenId}:`, error);
    }
  }

  // 3. Consolidate prices.
  console.log(`Processing ${priceFiles.length} price files...`);
  for (const file of priceFiles) {
    const tokenId = file.replace(".json", "");
    if (!tokensBlob[tokenId]) {
      continue;
    }

    try {
      const raw = await fs.promises.readFile(path.join(PRICES_DIR, file), "utf-8");
      pricesBlob[tokenId] = JSON.parse(raw);
    } catch (error) {
      console.error(`Error parsing prices for ${tokenId}:`, error);
    }
  }

  // 4. Final validation and write output.
  if (Object.keys(tokensBlob).length === 0 || registry.length === 0) {
    throw new Error("CRITICAL FAILURE: Consolidation resulted in zero tokens. Check data/ directory.");
  }

  console.log("Writing blobs to disk...");
  await writeFileAtomic(OUTPUT_TOKENS_BLOB, JSON.stringify(tokensBlob));
  await writeFileAtomic(OUTPUT_METRICS_BLOB, JSON.stringify(metricsBlob));
  await writeFileAtomic(OUTPUT_PRICES_BLOB, JSON.stringify(pricesBlob));
  await writeFileAtomic(OUTPUT_REGISTRY, JSON.stringify(registry));

  console.log("Consolidation complete!");
  console.log(`\n  - Tokens: ${Object.keys(tokensBlob).length} (${tokenFiles.length - Object.keys(tokensBlob).length} skipped)`);
  console.log(`  - Registry: ${registry.length}`);
  console.log(`  - Metrics: ${Object.keys(metricsBlob).length} / ${Object.keys(tokensBlob).length} coverage`);
  console.log(`  - Prices: ${Object.keys(pricesBlob).length}\n`);

  // 5. Remove legacy build-only blobs from public/ so raw prebuild payloads are not
  // deployed to the static CDN edge. Client views consume targeted Next.js route
  // payloads (/data/home-market-lab.json, /data/token-directory.json) and research snapshots.
  const publicDataDir = path.join(process.cwd(), "public", "data");
  const publicContentDir = path.join(process.cwd(), "public", "content");

  if (fs.existsSync(publicContentDir)) {
    fs.rmSync(publicContentDir, { recursive: true, force: true });
  }

  if (fs.existsSync(publicDataDir)) {
    for (const file of LEGACY_PUBLIC_DATA_BLOBS) {
      const stalePath = path.join(publicDataDir, file);
      if (fs.existsSync(stalePath)) {
        fs.rmSync(stalePath, { force: true });
      }
    }
  }
}

consolidate().catch((error) => {
  console.error(error);
  process.exit(1);
});

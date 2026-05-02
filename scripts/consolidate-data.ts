import * as fs from "fs";
import * as path from "path";

/**
 * Consolidate individual token/metric/price files into single optimized blobs.
 * This script runs during prebuild to minimize disk I/O at runtime and during SSG.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const PRICES_DIR = path.join(DATA_DIR, "prices");

const OUTPUT_TOKENS_BLOB = path.join(DATA_DIR, "_tokens_blob.json");
const OUTPUT_METRICS_BLOB = path.join(DATA_DIR, "_metrics_blob.json");
const OUTPUT_PRICES_BLOB = path.join(DATA_DIR, "_prices_blob.json");
const OUTPUT_REGISTRY = path.join(DATA_DIR, "_registry.json");

type TokenContent = {
  id?: string;
  name?: string;
  symbol?: string;
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
  [key: string]: unknown;
};

type RegistryEntry = {
  id: string;
  name: string;
  symbol: string;
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

async function consolidate() {
  console.log("Starting data consolidation...");

  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith(".json")).sort();
  const metricFiles = fs.readdirSync(METRICS_DIR).filter((f) => f.endsWith(".json")).sort();
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

      // Skip tokens with zero market data (price, market cap, and volume are 0).
      const market = content.market || {};
      const hasMarket =
        (market.price ?? 0) > 0 || (market.marketCap ?? 0) > 0 || (market.volume24h ?? 0) > 0;

      if (!hasMarket) {
        console.warn(`Skipping ${tokenId} during consolidation: No market data.`);
        continue;
      }

      tokensBlob[tokenId] = content;

      // Extract registry data (minimal set for list pages).
      registry.push({
        id: content.id ?? tokenId,
        name: content.name ?? tokenId,
        symbol: content.symbol ?? "",
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
  registry.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));

  // 2. Consolidate metrics.
  console.log(`Processing ${metricFiles.length} metric files...`);
  for (const file of metricFiles) {
    const tokenId = file.replace(".json", "");
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
  await fs.promises.writeFile(OUTPUT_TOKENS_BLOB, JSON.stringify(tokensBlob));
  await fs.promises.writeFile(OUTPUT_METRICS_BLOB, JSON.stringify(metricsBlob));
  await fs.promises.writeFile(OUTPUT_PRICES_BLOB, JSON.stringify(pricesBlob));
  await fs.promises.writeFile(OUTPUT_REGISTRY, JSON.stringify(registry));

  console.log("Consolidation complete!");
  console.log(`\n  - Tokens: ${Object.keys(tokensBlob).length} (${tokenFiles.length - Object.keys(tokensBlob).length} skipped)`);
  console.log(`  - Registry: ${registry.length}`);
  console.log(`  - Metrics: ${Object.keys(metricsBlob).length} / ${Object.keys(tokensBlob).length} coverage`);
  console.log(`  - Prices: ${Object.keys(pricesBlob).length}\n`);

  // 5. Copy only essential data files to public for Edge Runtime fetching.
  // Individual token/metric/price files are already consolidated into the blobs.
  console.log("Copying essential data and content to public folder...");
  const publicDataDir = path.join(process.cwd(), "public", "data");
  const publicContentDir = path.join(process.cwd(), "public", "content");

  // Clean up old copies in case a previous build included stale files.
  if (fs.existsSync(publicDataDir)) fs.rmSync(publicDataDir, { recursive: true, force: true });
  if (fs.existsSync(publicContentDir)) fs.rmSync(publicContentDir, { recursive: true, force: true });

  if (!fs.existsSync(path.join(process.cwd(), "public"))) {
    fs.mkdirSync(path.join(process.cwd(), "public"));
  }

  fs.mkdirSync(publicDataDir, { recursive: true });
  const essentialDataFiles = [
    "_tokens_blob.json",
    "_metrics_blob.json",
    "_prices_blob.json",
    "_registry.json",
    "upcoming-tges.json",
    "glossary.json",
    "keywords.json",
    "tokens.json",
  ];
  for (const file of essentialDataFiles) {
    const src = path.join(DATA_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(publicDataDir, file));
    }
  }

  function copyRecursiveSync(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const child of fs.readdirSync(src).sort()) {
        copyRecursiveSync(path.join(src, child), path.join(dest, child));
      }
      return;
    }
    fs.copyFileSync(src, dest);
  }

  const contentTokensDir = path.join(process.cwd(), "content", "tokens");
  if (fs.existsSync(contentTokensDir)) {
    copyRecursiveSync(contentTokensDir, path.join(publicContentDir, "tokens"));
  }

  console.log(`Copied ${essentialDataFiles.length} essential data files and content articles to public folder.`);
}

consolidate().catch((error) => {
  console.error(error);
  process.exit(1);
});

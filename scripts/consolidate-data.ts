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

function consolidate() {
  console.log("🚀 Starting data consolidation...");

  const tokenFiles = fs.readdirSync(TOKENS_DIR).filter((f) => f.endsWith(".json"));
  const metricFiles = fs.readdirSync(METRICS_DIR).filter((f) => f.endsWith(".json"));
  const priceFiles = fs.readdirSync(PRICES_DIR).filter((f) => f.endsWith(".json"));

  const tokensBlob: Record<string, any> = {};
  const registry: any[] = [];
  const metricsBlob: Record<string, any> = {};
  const pricesBlob: Record<string, any> = {};

  // 1. Consolidate Token Details & Build Registry
  console.log(`📦 Processing ${tokenFiles.length} tokens...`);
  for (const file of tokenFiles) {
    const tokenId = file.replace(".json", "");
    try {
      const content = JSON.parse(fs.readFileSync(path.join(TOKENS_DIR, file), "utf-8"));
      
      // SKIP tokens with zero market data (Price and Market Cap and Volume are 0)
      const market = content.market || {};
      const hasMarket = market.price > 0 || market.marketCap > 0 || market.volume24h > 0;
      
      if (!hasMarket) {
        console.warn(`⚠️ Skipping ${tokenId} during consolidation: No market data.`);
        continue;
      }

      tokensBlob[tokenId] = content;

      // Extract registry data (minimal set for list pages)
      registry.push({
        id: content.id,
        name: content.name,
        symbol: content.symbol,
        categories: content.categories || [],
        rank: content.market?.marketCapRank ?? 9999,
        price: content.market?.price ?? 0,
        marketCap: content.market?.marketCap ?? 0,
        volume24h: content.market?.volume24h ?? 0,
        priceChange24h: content.market?.priceChange24h ?? 0,
        ath: content.market?.ath ?? 0,
        athDate: content.market?.athDate ?? "",
        atl: content.market?.atl ?? 0,
        atlDate: content.market?.atlDate ?? "",
        circulatingSupply: content.market?.circulatingSupply ?? 0,
        totalSupply: content.market?.totalSupply ?? null,
        maxSupply: content.market?.maxSupply ?? null,
      });
    } catch (e) {
      console.error(`❌ Error parsing token ${tokenId}:`, e);
    }
  }

  // Sort registry by rank
  registry.sort((a, b) => a.rank - b.rank);

  // 2. Consolidate Metrics
  console.log(`📊 Processing ${metricFiles.length} metric files...`);
  for (const file of metricFiles) {
    const tokenId = file.replace(".json", "");
    try {
      const content = JSON.parse(fs.readFileSync(path.join(METRICS_DIR, file), "utf-8"));
      metricsBlob[tokenId] = content;
    } catch (e) {
      console.error(`❌ Error parsing metrics for ${tokenId}:`, e);
    }
  }

  // 3. Consolidate Prices
  console.log(`📈 Processing ${priceFiles.length} price files...`);
  for (const file of priceFiles) {
    const tokenId = file.replace(".json", "");
    try {
      const content = JSON.parse(fs.readFileSync(path.join(PRICES_DIR, file), "utf-8"));
      pricesBlob[tokenId] = content;
    } catch (e) {
      console.error(`❌ Error parsing prices for ${tokenId}:`, e);
    }
  }

  // 4. Write Output
  console.log("💾 Writing blobs to disk...");
  fs.writeFileSync(OUTPUT_TOKENS_BLOB, JSON.stringify(tokensBlob));
  fs.writeFileSync(OUTPUT_METRICS_BLOB, JSON.stringify(metricsBlob));
  fs.writeFileSync(OUTPUT_PRICES_BLOB, JSON.stringify(pricesBlob));
  fs.writeFileSync(OUTPUT_REGISTRY, JSON.stringify(registry));

  console.log(`✅ Consolidation complete!`);
  console.log(`   - Tokens: ${Object.keys(tokensBlob).length}`);
  console.log(`   - Registry: ${registry.length}`);
  console.log(`   - Metrics: ${Object.keys(metricsBlob).length}`);
  console.log(`   - Prices: ${Object.keys(pricesBlob).length}`);
}

consolidate();

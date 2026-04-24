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

async function consolidate() {
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
  await Promise.allSettled(
    tokenFiles.map(async (file) => {
      const tokenId = file.replace(".json", "");
      try {
        const raw = await fs.promises.readFile(path.join(TOKENS_DIR, file), "utf-8");
        const content = JSON.parse(raw);
        
        // SKIP tokens with zero market data (Price and Market Cap and Volume are 0)
        const market = content.market || {};
        const hasMarket = market.price > 0 || market.marketCap > 0 || market.volume24h > 0;
        
        if (!hasMarket) {
          console.warn(`⚠️ Skipping ${tokenId} during consolidation: No market data.`);
          return;
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
    })
  );

  // Sort registry by rank
  registry.sort((a, b) => a.rank - b.rank);

  // 2. Consolidate Metrics
  console.log(`📊 Processing ${metricFiles.length} metric files...`);
  await Promise.allSettled(
    metricFiles.map(async (file) => {
      const tokenId = file.replace(".json", "");
      try {
        const raw = await fs.promises.readFile(path.join(METRICS_DIR, file), "utf-8");
        metricsBlob[tokenId] = JSON.parse(raw);
      } catch (e) {
        console.error(`❌ Error parsing metrics for ${tokenId}:`, e);
      }
    })
  );

  // 3. Consolidate Prices
  console.log(`📈 Processing ${priceFiles.length} price files...`);
  await Promise.allSettled(
    priceFiles.map(async (file) => {
      const tokenId = file.replace(".json", "");
      try {
        const raw = await fs.promises.readFile(path.join(PRICES_DIR, file), "utf-8");
        pricesBlob[tokenId] = JSON.parse(raw);
      } catch (e) {
        console.error(`❌ Error parsing prices for ${tokenId}:`, e);
      }
    })
  );

  // 4. Final Validation & Write Output
  if (Object.keys(tokensBlob).length === 0 || registry.length === 0) {
    throw new Error("❌ CRITICAL FAILURE: Consolidation resulted in zero tokens. Check data/ directory.");
  }

  console.log("💾 Writing blobs to disk...");
  await fs.promises.writeFile(OUTPUT_TOKENS_BLOB, JSON.stringify(tokensBlob));
  await fs.promises.writeFile(OUTPUT_METRICS_BLOB, JSON.stringify(metricsBlob));
  await fs.promises.writeFile(OUTPUT_PRICES_BLOB, JSON.stringify(pricesBlob));
  await fs.promises.writeFile(OUTPUT_REGISTRY, JSON.stringify(registry));

  console.log(`✅ Consolidation complete!`);
  console.log(`\n  - Tokens: ${Object.keys(tokensBlob).length} (${tokenFiles.length - Object.keys(tokensBlob).length} skipped)`);
  console.log(`  - Registry: ${registry.length}`);
  console.log(`  - Metrics: ${Object.keys(metricsBlob).length} / ${Object.keys(tokensBlob).length} coverage`);
  console.log(`  - Prices: ${Object.keys(pricesBlob).length}\n`);

  // 5. Copy ONLY essential data files to public for Edge Runtime Fetching
  // IMPORTANT: We only copy consolidated blobs and essential top-level files.
  // Individual token/metric/price files are NOT needed at runtime — they are
  // already consolidated into the blob files above. Copying them would add
  // ~1,700 unnecessary files, risking Cloudflare Pages' 20,000 file limit.
  console.log("📦 Copying essential data & content to public folder...");
  const publicDataDir = path.join(process.cwd(), "public", "data");
  const publicContentDir = path.join(process.cwd(), "public", "content");
  
  // Clean up old ones just in case
  if (fs.existsSync(publicDataDir)) fs.rmSync(publicDataDir, { recursive: true, force: true });
  if (fs.existsSync(publicContentDir)) fs.rmSync(publicContentDir, { recursive: true, force: true });
  
  if (!fs.existsSync(path.join(process.cwd(), "public"))) {
    fs.mkdirSync(path.join(process.cwd(), "public"));
  }

  // Copy only essential top-level data files (blobs + config files)
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

  // Recursive copy helper (used only for content articles)
  function copyRecursiveSync(src: string, dest: string) {
    if (!fs.existsSync(src)) return;
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      fs.readdirSync(src).forEach((child) => {
        copyRecursiveSync(path.join(src, child), path.join(dest, child));
      });
    } else {
      fs.copyFileSync(src, dest);
    }
  }

  // Copy content/tokens for article serving on Edge
  const contentTokensDir = path.join(process.cwd(), "content", "tokens");
  if (fs.existsSync(contentTokensDir)) {
    copyRecursiveSync(contentTokensDir, path.join(publicContentDir, "tokens"));
  }

  const publicFileCount = essentialDataFiles.length;
  console.log(`✅ Copied ${publicFileCount} essential data files + content articles to public folder!`);
}

consolidate().catch(err => {
  console.error(err);
  process.exit(1);
});

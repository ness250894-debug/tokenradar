/**
 * Publish from Queue — TokenRadar
 * 
 * Consumes AI-generated article templates from data/queue, injects 
 * fresh live market data into placeholders, and moves them to 
 * the production content/tokens directory.
 * 
 * Usage:
 *   npx tsx scripts/publish-from-queue.ts --max 15
 */

import * as fs from "fs";
import * as path from "path";
import { loadEnv, safeReadJson, ensureDirSync } from "../src/lib/utils";
import { fetchFullTokenData, fetchGlobalMarketData, searchGeckoTerminalPools } from "../src/lib/coingecko";
import { logActivity, logError } from "../src/lib/reporter";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(process.cwd(), "data");
const QUEUE_DIR = path.join(DATA_DIR, "queue");
const CONTENT_DIR = path.resolve(process.cwd(), "content/tokens");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");

/**
 * Format currency values for display.
 */
function formatCurrency(val: number): string {
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1) return `$${val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return `$${val.toFixed(8)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const maxIdx = args.indexOf("--max");
  const maxToProcess = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 15;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Queue Publisher            ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  if (!fs.existsSync(QUEUE_DIR)) {
    console.log("  ∅ Queue directory not found. Nothing to publish.");
    return;
  }

  const queueItems = fs.readdirSync(QUEUE_DIR).filter(d => 
    fs.statSync(path.join(QUEUE_DIR, d)).isDirectory()
  );

  if (queueItems.length === 0) {
    console.log("  ∅ Queue is empty.");
    return;
  }

  console.log(`  ✦ Found ${queueItems.length} tokens in queue.`);
  console.log(`  ✦ Processing limit: ${maxToProcess}`);
  console.log();

  // Fetch Global Context once per run
  console.log("▶ Step 1: Fetching Global Market Context...");
  let globalStats = { mcap: "N/A", btcDom: "N/A" };
  try {
    const globalData = await fetchGlobalMarketData();
    if (globalData) {
      const mcapUSD = globalData.total_market_cap?.usd || 0;
      const btcDom = globalData.market_cap_percentage?.btc || 0;
      globalStats.mcap = formatCurrency(mcapUSD);
      globalStats.btcDom = `${btcDom.toFixed(1)}%`;
      console.log(`  ✓ Global Cap: ${globalStats.mcap} | BTC Dom: ${globalStats.btcDom}`);
    }
  } catch (err) {
    console.warn("  ⚠ Failed to fetch global context. Placeholders in text might remain generic.");
  }

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric"
  });

  const upcomingTges = safeReadJson<any[]>(TGE_FILE, []);
  let processedCount = 0;

  for (const tokenId of queueItems) {
    if (processedCount >= maxToProcess) break;

    console.log(`▶ [${processedCount + 1}/${maxToProcess}] Publishing: ${tokenId}...`);

    const tokenQueueDir = path.join(QUEUE_DIR, tokenId);
    const tokenFiles = fs.readdirSync(tokenQueueDir).filter(f => f.endsWith(".json"));

    if (tokenFiles.length === 0) {
      console.warn(`  ⚠ Empty folder for ${tokenId}. Cleaning up.`);
      fs.rmSync(tokenQueueDir, { recursive: true, force: true });
      continue;
    }

    // Fetch fresh market data for this token
    let liveData: any = null;
    try {
      // Check if it's a TGE project (unreleased)
      const tgeEntry = upcomingTges.find(t => t.id === tokenId);
      const isUnreleased = tgeEntry && tgeEntry.status !== "released";

      if (isUnreleased) {
        process.stdout.write(`  [DEX SYNC] Fetching GeckoTerminal data... `);
        const pools = await searchGeckoTerminalPools(tgeEntry.symbol || tokenId);
        if (pools.length > 0) {
          const p = pools[0];
          liveData = {
            price: p.priceUsd,
            marketCap: p.fdvUsd, // Use FDV as proxy for unreleased
            rank: "TBA",
            change24h: p.priceChange24h
          };
          console.log("✓ Done");
        } else {
          console.log("✗ No pools found");
        }
      } else {
        process.stdout.write(`  [CG SYNC] Fetching CoinGecko data... `);
        const fullData = await fetchFullTokenData(tokenId);
        liveData = {
          price: fullData.market.price,
          marketCap: fullData.market.marketCap,
          rank: `#${fullData.market.marketCapRank}`,
          change24h: fullData.market.priceChange24h
        };
        console.log("✓ Done");
      }
    } catch (err) {
      console.log(`✗ Failed: ${err instanceof Error ? err.message : String(err)}`);
      // We still try to publish if we have fallback data or just skip it
    }

    if (!liveData) {
      console.warn(`  ⚠ Skipping ${tokenId}: Could not fetch live market data.`);
      continue;
    }

    const replacements: Record<string, string> = {
      "{{LIVE_PRICE}}": formatCurrency(liveData.price),
      "{{LIVE_MARKET_CAP}}": formatCurrency(liveData.marketCap),
      "{{LIVE_RANK}}": String(liveData.rank),
      "{{LIVE_DATE}}": today,
      "{{LIVE_24H_CHANGE}}": `${liveData.change24h >= 0 ? "+" : ""}${liveData.change24h.toFixed(2)}%`,
      "{{GLOBAL_MCAP}}": globalStats.mcap,
      "{{BTC_DOM}}": globalStats.btcDom,
    };

    const targetDir = path.join(CONTENT_DIR, tokenId);
    ensureDirSync(targetDir);

    let tokenArticleCount = 0;
    for (const file of tokenFiles) {
      const filePath = path.join(tokenQueueDir, file);
      const article = safeReadJson<any>(filePath, null);
      if (!article) continue;

      // Replace placeholders in title and content
      let finalContent = article.content || "";
      let finalTitle = article.title || "";

      for (const [tag, val] of Object.entries(replacements)) {
        finalContent = finalContent.split(tag).join(val);
        finalTitle = finalTitle.split(tag).join(val);
      }

      // Update generation timestamp to now
      article.content = finalContent;
      article.title = finalTitle;
      article.generatedAt = new Date().toISOString();

      const targetPath = path.join(targetDir, file);
      fs.writeFileSync(targetPath, JSON.stringify(article, null, 2));
      tokenArticleCount++;
    }

    console.log(`  ✓ Published ${tokenArticleCount} articles to ${targetDir}`);
    
    // Cleanup queue
    fs.rmSync(tokenQueueDir, { recursive: true, force: true });
    
    logActivity("publish-from-queue", {
      tokenId,
      articles: tokenArticleCount,
      price: liveData.price
    });

    processedCount++;
  }

  console.log();
  console.log(`✅ Success! Published ${processedCount} tokens from queue.`);
}

main().catch(async (err) => {
  await logError("publish-from-queue", err);
  process.exit(1);
});

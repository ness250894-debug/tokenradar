/**
 * TokenRadar — Detailed Data Fetcher
 *
 * This script populates the /data/tokens directory with detailed information
 * from CoinGecko.
 *
 * Modes:
 * 1. Default: Fetches full details including charts for every token in range (Heavy).
 * 2. --lite: Fetches only market data (price, cap, volume) for all tokens (Fast/Cheap).
 *
 * Usage:
 *   npx tsx scripts/fetch-crypto-data.ts --start 1 --end 100 [--lite]
 *   npx tsx scripts/fetch-crypto-data.ts --token bitcoin
 */

import * as fs from "fs";
import * as path from "path";
import { fetchTokensByRank, fetchFullTokenData, CoinGeckoToken } from "../src/lib/coingecko";
import { logError } from "../src/lib/reporter";
import { safeReadJson, loadEnv, ensureDirSync } from "../src/lib/utils";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");

// Ensure directories exist
ensureDirSync(TOKENS_DIR);

async function main() {
  const args = process.argv.slice(2);
  const start = parseInt(args[args.indexOf("--start") + 1] || "1", 10);
  const end = parseInt(args[args.indexOf("--end") + 1] || "100", 10);
  const tokenArg = args.indexOf("--token") !== -1 ? args[args.indexOf("--token") + 1] : null;
  const lite = args.includes("--lite");

  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  TokenRadar — Detailed Data Fetcher      ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();
  if (tokenArg) {
    console.log(`  Target:  Single Token (${tokenArg})`);
  } else {
    console.log(`  Range:   #${start} — #${end}`);
  }
  console.log(`  Mode:    ${lite ? "LITE (Prices Only)" : "FULL (Details + Charts)"}`);
  console.log();

  let liteTokens: CoinGeckoToken[] = [];

  if (tokenArg) {
    // If single token, we just create a dummy lite token to reuse the processing loop
    liteTokens = [{ id: tokenArg, symbol: "", name: "", market_cap_rank: 0 } as any];
  } else {
    // 1. Fetch top tokens by rank (Lite data for all)
    liteTokens = await fetchTokensByRank(start, end);
    console.log(` ✓ Found ${liteTokens.length} tokens in range.`);
  }

  // 2. Process each token
  for (let i = 0; i < liteTokens.length; i++) {
    const t = liteTokens[i];
    const percentage = Math.round(((i + 1) / liteTokens.length) * 100);
    const tokenFile = path.join(TOKENS_DIR, `${t.id}.json`);

    process.stdout.write(`  [${percentage}%] #${t.market_cap_rank} ${t.name} (${t.id}) [${lite ? 'LITE' : 'FULL'}]... `);

    try {
      if (lite) {
        // LITE MODE: Update market data only
        const existing = safeReadJson<Record<string, any>>(tokenFile, {});

        const liteData = {
          ...existing, // Keep everything else (description, charts, links if they exist)
          id: t.id,
          symbol: t.symbol,
          name: t.name,
          market: {
            // Priority: merge fresh lite data into existing structure
            ...(existing.market || {}),
            price: t.current_price,
            marketCap: t.market_cap,
            marketCapRank: t.market_cap_rank,
            volume24h: t.total_volume,
            priceChange24h: t.price_change_percentage_24h,
            ath: t.ath,
            athChangePercentage: t.ath_change_percentage,
            athDate: t.ath_date,
            atl: t.atl,
            atlDate: t.atl_date,
            circulatingSupply: t.circulating_supply,
            totalSupply: t.total_supply,
            maxSupply: t.max_supply,
          },
          lastMarketUpdate: new Date().toISOString(),
        };

        fs.writeFileSync(tokenFile, JSON.stringify(liteData, null, 2));
        console.log("✓ Updated");
      } else {
        // FULL MODE: Fetch everything (Details + Charts)
        if (!t.id) {
          console.log("✗ Skipped: Missing ID");
          continue;
        }
        const fullData = await fetchFullTokenData(t.id);
        
        // Split charts into separate files for getPriceHistory logic
        const { chart30d, chart1y, ...detailOnly } = fullData;
        
        const PRICES_DIR = path.join(DATA_DIR, "prices");
        ensureDirSync(PRICES_DIR);

        fs.writeFileSync(
          path.join(PRICES_DIR, `${t.id}.json`),
          JSON.stringify({
            id: t.id,
            name: t.name,
            chart30d: chart30d?.prices?.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [],
            chart1y: chart1y?.prices?.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [],
            fetchedAt: new Date().toISOString()
          }, null, 2)
        );

        fs.writeFileSync(tokenFile, JSON.stringify(detailOnly, null, 2));
        console.log("✓ Saved (incl. prices)");
      }
    } catch (error) {
      console.log(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      await logError("fetch-crypto-data", error, false);
    }
  }

  // 3. Update master tokens.json (summary for grid/search)
  const allFiles = fs.readdirSync(TOKENS_DIR).filter(f => f.endsWith(".json"));
  const tokensSummary = allFiles
    .map(f => {
      const data = safeReadJson<any>(path.join(TOKENS_DIR, f), null);
      if (!data || !data.id) return null;
      return {
        id: data.id,
        symbol: data.symbol,
        name: data.name,
        market: data.market,
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.market?.marketCapRank || 9999) - (b.market?.marketCapRank || 9999));

  fs.writeFileSync(path.join(DATA_DIR, "tokens.json"), JSON.stringify(tokensSummary, null, 2));

  console.log();
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  Sync Complete — Data directory updated  ║`);
  console.log(`╚══════════════════════════════════════════╝`);
}

main().catch(async (error) => {
  await logError("fetch-crypto-data", error);
  process.exit(1);
});

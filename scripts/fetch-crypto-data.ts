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
import { logError, logActivity } from "../src/lib/reporter";
import { safeReadJson, loadEnv, ensureDirSync } from "../src/lib/utils";
import {
  mergeTokenRecordWithNewestMarketSnapshot,
  newestValidObservationTimestamp,
  normalizeObservedPricePoints,
  resolveProviderMarketTimestamp,
} from "../src/lib/market-data-quality";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const PRICES_DIR = path.join(DATA_DIR, "prices");

type LiteMarketToken = CoinGeckoToken & {
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
  price_change_percentage_1y_in_currency?: number | null;
  fully_diluted_valuation?: number | null;
  high_24h?: number | null;
  low_24h?: number | null;
};

// Ensure directories exist
ensureDirSync(TOKENS_DIR);

function getNumericArg(args: string[], name: string, fallback: number): number {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const parsed = parseInt(args[index + 1] || "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function priceHistoryAgeMs(tokenId: string): number {
  const priceFile = path.join(PRICES_DIR, `${tokenId}.json`);
  try {
    return Date.now() - fs.statSync(priceFile).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

async function writeFullTokenData(tokenId: string): Promise<void> {
  const fullData = await fetchFullTokenData(tokenId);
  const { chart30d, chart1y, ...detailOnly } = fullData;
  const tokenFile = path.join(TOKENS_DIR, `${tokenId}.json`);
  const existing = safeReadJson<Record<string, unknown>>(tokenFile, {});
  const mergedDetail = mergeTokenRecordWithNewestMarketSnapshot(existing, detailOnly);
  const normalizedChart30d = normalizeObservedPricePoints(chart30d?.prices);
  const normalizedChart1y = normalizeObservedPricePoints(chart1y?.prices);

  ensureDirSync(PRICES_DIR);

  fs.writeFileSync(
    path.join(PRICES_DIR, `${tokenId}.json`),
    JSON.stringify({
      id: detailOnly.id,
      name: detailOnly.name,
      chart30d: normalizedChart30d,
      chart1y: normalizedChart1y,
      priceHistoryAsOf: newestValidObservationTimestamp(
        normalizedChart30d.map((point) => point.date),
      ),
      fetchedAt: new Date().toISOString()
    }, null, 2)
  );

  fs.writeFileSync(tokenFile, JSON.stringify(mergedDetail, null, 2));
}

async function main() {
  const args = process.argv.slice(2);
  const start = getNumericArg(args, "--start", 1);
  const end = getNumericArg(args, "--end", 100);
  const tokenArg = args.indexOf("--token") !== -1 ? args[args.indexOf("--token") + 1] : null;
  const lite = args.includes("--lite");
  const bypassCache = args.includes("--bypass-cache");
  const cacheTtlMinutes = getNumericArg(args, "--cache-ttl-minutes", 120);
  const fullRefreshLimit = getNumericArg(args, "--full-refresh-limit", 0);
  const fullRefreshMaxAgeDays = getNumericArg(args, "--full-refresh-max-age-days", 7);

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
    liteTokens = await fetchTokensByRank(start, end, {
      bypassCache,
      cacheTtlMs: Math.max(0, cacheTtlMinutes) * 60 * 1000,
    });
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
        const marketToken = t as LiteMarketToken;
        const existingMarket = existing.market || {};

        const providerSnapshotAt = resolveProviderMarketTimestamp(t.last_updated);
        const liteData = mergeTokenRecordWithNewestMarketSnapshot(existing, {
          id: t.id,
          symbol: t.symbol,
          name: t.name,
          market: {
            // Priority: merge fresh lite data into existing structure
            ...existingMarket,
            price: t.current_price ?? existingMarket.price ?? 0,
            marketCap: t.market_cap ?? existingMarket.marketCap ?? 0,
            marketCapRank: t.market_cap_rank ?? existingMarket.marketCapRank ?? 9999,
            volume24h: t.total_volume ?? existingMarket.volume24h ?? 0,
            high24h: marketToken.high_24h ?? existingMarket.high24h ?? 0,
            low24h: marketToken.low_24h ?? existingMarket.low24h ?? 0,
            priceChange24h: t.price_change_percentage_24h ?? existingMarket.priceChange24h ?? 0,
            priceChange7d: marketToken.price_change_percentage_7d_in_currency ?? existingMarket.priceChange7d ?? 0,
            priceChange30d: marketToken.price_change_percentage_30d_in_currency ?? existingMarket.priceChange30d ?? 0,
            priceChange1y: marketToken.price_change_percentage_1y_in_currency ?? existingMarket.priceChange1y ?? 0,
            ath: t.ath ?? existingMarket.ath ?? 0,
            athChangePercentage: t.ath_change_percentage ?? existingMarket.athChangePercentage ?? 0,
            athDate: t.ath_date ?? existingMarket.athDate ?? "",
            atl: t.atl ?? existingMarket.atl ?? 0,
            atlDate: t.atl_date ?? existingMarket.atlDate ?? "",
            circulatingSupply: t.circulating_supply ?? existingMarket.circulatingSupply ?? 0,
            totalSupply: t.total_supply ?? existingMarket.totalSupply ?? null,
            maxSupply: t.max_supply ?? existingMarket.maxSupply ?? null,
            fdv: marketToken.fully_diluted_valuation ?? existingMarket.fdv ?? null,
          },
          // Preserve the provider's observation time. A cached response must
          // never be relabeled as if its market values were fetched just now.
          lastMarketUpdate: providerSnapshotAt,
        });

        fs.writeFileSync(tokenFile, JSON.stringify(liteData, null, 2));
        console.log("✓ Updated");
      } else {
        // FULL MODE: Fetch everything (Details + Charts)
        if (!t.id) {
          console.log("✗ Skipped: Missing ID");
          continue;
        }
        await writeFullTokenData(t.id);
        console.log("✓ Saved (incl. prices)");
      }
    } catch (error) {
      console.log(`✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      await logError("fetch-crypto-data", error, false);
    }
  }

  if (lite && fullRefreshLimit > 0) {
    const maxAgeMs = fullRefreshMaxAgeDays * 24 * 60 * 60 * 1000;
    const stalePriceTokens = liteTokens
      .filter((token): token is CoinGeckoToken & { id: string } =>
        typeof token.id === "string" &&
        token.id.length > 0 &&
        priceHistoryAgeMs(token.id) > maxAgeMs
      )
      .sort((a, b) => priceHistoryAgeMs(b.id) - priceHistoryAgeMs(a.id))
      .slice(0, fullRefreshLimit);

    console.log();
    console.log(`  Rolling full refresh: ${stalePriceTokens.length}/${fullRefreshLimit} stale price histories`);

    for (const token of stalePriceTokens) {
      process.stdout.write(`  [FULL] #${token.market_cap_rank} ${token.name} (${token.id})... `);
      try {
        await writeFullTokenData(token.id);
        console.log("Saved (incl. prices)");
      } catch (error) {
        console.log(`Failed: ${error instanceof Error ? error.message : String(error)}`);
        await logError("fetch-crypto-data-full-refresh", error, false);
      }
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
  
  // Log activity for system report
  await logActivity("data-refresh", { tokenCount: tokensSummary.length });

  console.log();
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║  Sync Complete — Data directory updated  ║`);
  console.log(`╚══════════════════════════════════════════╝`);
}

main().catch(async (error) => {
  await logError("fetch-crypto-data", error);
  process.exit(1);
});

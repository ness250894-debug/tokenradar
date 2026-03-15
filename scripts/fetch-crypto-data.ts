/**
 * Detailed Token Data Fetcher — Phase 2
 *
 * Fetches comprehensive data for each token from CoinGecko:
 * - Detailed coin info (description, categories, links)
 * - 30-day and 1-year price history
 * - Stores per-token JSON files in data/tokens/ and data/prices/
 *
 * Usage:
 *   npx tsx scripts/fetch-crypto-data.ts
 *   npx tsx scripts/fetch-crypto-data.ts --start 50 --end 100
 *
 * Cost: $0 (CoinGecko free tier)
 */

import * as fs from "fs";
import * as path from "path";
import { fetchCoinGecko, fetchTokensByRank } from "../src/lib/coingecko";

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const PRICES_DIR = path.join(DATA_DIR, "prices");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

// ── Types ──────────────────────────────────────────────────────

interface CoinDetail {
  id: string;
  symbol: string;
  name: string;
  description: { en: string };
  links: {
    homepage: string[];
    blockchain_site: string[];
    official_forum_url: string[];
    subreddit_url: string;
    repos_url: { github: string[]; bitbucket: string[] };
  };
  categories: string[];
  genesis_date: string | null;
  market_cap_rank: number | null;
  market_data: {
    current_price: { usd: number };
    market_cap: { usd: number };
    total_volume: { usd: number };
    high_24h: { usd: number };
    low_24h: { usd: number };
    price_change_percentage_24h: number;
    price_change_percentage_7d: number;
    price_change_percentage_30d: number;
    price_change_percentage_1y: number;
    ath: { usd: number };
    ath_change_percentage: { usd: number };
    ath_date: { usd: string };
    atl: { usd: number };
    atl_date: { usd: string };
    circulating_supply: number;
    total_supply: number | null;
    max_supply: number | null;
    fully_diluted_valuation: { usd: number | null };
  };
  community_data: {
    twitter_followers: number | null;
    reddit_subscribers: number | null;
    reddit_average_posts_48h: number | null;
  };
  developer_data: {
    stars: number | null;
    forks: number | null;
    subscribers: number | null;
    total_issues: number | null;
    closed_issues: number | null;
    commit_count_4_weeks: number | null;
  };
}

interface MarketChartData {
  prices: [number, number][];
  market_caps: [number, number][];
  total_volumes: [number, number][];
}

export interface TokenDetailData {
  id: string;
  symbol: string;
  name: string;
  description: string;
  categories: string[];
  genesisDate: string | null;
  links: {
    website: string | null;
    github: string | null;
    reddit: string | null;
    explorer: string | null;
  };
  market: {
    price: number;
    marketCap: number;
    marketCapRank: number;
    volume24h: number;
    high24h: number;
    low24h: number;
    priceChange24h: number;
    priceChange7d: number;
    priceChange30d: number;
    priceChange1y: number;
    ath: number;
    athChangePercentage: number;
    athDate: string;
    atl: number;
    atlDate: string;
    circulatingSupply: number;
    totalSupply: number | null;
    maxSupply: number | null;
    fdv: number | null;
  };
  community: {
    twitterFollowers: number | null;
    redditSubscribers: number | null;
  };
  developer: {
    githubStars: number | null;
    githubForks: number | null;
    commits4Weeks: number | null;
  };
  fetchedAt: string;
}

// ── Utilities ──────────────────────────────────────────────────

function ensureDirs(): void {
  for (const dir of [DATA_DIR, TOKENS_DIR, PRICES_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

function truncateDescription(html: string, maxLength: number = 500): string {
  // Strip HTML tags and truncate
  const text = html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).replace(/\s+\S*$/, "") + "...";
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const startRank = args.includes("--start") ? parseInt(args[args.indexOf("--start") + 1], 10) : 1;
  const endRank = args.includes("--end") ? parseInt(args[args.indexOf("--end") + 1], 10) : 100;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Detailed Data Fetcher      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Sync range: #${startRank} — #${endRank}`);
  console.log();

  ensureDirs();

  // Step 1: Fetch Top 250 market data (1 API call)
  console.log("▶ Step 1: Fetching Top 250 global market data for Sidebars...");
  const globalTokens = await fetchTokensByRank(1, 250);
  fs.writeFileSync(TOKENS_FILE, JSON.stringify(globalTokens, null, 2));
  console.log(` ✓ Saved 250 tokens to tokens.json\n`);

  // Step 2: Sync individual data files
  console.log(`▶ Step 2: Syncing individual token data (Details/Charts for #${startRank}-#${endRank})...`);
  
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < globalTokens.length; i++) {
    const token = globalTokens[i];
    const { id, name, market_cap_rank: rank } = token;
    const isTargetRange = rank >= startRank && rank <= endRank;
    const pct = Math.round(((i + 1) / globalTokens.length) * 100);

    try {
      if (!isTargetRange) {
        // LITE SYNC (Just save market data from the list call)
        const liteData: TokenDetailData = {
          id: token.id,
          symbol: token.symbol,
          name: token.name,
          description: "", 
          categories: [],
          genesisDate: null,
          links: { website: null, github: null, reddit: null, explorer: null },
          market: {
            price: token.current_price,
            marketCap: token.market_cap,
            marketCapRank: token.market_cap_rank,
            volume24h: token.total_volume,
            high24h: 0,
            low24h: 0,
            priceChange24h: token.price_change_percentage_24h,
            priceChange7d: 0,
            priceChange30d: 0,
            priceChange1y: 0,
            ath: token.ath,
            athChangePercentage: token.ath_change_percentage,
            athDate: token.ath_date,
            atl: token.atl,
            atlDate: token.atl_date,
            circulatingSupply: token.circulating_supply,
            totalSupply: token.total_supply,
            maxSupply: token.max_supply,
            fdv: null,
          },
          community: { twitterFollowers: null, redditSubscribers: null },
          developer: { githubStars: null, githubForks: null, commits4Weeks: null },
          fetchedAt: new Date().toISOString(),
        };

        const filePath = path.join(TOKENS_DIR, `${id}.json`);
        if (fs.existsSync(filePath)) {
          const existing = JSON.parse(fs.readFileSync(filePath, "utf-8")) as TokenDetailData;
          liteData.description = existing.description || "";
          liteData.categories = existing.categories || [];
          liteData.links = existing.links || liteData.links;
        }

        fs.writeFileSync(filePath, JSON.stringify(liteData, null, 2));
        continue; 
      }

      process.stdout.write(`  [${pct}%] #${rank} ${name} (${id}) [FULL+AI]...`);

      // Fetch detailed coin info
      const detail = await fetchCoinGecko<CoinDetail>(
        `/coins/${id}`,
        {
          localization: "false",
          tickers: "false",
          market_data: "true",
          community_data: "true",
          developer_data: "true",
        },
        `coin-detail-${id}`,
        24 * 60 * 60 * 1000 // 24h cache
      );

      // Fetch 30-day price history
      const chart30d = await fetchCoinGecko<MarketChartData>(
        `/coins/${id}/market_chart`,
        {
          vs_currency: "usd",
          days: "30",
          interval: "daily",
        },
        `chart-30d-${id}`,
        12 * 60 * 60 * 1000 // 12h cache
      );

      // Fetch 365-day price history
      const chart1y = await fetchCoinGecko<MarketChartData>(
        `/coins/${id}/market_chart`,
        {
          vs_currency: "usd",
          days: "365",
          interval: "daily",
        },
        `chart-1y-${id}`,
        24 * 60 * 60 * 1000 // 24h cache
      );

      // Transform into clean format
      const tokenData: TokenDetailData = {
        id: detail.id,
        symbol: detail.symbol,
        name: detail.name,
        description: truncateDescription(detail.description?.en || ""),
        categories: detail.categories?.filter(Boolean) || [],
        genesisDate: detail.genesis_date,
        links: {
          website: detail.links?.homepage?.[0] || null,
          github: detail.links?.repos_url?.github?.[0] || null,
          reddit: detail.links?.subreddit_url || null,
          explorer: detail.links?.blockchain_site?.[0] || null,
        },
        market: {
          price: detail.market_data?.current_price?.usd ?? 0,
          marketCap: detail.market_data?.market_cap?.usd ?? 0,
          marketCapRank: detail.market_cap_rank ?? 999,
          volume24h: detail.market_data?.total_volume?.usd ?? 0,
          high24h: detail.market_data?.high_24h?.usd ?? 0,
          low24h: detail.market_data?.low_24h?.usd ?? 0,
          priceChange24h: detail.market_data?.price_change_percentage_24h ?? 0,
          priceChange7d: detail.market_data?.price_change_percentage_7d ?? 0,
          priceChange30d: detail.market_data?.price_change_percentage_30d ?? 0,
          priceChange1y: detail.market_data?.price_change_percentage_1y ?? 0,
          ath: detail.market_data?.ath?.usd ?? 0,
          athChangePercentage: detail.market_data?.ath_change_percentage?.usd ?? 0,
          athDate: detail.market_data?.ath_date?.usd ?? "",
          atl: detail.market_data?.atl?.usd ?? 0,
          atlDate: detail.market_data?.atl_date?.usd ?? "",
          circulatingSupply: detail.market_data?.circulating_supply ?? 0,
          totalSupply: detail.market_data?.total_supply ?? null,
          maxSupply: detail.market_data?.max_supply ?? null,
          fdv: detail.market_data?.fully_diluted_valuation?.usd ?? null,
        },
        community: {
          twitterFollowers: detail.community_data?.twitter_followers ?? null,
          redditSubscribers: detail.community_data?.reddit_subscribers ?? null,
        },
        developer: {
          githubStars: detail.developer_data?.stars ?? null,
          githubForks: detail.developer_data?.forks ?? null,
          commits4Weeks: detail.developer_data?.commit_count_4_weeks ?? null,
        },
        fetchedAt: new Date().toISOString(),
      };

      // Save token detail
      fs.writeFileSync(
        path.join(TOKENS_DIR, `${id}.json`),
        JSON.stringify(tokenData, null, 2)
      );

      // Save price history
      fs.writeFileSync(
        path.join(PRICES_DIR, `${id}.json`),
        JSON.stringify(
          {
            id,
            name,
            chart30d: chart30d.prices.map(([ts, price]) => ({
              date: new Date(ts).toISOString().split("T")[0],
              price,
            })),
            chart1y: chart1y.prices.map(([ts, price]) => ({
              date: new Date(ts).toISOString().split("T")[0],
              price,
            })),
            volumes30d: chart30d.total_volumes.map(([ts, vol]) => ({
              date: new Date(ts).toISOString().split("T")[0],
              volume: vol,
            })),
            fetchedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );

      successCount++;
      console.log(" ✓");
    } catch (error) {
      errorCount++;
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ✗ ${msg}`);

      // If monthly limit hit, stop entirely
      if (msg.includes("Monthly CoinGecko API limit")) {
        console.error("\n  ⚠ Monthly API limit reached. Stopping.");
        break;
      }
    }
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║           Data Fetch Complete            ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Success:   ${String(successCount).padStart(6)}                 ║`);
  console.log(`║  Errors:    ${String(errorCount).padStart(6)}                 ║`);
  console.log(`║  Token dir: data/tokens/                 ║`);
  console.log(`║  Price dir: data/prices/                 ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error("\n✖ Fatal error:", error);
  process.exit(1);
});

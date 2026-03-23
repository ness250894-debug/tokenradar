/**
 * TGE Discovery Script
 *
 * Scans RSS feeds for upcoming Token Generation Events (TGE),
 * uses AI to identify high-quality projects, and maintains
 * a registry of upcoming launches.
 *
 * Failsafe: If RSS feeds fail or AI is unavailable, existing
 * data is preserved. The script never destroys data on error.
 *
 * Usage:
 *   npx tsx scripts/discover-tges.ts
 */

import * as fs from "fs";
import * as path from "path";
import Parser from "rss-parser";
import { callAIWithFallback } from "../src/lib/gemini";
import { sleep } from "../src/lib/utils";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");

/** RSS feed timeout in milliseconds. */
const RSS_TIMEOUT_MS = 15_000;

/** Maximum news items to send to AI (controls token usage). */
const MAX_NEWS_ITEMS = 20;

const RSS_FEEDS = [
  "https://cointelegraph.com/rss",
  "https://airdropalert.com/feed/",
  "https://icowatchlist.com/blog/feed",  // Free — ICO/IDO/IEO focused
  "https://foundico.com/blog/feed",      // Free — upcoming ICO lists
];

interface UpcomingTge {
  id: string;
  name: string;
  symbol: string;
  category: string;
  expectedTge: string;
  narrativeStrength: number;
  dataSource: string;
  discoveredAt: string;
}

const parser = new Parser({
  timeout: RSS_TIMEOUT_MS,
});

/**
 * Analyze news items with AI to extract upcoming TGEs.
 * Returns [] on any failure (never throws).
 */
async function analyzeNewsWithAI(newsItems: Record<string, unknown>[]): Promise<UpcomingTge[]> {
  if (newsItems.length === 0) {
    console.log("  ⚠ No news items to analyze. Skipping AI call.");
    return [];
  }

  // Limit news items to control token usage and stay within Gemini free tier
  const limitedItems = newsItems.slice(0, MAX_NEWS_ITEMS);
  console.log(`  📰 Analyzing ${limitedItems.length} news items (capped from ${newsItems.length})...`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newsContext = limitedItems.map((item: any) =>
    `Title: ${item.title}\nSnippet: ${(item.contentSnippet || item.content || "").substring(0, 200)}\nSource: ${item.link}`
  ).join("\n---\n");

  const prompt = `You are a crypto research analyst. Analyze these news items and identify any crypto projects that show STRONG PRE-LAUNCH SIGNALS.

Look for ALL of the following indicators:
1. **Upcoming TGE / ICO / IDO / IEO** — Explicit announcements of token sales or generation events
2. **Major funding rounds** — "Project X raises $50M Series A" signals an upcoming token
3. **Testnet / Mainnet launches** — Projects launching testnets often follow with a TGE within months
4. **Airdrop announcements** — Confirmed airdrops often accompany or precede a token launch
5. **Token migration / Rebranding** — Existing projects launching a new or replacement token
6. **Exchange listing announcements** — First-time listings for new tokens

QUALITY FILTER:
- Only include HIGH QUALITY, VC-backed, or highly anticipated projects
- Ignore low-quality degen/meme tokens
- Minimum narrative strength of 50 to be included

Return a JSON array of objects with:
{
  "id": "kebab-case-id",
  "name": "Project Name",
  "symbol": "SYMBOL",
  "category": "L1/L2/DeFi/AI/Gaming/Infrastructure/etc",
  "expectedTge": "Rough date or stage (e.g., Q2 2026, Testnet, Funding Stage)",
  "narrativeStrength": 1-100 (score based on hype/investors/community buzz),
  "dataSource": "Link to the source news article"
}

If no high-quality projects found, return [].

News Items:
${newsContext}`;

  try {
    const result = await callAIWithFallback("", prompt, 2048);
    const text = result.content;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn("  ⚠ AI returned no parseable JSON array.");
      return [];
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      console.warn("  ⚠ AI returned non-array JSON.");
      return [];
    }
    return parsed;
  } catch (e) {
    console.error("  ✗ AI Analysis failed:", e instanceof Error ? e.message : String(e));
    return [];
  }
}

/**
 * Check if a TGE has "graduated" (is now trading on CoinGecko).
 * Returns false on any error (safe default: keep the entry).
 */
async function checkGraduation(tge: UpcomingTge): Promise<boolean> {
  try {
    const apiKey = process.env.COINGECKO_API_KEY;
    const url = apiKey
      ? `https://pro-api.coingecko.com/api/v3/coins/${tge.id}?x_cg_pro_api_key=${apiKey}`
      : `https://api.coingecko.com/api/v3/coins/${tge.id}`;

    const res = await fetch(url);
    if (res.status === 200) {
      const data = await res.json();
      return !!data.market_data?.current_price?.usd;
    }
  } catch (e) {
    // On error, assume not graduated (safe: keep the entry)
    console.warn(`  ⚠ Graduation check failed for ${tge.id} (keeping entry): ${e instanceof Error ? e.message : String(e)}`);
  }
  return false;
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — TGE Discovery              ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // 1. Load existing data FIRST (failsafe: never lose data)
  let existing: UpcomingTge[] = [];
  if (fs.existsSync(TGE_FILE)) {
    try {
      existing = JSON.parse(fs.readFileSync(TGE_FILE, "utf-8"));
      console.log(`  📂 Loaded ${existing.length} existing TGEs.`);
    } catch (e) {
      console.error("  ✗ Failed to parse existing TGE file. Starting fresh.");
      existing = [];
    }
  }

  // 2. Fetch RSS feeds (with per-feed error isolation)
  let allNews: Record<string, unknown>[] = [];
  let feedsSucceeded = 0;

  for (const url of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      const items = feed.items || [];
      allNews = [...allNews, ...items];
      feedsSucceeded++;
      console.log(`  ✓ ${url} — ${items.length} items`);
    } catch (e) {
      console.warn(`  ⚠ Failed to parse ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`  RSS Result: ${feedsSucceeded}/${RSS_FEEDS.length} feeds OK, ${allNews.length} total items.`);

  if (allNews.length === 0) {
    console.log("  ⚠ No news items fetched. Preserving existing data.");
    console.log(`✅ Kept ${existing.length} existing TGEs (no changes).`);
    return;
  }

  // 3. AI analysis
  const discovered = await analyzeNewsWithAI(allNews);
  console.log(`  ✨ AI identified ${discovered.length} potential TGEs.`);

  // 4. Merge (never remove existing unless graduated)
  const combined = [...existing];
  let newCount = 0;

  for (const item of discovered) {
    if (!item.id || !item.name) continue; // Skip malformed entries
    if (!combined.find(e => e.id === item.id)) {
      combined.push({ ...item, discoveredAt: new Date().toISOString() });
      console.log(`  ➕ New: ${item.name} (${item.symbol})`);
      newCount++;
    }
  }

  // 5. Graduation check (with rate limiting for CoinGecko)
  const active: UpcomingTge[] = [];
  for (const tge of combined) {
    const isGraduated = await checkGraduation(tge);
    if (isGraduated) {
      console.log(`  🎓 ${tge.name} graduated (now trading on CoinGecko).`);
    } else {
      active.push(tge);
    }
    await sleep(500); // Rate limit CoinGecko calls
  }

  // 6. Save
  fs.writeFileSync(TGE_FILE, JSON.stringify(active, null, 2));

  console.log();
  console.log(`  Summary: ${newCount} new, ${combined.length - active.length} graduated, ${active.length} active.`);
  console.log(`✅ Saved ${active.length} upcoming TGEs.`);
}

main().catch((e) => {
  console.error("❌ TGE Discovery failed:", e);
  console.log("  Existing data has been preserved.");
  process.exit(1);
});

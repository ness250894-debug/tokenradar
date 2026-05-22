/**
 * TGE Discovery Script
 *
 * Discovers upcoming Token Generation Events:
 * - Scans RSS feeds (one-by-one, AI analysis in batches)
 *
 * Failsafe: If any data source fails, existing data is preserved.
 *
 * Usage:
 *   npx tsx scripts/discover-tges.ts
 */

import * as fs from "fs";
import * as path from "path";
import Parser from "rss-parser";
import { fetchCoinGecko } from "../src/lib/coingecko";
import { callAIWithFallback } from "../src/lib/gemini";
import { logError } from "../src/lib/reporter";
import { sleep } from "../src/lib/shared-utils";
import {
  createTgeRssReportError,
  formatTgeRssErrorSource,
  isSkippableTgeRssFetchError,
} from "../src/lib/tge-rss-errors";
import {
  hasVerifiedMarketEvidence,
  inferTgeSignalType,
  inferTgeSourceType,
  isGenericTgeSymbol,
  normalizeTge,
  type TgeMarketEvidence,
  type UpcomingTge,
} from "../src/lib/tge";
import { TGE_RSS_FEEDS } from "../src/lib/tge-rss-feeds";
import { formatErrorForLog, loadEnv, safeReadJson } from "../src/lib/utils";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");

/** RSS feed timeout in milliseconds. */
const RSS_TIMEOUT_MS = 15_000;

/** Batch size for AI analysis (controls tokens per call). */
const AI_BATCH_SIZE = 15;

/** Pause between AI batches in milliseconds. */
const AI_BATCH_PAUSE_MS = 5_000;

const parser = new Parser({
  timeout: RSS_TIMEOUT_MS,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "Accept-Language": "en-US,en;q=0.9,ru;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
  }
});

// ── AI Analysis (batched) ──────────────────────────────────

const AI_PROMPT_BASE = `You are a crypto research analyst. Analyze these news items and identify any crypto projects that show STRONG PRE-LAUNCH SIGNALS.

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

DUPLICATE PREVENTION:
- If a project matches one of the EXISTING tracked projects listed below, DO NOT include it again.
- Use the EXACT existing ID if adding updated info for a project we already track.
- Use the project's most common/official name, not article-specific variants.

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
`;

const AI_PROMPT_QUALITY_OVERRIDE = `

STRICT CURRENT POLICY OVERRIDE:
- Do not include funding rounds, product launches, stablecoin integrations, chain upgrades, or enterprise partnerships unless the article explicitly ties them to a token launch, public sale, airdrop, token migration, or first listing.
- Use "candidate" for one weak signal, "watchlist" for one credible non-official signal, and "confirmed_tge" only for official, exchange, airdrop, sale, or migration evidence.
- Return "confidence" as a separate 0-100 evidence-quality score. Narrative strength is market attention, not proof.
- Add a "signals" array. Each signal needs type, sourceType, url, title, and observedAt.
- Valid lifecycleStatus values for new discoveries are: candidate, watchlist, confirmed_tge.
`;

/**
 * Build the full AI prompt, injecting existing project context so the model
 * can avoid creating duplicate entries with different IDs.
 */
function buildAIPrompt(existingTges: UpcomingTge[]): string {
  const existingContext = existingTges
    .map((t) => `  - ${t.id} (${t.symbol}) — ${t.name}`)
    .join("\n");

  return (
    AI_PROMPT_BASE +
    AI_PROMPT_QUALITY_OVERRIDE +
    (existingContext
      ? `\nEXISTING TRACKED PROJECTS (do NOT duplicate):\n${existingContext}\n\n`
      : "") +
    "News Items:\n"
  );
}

/**
 * Analyze news items with AI in batches to stay within rate limits.
 * Returns [] on any failure (never throws).
 */
async function analyzeNewsInBatches(
  newsItems: Record<string, unknown>[],
  existingTges: UpcomingTge[],
): Promise<UpcomingTge[]> {
  if (newsItems.length === 0) return [];

  const allResults: UpcomingTge[] = [];
  const totalBatches = Math.ceil(newsItems.length / AI_BATCH_SIZE);
  const promptTemplate = buildAIPrompt(existingTges);

  console.log(`  📰 Analyzing ${newsItems.length} items in ${totalBatches} batch(es) of ${AI_BATCH_SIZE}...`);

  for (let i = 0; i < totalBatches; i++) {
    const batch = newsItems.slice(i * AI_BATCH_SIZE, (i + 1) * AI_BATCH_SIZE);

    const newsContext = batch.map((item: any) =>
      `Title: ${item.title}\nSnippet: ${(item.contentSnippet || item.content || "").substring(0, 200)}\nSource: ${item.link}`
    ).join("\n---\n");

    const prompt = promptTemplate + newsContext;

    try {
      console.log(`    Batch ${i + 1}/${totalBatches} (${batch.length} items)...`);
      const result = await callAIWithFallback("", prompt, 2048);
      const text = result.content;
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          allResults.push(
            ...parsed
              .filter((t: UpcomingTge) => t.id && t.name)
              .map((t: UpcomingTge) => {
                const primaryUrl = t.dataSource || t.signals?.[0]?.url || "";
                return normalizeTge({
                  ...t,
                  dataSource: primaryUrl,
                  signals: t.signals?.length
                    ? t.signals
                    : primaryUrl
                      ? [{
                          type: inferTgeSignalType({
                            expectedTge: t.expectedTge,
                            category: t.category,
                            url: primaryUrl,
                          }),
                          sourceType: inferTgeSourceType(primaryUrl),
                          url: primaryUrl,
                          observedAt: new Date().toISOString(),
                        }]
                      : [],
                });
              })
          );
        }
      }
    } catch (e) {
      console.warn(`    ⚠ Batch ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`);
      await logError("discover-tges-ai", e, false);
    }

    // Pause between batches (skip after last batch)
    if (i < totalBatches - 1) {
      console.log(`    ⏸ Pausing ${AI_BATCH_PAUSE_MS / 1000}s before next batch...`);
      await sleep(AI_BATCH_PAUSE_MS);
    }
  }

  return allResults;
}

// ── Graduation Check ───────────────────────────────────────

/**
 * Check if a TGE has graduated into a publicly traded asset.
 * Requires an exact local id or CoinGecko id match plus usable market data.
 */
async function checkGraduation(tge: UpcomingTge): Promise<TgeMarketEvidence | null> {
  const localToken = safeReadJson<any>(path.join(TOKENS_DIR, `${tge.id}.json`), null);
  const localMarket = localToken?.market || {};
  const localSymbolMatches =
    isGenericTgeSymbol(tge.symbol) ||
    !localToken?.symbol ||
    String(localToken.symbol).toUpperCase() === String(tge.symbol).toUpperCase();
  const hasLocalMarket =
    localSymbolMatches &&
    (localMarket.price ?? 0) > 0 &&
    ((localMarket.marketCap ?? 0) >= 100_000 || (localMarket.volume24h ?? 0) >= 10_000);

  if (hasLocalMarket) {
    return {
      coingeckoId: localToken?.id || tge.id,
      coingeckoRank: localMarket.marketCapRank || 0,
      rank: localMarket.marketCapRank || 0,
      priceUsd: localMarket.price,
      volume24h: localMarket.volume24h,
      matchedBy: "id",
      verifiedAt: new Date().toISOString(),
    };
  }

  try {
    const data = await fetchCoinGecko<any>(
      `/coins/${tge.id}`,
      {
        localization: "false",
        tickers: "false",
        market_data: "true",
        community_data: "false",
        developer_data: "false",
        sparkline: "false",
      },
      `tge-graduation-${tge.id}`,
      6 * 60 * 60 * 1000
    );
    const symbolMatches =
      isGenericTgeSymbol(tge.symbol) ||
      String(data?.symbol || "").toUpperCase() === String(tge.symbol || "").toUpperCase();
    const evidence: TgeMarketEvidence = {
      coingeckoId: data?.id,
      coingeckoRank: data?.market_cap_rank || 0,
      rank: data?.market_cap_rank || 0,
      priceUsd: data?.market_data?.current_price?.usd,
      volume24h: data?.market_data?.total_volume?.usd,
      matchedBy: "id",
      verifiedAt: new Date().toISOString(),
    };

    if (data?.id === tge.id && symbolMatches && hasVerifiedMarketEvidence(evidence)) {
      return evidence;
    }
  } catch (e) {
    const is404 = e instanceof Error && e.message.includes("404");
    if (!is404) {
      console.warn(`  ⚠ Graduation check failed for ${tge.id} (keeping status): ${e instanceof Error ? e.message : String(e)}`);
      await logError("discover-tges-graduation", e, false);
    } else {
      // 404 is expected for unlaunched tokens
      console.log(`  🕒 ${tge.name} not found on CoinGecko yet (still upcoming).`);
    }
  }
  return null;
}

// ── Main (Waterfall Strategy) ──────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — TGE Discovery (Waterfall)  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // 1. Load existing data FIRST (failsafe: never lose data)
  const existing = safeReadJson<UpcomingTge[]>(TGE_FILE, []).map(normalizeTge);
  console.log(`  📂 Loaded ${existing.length} existing TGEs.`);

  // 2. Scan RSS sources
  const discovered: UpcomingTge[] = [];

  for (const feed of TGE_RSS_FEEDS) {
    console.log(`\\n▶ Source: ${feed.name}`);
    
    try {
      const rssFeed = await parser.parseURL(feed.url);
      const items = rssFeed.items || [];
      console.log(`  ✓ Fetched ${items.length} items.`);

      if (items.length === 0) continue;

      const aiResults = await analyzeNewsInBatches(items as Record<string, unknown>[], [...existing, ...discovered]);
      const newFromFeed = aiResults.filter(d => 
        !existing.find(e => e.id === d.id) && !discovered.find(e => e.id === d.id)
      );

      discovered.push(...newFromFeed);

      if (newFromFeed.length > 0) {
        console.log(`  * ${newFromFeed.length} NEW projects from ${feed.name}. Continuing scan.`);
      } else {
        console.log(`  → No new projects from ${feed.name}. Trying next source...`);
      }
    } catch (e) {
      console.warn(`  ⚠ Failed to fetch ${feed.name} (${feed.url}): ${formatErrorForLog(e)}`);
      if (isSkippableTgeRssFetchError(e)) {
        console.warn("  -> RSS feed returned a definitive client block/unavailable status; skipping system warning.");
        continue;
      }

      await logError(formatTgeRssErrorSource(feed), createTgeRssReportError(feed, e), false);
    }
  }

  // 3. Merge (never remove existing unless graduated)
  //    Dedup by ID, by symbol (case-insensitive), and by source URL path.
  const combined = [...existing];
  let newCount = 0;

  /** Normalize a source URL to its path for comparison (strip query params). */
  const normalizeSource = (url: string): string => {
    try {
      const u = new URL(url);
      return u.hostname + u.pathname;
    } catch {
      return url;
    }
  };

  for (const item of discovered) {
    if (!item.id || !item.name) continue;

    // Check by exact ID
    if (combined.find((e) => e.id === item.id)) continue;

    // Check by symbol (skip generic placeholders)
    const sym = (item.symbol || "").toUpperCase();
    if (sym && !isGenericTgeSymbol(sym) && combined.find((e) => (e.symbol || "").toUpperCase() === sym)) {
      console.log(`  ⏭ Skipping ${item.name} (${item.symbol}) — symbol already tracked.`);
      continue;
    }

    // Check by normalized source URL
    const normSrc = normalizeSource(item.dataSource || "");
    if (normSrc && combined.find((e) => normalizeSource(e.dataSource || "") === normSrc)) {
      console.log(`  ⏭ Skipping ${item.name} — same source URL already tracked.`);
      continue;
    }

    combined.push(normalizeTge({ ...item, discoveredAt: new Date().toISOString(), lastVerifiedAt: new Date().toISOString() }));
    console.log(`  ➕ New: ${item.name} (${item.symbol})`);
    newCount++;
  }

  // 4. Graduation check — mark as released, don't delete (SEO preservation)
  console.log("\n▶ Graduation check...");
  let graduatedCount = 0;
  for (const tge of combined) {
    // Skip already-released tokens
    if (tge.status === "released") continue;

    const graduation = await checkGraduation(tge);
    if (graduation) {
      tge.status = "released";
      tge.lifecycleStatus = "graduated";
      tge.graduatedAt = new Date().toISOString();
      tge.coingeckoRank = graduation.coingeckoRank || 0;
      tge.graduationEvidence = graduation;
      tge.lastVerifiedAt = graduation.verifiedAt;
      graduatedCount++;
      console.log(`  🎓 ${tge.name} graduated (Rank #${graduation.rank}). Marked as released.`);
    } else {
      tge.status = tge.status || "upcoming";
    }
    await sleep(1000);
  }

  // 5. Save
  fs.writeFileSync(TGE_FILE, JSON.stringify(combined, null, 2));

  const upcomingCount = combined.filter(t => t.status !== "released").length;
  const releasedCount = combined.filter(t => t.status === "released").length;
  console.log();
  console.log(`  Summary: ${newCount} new, ${graduatedCount} newly graduated, ${upcomingCount} upcoming, ${releasedCount} released.`);
  console.log(`✅ Saved ${combined.length} total TGEs (${upcomingCount} upcoming + ${releasedCount} released).`);
}

main().catch((e) => {
  console.error("❌ TGE Discovery failed:", e);
  console.log("  Existing data has been preserved.");
  process.exit(1);
});

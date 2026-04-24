/**
 * AI Content Generator — Phase 3
 *
 * Generates SEO-optimized articles using Gemini 3.1 Flash/Pro with Claude Haiku as fallback.
 * Each article uses:
 * - Real CoinGecko data
 * - Computed proprietary metrics (Risk Score, Growth Index, etc.)
 * - Reference article snippets for style/fact reference
 * - Structured prompts with quality rules
 *
 * Usage:
 *   npx tsx scripts/generate-content.ts
 *   npx tsx scripts/generate-content.ts --token injective-protocol
 *   npx tsx scripts/generate-content.ts --type price-prediction
 *   npx tsx scripts/generate-content.ts --dry-run  (preview prompts without calling AI)
 *
 * Cost: ~$0.015 per article depending on primary AI provider
 */

import * as fs from "fs";
import * as path from "path";
import { logError, logActivity } from "../src/lib/reporter";
import { sleep } from "../src/lib/shared-utils";
import { getRelatedTokens, type UpcomingTge, type TokenDetail } from "../src/lib/content-loader";
import { loadEnv, safeReadJson, ensureDirSync } from "../src/lib/utils";
import type { DEXPoolData } from "../src/lib/coingecko";
import { fetchGlobalMarketData, fetchTrendingCategories, fetchFullTokenData, searchGeckoTerminalPools } from "../src/lib/coingecko";

// Load environment
loadEnv();

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const REFERENCES_DIR = path.join(DATA_DIR, "references");
const TGE_FILE = path.join(DATA_DIR, "upcoming-tges.json");
const PRICES_DIR = path.join(DATA_DIR, "prices");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");

// ── Types ──────────────────────────────────────────────────────

interface ArticleConfig {
  type: string;
  title: string;
  slug: string;
  prompt: string;
}

interface GeneratedArticle {
  tokenId: string;
  tokenName: string;
  type: string;
  title: string;
  slug: string;
  content: string;
  wordCount: number;
  generatedAt: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
}

import { callAIWithFallback, AIResult } from "../src/lib/gemini";

// ── Price History Helpers ───────────────────────────────────────

interface PricePoint {
  date: string;
  price: number;
}

/**
 * Load and summarize price history from data/prices/{tokenId}.json.
 * Returns a compact text block with 30d and 1y high/low/avg stats.
 */
async function loadPriceSummary(tokenId: string): Promise<string> {
  const pricesFile = path.join(PRICES_DIR, `${tokenId}.json`);
  const data = safeReadJson<any>(pricesFile, null);
  if (!data) return "";

  try {
    const parts: string[] = [];

    const summarize = (label: string, points: PricePoint[]): string | null => {
      if (!points || points.length === 0) return null;
      const prices = points.map((p) => p.price);
      const high = Math.max(...prices);
      const low = Math.min(...prices);
      const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
      const first = prices[0];
      const last = prices[prices.length - 1];
      const changePct = first > 0 ? (((last - first) / first) * 100).toFixed(2) : "N/A";
      return `${label}: High $${high.toFixed(6)} | Low $${low.toFixed(6)} | Avg $${avg.toFixed(6)} | Change ${changePct}%`;
    };

    const line30d = summarize("30-Day", data.chart30d);
    const line1y = summarize("1-Year", data.chart1y);
    if (line30d) parts.push(line30d);
    if (line1y) parts.push(line1y);

    return parts.length > 0 ? `\nPRICE HISTORY SUMMARY:\n${parts.join("\n")}` : "";
  } catch {
    return "";
  }
}

// ── Prompt Templates ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert crypto analyst writing for TokenRadar.co, a data-driven crypto research platform.

STRICT RULES:
1. Write in a professional, analytical tone. No hype, no FOMO.
2. NEVER recommend buying or selling any token.
3. NEVER guarantee returns or profits.
4. NEVER use phrases like "you should invest", "guaranteed gains", "moonshot".
5. Always present data and analysis objectively.
6. MANDATORY: Use placeholders for ALL live market data to ensure 100% accuracy during daily updates. Use exactly these tags:
   - {{LIVE_PRICE}} - Current price with $ prefix
   - {{LIVE_MARKET_CAP}} - Current market cap with $ prefix
   - {{LIVE_RANK}} - Current market cap rank
   - {{LIVE_DATE}} - Today's date (formatted as Month Day, Year)
   - {{LIVE_24H_CHANGE}} - 24-hour percentage change
7. Include at least 3 specific historical numerical data points from the provided context (excluding live placeholders).
8. Reference at least 1 real-world development or event.
9. Strictly follow the word count instructions provided in each specific prompt.
10. ONLY use markdown heading ## for sections. DO NOT use ### or deeper subheadings. Ensure headers are descriptive and at least 3 words long.
11. Include a FAQ section at the end with 3-5 questions and answers. Format it exactly as "## FAQ".
12. End every article with: "---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*"
13. MANDATORY: Include a Markdown table detailing specific token statistics or market comparisons early in the article. Use the placeholders defined above in this table. This is critical for Google Featured Snippets.
14. EXTERNAL LINKS: NEVER include URLs, external links, third-party domains, or ads. The only permitted site is tokenradar.co.
15. NO MASSIVE BOLD: Do not bold entire paragraphs. Only bold short phrases (max 5-7 words) for emphasis.

FORMAT:
- Start with a comprehensive intro paragraph of 3-4 sentences (no heading). This must be the very first content.
- MANDATORY: Include the Markdown Summary Table ONLY AFTER the intro paragraph. You MUST include a header row (e.g., "| Metric | Details |") followed by the separator row for the table to render correctly. Use the placeholders defined above.
- Use ## for all main sections. DO NOT split headers into multiple lines (e.g., "## The\n\nCore Problem" is forbidden; use "## The Core Problem").
- Include bullet points and bold text for key data.
- Include a structured FAQ section at the end using ## FAQ format.
- INTEGRATE STRATEGIC CONTEXT: Naturally weave the provided GLOBAL MARKET STATS and SECTOR PERFORMANCE into your analysis. Mention the current total market cap or BTC dominance within the first two paragraphs. This is critical for authority.`;

/**
 * Build article-specific prompts.
 */
async function buildArticleConfigs(
  tokenId: string,
  tokenName: string,
  symbol: string,
  tgeCategory: string,
  tokenData: Record<string, unknown>,
  metrics: Record<string, unknown>,
  references: { articles: { title: string; snippet: string; source: string }[] },
  tgeEntry?: UpcomingTge | null,
  relatedTokenNames?: string[],
  macroContext?: { globalStats: string; sectorPerformance: string },
  dexData?: DEXPoolData | null,
): Promise<ArticleConfig[]> {
  const dataStr = JSON.stringify(tokenData, null, 2);
  const metricsStr = JSON.stringify(metrics, null, 2);
  const priceSummary = await loadPriceSummary(tokenId);
  const refsStr = references.articles
    .map((a) => `- [${a.source}] "${a.title}": ${a.snippet}`)
    .join("\n");

  const commonContext = `
TOKEN DATA (from CoinGecko):
${dataStr}

PROPRIETARY METRICS (computed by TokenRadar):
${metricsStr}
${priceSummary}

REFERENCE ARTICLES (use as fact/style reference only — do NOT copy):
${refsStr || "No recent articles found."}


${relatedTokenNames?.length ? `SEMANTIC CLUSTERING RULE:\nYou MUST explicitly mention and compare ${tokenName} against the following market peers at least once in your analysis: ${relatedTokenNames.join(", ")}.` : ""}

GLOBAL MARKET CONTEXT (Strategic Grounding):
- Current Market Phase: ${macroContext?.globalStats || "Neutral / Stable"}
- Top Performing Sectors: ${macroContext?.sectorPerformance || "Mixed performance across sectors"}
`;

  // TGE-specific context: include source, narrative, description from TGE entry
  const tgeContext = tgeEntry ? `
TGE ENTRY DATA (from TokenRadar discovery pipeline):
- Source Article: ${tgeEntry.dataSource || "Unknown"}
- Narrative Strength: ${tgeEntry.narrativeStrength ?? "N/A"}/100
- Category: ${tgeEntry.category || "General"}
- Status: ${tgeEntry.status || "upcoming"}
- Expected TGE: ${tgeEntry.expectedTge || "TBD"}
- Discovered At: ${tgeEntry.discoveredAt || "Unknown"}

${dexData ? `DEX LIVE MARKET DATA (from GeckoTerminal):
- Current Price: $${dexData.priceUsd.toFixed(8)}
- 24h Volume: $${dexData.volume24h.toLocaleString()}
- Liquidity (Reserve): $${dexData.reserveUsd.toLocaleString()}
- FDV: $${dexData.fdvUsd.toLocaleString()}
- Dex: ${dexData.dexId}
- Pool Created: ${dexData.poolCreatedAt}
- 24h Change: ${dexData.priceChange24h.toFixed(2)}%
` : ""}
` : "";

  const overviewTitles = [
    `What is ${tokenName} (${symbol.toUpperCase()})? Complete Guide`,
    `Understanding ${tokenName} (${symbol.toUpperCase()}): An In-Depth Look`,
    `The Ultimate Guide to ${tokenName} (${symbol.toUpperCase()})`,
    `${tokenName} (${symbol.toUpperCase()}) Explained: Fundamentals and Future Potential`
  ];

  const overviewPrompts = [
    `Write a comprehensive overview article about ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 1,200 - 1,500 words.\n\nCover these exact sections:\n## What is ${tokenName}?\nExplain what it is and the core problem it solves.\n## Technical Architecture\nHow the technology works (simplified for investors).\n## Tokenomics and Utility\nSupply metrics, distribution, and real-world use cases.\n## Market Position\nCurrent price, market cap, and relative rank.\n## TokenRadar Metrics Analysis\nDeep dive into Risk Score, Growth Index, and Narrative Strength.\n## Risks and Challenges\nKey risks, vulnerabilities, and competitor analysis.\n## Recent Developments\nRoadmap, news, and ecosystem growth.\n\n${commonContext}`,
    `Create a detailed guide covering ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 1,200 - 1,500 words.\n\nStructure the article with these headers:\n## The Core Problem\nWhy does ${tokenName} exist and what does it solve?\n## Technology and Operation\nHow it operates under the hood.\n## Token Economics\nUse cases and supply metrics.\n## Market Analysis\nPrice, market cap, and rank review.\n## TokenRadar Research\nDeep dive into Risk Score and Narrative Strength.\n## Potential Headwinds\nRisks and competitor analysis.\n\n${commonContext}`
  ];

  const priceTitles = [
    `${tokenName} (${symbol.toUpperCase()}) Price Prediction ${new Date().getFullYear()}-${new Date().getFullYear() + 1}`,
    `${tokenName} (${symbol.toUpperCase()}) Price Forecast & Scenarios`,
    `Will ${tokenName} (${symbol.toUpperCase()}) Surge? Price Analysis`
  ];

  const pricePrompts = [
    `Write a data-driven price analysis article for ${tokenName} (${symbol.toUpperCase()}).\n\nCRITICAL: You are NOT making predictions. You are analyzing data trends, historical patterns, and market conditions to discuss possible scenarios.\n\nTARGET LENGTH: 1,000 - 1,200 words. Be analytical and concise.\n\nIMPORTANT: Use the PRICE HISTORY SUMMARY data below to reference actual 30-day and 1-year price movements, highs, lows, and percentage changes. This is real data — cite it.\n\nCover:\n1. Current price and recent performance (use the 30d and 1y stats provided)\n2. Technical analysis of key support/resistance levels (use the highs/lows from price history)\n3. Comparison to ATH and ATL\n4. Market cap growth scenarios (bear, base, bull cases)\n5. Risk factors that could affect price (use Risk Score data)\n6. How ${tokenName} compares to category peers\n7. Include data ranges, not single predictions\n\nREMEMBER: Present multiple scenarios with data-backed reasoning. Use phrases like "based on current data", "historical patterns suggest", "in a bullish scenario". NEVER predict exact prices.\n\n${commonContext}`,
    `Draft an objective price trend analysis for ${tokenName} (${symbol.toUpperCase()}).\n\nCRITICAL: You are NOT making predictions. Analyze data trends and discuss scenarios.\n\nTARGET LENGTH: 1,000 - 1,200 words.\n\nIMPORTANT: Cite the PRICE HISTORY SUMMARY points provided (30-day/1-year changes, highs, lows).\n\nStructure:\n- Recent Market Action: How ${tokenName} has performed recently\n- Key Price Levels: Support and resistance based on historical highs/lows\n- Valuation Scenarios: What would it take to reach new highs? Discuss bear, base, and bull cases\n- Risk Profile: Incorporate TokenRadar's Risk Score\n- Sector Comparison: How it stacks up against ${tgeCategory || "peers"}\n\nPresent balanced scenarios with strict data reliance.\n\n${commonContext}`
  ];

  const buyTitles = [
    `How to Buy ${tokenName} (${symbol.toUpperCase()}) — Step-by-Step Guide`,
    `Where to Purchase ${tokenName} (${symbol.toUpperCase()}): Full Guide`,
    `Buying ${tokenName} (${symbol.toUpperCase()}): Safest Exchanges and Steps`
  ];

  const buyPrompts = [
    `Write a practical step-by-step guide for buying ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 600 - 800 words. Be highly concise, actionable, and skip unnecessary filler.\n\nCover:\n1. Quick overview of ${tokenName} and why people are interested\n2. Which major exchanges list ${symbol.toUpperCase()} (Binance, Coinbase, Bybit, etc.)\n3. Step-by-step process:\n   - Create/verify exchange account\n   - Deposit funds (fiat or crypto)\n   - Find the ${symbol.toUpperCase()} trading pair\n   - Place your order (market vs limit)\n4. How to store ${symbol.toUpperCase()} safely (exchanges vs wallets)\n5. Key considerations before buying (Risk Score, volatility data)\n6. Tax implications overview (general, not specific advice)\n\nNote: Include TokenRadar's Risk Score and relevant market data to help readers make informed decisions.\n\n${commonContext}`,
    `Write an actionable purchasing guide for ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 600 - 800 words.\n\nStructure:\n- Why buy ${tokenName}? Brief summary\n- Top Exchange Options for ${symbol.toUpperCase()}\n- Purchase Tutorial: From fiat deposit to holding the token\n- Securing your tokens: Hardware wallets vs Exchange storage\n- Important Risks: Mention the TokenRadar Risk Score\n\nKeep it direct and easy to follow for beginners.\n\n${commonContext}`
  ];

  const pick = <T>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

  return [
    {
      type: "overview",
      title: pick(overviewTitles),
      slug: "overview",
      prompt: pick(overviewPrompts),
    },
    {
      type: "price-prediction",
      title: pick(priceTitles),
      slug: "price-prediction",
      prompt: pick(pricePrompts),
    },
    {
      type: "how-to-buy",
      title: pick(buyTitles),
      slug: "how-to-buy",
      prompt: pick(buyPrompts),
    },
    {
      type: "tge-preview",
      title: `${tokenName} (${symbol.toUpperCase()}) Pre-Launch Spotlight — Upcoming TGE Analysis`,
      slug: "tge-preview",
      prompt: `Write a pre-launch spotlight article for ${tokenName} (${symbol.toUpperCase()}).\n      \nTARGET LENGTH: 800 - 1,000 words.\n\nAs the token is not yet trading on major exchanges, focus on:\n1. Project Vision and Ecosystem impact\n2. Narrative Strength (why is it hyped? — use the Narrative Strength score provided)\n3. Investors and Backing (if known from the source article or description)\n4. Expected TGE/Launch Window\n5. Category Analysis (${tgeCategory || "General"})\n6. Comparison to successful projects in the same sector\n\nIMPORTANT: Use the TGE ENTRY DATA below for factual context about this project. Reference the source article topic, the narrative strength score, and the project description to write a well-informed analysis.\n\n${tgeContext}\n${commonContext}`,
    },
  ];
}


function ensureContentDir(tokenId: string, isQueue = false): string {
  const baseDir = isQueue ? path.join(DATA_DIR, "queue") : CONTENT_DIR;
  const dir = path.join(baseDir, tokenId);
  ensureDirSync(dir);
  return dir;
}

async function isStale(filePath: string, maxAgeDays: number, tokenData?: Partial<TokenDetail> & { market?: { priceChange24h?: number } }): Promise<boolean> {
  if (tokenData?.market?.priceChange24h) {
    if (Math.abs(tokenData.market.priceChange24h) >= 15) {
      console.log(`  [VOLATILITY TRIGGER] >15% move detected. Forcing update.`);
      return true; 
    }
  }

  const data = safeReadJson<any>(filePath, null);
  if (!data || !data.generatedAt) return true;
  
  try {
    
    const diffMs = Date.now() - new Date(data.generatedAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= maxAgeDays;
  } catch (_e) {
    return true; // Treat corrupt/unparseable files as stale
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf("--token");
  const typeIdx = args.indexOf("--type");
  const maxIdx = args.indexOf("--max");
  const maxTgeIdx = args.indexOf("--max-tge");
  const targetToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;
  const targetType = typeIdx !== -1 ? args[typeIdx + 1] : null;
  const dryRun = args.includes("--dry-run");
  const useQueue = args.includes("--queue");

  const maxTokens = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 5;
  const maxTgeTokens = maxTgeIdx !== -1 ? parseInt(args[maxTgeIdx + 1], 10) : 5;
  const refreshMacro = args.includes("--refresh-macro");
  const dripMode = args.includes("--drip");
  const maxRefreshIdx = args.indexOf("--max-refresh");
  const maxRefresh = maxRefreshIdx !== -1 ? parseInt(args[maxRefreshIdx + 1], 10) : 5;

  // Macro-Context Fetching (Institutional Grounding)
  console.log(`▶ Step 0: Fetching Macro Market Context...`);
  let globalStatsStr = "";
  let sectorPerformanceStr = "";

  try {
    const globalData = await fetchGlobalMarketData();
    if (globalData) {
      const mcapUSD = globalData.total_market_cap?.usd || 0;
      const mcapChange = globalData.market_cap_change_percentage_24h_usd || 0;
      const btcDom = globalData.market_cap_percentage?.btc || 0;
      const mcapStr = mcapUSD >= 1e12 
        ? `$${(mcapUSD / 1e12).toFixed(2)}T` 
        : `$${(mcapUSD / 1e9).toFixed(0)}B`;
      globalStatsStr = `${mcapStr} Total Cap (${mcapChange >= 0 ? "+" : ""}${mcapChange.toFixed(1)}% 24h), BTC Dominance: ${btcDom.toFixed(1)}%`;
    }

    const sectors = await fetchTrendingCategories(3);
    if (sectors.length > 0) {
      sectorPerformanceStr = sectors
        .map(s => `${s.name} (${s.market_cap_change_24h && s.market_cap_change_24h >= 0 ? "+" : ""}${s.market_cap_change_24h?.toFixed(1)}%)`)
        .join(", ");
    }
    
    if (globalStatsStr) console.log(`  ✦ Global: ${globalStatsStr}`);
    if (sectorPerformanceStr) console.log(`  ✦ Sectors: ${sectorPerformanceStr}`);
  } catch (err) {
    console.warn("  ⚠ Failed to fetch macro context, skipping grounding...");
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — AI Content Generator       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN (no API calls)" : "LIVE"}`);
  console.log(`  Target token: ${targetToken || "all"}`);
  console.log(`  Target type: ${targetType || "all"}`);
  console.log(`  Max tracked tokens: ${maxTokens}`);
  console.log(`  Max TGE tokens:     ${maxTgeTokens}`);
  if (dripMode) {
    console.log(`  Drip Mode Enabled:  Limit ${maxRefresh} refreshes + ${maxTgeTokens} TGEs`);
  }
  console.log();

  // Check for API key
  if (!dryRun && !process.env.ANTHROPIC_API_KEY) {
    console.error("  ✗ ANTHROPIC_API_KEY not set in .env.local");
    console.error("    Set it or use --dry-run to preview prompts.");
    process.exit(1);
  }

  // Load token data
  const tokenFiles = fs
    .readdirSync(TOKENS_DIR)
    .filter((f) => f.endsWith(".json"));

  if (tokenFiles.length === 0) {
    console.error("  ✗ No token data found. Run fetch-crypto-data first.");
    process.exit(1);
  }

  // Load upcoming TGE data early — needed for both queue filtering and TGE processing
  const upcomingTges = safeReadJson<UpcomingTge[]>(TGE_FILE, []);

  // Build a set of upcoming TGE IDs (status !== "released") so we can
  // exclude them from the regular token queue. Tokens that have already
  // graduated (status === "released") are NOT excluded.
  const upcomingTgeIdSet = new Set<string>(
    upcomingTges
      .filter((t: { status?: string }) => t.status !== "released")
      .map((t: { id: string }) => t.id)
  );

  // Build a set of tokens to process
  let tokensToProcess: string[] = [];
  let tgeTokensToProcess: string[] = [];

  if (dripMode) {
    console.log("▶ [DRIP MODE] Identifying candidates for safe daily update...");
    
    // 1. Drip TGEs (Priority: New projects awaiting spotlight)
    for (const tge of upcomingTges) {
      if (targetToken && tge.id !== targetToken) continue;
      if (tge.status === "released") continue; // Released ones go to Phase 2 (Graduation)
      
      const tgePath = path.join(CONTENT_DIR, tge.id, "tge-preview.json");
      if (!fs.existsSync(tgePath) || (await isStale(tgePath, 7))) {
        tgeTokensToProcess.push(tge.id);
      }
      if (tgeTokensToProcess.length >= maxTgeTokens) break;
    }

    // 2. High Priority: TGE Graduation (Newly launched tokens needing full guides)
    const graduatedToProcess: string[] = [];
    for (const tge of upcomingTges) {
      if (tge.status === "released") {
        const overviewPath = path.join(CONTENT_DIR, tge.id, "overview.json");
        if (!fs.existsSync(overviewPath)) {
          graduatedToProcess.push(tge.id);
          console.log(`  🎓 [GRADUATION] Found newly released token: ${tge.name} (${tge.id}). Adding to high-priority queue.`);
        }
      }
      if (graduatedToProcess.length >= maxRefresh) break;
    }

    // 3. Drip Refreshes (Priority: Oldest existing articles across all ranks)
    const refreshCandidates: { id: string; lastGen: number }[] = [];
    const contentDirs = fs.readdirSync(CONTENT_DIR);
    
    for (const id of contentDirs) {
      if (targetToken && id !== targetToken) continue;
      if (upcomingTgeIdSet.has(id)) continue; // Skip unreleased TGEs
      if (graduatedToProcess.includes(id)) continue; // Already in graduation queue

      const overviewPath = path.join(CONTENT_DIR, id, "overview.json");
      const data = safeReadJson<any>(overviewPath, null);
      if (data) {
        try {
          const lastGen = data.generatedAt ? new Date(data.generatedAt).getTime() : 0;
          refreshCandidates.push({ id, lastGen });
        } catch (_e) {
          refreshCandidates.push({ id, lastGen: 0 }); 
        }
      }
    }

    // Sort by oldest first
    refreshCandidates.sort((a, b) => a.lastGen - b.lastGen);
    
    // Fill the remaining quota after graduation with stale refreshes
    const remainingQuota = Math.max(0, maxRefresh - graduatedToProcess.length);
    tokensToProcess = [...graduatedToProcess, ...refreshCandidates.slice(0, remainingQuota).map(c => c.id)];

    console.log(`  ✦ Selected ${tgeTokensToProcess.length} TGEs and ${tokensToProcess.length} Refreshes (${graduatedToProcess.length} graduated) for today's drip.`);
  } else {
    // Standard logic (Bulk or Single Token)
    for (const f of tokenFiles) {
      const id = f.replace(".json", "");
      if (targetToken && id !== targetToken) continue;

      // Skip upcoming TGEs that lack real market data — they belong in the TGE queue only
      if (upcomingTgeIdSet.has(id)) {
        const data = JSON.parse(await fs.promises.readFile(path.join(TOKENS_DIR, f), "utf-8"));
        if (!data.market?.price || data.market.price === 0) continue;
      }

      // Check if this token is missing any generated content
      const overviewPath = path.join(CONTENT_DIR, id, "overview.json");
      const pricePath = path.join(CONTENT_DIR, id, "price-prediction.json");
      const howToBuyPath = path.join(CONTENT_DIR, id, "how-to-buy.json");

      let needsGeneration = false;
      let tokenData = null;
      try {
        tokenData = JSON.parse(await fs.promises.readFile(path.join(TOKENS_DIR, f), "utf-8"));
      } catch (_e) {}

      if (targetType) {
        needsGeneration = await isStale(path.join(CONTENT_DIR, id, `${targetType}.json`), 30, tokenData);
      } else {
        needsGeneration = ((await isStale(overviewPath, 30, tokenData))) || ((await isStale(pricePath, 30, tokenData))) || ((await isStale(howToBuyPath, 30, tokenData)));
      }

      if (refreshMacro && !needsGeneration) {
        const metadataPath = path.join(CONTENT_DIR, id, "overview.json");
        if (fs.existsSync(metadataPath)) {
          const stats = fs.statSync(metadataPath);
          const lastGen = new Date(stats.mtime);
          const todayAtMidnight = new Date();
          todayAtMidnight.setHours(0, 0, 0, 0);
          if (lastGen < todayAtMidnight) {
            needsGeneration = true;
          }
        }
      }

      if (needsGeneration || args.includes("--force")) {
        tokensToProcess.push(id);
      }
      if (tokensToProcess.length >= maxTokens) break;
    }

    // Standard TGE selection
    for (const tge of upcomingTges) {
      if (targetToken && tge.id !== targetToken) continue;
      if (tokensToProcess.includes(tge.id)) continue;
      if (tgeTokensToProcess.includes(tge.id)) continue;

      const tgePath = path.join(CONTENT_DIR, tge.id, "tge-preview.json");
      if ((await isStale(tgePath, 7)) || args.includes("--force")) {
        tgeTokensToProcess.push(tge.id);
      }
      if (tgeTokensToProcess.length >= maxTgeTokens) break;
    }
  }

  // Also check content/tokens directory to catch tokens that have content but no detailed data yet
  if (tokensToProcess.length < maxTokens && fs.existsSync(CONTENT_DIR)) {
    const contentDirs = fs.readdirSync(CONTENT_DIR);
    for (const id of contentDirs) {
      if (targetToken && id !== targetToken) continue;
      if (tokensToProcess.includes(id)) continue;

      // Skip upcoming TGEs — they belong in the TGE queue only
      if (upcomingTgeIdSet.has(id)) continue;

      const overviewPath = path.join(CONTENT_DIR, id, "overview.json");
      
      let tokenData = null;
      try {
        const p = path.join(TOKENS_DIR, `${id}.json`);
        if(fs.existsSync(p)) tokenData = JSON.parse(await fs.promises.readFile(p, "utf-8"));
      } catch (_e) {}

      const needsGeneration = targetType 
        ? await isStale(path.join(CONTENT_DIR, id, `${targetType}.json`), 30, tokenData)
        : await isStale(overviewPath, 30, tokenData);

      if (needsGeneration || args.includes("--force")) {
        tokensToProcess.push(id);
      }
      if (tokensToProcess.length >= maxTokens) break;
    }
  }

  console.log(`  Tracked tokens needing generation: ${tokensToProcess.length}`);
  console.log(`  TGE tokens needing generation:     ${tgeTokensToProcess.length}`);
  console.log();

  // Combine both queues: tracked tokens first, then TGE tokens with tge-preview only
  const allTokensToProcess = [
    ...tokensToProcess.map(id => ({ id, isTge: false })),
    ...tgeTokensToProcess.map(id => ({ id, isTge: true })),
  ];

  // Removed alertFile clearing

  let totalArticles = 0;
  let totalCost = 0;
  const generatedRegularTokens = new Set<string>();
  const generatedTgeTokens = new Set<string>();

  for (const { id: tokenId, isTge } of allTokensToProcess) {
    // 1. Load data
    const tokenFilePath = path.join(TOKENS_DIR, `${tokenId}.json`);
    let tokenData: Partial<TokenDetail> & { id: string; symbol: string; name: string; category?: string } = { id: tokenId, symbol: tokenId.split("-")[0], name: tokenId };
    
    if (fs.existsSync(tokenFilePath)) {
      tokenData = JSON.parse(await fs.promises.readFile(tokenFilePath, "utf-8"));
    }

    // 2. Just-In-Time (JIT) Sync: If it's a "Lite" token (no description), fetch full data
    if (!tokenData.description || args.includes("--force-sync")) {
      process.stdout.write(`  [JIT SYNC] Fetching full data for ${tokenData.name}... `);
      try {
        const fullData = await fetchFullTokenData(tokenId);
        
        // Split charts into separate files for getPriceHistory logic
        const { chart30d, chart1y, ...detailOnly } = fullData;
        tokenData = detailOnly;

        const PRICES_DIR = path.join(DATA_DIR, "prices");
        ensureDirSync(PRICES_DIR);

        await fs.promises.writeFile(
          path.join(PRICES_DIR, `${tokenId}.json`),
          JSON.stringify({
            id: tokenId,
            name: fullData.name,
            chart30d: chart30d?.prices?.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [],
            chart1y: chart1y?.prices?.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [],
            fetchedAt: new Date().toISOString()
          }, null, 2)
        );

        await fs.promises.writeFile(tokenFilePath, JSON.stringify(tokenData, null, 2));
        console.log("✓ Done (incl. prices)");
      } catch (e) {
        // For upcoming TGEs, JIT sync will always fail (not on CG yet). 
        // This is expected, so we just log a smaller note.
        if (isTge) {
          console.log(`💡 Note: ${tokenId} is a pre-launch TGE (not on CoinGecko yet)`);
        } else {
          console.log(`✗ Failed JIT Sync: ${e instanceof Error ? e.message : String(e)}`);
          await logError("generate-content JIT Sync", e, false);
        }
      }

      // If description is STILL missing after an attempted sync (or failed sync), provide a fallback
      // This ensures we never skip a token again.
      if (!tokenData.description) {
        console.log(`  ⚠️  No description found for ${tokenData.name}. Using fallback.`);
        tokenData.description = `A cryptocurrency token known as ${tokenData.name} (${tokenData.symbol?.toUpperCase()}). It is tracked on CoinGecko with the ID "${tokenId}".`;
        
        // Save the updated token data with fallback to prevent future sync attempts
        // BUT: skip for TGE tokens — don't pollute data/tokens/ with placeholder files
        if (!isTge) {
          await fs.promises.writeFile(tokenFilePath, JSON.stringify(tokenData, null, 2));
        }
      }
    }

    // Load metrics (may not exist yet)
    const metricsFile = path.join(METRICS_DIR, `${tokenId}.json`);
    const metrics = safeReadJson<Record<string, any>>(metricsFile, {});

    // Load references (may not exist)
    let references = { articles: [] as { title: string; snippet: string; source: string }[] };
    const refsFile = path.join(REFERENCES_DIR, `${tokenId}.json`);
    if (fs.existsSync(refsFile)) {
      references = JSON.parse(await fs.promises.readFile(refsFile, "utf-8"));
    }

    // Build article configs
    // For TGE tokens, look up the matching entry to enrich the prompt
    const matchingTgeEntry = isTge ? upcomingTges.find((t: UpcomingTge) => t.id === tokenId) : null;
    
    let relatedTokenNames: string[] = [];
    if (!isTge) {
      try {
        const related = (await getRelatedTokens(tokenId, 2)) as any[];
        relatedTokenNames = related.map((t: any) => t.name);
      } catch (_e) {
        // Safe fallback
      }
    }

    // 3. For TGE tokens, attempt GeckoTerminal enrichment if they aren't on CG yet
    let dexData: DEXPoolData | null = null;
    if (isTge && (!tokenData.market?.price || tokenData.market.price === 0)) {
      process.stdout.write(`  [DEX SYNC] Searching GeckoTerminal for ${tokenData.symbol}... `);
      try {
        const pools = await searchGeckoTerminalPools(tokenData.symbol);
        if (pools.length > 0) {
          dexData = pools[0]; // Highest liquidity per our strategy
          console.log(`✓ Found pool on ${dexData.dexId} ($${dexData.reserveUsd.toLocaleString()} liq)`);
        } else {
          console.log("✗ No pools found");
        }
      } catch (e) {
        console.log(`✗ GT Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const configs = await buildArticleConfigs(
      tokenId,
      tokenData.name,
      tokenData.symbol,
      tokenData.category || "Crypto",
      tokenData,
      metrics,
      references,
      matchingTgeEntry,
      relatedTokenNames,
      { globalStats: globalStatsStr, sectorPerformance: sectorPerformanceStr },
      dexData
    );

    // For TGE tokens, only generate tge-preview; for tracked tokens, skip tge-preview
    const filteredConfigs = isTge
      ? configs.filter((c) => c.type === "tge-preview")
      : targetType
        ? configs.filter((c) => c.type === targetType)
        : configs.filter((c) => c.type !== "tge-preview");

    console.log(`▶ ${tokenData.name} (${tokenData.symbol.toUpperCase()}):`);

    if (filteredConfigs.length === 0) continue;

    const metadataFile = path.join(TOKENS_DIR, `${tokenId}.json`);
    if (!fs.existsSync(metadataFile) && !isTge) {
      if (dryRun) {
        console.log(`  [DRY-RUN] Would create metadata file: ${metadataFile}`);
      } else {
        process.stdout.write(`  [META] Creating basic metadata for ${tokenId}... `);
        const metaData = {
          id: tokenId,
          symbol: tokenData.symbol || tokenId.split('-')[0],
          name: tokenData.name || tokenId,
          description: tokenData.description || "",
          market: tokenData.market || { price: 0, marketCap: 0, marketCapRank: 9999 },
          lastMarketUpdate: new Date().toISOString()
        };
        await fs.promises.writeFile(metadataFile, JSON.stringify(metaData, null, 2));
        console.log("✓ Created");
      }
    }

    // Double check stale status (we already did it earlier, but to be safe and print logs)
    const configsToGenerate = [];
    for (const config of filteredConfigs) {
      const outputDir = ensureContentDir(tokenId, useQueue);
      const outputFile = path.join(outputDir, `${config.slug}.json`);
      if (fs.existsSync(outputFile) && !(await isStale(outputFile, isTge ? 7 : 30)) && !args.includes("--force")) {
        console.log(`  ⏭ ${config.type} — generated recently`);
      } else {
        configsToGenerate.push(config);
      }
    }

    if (configsToGenerate.length === 0) continue;

    const sectionsToGenerate = configsToGenerate.map(c => c.type);
    const contentPrompt = `
You are an expert crypto analyst and technical writer. 
Generate a comprehensive report for ${tokenData.name} (${tokenData.symbol?.toUpperCase()}).

We require the following sections to be generated: ${sectionsToGenerate.join(", ")}.
Please use the following prompts for each section:

${configsToGenerate.map(c => `=== SECTION: ${c.type} ===\nTITLE TO USE: ${c.title}\nINSTRUCTIONS:\n${c.prompt}`).join("\n\n")}
`;

    process.stdout.write(`  🤖 Generating [${sectionsToGenerate.join(", ")}]...`);

    try {

    if (dryRun) {
      console.log(`  [DRY-RUN] Would generate sections: ${sectionsToGenerate.join(", ")}`);
      continue;
    }

      const properties: Record<string, any> = {};
      for (const config of configsToGenerate) {
        properties[config.type] = {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string", description: `The markdown content for ${config.type}. Make sure it hits the target word count.` }
          },
          required: ["title", "content"]
        };
      }

      const jsonSchema = {
        type: "object",
        properties,
        required: sectionsToGenerate
      };

      let result: AIResult | null = null;
      let attempts = 0;
      const maxAttempts = 2;
      let parsedResponse: any = null;

      while (attempts < maxAttempts) {
        attempts++;
        result = await callAIWithFallback(SYSTEM_PROMPT, contentPrompt, 8000, jsonSchema);
        
        totalCost += result.cost;

        try {
          parsedResponse = JSON.parse(result.content);
          
          let allPresent = true;
          for (const req of sectionsToGenerate) {
            if (!parsedResponse[req] || !parsedResponse[req].content || !parsedResponse[req].title) {
              allPresent = false;
              break;
            }
          }

          if (allPresent) {
            const dataPointRegex = /\$[\d,.]+|\d+(\.\d+)?%|\d{1,3}(,\d{3})+/g;
            const dataPoints = result.content.match(dataPointRegex) || [];
            if (dataPoints.length >= 3 || isTge) {
               break; 
            } else {
               console.log(`\n    ⚠ Attempt ${attempts} failed data points check.`);
            }
          } else {
            console.log(`\n    ⚠ Attempt ${attempts} missing required sections in JSON.`);
          }
        } catch (err) {
          console.log(`\n    ⚠ Attempt ${attempts} failed to parse JSON.`);
        }
        
        if (attempts < maxAttempts) {
          process.stdout.write(`    🤖 Retrying...`);
        }
      }

      if (!result || !parsedResponse) {
         console.log(` ✗ Failed after ${maxAttempts} attempts`);
         continue;
      }

      for (const config of configsToGenerate) {
        const outputDir = ensureContentDir(tokenId, useQueue);
        const outputFile = path.join(outputDir, `${config.slug}.json`);
        
        const sectionData = parsedResponse[config.type];
        if (!sectionData) continue;

        const wordCount = sectionData.content.split(/\s+/).length;
        
        const article: GeneratedArticle = {
          tokenId,
          tokenName: tokenData.name,
          type: config.type,
          title: sectionData.title || config.title,
          slug: config.slug,
          content: sectionData.content,
          wordCount,
          generatedAt: new Date().toISOString(),
          model: result.model,
          promptTokens: Math.floor(result.promptTokens / sectionsToGenerate.length),
          completionTokens: Math.floor(result.completionTokens / sectionsToGenerate.length),
        };

        await fs.promises.writeFile(outputFile, JSON.stringify(article, null, 2));
        
        logActivity("generate", {
          tokenId,
          tokenName: tokenData.name,
          articleType: config.type,
          isTge,
          wordCount,
          cost: result.cost / sectionsToGenerate.length
        });
        totalArticles++;
      }
      
      if (isTge) {
        generatedTgeTokens.add(tokenId);
      } else {
        generatedRegularTokens.add(tokenId);
      }
      console.log(` ✓ generated successfully ($${result.cost.toFixed(4)})`);
      
      await sleep(1000);
      
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(` ✗ ${msg}`);
      await logError("generate-content AI", error, false);
    }
    console.log();
  }


  // Final report


  console.log("╔══════════════════════════════════════════╗");
  console.log("║       Content Generation Complete        ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Articles:  ${String(totalArticles).padStart(6)}                 ║`);
  console.log(`║  Est Cost:  $${totalCost.toFixed(4).padStart(5)}                 ║`);
  console.log(`║  Output:    content/tokens/              ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch(async (error) => {
  await logError("generate-content", error);
  process.exit(1);
});

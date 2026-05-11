/**
 * AI Content Generator — Phase 3
 *
 * Generates SEO-optimized articles using Gemini 2.5 Flash (primary) with Claude Haiku 4.5 as fallback.
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
import { getTgeContractQueries, normalizeTge, shouldPublishTgePreview } from "../src/lib/tge";
import { loadEnv, safeReadJson, ensureDirSync } from "../src/lib/utils";
import { buildArticleQualitySnapshot, evaluateArticleQuality, type ArticleQualitySnapshot } from "../src/lib/content-quality";
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
  quality?: ArticleQualitySnapshot;
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
16. MARKDOWN LINKS: Do not create Markdown links. TokenRadar injects internal links after generation.

FORMAT:
- Start with a comprehensive intro paragraph of 3-4 sentences (no heading). This must be the very first content.
- MANDATORY: Include the Markdown Summary Table ONLY AFTER the intro paragraph. Ensure there is a blank line before and after the table.
  Use exactly these labels for the summary table rows:
  | Price | {{LIVE_PRICE}} |
  | Market Cap | {{LIVE_MARKET_CAP}} |
  | 24h Change | {{LIVE_24H_CHANGE}} |
  | Market Rank | {{LIVE_RANK}} |
- Use ## for all main sections. ENSURE there is a blank line before every header.
- ENSURE every paragraph is followed by a blank line.
- Include bullet points and bold text for key data.
- Include a structured FAQ section at the end using ## FAQ format.
- INTEGRATE STRATEGIC CONTEXT: Naturally weave the provided GLOBAL MARKET STATS and SECTOR PERFORMANCE into your analysis. Mention the current total market cap or BTC dominance within the first two paragraphs. This is critical for authority.`;

const TGE_SYSTEM_PROMPT = `You are an expert crypto launch analyst writing for TokenRadar.co.

STRICT RULES:
1. Write in a professional, evidence-first tone. No hype, no FOMO.
2. NEVER recommend buying or selling any token.
3. NEVER guarantee returns or profits.
4. Do not use live market placeholders such as {{LIVE_PRICE}}, {{LIVE_MARKET_CAP}}, {{LIVE_RANK}}, {{LIVE_DATE}}, or {{LIVE_24H_CHANGE}}.
5. If a token is not actively trading, say market data is not available yet instead of inventing prices, market caps, exchange listings, or liquidity.
6. Separate market narrative from verification confidence.
7. Only call a launch confirmed when the provided TGE entry says lifecycleStatus is confirmed_tge, trading_on_dex, listed_on_aggregator, or graduated.
8. Use source evidence from the provided signals. Do not invent investors, tokenomics, chains, contracts, unlocks, or official links.
9. Include a compact evidence table early in the article with status, confidence, source count, expected launch window, category, and last checked.
10. Use only ## headings. Include a ## FAQ section with 3-5 questions and answers.
11. End every article with: "---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*"
12. EXTERNAL LINKS: NEVER include raw URLs, third-party domains, or ads. The only permitted site is tokenradar.co.
13. MARKDOWN LINKS: Do not create Markdown links. TokenRadar injects internal links after generation.`;

function getTargetLengthLabel(articleType: string): string {
  switch (articleType) {
    case "overview":
    case "price-prediction":
      return "1000-1200";
    case "how-to-buy":
    case "tge-preview":
      return "800-1000";
    default:
      return "800-1000";
  }
}

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
  const tgeSignals = tgeEntry?.signals
    ?.map((signal) => `- ${signal.type} via ${signal.sourceType}: ${signal.title || signal.url}`)
    .join("\n");

  const tgeContext = tgeEntry ? `
TGE ENTRY DATA (from TokenRadar discovery pipeline):
- Source Article: ${tgeEntry.dataSource || "Unknown"}
- Lifecycle Status: ${tgeEntry.lifecycleStatus || "candidate"}
- Confidence: ${tgeEntry.confidence ?? "N/A"}/100
- Narrative Strength: ${tgeEntry.narrativeStrength ?? "N/A"}/100
- Category: ${tgeEntry.category || "General"}
- Status: ${tgeEntry.status || "upcoming"}
- Expected TGE: ${tgeEntry.expectedTge || "TBD"}
- Discovered At: ${tgeEntry.discoveredAt || "Unknown"}
- Last Verified At: ${tgeEntry.lastVerifiedAt || tgeEntry.discoveredAt || "Unknown"}
- Evidence Count: ${(tgeEntry.signals?.length || 0) + (tgeEntry.contracts?.length || 0)}
- Chains: ${tgeEntry.chains?.join(", ") || "Unknown"}
- Contracts: ${tgeEntry.contracts?.map((contract) => `${contract.chain}:${contract.address}`).join(", ") || "Not verified yet"}
- Tokenomics: ${tgeEntry.tokenomics ? JSON.stringify(tgeEntry.tokenomics) : "Not verified yet"}
- Signals:
${tgeSignals || "- No structured signals yet. Use the source article only."}

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
    `Write a comprehensive overview article about ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 1,000 - 1,200 words.\n\nCover these exact sections:\n## What is ${tokenName}?\nExplain what it is and the core problem it solves.\n## Technical Architecture\nHow the technology works (simplified for investors).\n## Tokenomics and Utility\nSupply metrics, distribution, and real-world use cases.\n## Market Position\nCurrent price, market cap, and relative rank.\n## TokenRadar Metrics Analysis\nDeep dive into Risk Score, Growth Index, and Narrative Strength.\n## Risks and Challenges\nKey risks, vulnerabilities, and competitor analysis.\n## Recent Developments\nRoadmap, news, and ecosystem growth.\n\n${commonContext}`,
    `Create a detailed guide covering ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 1,000 - 1,200 words.\n\nStructure the article with these headers:\n## The Core Problem\nWhy does ${tokenName} exist and what does it solve?\n## Technology and Operation\nHow it operates under the hood.\n## Token Economics\nUse cases and supply metrics.\n## Market Analysis\nPrice, market cap, and rank review.\n## TokenRadar Research\nDeep dive into Risk Score and Narrative Strength.\n## Potential Headwinds\nRisks and competitor analysis.\n\n${commonContext}`
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
    `Buying ${tokenName} (${symbol.toUpperCase()}): Verification, Fees, and Storage`
  ];

  const buyPrompts = [
    `Write a practical step-by-step guide for buying ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 800 - 1,000 words. Be actionable and specific without inventing unsupported listings.\n\nCover:\n1. Quick overview of ${tokenName} and why people are interested\n2. How to verify live exchange or DEX availability before buying\n3. Step-by-step process:\n   - Choose a regulated exchange or DEX only after confirming the ${symbol.toUpperCase()} market exists\n   - Create/verify the account or connect a self-custody wallet\n   - Deposit funds (fiat, stablecoin, or the correct network asset)\n   - Confirm the exact ${symbol.toUpperCase()} trading pair, contract, and network\n   - Place your order (market vs limit) and review fees/slippage\n4. How to store ${symbol.toUpperCase()} safely (exchange custody vs self-custody)\n5. Key considerations before buying (Risk Score, volatility data, liquidity, network fees)\n6. Tax implications overview (general, not specific advice)\n\nDo NOT claim Binance, Coinbase, Bybit, Kraken, OKX, Gate.io, KuCoin, MEXC, Bitget, or any other venue lists ${symbol.toUpperCase()} unless that listing is explicitly present in TOKEN DATA. If the data does not provide verified markets, tell readers to check current pair availability before depositing funds.\n\nNote: Include TokenRadar's Risk Score and relevant market data to help readers make informed decisions.\n\n${commonContext}`,
    `Write an actionable purchasing guide for ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 800 - 1,000 words.\n\nStructure:\n- Why consider ${tokenName}? Brief, neutral summary\n- Market Availability Checks for ${symbol.toUpperCase()}\n- Purchase Tutorial: From funding to holding the token\n- Pair, Network, and Contract Verification\n- Securing your tokens: Hardware wallets vs exchange storage\n- Important Risks: Mention the TokenRadar Risk Score, liquidity, volatility, and regional availability\n\nDo not name specific exchanges as listing venues unless TOKEN DATA explicitly verifies them. Use generic wording such as "check a reputable exchange or DEX for current ${symbol.toUpperCase()} pairs" when venue data is unavailable.\n\nKeep it direct and easy to follow for beginners.\n\n${commonContext}`
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
      title: `${tokenName} (${symbol.toUpperCase()}) TGE Watchlist and Launch Evidence`,
      slug: "tge-preview",
      prompt: `Write a pre-launch watchlist article for ${tokenName} (${symbol.toUpperCase()}).\n      \nTARGET LENGTH: 800 - 1,000 words.\n\nAs the token may not be actively trading yet, focus on:\n1. Launch status and verification confidence\n2. Evidence timeline based only on the provided signals\n3. Project category and ecosystem impact\n4. Narrative strength as attention, not proof\n5. Expected TGE or launch window\n6. Tokenomics, contracts, chains, and official links only if provided\n7. What evidence would move this project toward graduation\n\nIMPORTANT: Use the TGE ENTRY DATA below for factual context. Do not invent price, market cap, tokenomics, investors, exchange listings, contracts, or launch dates.\n\n${tgeContext}\n${commonContext}`,
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
  const CONTENT_BASE_DIR = useQueue ? path.join(DATA_DIR, "queue") : CONTENT_DIR;

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
  const upcomingTges = safeReadJson<UpcomingTge[]>(TGE_FILE, []).map(normalizeTge);

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

  // Helper: check if a file exists in EITHER the queue dir or the published content dir.
  // This is critical because publish-from-queue.ts deletes queue folders after publishing,
  // so existence/staleness checks must consult the persistent content/tokens/ dir as well.
  const existsInEitherDir = (tokenId: string, slug: string): boolean =>
    fs.existsSync(path.join(CONTENT_BASE_DIR, tokenId, `${slug}.json`)) ||
    fs.existsSync(path.join(CONTENT_DIR, tokenId, `${slug}.json`));

  const resolveContentFile = (tokenId: string, slug: string): string | null => {
    const queuePath = path.join(CONTENT_BASE_DIR, tokenId, `${slug}.json`);
    if (fs.existsSync(queuePath)) return queuePath;
    const publishedPath = path.join(CONTENT_DIR, tokenId, `${slug}.json`);
    if (fs.existsSync(publishedPath)) return publishedPath;
    return null;
  };

  if (dripMode) {
    console.log("▶ [DRIP MODE] Identifying candidates for safe daily update...");
    
    // 1. Drip TGEs (Priority: New projects awaiting spotlight)
    for (const tge of upcomingTges) {
      if (targetToken && tge.id !== targetToken) continue;
      if (tge.status === "released") continue; // Released ones go to Phase 2 (Graduation)
      if (!shouldPublishTgePreview(tge)) continue;
      
      // Check both queue and published dirs for existing TGE preview
      const tgeFile = resolveContentFile(tge.id, "tge-preview");
      if (!tgeFile || (await isStale(tgeFile, 7))) {
        tgeTokensToProcess.push(tge.id);
      }
      if (tgeTokensToProcess.length >= maxTgeTokens) break;
    }

    // 2. High Priority: TGE Graduation (Newly launched tokens needing full guides)
    const graduatedToProcess: string[] = [];
    for (const tge of upcomingTges) {
      if (tge.status === "released") {
        // Check BOTH queue and published content directories — once graduated
        // content is published, the queue folder is deleted by publish-from-queue.ts
        const hasOverview = existsInEitherDir(tge.id, "overview");
        if (!hasOverview) {
          graduatedToProcess.push(tge.id);
          console.log(`  🎓 [GRADUATION] Found newly released token: ${tge.name} (${tge.id}). Adding to high-priority queue.`);
        }
      }
      if (graduatedToProcess.length >= maxRefresh) break;
    }

    // ── Smart Drip: 3-Tier Priority Queue ──────────────────────────
    // Priority 1: Volatile tokens (>15% 24h price change)
    // Priority 2: Empty/incomplete tokens (missing overview, price-prediction, or how-to-buy)
    // Priority 3: Oldest articles (stale refresh)

    const volatileTokens: string[] = [];
    const incompleteTokens: string[] = [];
    const refreshCandidates: { id: string; lastGen: number }[] = [];

    const allTrackedIds = tokenFiles.map(f => f.replace(".json", ""));

    for (const id of allTrackedIds) {
      if (targetToken && id !== targetToken) continue;
      if (upcomingTgeIdSet.has(id)) continue;
      if (graduatedToProcess.includes(id)) continue;

      // Load token market data for volatility check
      const tokenDataPath = path.join(TOKENS_DIR, `${id}.json`);
      let tokenMarketData: any = null;
      try {
        if (fs.existsSync(tokenDataPath)) {
          tokenMarketData = JSON.parse(await fs.promises.readFile(tokenDataPath, "utf-8"));
        }
      } catch (_e) {}

      // Priority 1: Volatile (>15% 24h move) with 24h cooldown
      const change24h = tokenMarketData?.market?.priceChange24h ?? 0;
      if (Math.abs(change24h) >= 15) {
        // Cooldown: don't re-generate if content was already updated in last 24h
        const recentFile = resolveContentFile(id, "overview");
        if (recentFile) {
          const recentData = safeReadJson<any>(recentFile, null);
          if (recentData?.generatedAt) {
            const hoursSince = (Date.now() - new Date(recentData.generatedAt).getTime()) / (1000 * 60 * 60);
            if (hoursSince < 24) {
              // Already regenerated recently for this volatile move — skip
              continue;
            }
          }
        }
        volatileTokens.push(id);
        console.log(`  ⚡ [VOLATILE] ${tokenMarketData?.name || id}: ${change24h >= 0 ? "+" : ""}${change24h.toFixed(1)}% 24h change`);
        continue;
      }

      // Priority 2: Empty or incomplete content hub
      // Check BOTH queue and published dirs — queue is ephemeral (deleted after publish)
      const hasOverview = existsInEitherDir(id, "overview");
      const hasPrice = existsInEitherDir(id, "price-prediction");
      const hasHowToBuy = existsInEitherDir(id, "how-to-buy");

      if (!hasOverview || !hasPrice || !hasHowToBuy) {
        const missing: string[] = [];
        if (!hasOverview) missing.push("overview");
        if (!hasPrice) missing.push("price-prediction");
        if (!hasHowToBuy) missing.push("how-to-buy");
        incompleteTokens.push(id);
        console.log(`  📝 [INCOMPLETE] ${tokenMarketData?.name || id}: missing ${missing.join(", ")}`);
        continue;
      }

      // Priority 3: Refresh candidate — enforce 30-day minimum age from PUBLISHED content
      // Read from published dir (not queue — queue is ephemeral)
      const publishedOverviewPath = resolveContentFile(id, "overview");
      if (publishedOverviewPath) {
        const data = safeReadJson<any>(publishedOverviewPath, null);
        if (data?.generatedAt) {
          try {
            const lastGen = new Date(data.generatedAt).getTime();
            const ageDays = (Date.now() - lastGen) / (1000 * 60 * 60 * 24);
            if (ageDays >= 30) {
              refreshCandidates.push({ id, lastGen });
            }
          } catch (_e) {
            // Corrupt date — treat as needing refresh
            refreshCandidates.push({ id, lastGen: 0 });
          }
        }
      }
    }

    // Sort refresh candidates by oldest first
    refreshCandidates.sort((a, b) => a.lastGen - b.lastGen);

    // ── Hybrid Smart Queue ──────────────────────────────────────
    // Strategy: Time-sensitive items first, then balanced distribution.
    //   P0: ALL graduated tokens (no cap — too valuable to delay)
    //   P1/P2: Split remaining budget evenly between Volatile & Incomplete
    //   P3: Fill any leftover slots with Stale Refreshes
    const budget = maxRefresh;
    const smartQueue: string[] = [];

    // P0: Graduated tokens — take ALL (time-sensitive, launch-day SEO)
    for (const id of graduatedToProcess) {
      if (smartQueue.length >= budget) break;
      smartQueue.push(id);
    }

    // Calculate remaining budget after graduations
    const remainingAfterGrad = Math.max(0, budget - smartQueue.length);
    // Split remaining evenly between Volatile (P1) and Incomplete (P2)
    const perTierBudget = Math.floor(remainingAfterGrad / 2);
    // If odd remainder, give the extra slot to Volatile (more time-sensitive)
    const volatileBudget = perTierBudget + (remainingAfterGrad % 2);
    const incompleteBudget = perTierBudget;

    // P1: Volatile tokens (market-moving events)
    let volatileAdded = 0;
    for (const id of volatileTokens) {
      if (volatileAdded >= volatileBudget) break;
      if (smartQueue.includes(id)) continue;
      smartQueue.push(id);
      volatileAdded++;
    }

    // P2: Incomplete tokens (missing articles — SEO coverage gaps)
    let incompleteAdded = 0;
    for (const id of incompleteTokens) {
      if (incompleteAdded >= incompleteBudget) break;
      if (smartQueue.includes(id)) continue;
      smartQueue.push(id);
      incompleteAdded++;
    }

    // P3: Stale refreshes (fill any remaining slots)
    for (const { id } of refreshCandidates) {
      if (smartQueue.length >= budget) break;
      if (smartQueue.includes(id)) continue;
      smartQueue.push(id);
    }

    tokensToProcess = [...smartQueue];

    const graduatedSelected = graduatedToProcess.filter(id => smartQueue.includes(id)).length;
    const volatileSelected = volatileTokens.filter(id => smartQueue.includes(id) && !graduatedToProcess.includes(id)).length;
    const incompleteSelected = incompleteTokens.filter(id => smartQueue.includes(id)).length;
    const refreshSelected = refreshCandidates.filter(c => smartQueue.includes(c.id) && !graduatedToProcess.includes(c.id) && !volatileTokens.includes(c.id) && !incompleteTokens.includes(c.id)).length;

    console.log(`  ✦ Hybrid Smart Queue (budget: ${budget}):`);
    console.log(`    🎓 Graduated:  ${graduatedSelected} / ${graduatedToProcess.length} found (uncapped)`);
    console.log(`    ⚡ Volatile:   ${volatileSelected} / ${volatileTokens.length} found (cap: ${volatileBudget})`);
    console.log(`    📝 Incomplete: ${incompleteSelected} / ${incompleteTokens.length} found (cap: ${incompleteBudget})`);
    console.log(`    🔄 Refreshes:  ${refreshSelected} (leftover slots)`);
    console.log(`    📊 Total:      ${tokensToProcess.length} tokens`);
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
      const overviewPath = path.join(CONTENT_BASE_DIR, id, "overview.json");
      const pricePath = path.join(CONTENT_BASE_DIR, id, "price-prediction.json");
      const howToBuyPath = path.join(CONTENT_BASE_DIR, id, "how-to-buy.json");

      let needsGeneration = false;
      let tokenData = null;
      try {
        tokenData = JSON.parse(await fs.promises.readFile(path.join(TOKENS_DIR, f), "utf-8"));
      } catch (_e) {}

      if (targetType) {
        needsGeneration = await isStale(path.join(CONTENT_BASE_DIR, id, `${targetType}.json`), 30, tokenData);
      } else {
        needsGeneration = ((await isStale(overviewPath, 30, tokenData))) || ((await isStale(pricePath, 30, tokenData))) || ((await isStale(howToBuyPath, 30, tokenData)));
      }

      if (refreshMacro && !needsGeneration) {
        const metadataPath = path.join(CONTENT_BASE_DIR, id, "overview.json");
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
      if (tge.status === "released") continue;
      if (!shouldPublishTgePreview(tge)) continue;

      const tgePath = path.join(CONTENT_BASE_DIR, tge.id, "tge-preview.json");
      if ((await isStale(tgePath, 7)) || args.includes("--force")) {
        tgeTokensToProcess.push(tge.id);
      }
      if (tgeTokensToProcess.length >= maxTgeTokens) break;
    }
  }

  // Also check content/tokens directory to catch tokens that have content but no detailed data yet
  if (!dripMode && tokensToProcess.length < maxTokens && fs.existsSync(CONTENT_DIR)) {
    const contentDirs = fs.readdirSync(CONTENT_DIR);
    for (const id of contentDirs) {
      if (targetToken && id !== targetToken) continue;
      if (tokensToProcess.includes(id)) continue;

      // Skip upcoming TGEs — they belong in the TGE queue only
      if (upcomingTgeIdSet.has(id)) continue;

      const overviewPath = path.join(CONTENT_BASE_DIR, id, "overview.json");
      
      let tokenData = null;
      try {
        const p = path.join(TOKENS_DIR, `${id}.json`);
        if(fs.existsSync(p)) tokenData = JSON.parse(await fs.promises.readFile(p, "utf-8"));
      } catch (_e) {}

      const needsGeneration = targetType 
        ? await isStale(path.join(CONTENT_BASE_DIR, id, `${targetType}.json`), 30, tokenData)
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
    const matchingTgeEntry = isTge ? upcomingTges.find((t: UpcomingTge) => t.id === tokenId) : null;
    
    if (fs.existsSync(tokenFilePath)) {
      tokenData = JSON.parse(await fs.promises.readFile(tokenFilePath, "utf-8"));
    }

    if (isTge && matchingTgeEntry) {
      tokenData = {
        ...tokenData,
        name: matchingTgeEntry.name || tokenData.name,
        symbol: matchingTgeEntry.symbol || tokenData.symbol,
        category: matchingTgeEntry.category || tokenData.category,
      };
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
      const contractQueries = matchingTgeEntry ? getTgeContractQueries(matchingTgeEntry) : [];
      if (contractQueries.length === 0) {
        console.log("  [DEX SYNC] Skipped: no verified contract address for this TGE.");
      } else {
      process.stdout.write(`  [DEX SYNC] Searching GeckoTerminal for ${tokenData.symbol}... `);
      try {
        const pools = await searchGeckoTerminalPools(contractQueries[0]);
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

    // Double check stale status — check both queue dir AND published content dir,
    // since queue is wiped after publish-from-queue.ts runs
    const configsToGenerate = [];
    for (const config of filteredConfigs) {
      const outputDir = ensureContentDir(tokenId, useQueue);
      const outputFile = path.join(outputDir, `${config.slug}.json`);
      const publishedFile = path.join(CONTENT_DIR, tokenId, `${config.slug}.json`);
      const fileToCheck = fs.existsSync(outputFile) ? outputFile : publishedFile;
      if (fs.existsSync(fileToCheck) && !(await isStale(fileToCheck, isTge ? 7 : 30)) && !args.includes("--force")) {
        console.log(`  ⏭ ${config.type} — generated recently`);
      } else {
        configsToGenerate.push(config);
      }
    }

    if (configsToGenerate.length === 0) continue;

    const sectionsToGenerate = configsToGenerate.map(c => c.type);
    console.log(`  🤖 Generating [${sectionsToGenerate.join(", ")}] individually...`);

    try {
      if (dryRun) {
        console.log(`  [DRY-RUN] Would generate sections: ${sectionsToGenerate.join(", ")}`);
        continue;
      }

      let allSectionsSuccessful = true;
      let currentCost = 0;

      for (const config of configsToGenerate) {
        process.stdout.write(`    ⏳ Generating ${config.type}...`);
        
        const contentPrompt = `
You are an expert crypto analyst and technical writer. 
Generate a comprehensive report for ${tokenData.name} (${tokenData.symbol?.toUpperCase()}).

=== SECTION: ${config.type} ===
TITLE TO USE: ${config.title}
INSTRUCTIONS:
${config.prompt}

TARGET LENGTH: ${getTargetLengthLabel(config.type)} words.
DO NOT shorten or summarize.
MANDATORY: MUST include an introductory paragraph, a Markdown summary table, several ## sections, a "## FAQ" section with 3-5 Q&As, and the disclaimer at the end.

=== OUTPUT FORMAT ===
Output EXACTLY in this format (no JSON, no code blocks):

---TITLE---
<the article title>
---CONTENT---
<the full markdown article content>
---END---
`;

        let result: AIResult | null = null;
        let attempts = 0;
        const maxAttempts = 3;
        let parsedSection: { title?: string, content?: string } | null = null;

        let qualityCheckPassed = true;
        while (attempts < maxAttempts) {
          attempts++;
          qualityCheckPassed = true;
          result = await callAIWithFallback(config.type === "tge-preview" ? TGE_SYSTEM_PROMPT : SYSTEM_PROMPT, contentPrompt, 8192);
          
          currentCost += result.cost;

          try {
            const raw = result.content.trim();
            const titleMatch = raw.match(/---TITLE---\s*([\s\S]*?)\s*---CONTENT---/);
            const contentMatch = raw.match(/---CONTENT---\s*([\s\S]*?)\s*(?:---END---|$)/);
            
            if (titleMatch && contentMatch) {
              parsedSection = {
                title: titleMatch[1].trim(),
                content: contentMatch[1].trim()
              };
            } else {
              // Fallback: try JSON parse (for Claude fallback which uses tool_use)
              let cleanJson = raw;
              const jsonMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
              if (jsonMatch) {
                cleanJson = jsonMatch[1].trim();
              } else if (cleanJson.startsWith('```')) {
                cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
              }
              parsedSection = JSON.parse(cleanJson);
            }

            if (parsedSection && parsedSection.content && parsedSection.title) {
              const quality = evaluateArticleQuality({
                type: config.type,
                slug: config.slug,
                title: parsedSection.title,
                content: parsedSection.content,
              });

              if (!quality.passed) {
                console.log(`\n      ⚠ Attempt ${attempts}: ${config.type} quality failed: ${quality.issues.join("; ")}`);
                qualityCheckPassed = false;
              }

              if (config.type === "tge-preview" && /\{\{[A-Z0-9_]+\}\}/.test(`${parsedSection.title}\n${parsedSection.content}`)) {
                console.log(`\n      Warning: ${config.type} contains unresolved template placeholders.`);
                qualityCheckPassed = false;
              }

              if (qualityCheckPassed) {
                 break; // Success
              }
            } else {
               console.log(`      ⚠ Attempt ${attempts} missing title/content in output.`);
               qualityCheckPassed = false;
            }
          } catch (e: any) {
            console.log(`      ⚠ Attempt ${attempts} failed to parse output: ${e.message}`);
            qualityCheckPassed = false;
          }
          parsedSection = null; // Reset on failure
          if (attempts < maxAttempts) {
            process.stdout.write(`      🤖 Retrying ${config.type} with stricter quality focus...`);
          }
        }

        if (!result || !parsedSection || !parsedSection.content || !parsedSection.title) {
           console.log(`\n    ✗ ${config.type} failed after ${maxAttempts} attempts`);
           allSectionsSuccessful = false;
           continue;
        }

        // Save immediately
        const outputDir = ensureContentDir(tokenId, useQueue);
        const outputFile = path.join(outputDir, `${config.slug}.json`);
        const wordCount = parsedSection.content.split(/\s+/).filter(Boolean).length;
        
        const article: GeneratedArticle = {
          tokenId,
          tokenName: tokenData.name,
          type: config.type,
          title: parsedSection.title,
          slug: config.slug,
          content: parsedSection.content,
          wordCount,
          generatedAt: new Date().toISOString(),
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        };
        article.quality = buildArticleQualitySnapshot(article);

        await fs.promises.writeFile(outputFile, JSON.stringify(article, null, 2));
        
        logActivity("generate", {
          tokenId,
          tokenName: tokenData.name,
          articleType: config.type,
          isTge,
          wordCount,
          cost: result.cost
        });
        
        console.log(` ✓ (${wordCount} words)`);
      }
      
      totalCost += currentCost;
      if (allSectionsSuccessful) {
        if (isTge) {
          generatedTgeTokens.add(tokenId);
        } else {
          generatedRegularTokens.add(tokenId);
        }
        totalArticles += configsToGenerate.length;
        console.log(` ✓ All sections generated successfully ($${currentCost.toFixed(4)})`);
      } else {
        console.log(` ⚠ Completed with some failed sections ($${currentCost.toFixed(4)})`);
      }
      
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

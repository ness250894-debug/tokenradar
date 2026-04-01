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
import * as dotenv from "dotenv";
import { fetchFullTokenData } from "../src/lib/coingecko";
import { logError, sendTelegramAlert, logActivity } from "../src/lib/reporter";
import { sleep } from "../src/lib/utils";
import { getRelatedTokens, type UpcomingTge, type TokenDetail } from "../src/lib/content-loader";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

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
  if (!fs.existsSync(pricesFile)) return "";

  try {
    const data = JSON.parse(await fs.promises.readFile(pricesFile, "utf-8"));
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
6. Include at least 3 specific numerical data points (e.g., prices starting with $, percentages, or large numbers separated by commas). This is a strictly enforced rule.
7. Reference at least 1 real-world development or event.
8. Strictly follow the word count instructions provided in each specific prompt.
9. ONLY use markdown heading ## for sections. DO NOT use ### or deeper subheadings.
10. Include a FAQ section at the end with 3-5 questions and answers. Format it exactly as "## FAQ".
11. End every article with: "---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*"
12. MANDATORY: Include a Markdown table detailing specific token statistics or market comparisons early in the article. This is critical for Google Featured Snippets.

FORMAT:
- Start with a brief intro paragraph (no heading)
- Include a Markdown Summary Table early in the article (e.g. Price, Market Cap, Risk Score)
- Use ## for all main sections and subsections
- Include bullet points and bold text for key data
- Include a structured FAQ section at the end using ## FAQ format`;

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
` : "";

  const overviewTitles = [
    `What is ${tokenName} (${symbol.toUpperCase()})? Complete Guide`,
    `Understanding ${tokenName} (${symbol.toUpperCase()}): An In-Depth Look`,
    `The Ultimate Guide to ${tokenName} (${symbol.toUpperCase()})`,
    `${tokenName} (${symbol.toUpperCase()}) Explained: Fundamentals and Future Potential`
  ];

  const overviewPrompts = [
    `Write a comprehensive overview article about ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 1,200 - 1,500 words.\n\nCover:\n1. What ${tokenName} is and what problem it solves\n2. How the technology works (simplified)\n3. Tokenomics (supply, distribution, use cases)\n4. Current market position (price, market cap, rank)\n5. TokenRadar's proprietary metrics analysis (Risk Score, Growth Index, Narrative Strength)\n6. Key risks and concerns\n7. Recent developments and roadmap\n\n${commonContext}`,
    `Create a detailed guide covering ${tokenName} (${symbol.toUpperCase()}).\n\nTARGET LENGTH: 1,200 - 1,500 words.\n\nStructure the article to answer:\n- The Core Problem: Why does ${tokenName} exist and what does it solve?\n- Technical Architecture: How it operates under the hood\n- Token Utility & Economics: Use cases and supply metrics\n- Market Analysis: Price, market cap, and rank review\n- TokenRadar Metrics: Deep dive into Risk Score and Narrative Strength\n- Potential Headwinds: Risks and competitor analysis\n\n${commonContext}`
  ];

  const priceTitles = [
    `${tokenName} (${symbol.toUpperCase()}) Price Prediction 2026-2027`,
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


function ensureContentDir(tokenId: string): string {
  const dir = path.join(CONTENT_DIR, tokenId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function isStale(filePath: string, maxAgeDays: number, tokenData?: Partial<TokenDetail> & { market?: { priceChange24h?: number } }): Promise<boolean> {
  if (tokenData?.market?.priceChange24h) {
    if (Math.abs(tokenData.market.priceChange24h) >= 15) {
      console.log(`  [VOLATILITY TRIGGER] >15% move detected. Forcing update.`);
      return true; 
    }
  }

  if (!fs.existsSync(filePath)) return true;
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (!data.generatedAt) return true;
    
    const diffMs = Date.now() - new Date(data.generatedAt).getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    return diffDays >= maxAgeDays;
  } catch (e) {
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
  const maxTokens = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 5;
  const maxTgeTokens = maxTgeIdx !== -1 ? parseInt(args[maxTgeIdx + 1], 10) : 5;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — AI Content Generator       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN (no API calls)" : "LIVE"}`);
  console.log(`  Target token: ${targetToken || "all"}`);
  console.log(`  Target type: ${targetType || "all"}`);
  console.log(`  Max tracked tokens: ${maxTokens}`);
  console.log(`  Max TGE tokens:     ${maxTgeTokens}`);
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
  const upcomingTges: UpcomingTge[] = fs.existsSync(TGE_FILE) ? JSON.parse(await fs.promises.readFile(TGE_FILE, "utf-8")) : [];

  // Build a set of upcoming TGE IDs (status !== "released") so we can
  // exclude them from the regular token queue. Tokens that have already
  // graduated (status === "released") are NOT excluded.
  const upcomingTgeIdSet = new Set<string>(
    upcomingTges
      .filter((t: { status?: string }) => t.status !== "released")
      .map((t: { id: string }) => t.id)
  );

  // Filter tokens to find ones that actually need generation
  const tokensToProcess: string[] = [];
  
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
    // We parse token data early just to pass it to isStale
    let tokenData = null;
    try {
      tokenData = JSON.parse(await fs.promises.readFile(path.join(TOKENS_DIR, f), "utf-8"));
    } catch (e) {}

    if (targetType) {
      needsGeneration = await isStale(path.join(CONTENT_DIR, id, `${targetType}.json`), 30, tokenData);
    } else {
      needsGeneration = ((await isStale(overviewPath, 30, tokenData))) || ((await isStale(pricePath, 30, tokenData))) || ((await isStale(howToBuyPath, 30, tokenData)));
    }

    if (needsGeneration || args.includes("--force")) {
      tokensToProcess.push(id);
    }
    
    if (tokensToProcess.length >= maxTokens) break;
  }

  // Build separate TGE queue (independent budget)
  const tgeTokensToProcess: string[] = [];
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
      } catch (e) {}

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
        if (!fs.existsSync(PRICES_DIR)) {
          fs.mkdirSync(PRICES_DIR, { recursive: true });
        }

        await fs.promises.writeFile(
          path.join(PRICES_DIR, `${tokenId}.json`),
          JSON.stringify({
            id: tokenId,
            name: fullData.name,
            chart30d: chart30d?.prices.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [],
            chart1y: chart1y?.prices.map(p => ({ date: new Date(p[0]).toISOString(), price: p[1] })) || [],
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
    let metrics: Record<string, unknown> = {};
    const metricsFile = path.join(METRICS_DIR, `${tokenId}.json`);
    if (fs.existsSync(metricsFile)) {
      metrics = JSON.parse(await fs.promises.readFile(metricsFile, "utf-8"));
    }

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
        relatedTokenNames = getRelatedTokens(tokenId, 2).map((t: any) => t.name);
      } catch (e) {
        // Safe fallback
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
      relatedTokenNames
    );

    // For TGE tokens, only generate tge-preview; for tracked tokens, skip tge-preview
    const filteredConfigs = isTge
      ? configs.filter((c) => c.type === "tge-preview")
      : targetType
        ? configs.filter((c) => c.type === targetType)
        : configs.filter((c) => c.type !== "tge-preview");

    console.log(`▶ ${tokenData.name} (${tokenData.symbol.toUpperCase()}):`);

    for (const config of filteredConfigs) {
      const outputDir = ensureContentDir(tokenId);
      const outputFile = path.join(outputDir, `${config.slug}.json`);

      // 3. Ensure metadata file exists in TOKENS_DIR so Next.js builds the route
      //    BUT: skip for TGE tokens — they should only have routes under /upcoming/[token]
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

      // Skip if already generated recently
      if (fs.existsSync(outputFile) && !(await isStale(outputFile, isTge ? 7 : 30)) && !args.includes("--force")) {
        console.log(`  ⏭ ${config.type} — generated recently (use --force to overwrite)`);
        continue;
      }

      if (dryRun) {
        console.log(`  📝 ${config.type}: "${config.title}"`);
        console.log(`     Prompt length: ${config.prompt.length} chars`);

        // Save prompt preview
        await fs.promises.writeFile(
          path.join(outputDir, `${config.slug}.prompt.txt`),
          `SYSTEM:\n${SYSTEM_PROMPT}\n\nUSER:\n${config.prompt}`
        );
        continue;
      }

      process.stdout.write(`  🤖 ${config.type}...`);

      try {
        let result: AIResult | null = null;
        let wordCount = 0;
        let attempts = 0;
        const maxAttempts = 2; // inline retry limit

        while (attempts < maxAttempts) {
          attempts++;
          result = await callAIWithFallback(SYSTEM_PROMPT, config.prompt);
          wordCount = result.content.split(/\s+/).length;
          
          // Add the returned cost
          totalCost += result.cost;

          // Check data points
          const dataPointRegex = /\$[\d,.]+|\d+(\.\d+)?%|\d{1,3}(,\d{3})+/g;
          const dataPoints = result.content.match(dataPointRegex) || [];
          if (dataPoints.length >= 3) {
            break; // Valid content
          } else {
            console.log(`\n    ⚠ Attempt ${attempts} failed data points check (${dataPoints.length}/3).`);
            if (attempts < maxAttempts) {
              process.stdout.write(`    🤖 Retrying...`);
            }
          }
        }

        if (!result) continue; // Should not happen, but satisfies TS

        const article: GeneratedArticle = {
          tokenId,
          tokenName: tokenData.name,
          type: config.type,
          title: config.title,
          slug: config.slug,
          content: result.content,
          wordCount,
          generatedAt: new Date().toISOString(),
          model: result.model,
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        };

        await fs.promises.writeFile(outputFile, JSON.stringify(article, null, 2));
        // Log the activity to the unified system reporter
        logActivity("generate", {
          tokenId,
          tokenName: tokenData.name,
          articleType: config.type,
          isTge,
          wordCount,
          cost: result.cost
        });

        totalArticles++;
        if (isTge) {
          generatedTgeTokens.add(tokenId);
        } else {
          generatedRegularTokens.add(tokenId);
        }
        console.log(
          ` ✓ ${wordCount} words ($${result.cost.toFixed(4)})`
        );

        // Rate limit between articles
        await sleep(1000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(` ✗ ${msg}`);
        await logError("generate-content AI", error, false);
      }
    }
    console.log();
  }

  // Removed legacy Telegram Telemetry Report in favor of unified System Report

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

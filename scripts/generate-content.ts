/**
 * AI Content Generator — Phase 3
 *
 * Generates SEO-optimized articles using Claude Haiku 4.5.
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
 * Cost: ~$0.015 per article (Claude Haiku 4.5)
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");
const METRICS_DIR = path.join(DATA_DIR, "metrics");
const REFERENCES_DIR = path.join(DATA_DIR, "references");
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

// ── Claude API ─────────────────────────────────────────────────

/**
 * Call Claude Haiku 4.5 API via Anthropic's Messages endpoint.
 */
async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 4000
): Promise<{ content: string; promptTokens: number; completionTokens: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to .env.local"
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} — ${error}`);
  }

  const data = (await response.json()) as {
    content: { type: string; text: string }[];
    usage: { input_tokens: number; output_tokens: number };
  };

  return {
    content: data.content[0]?.text || "",
    promptTokens: data.usage?.input_tokens || 0,
    completionTokens: data.usage?.output_tokens || 0,
  };
}

// ── Prompt Templates ───────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert crypto analyst writing for TokenRadar.co, a data-driven crypto research platform.

STRICT RULES:
1. Write in a professional, analytical tone. No hype, no FOMO.
2. NEVER recommend buying or selling any token.
3. NEVER guarantee returns or profits.
4. NEVER use phrases like "you should invest", "guaranteed gains", "moonshot".
5. Always present data and analysis objectively.
6. Include at least 3 specific data points from the provided data.
7. Reference at least 1 real-world development or event.
8. Strictly follow the word count instructions provided in each specific prompt.
9. Use markdown formatting with proper headings (## for sections).
10. Include a FAQ section at the end with 3-5 questions and answers.
11. End every article with: "---\\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*"

FORMAT:
- Start with a brief intro paragraph (no heading)
- Use ## for main sections
- Use ### for subsections
- Include bullet points and bold text for key data
- Include a structured FAQ section at the end using ### FAQ format`;

/**
 * Build article-specific prompts.
 */
function buildArticleConfigs(
  tokenId: string,
  tokenName: string,
  symbol: string,
  tokenData: Record<string, unknown>,
  metrics: Record<string, unknown>,
  references: { articles: { title: string; snippet: string; source: string }[] }
): ArticleConfig[] {
  const dataStr = JSON.stringify(tokenData, null, 2);
  const metricsStr = JSON.stringify(metrics, null, 2);
  const refsStr = references.articles
    .map((a) => `- [${a.source}] "${a.title}": ${a.snippet}`)
    .join("\n");

  const commonContext = `
TOKEN DATA (from CoinGecko):
${dataStr}

PROPRIETARY METRICS (computed by TokenRadar):
${metricsStr}

REFERENCE ARTICLES (use as fact/style reference only — do NOT copy):
${refsStr || "No recent articles found."}`;

  return [
    {
      type: "overview",
      title: `What is ${tokenName} (${symbol.toUpperCase()})? Complete Guide`,
      slug: "overview",
      prompt: `Write a comprehensive overview article about ${tokenName} (${symbol.toUpperCase()}).

TARGET LENGTH: 1,200 - 1,500 words.

Cover:
1. What ${tokenName} is and what problem it solves
2. How the technology works (simplified)
3. Tokenomics (supply, distribution, use cases)
4. Current market position (price, market cap, rank)
5. TokenRadar's proprietary metrics analysis (Risk Score, Growth Index, Narrative Strength)
6. Key risks and concerns
7. Recent developments and roadmap

${commonContext}`,
    },
    {
      type: "price-prediction",
      title: `${tokenName} (${symbol.toUpperCase()}) Price Prediction 2026-2027`,
      slug: "price-prediction",
      prompt: `Write a data-driven price analysis article for ${tokenName} (${symbol.toUpperCase()}).

CRITICAL: You are NOT making predictions. You are analyzing data trends, historical patterns, and market conditions to discuss possible scenarios.

TARGET LENGTH: 1,000 - 1,200 words. Be analytical and concise.

Cover:
1. Current price and recent performance (30d, 1y trends)
2. Technical analysis of key support/resistance levels
3. Comparison to ATH and ATL
4. Market cap growth scenarios (bear, base, bull cases)
5. Risk factors that could affect price (use Risk Score data)
6. How ${tokenName} compares to category peers
7. Include data ranges, not single predictions

REMEMBER: Present multiple scenarios with data-backed reasoning. Use phrases like "based on current data", "historical patterns suggest", "in a bullish scenario". NEVER predict exact prices.

${commonContext}`,
    },
    {
      type: "how-to-buy",
      title: `How to Buy ${tokenName} (${symbol.toUpperCase()}) — Step-by-Step Guide`,
      slug: "how-to-buy",
      prompt: `Write a practical step-by-step guide for buying ${tokenName} (${symbol.toUpperCase()}).

TARGET LENGTH: 600 - 800 words. Be highly concise, actionable, and skip unnecessary filler.

Cover:
1. Quick overview of ${tokenName} and why people are interested
2. Which major exchanges list ${symbol.toUpperCase()} (Binance, Coinbase, Bybit, etc.)
3. Step-by-step process:
   - Create/verify exchange account
   - Deposit funds (fiat or crypto)
   - Find the ${symbol.toUpperCase()} trading pair
   - Place your order (market vs limit)
4. How to store ${symbol.toUpperCase()} safely (exchanges vs wallets)
5. Key considerations before buying (Risk Score, volatility data)
6. Tax implications overview (general, not specific advice)

Note: Include TokenRadar's Risk Score and relevant market data to help readers make informed decisions.

${commonContext}`,
    },
  ];
}

// ── Utilities ──────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureContentDir(tokenId: string): string {
  const dir = path.join(CONTENT_DIR, tokenId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf("--token");
  const typeIdx = args.indexOf("--type");
  const maxIdx = args.indexOf("--max");
  const targetToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;
  const targetType = typeIdx !== -1 ? args[typeIdx + 1] : null;
  const dryRun = args.includes("--dry-run");
  const maxTokens = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 5;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — AI Content Generator       ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN (no API calls)" : "LIVE"}`);
  console.log(`  Target token: ${targetToken || "all"}`);
  console.log(`  Target type: ${targetType || "all"}`);
  console.log(`  Max tokens to process: ${maxTokens}`);
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

  // Filter tokens to find ones that actually need generation
  let tokensToProcess: string[] = [];
  
  for (const f of tokenFiles) {
    const id = f.replace(".json", "");
    if (targetToken && id !== targetToken) continue;

    // Check if this token is missing any generated content
    const hasOverview = fs.existsSync(path.join(CONTENT_DIR, id, "overview.json"));
    const hasPrice = fs.existsSync(path.join(CONTENT_DIR, id, "price-prediction.json"));
    const hasHowToBuy = fs.existsSync(path.join(CONTENT_DIR, id, "how-to-buy.json"));
    
    // If targeting a specific type, check only that type for existence
    let needsGeneration = false;
    if (targetType) {
      needsGeneration = !fs.existsSync(path.join(CONTENT_DIR, id, `${targetType}.json`));
    } else {
      needsGeneration = !hasOverview || !hasPrice || !hasHowToBuy;
    }

    if (needsGeneration || args.includes("--force")) {
      tokensToProcess.push(id);
    }
    
    if (tokensToProcess.length >= maxTokens) break;
  }

  console.log(`  Tokens needing generation: ${tokensToProcess.length}`);
  console.log();

  let totalArticles = 0;
  let totalCost = 0;

  for (const tokenId of tokensToProcess) {
    // Load data
    const tokenData = JSON.parse(
      fs.readFileSync(path.join(TOKENS_DIR, `${tokenId}.json`), "utf-8")
    );

    // Load metrics (may not exist yet)
    let metrics: Record<string, unknown> = {};
    const metricsFile = path.join(METRICS_DIR, `${tokenId}.json`);
    if (fs.existsSync(metricsFile)) {
      metrics = JSON.parse(fs.readFileSync(metricsFile, "utf-8"));
    }

    // Load references (may not exist)
    let references = { articles: [] as { title: string; snippet: string; source: string }[] };
    const refsFile = path.join(REFERENCES_DIR, `${tokenId}.json`);
    if (fs.existsSync(refsFile)) {
      references = JSON.parse(fs.readFileSync(refsFile, "utf-8"));
    }

    // Build article configs
    const configs = buildArticleConfigs(
      tokenId,
      tokenData.name,
      tokenData.symbol,
      tokenData,
      metrics,
      references
    );

    const filteredConfigs = targetType
      ? configs.filter((c) => c.type === targetType)
      : configs;

    console.log(`▶ ${tokenData.name} (${tokenData.symbol.toUpperCase()}):`);

    for (const config of filteredConfigs) {
      const outputDir = ensureContentDir(tokenId);
      const outputFile = path.join(outputDir, `${config.slug}.json`);

      // Skip if already generated
      if (fs.existsSync(outputFile) && !args.includes("--force")) {
        console.log(`  ⏭ ${config.type} — already exists (use --force to regenerate)`);
        continue;
      }

      if (dryRun) {
        console.log(`  📝 ${config.type}: "${config.title}"`);
        console.log(`     Prompt length: ${config.prompt.length} chars`);

        // Save prompt preview
        fs.writeFileSync(
          path.join(outputDir, `${config.slug}.prompt.txt`),
          `SYSTEM:\n${SYSTEM_PROMPT}\n\nUSER:\n${config.prompt}`
        );
        continue;
      }

      process.stdout.write(`  🤖 ${config.type}...`);

      try {
        const result = await callClaude(SYSTEM_PROMPT, config.prompt);
        const wordCount = result.content.split(/\s+/).length;

        // Estimate cost (Haiku: $1/M input, $5/M output)
        const cost =
          (result.promptTokens / 1_000_000) * 1.0 +
          (result.completionTokens / 1_000_000) * 5.0;
        totalCost += cost;

        const article: GeneratedArticle = {
          tokenId,
          tokenName: tokenData.name,
          type: config.type,
          title: config.title,
          slug: config.slug,
          content: result.content,
          wordCount,
          generatedAt: new Date().toISOString(),
          model: "claude-haiku-4-5-20251001",
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
        };

        fs.writeFileSync(outputFile, JSON.stringify(article, null, 2));
        totalArticles++;
        console.log(
          ` ✓ ${wordCount} words ($${cost.toFixed(4)})`
        );

        // Rate limit between articles
        await sleep(1000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(` ✗ ${msg}`);
      }
    }
    console.log();
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║       Content Generation Complete        ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Articles:  ${String(totalArticles).padStart(6)}                 ║`);
  console.log(`║  Est Cost:  $${totalCost.toFixed(4).padStart(5)}                 ║`);
  console.log(`║  Output:    content/tokens/              ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch((error) => {
  console.error("\n✖ Fatal error:", error);
  process.exit(1);
});

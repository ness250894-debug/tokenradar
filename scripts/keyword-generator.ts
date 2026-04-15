/**
 * Keyword Research Engine — Phase 1
 *
 * Generates long-tail crypto keywords using a Template × Token matrix.
 *
 * Steps:
 * 1. Fetch tokens #1-#250 from CoinGecko
 * 2. Generate all template × token combinations
 * 3. Query Google Autocomplete for real search suggestions
 * 4. Deduplicate and output to data/keywords.json
 *
 * Usage:
 *   npx tsx scripts/keyword-generator.ts
 *   npx tsx scripts/keyword-generator.ts --skip-autocomplete  (faster, no Google queries)
 *   npx tsx scripts/keyword-generator.ts --start 50 --end 100  (custom rank range)
 *
 * Cost: $0 (CoinGecko free tier + Google Autocomplete is free)
 */

import * as fs from "fs";
import * as path from "path";
import { fetchTokensByRank, type CoinGeckoToken } from "../src/lib/coingecko";
import { logError } from "../src/lib/reporter";
import { sleep } from "../src/lib/shared-utils";

// ── Configuration ──────────────────────────────────────────────

const DATA_DIR = path.resolve(__dirname, "../data");
const OUTPUT_FILE = path.join(DATA_DIR, "keywords.json");
const TOKENS_FILE = path.join(DATA_DIR, "tokens.json");

/** Keyword templates — {token} is replaced with the token name. */
const TEMPLATES = [
  `{token} price prediction ${new Date().getFullYear()}`,
  "{token} price prediction 2027",
  "is {token} a good investment",
  "is {token} worth buying",
  "{token} vs {rival}",
  "how to buy {token}",
  "where to buy {token}",
  "{token} staking rewards",
  "{token} staking APY",
  "{token} tokenomics explained",
  "{token} tokenomics",
  "what is {token} used for",
  "what is {token} crypto",
  "{token} risks and concerns",
  "{token} review",
  "{token} price analysis",
  "{token} price today",
  "{token} news",
  "{token} ecosystem",
  `{token} roadmap ${new Date().getFullYear()}`,
  "should I buy {token}",
  "{token} all time high",
  "{token} market cap",
  "{token} future potential",
  "{token} burn rate",
];

/** Templates requiring a rival token for comparison articles. */
const COMPARISON_TEMPLATES = ["{token} vs {rival}"];

/** Alphabet modifiers for Google Autocomplete probing. */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz".split("");

// ── Types ──────────────────────────────────────────────────────

export interface Keyword {
  keyword: string;
  token: string;
  tokenId: string;
  template: string;
  type: "template" | "autocomplete";
  rival?: string;
}

export interface KeywordOutput {
  generatedAt: string;
  totalKeywords: number;
  tokenCount: number;
  templateCount: number;
  autocompleteCount: number;
  keywords: Keyword[];
}

// ── Google Autocomplete ────────────────────────────────────────

/**
 * Query Google Autocomplete for search suggestions.
 * Uses the public XML endpoint (no API key needed).
 *
 * @param query - The search query prefix
 * @returns Array of autocomplete suggestions
 */
async function googleAutocomplete(query: string): Promise<string[]> {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    if (!response.ok) {
      console.warn(`  [autocomplete] ${response.status} for "${query}"`);
      return [];
    }

    const data = (await response.json()) as [string, string[]];
    return data[1] || [];
  } catch (error) {
    console.warn(`  [autocomplete] error for "${query}":`, error);
    return [];
  }
}

/**
 * Fetch autocomplete suggestions for a token using alphabet probing.
 * Queries: "[token name] a", "[token name] b", ..., "[token name] z"
 *
 * @param tokenName - The human-readable token name
 * @param tokenId - The CoinGecko token ID
 * @param delayMs - Delay between requests to avoid rate limits
 * @returns Array of keywords from autocomplete
 */
async function fetchAutocompleteKeywords(
  tokenName: string,
  tokenId: string,
  delayMs: number = 300
): Promise<Keyword[]> {
  const keywords: Keyword[] = [];
  const seen = new Set<string>();

  // Base query: just the token name
  const baseSuggestions = await googleAutocomplete(`${tokenName} crypto`);
  for (const suggestion of baseSuggestions) {
    const lower = suggestion.toLowerCase().trim();
    if (!seen.has(lower) && lower.includes(tokenName.toLowerCase())) {
      seen.add(lower);
      keywords.push({
        keyword: lower,
        token: tokenName,
        tokenId,
        template: "autocomplete",
        type: "autocomplete",
      });
    }
  }

  // Alphabet probing: "[token] a", "[token] b", ...
  for (const letter of ALPHABET) {
    await sleep(delayMs);
    const suggestions = await googleAutocomplete(
      `${tokenName} ${letter}`
    );
    for (const suggestion of suggestions) {
      const lower = suggestion.toLowerCase().trim();
      if (!seen.has(lower) && lower.includes(tokenName.toLowerCase())) {
        seen.add(lower);
        keywords.push({
          keyword: lower,
          token: tokenName,
          tokenId,
          template: "autocomplete",
          type: "autocomplete",
        });
      }
    }
  }

  return keywords;
}

// ── Template Keyword Generation ────────────────────────────────

/**
 * Generate all template × token keyword combinations.
 *
 * @param tokens - Array of token data from CoinGecko
 * @returns Array of template-based keywords
 */
function generateTemplateKeywords(tokens: CoinGeckoToken[]): Keyword[] {
  const keywords: Keyword[] = [];
  const seen = new Set<string>();

  for (const token of tokens) {
    const tokenName = (token.name || "").toLowerCase();

    for (const template of TEMPLATES) {
      // Skip comparison templates here — handled separately
      if (COMPARISON_TEMPLATES.includes(template)) continue;

      const keyword = template.replace("{token}", tokenName);
      if (!seen.has(keyword)) {
        seen.add(keyword);
        keywords.push({
          keyword,
          token: token.name || "",
          tokenId: token.id || "",
          template,
          type: "template",
        });
      }
    }
  }

  return keywords;
}

/**
 * Generate comparison keywords ("[Token A] vs [Token B]").
 * Pairs tokens within the same rough market cap tier.
 *
 * @param tokens - Array of token data from CoinGecko
 * @param maxComparisons - Max comparison pairs per token
 * @returns Array of comparison keywords
 */
function generateComparisonKeywords(
  tokens: CoinGeckoToken[],
  maxComparisons: number = 3
): Keyword[] {
  const keywords: Keyword[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < tokens.length; i++) {
    const tokenA = tokens[i];
    let count = 0;

    for (let j = i + 1; j < tokens.length && count < maxComparisons; j++) {
      const tokenB = tokens[j];

      // Only compare tokens within 2x market cap of each other
      const mcapA = tokenA.market_cap || 0;
      const mcapB = tokenB.market_cap || 0;
      if (mcapA === 0 || mcapB === 0) continue;

      const ratio = mcapA / mcapB;
      if (ratio < 0.5 || ratio > 2.0) continue;

      const nameA = (tokenA.name || "").toLowerCase();
      const nameB = (tokenB.name || "").toLowerCase();
      const keyword = `${nameA} vs ${nameB}`;
      const reverseKeyword = `${nameB} vs ${nameA}`;

      if (!seen.has(keyword) && !seen.has(reverseKeyword)) {
        seen.add(keyword);
        keywords.push({
          keyword,
          token: tokenA.name || "",
          tokenId: tokenA.id || "",
          template: "{token} vs {rival}",
          type: "template",
          rival: tokenB.name || "",
        });
        count++;
      }
    }
  }

  return keywords;
}


function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const skipAutocomplete = args.includes("--skip-autocomplete");
  const startIdx = args.indexOf("--start");
  const endIdx = args.indexOf("--end");
  const startRank = startIdx !== -1 ? parseInt(args[startIdx + 1], 10) : 1;
  const endRank = endIdx !== -1 ? parseInt(args[endIdx + 1], 10) : 250;

  console.log("╔══════════════════════════════════════════╗");
  console.log("║   TokenRadar — Keyword Research Engine   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Token range: #${startRank} — #${endRank}`);
  console.log(`  Autocomplete: ${skipAutocomplete ? "SKIP" : "ON"}`);
  console.log();

  ensureDataDir();

  // Step 1: Fetch tokens
  console.log("▶ Step 1: Fetching tokens from CoinGecko...");
  const tokens = await fetchTokensByRank(startRank, endRank);
  console.log(`  ✓ Found ${tokens.length} tokens (rank #${startRank}-#${endRank})`);

  // Save token metadata for Phase 2+
  fs.writeFileSync(
    TOKENS_FILE,
    JSON.stringify(
      tokens.map((t) => ({
        id: t.id || "",
        name: t.name || "",
        symbol: t.symbol || "",
        rank: t.market_cap_rank,
        price: t.current_price,
        marketCap: t.market_cap,
        volume24h: t.total_volume,
        priceChange24h: t.price_change_percentage_24h,
        image: t.image,
        ath: t.ath,
        athDate: t.ath_date,
        atl: t.atl,
        atlDate: t.atl_date,
        circulatingSupply: t.circulating_supply,
        totalSupply: t.total_supply,
        maxSupply: t.max_supply,
      })),
      null,
      2
    )
  );
  console.log(`  ✓ Saved token data to ${path.relative(process.cwd(), TOKENS_FILE)}`);
  console.log();

  // Step 2: Generate template keywords
  console.log("▶ Step 2: Generating template keywords...");
  const templateKeywords = generateTemplateKeywords(tokens);
  console.log(`  ✓ Generated ${templateKeywords.length} template keywords`);

  // Step 3: Generate comparison keywords
  console.log("▶ Step 3: Generating comparison keywords...");
  const comparisonKeywords = generateComparisonKeywords(tokens);
  console.log(`  ✓ Generated ${comparisonKeywords.length} comparison keywords`);

  // Step 4: Autocomplete suggestions
  const autocompleteKeywords: Keyword[] = [];
  if (!skipAutocomplete) {
    console.log("▶ Step 4: Fetching Google Autocomplete suggestions...");
    console.log(`  (This will take ~${Math.round((tokens.length * 27 * 0.3) / 60)} minutes for ${tokens.length} tokens)`);
    console.log();

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (!token.id || !token.name) continue;

      const pct = Math.round(((i + 1) / tokens.length) * 100);
      process.stdout.write(
        `  [${pct}%] ${token.name} (${i + 1}/${tokens.length})...`
      );

      const suggestions = await fetchAutocompleteKeywords(
        token.name,
        token.id,
        300
      );
      autocompleteKeywords.push(...suggestions);
      console.log(` ${suggestions.length} suggestions`);
    }
    console.log(
      `  ✓ Total autocomplete keywords: ${autocompleteKeywords.length}`
    );
  } else {
    console.log("▶ Step 4: Skipping autocomplete (--skip-autocomplete)");
  }
  console.log();

  // Step 5: Combine, deduplicate, and save
  console.log("▶ Step 5: Deduplicating and saving...");
  const allKeywords = [
    ...templateKeywords,
    ...comparisonKeywords,
    ...autocompleteKeywords,
  ];

  // Deduplicate by lowercase keyword
  const seen = new Set<string>();
  const uniqueKeywords = allKeywords.filter((kw) => {
    const key = kw.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const output: KeywordOutput = {
    generatedAt: new Date().toISOString(),
    totalKeywords: uniqueKeywords.length,
    tokenCount: tokens.length,
    templateCount: templateKeywords.length + comparisonKeywords.length,
    autocompleteCount: autocompleteKeywords.length,
    keywords: uniqueKeywords,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  console.log(
    `  ✓ Saved ${uniqueKeywords.length} unique keywords to ${path.relative(process.cwd(), OUTPUT_FILE)}`
  );
  console.log();

  // Summary
  console.log("╔══════════════════════════════════════════╗");
  console.log("║            Generation Complete           ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Tokens:       ${String(tokens.length).padStart(6)}                 ║`);
  console.log(`║  Template KWs: ${String(templateKeywords.length).padStart(6)}                 ║`);
  console.log(`║  Comparison:   ${String(comparisonKeywords.length).padStart(6)}                 ║`);
  console.log(`║  Autocomplete: ${String(autocompleteKeywords.length).padStart(6)}                 ║`);
  console.log(`║  Total Unique: ${String(uniqueKeywords.length).padStart(6)}                 ║`);
  console.log("╚══════════════════════════════════════════╝");
}

main().catch(async (error) => {
  await logError("keyword-generator", error);
  process.exit(1);
});

/**
 * Agent: Narrative Hunter — Social Listening & Discovery
 *
 * This agent periodically scans X for emerging narratives and 'alpha leaks'.
 * It cross-references mentions with our database and performs 'Auto-Ingestion'
 * for high-potential new discoveries.
 *
 * Workflow:
 * 1. Search X for keywords (e.g. "undervalued $", "narrative rotation").
 * 2. Extract potential cashtags using AI.
 * 3. Cross-reference with data/tokens.json.
 * 4. For NEW tokens:
 *    - Resolve CoinGecko ID via Search.
 *    - Trigger Fetch -> Compute -> Generate pipeline.
 * 5. Update data/social/narratives.json for the Daily Report agent.
 *
 * Usage:
 *   npx tsx scripts/agent-narrative-hunter.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { execSync } from "child_process";
import { searchTweets } from "../src/lib/x-client";
import { callAIWithFallback } from "../src/lib/gemini";
import { searchTokenId } from "../src/lib/coingecko";
import { logError, logActivity } from "../src/lib/reporter";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const REGISTRY_FILE = path.join(DATA_DIR, "tokens.json");
const NARRATIVE_FILE = path.join(DATA_DIR, "social/narratives.json");

// Define narrative-heavy search queries
const QUERIES = [
  "undervalued $ narrative",
  "alpha leaks token",
  "next big narrative crypto",
  "rotation into $ AI",
  "low cap gems $"
];

async function main() {
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║      Agent: Narrative Hunter v1.0        ║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log();

  if (!fs.existsSync(path.dirname(NARRATIVE_FILE))) {
    fs.mkdirSync(path.dirname(NARRATIVE_FILE), { recursive: true });
  }

  // 1. Load current registry to avoid redundant ingestion
  const registryRaw = fs.readFileSync(REGISTRY_FILE, "utf-8");
  const registry = JSON.parse(registryRaw) as { symbol: string; id: string }[];
  const existingSymbols = new Set(registry.map(t => t.symbol.toLowerCase()));

  console.log(`▶ Step 1: Scanning X for narrative signals...`);
  
  const allTweets: string[] = [];
  for (const query of QUERIES) {
    process.stdout.write(`  Searching: "${query}"... `);
    const results = await searchTweets(query, 10);
    if (results.length > 0) {
      allTweets.push(...results.map((t: any) => t.text));
      console.log(`✓ (${results.length} found)`);
    } else {
      console.log(`⚠ (0 found)`);
    }
  }

  if (allTweets.length === 0) {
    console.warn("  ✗ No narrative signals found on X today.");
    return;
  }

  // 2. Extract potential cashtags via AI
  console.log(`\n▶ Step 2: Extracting high-potential tokens via AI...`);
  const extractionPrompt = `
    Analyze these tweets and extract all CASHTAGS ($SYMBOL) that are being discussed as part of a potential narrative or opportunity.
    TWEETS:
    ${allTweets.join("\n---\n").substring(0, 4000)}

    Respond with ONLY a comma-separated list of symbols (e.g. BTC, ETH, SOL).
  `;

  const extraction = await callAIWithFallback("You are a crypto research assistant.", extractionPrompt, 128);
  const discoveredSymbols = extraction.content
    .split(",")
    .map(s => s.trim().replace("$", "").toUpperCase())
    .filter(s => s.length >= 2 && s.length <= 10);

  const uniqueSymbols = Array.from(new Set(discoveredSymbols));
  console.log(`  ✦ Discovered ${uniqueSymbols.length} unique symbols.`);

  // 3. Filter for NEW/MISSING tokens
  const newTokens = uniqueSymbols.filter(s => !existingSymbols.has(s.toLowerCase()));
  console.log(`  ✦ Found ${newTokens.length} tokens NOT currently in our registry.`);

  // 4. Auto-Ingestion Pipeline for new discoveries
  const ingested: string[] = [];
  
  if (newTokens.length > 0) {
    console.log(`\n▶ Step 3: Triggering Auto-Ingestion for new discoveries...`);
    for (const symbol of newTokens.slice(0, 3)) { // Limit to 3 to stay safe with rate limits
      process.stdout.write(`  Processing $${symbol}... `);
      
      // A. Resolve ID
      const tokenId = await searchTokenId(symbol);
      if (!tokenId) {
        console.log(`✗ Could not resolve CoinGecko ID.`);
        continue;
      }

      try {
        // B. Fetch data
        execSync(`npx tsx scripts/fetch-crypto-data.ts --token ${tokenId}`, { stdio: "ignore" });
        
        // C. Compute metrics
        execSync(`npx tsx scripts/compute-metrics.ts --token ${tokenId}`, { stdio: "ignore" });
        
        // D. Generate Initial Article (Simulated trigger for generate-content)
        // Note: For now we just ensure data is ready. 
        // A standard 'npx tsx scripts/generate-content.ts' usually picks up all tokens.
        
        ingested.push(tokenId);
        console.log(`✓ Ingested and ready as "${tokenId}"`);
      } catch (err) {
        console.log(`✗ Pipeline failed.`);
      }
    }
  }

  // 5. Final Report
  const report = {
    timestamp: new Date().toISOString(),
    totalSignals: allTweets.length,
    narrativeSummary: extraction.content, // Raw list from AI is fine for logs
    ingestedCount: ingested.length,
    newIngestions: ingested
  };

  fs.writeFileSync(NARRATIVE_FILE, JSON.stringify(report, null, 2));
  console.log(`\n✅ Narrative hunt complete. Report saved to data/social/narratives.json`);
  
  logActivity("narrative-hunt", {
    tokensIngested: ingested.length,
    discoveredSymbols: uniqueSymbols.length
  });
}

main().catch(async (error) => {
  await logError("narrative-hunter", error);
  process.exit(1);
});

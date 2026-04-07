/**
 * Daily Queue Publisher — Hybrid Content Strategy
 * 
 * Picks N articles from the queue, injects live market data,
 * and publishes them to the live content directory.
 * 
 * Logic:
 * 1. Check data/queue/ for available tokens.
 * 2. Pick N tokens (prioritizes according to directory order).
 * 3. For each token:
 *    a. Fetch live market data (CoinGecko).
 *    b. Load all article types from queue.
 *    c. Replace placeholders ({{LIVE_PRICE}}, {{LIVE_MARKET_CAP}}, etc.).
 *    d. Write to content/tokens/.
 *    e. Remove from queue.
 * 4. If queue is empty, send alert and exit.
 */

import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fetchFullTokenData } from "../src/lib/coingecko";
import { logError, sendTelegramAlert, logActivity } from "../src/lib/reporter";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const DATA_DIR = path.resolve(__dirname, "../data");
const QUEUE_DIR = path.join(DATA_DIR, "queue");
const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const TOKENS_DIR = path.join(DATA_DIR, "tokens");

async function main() {
  const args = process.argv.slice(2);
  const maxIdx = args.indexOf("--max");
  const maxToPublish = maxIdx !== -1 ? parseInt(args[maxIdx + 1], 10) : 5;
  const dryRun = args.includes("--dry-run");

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Daily Queue Publisher      ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  // 1. Check Queue
  if (!fs.existsSync(QUEUE_DIR)) {
    console.warn("  ⚠ Queue directory does not exist.");
    await handleEmptyQueue();
    return;
  }

  const tokenQueues = fs.readdirSync(QUEUE_DIR).filter(d => fs.statSync(path.join(QUEUE_DIR, d)).isDirectory());

  if (tokenQueues.length === 0) {
    console.warn("  ⚠ Queue is empty.");
    await handleEmptyQueue();
    return;
  }

  console.log(`  Queue contains ${tokenQueues.length} tokens. Publishing up to ${maxToPublish}...`);
  console.log();

  const selectedTokens = tokenQueues.slice(0, maxToPublish);

  for (const tokenId of selectedTokens) {
    console.log(`▶ Processing ${tokenId}...`);
    const queueTokenDir = path.join(QUEUE_DIR, tokenId);
    const articles = fs.readdirSync(queueTokenDir).filter(f => f.endsWith(".json"));

    if (articles.length === 0) {
        console.log(`  ⏭ No articles in queue for ${tokenId}. Cleaning up.`);
        if (!dryRun) fs.rmSync(queueTokenDir, { recursive: true });
        continue;
    }

    try {
        // 2. Fetch Live Data
        process.stdout.write(`  [DATA] Fetching live market stats... `);
        const liveData = await fetchFullTokenData(tokenId);
        console.log("✓ Done");

        const placeholders: Record<string, string> = {
            "{{LIVE_PRICE}}": `$${liveData.market.price?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`,
            "{{LIVE_MARKET_CAP}}": `$${liveData.market.marketCap?.toLocaleString()}`,
            "{{LIVE_RANK}}": String(liveData.market.marketCapRank || "N/A"),
            "{{LIVE_DATE}}": new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
            "{{LIVE_24H_CHANGE}}": `${liveData.market.priceChange24h?.toFixed(2)}%`
        };

        // 3. Inject & Publish
        const liveTokenDir = path.join(CONTENT_DIR, tokenId);
        if (!fs.existsSync(liveTokenDir)) fs.mkdirSync(liveTokenDir, { recursive: true });

        for (const articleFile of articles) {
            const queuePath = path.join(queueTokenDir, articleFile);
            const livePath = path.join(liveTokenDir, articleFile);

            let content = fs.readFileSync(queuePath, "utf-8");
            
            // Replace all placeholders
            for (const [tag, value] of Object.entries(placeholders)) {
                content = content.split(tag).join(value);
            }

            if (dryRun) {
                console.log(`  [DRY-RUN] Would publish ${articleFile} to ${livePath}`);
            } else {
                fs.writeFileSync(livePath, content);
                fs.unlinkSync(queuePath);
            }
        }

        console.log(`  ✓ Published ${articles.length} articles.`);

        // 4. Update core token metadata so site has fresh stats
        if (!dryRun) {
            const metaPath = path.join(TOKENS_DIR, `${tokenId}.json`);
            const meta = {
                id: tokenId,
                symbol: liveData.symbol,
                name: liveData.name,
                description: liveData.description,
                market: liveData.market,
                lastMarketUpdate: new Date().toISOString()
            };
            fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
            
            // Final cleanup of empty queue folder
            if (fs.readdirSync(queueTokenDir).length === 0) {
                fs.rmSync(queueTokenDir, { recursive: true });
            }
        }

        logActivity("publish", { tokenId, articles: articles.length });

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`  ✗ Error publishing ${tokenId}: ${msg}`);
        await logError(`publish-from-queue (${tokenId})`, error, false);
    }
    console.log();
  }

  console.log("╚══════════════════════════════════════════╝");
}

async function handleEmptyQueue() {
    const alertMsg = "🚨 *CRITICAL: Publication Queue Empty*\n\nThe Daily Publisher found no articles in `data/queue/`. Weekly content generation may have failed or quota was exceeded.\n\n_Please check GitHub Actions logs._";
    console.error("  !!! Queue Empty. Sending critical alert.");
    if (process.env.TELEGRAM_REPORT_BOT_TOKEN) {
        await sendTelegramAlert(alertMsg);
    }
}

main().catch(async (error) => {
  await logError("publish-from-queue", error);
  process.exit(1);
});

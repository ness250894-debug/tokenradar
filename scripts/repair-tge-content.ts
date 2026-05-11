/**
 * Remove live-market placeholders from TGE preview articles.
 *
 * Pre-launch pages should not render price/market-cap template tags. They use
 * launch-evidence fields until a token graduates into normal market coverage.
 */

import * as fs from "fs";
import * as path from "path";
import { normalizeArticleMarkdown } from "../src/lib/article-formatting";
import { getTgeStatusLabel, normalizeTge, type UpcomingTge } from "../src/lib/tge";

const ROOT = process.cwd();
const TGE_FILE = path.join(ROOT, "data/upcoming-tges.json");
const SCAN_DIRS = [
  path.join(ROOT, "content/tokens"),
  path.join(ROOT, "data/queue"),
];

const MARKET_PLACEHOLDER_REPLACEMENTS: Record<string, string> = {
  "{{LIVE_PRICE}}": "Not trading yet",
  "{{LIVE_MARKET_CAP}}": "Not available yet",
  "{{LIVE_RANK}}": "Not ranked yet",
  "{{LIVE_DATE}}": new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  "{{LIVE_24H_CHANGE}}": "Not available yet",
  "{{GLOBAL_MCAP}}": "latest available market data",
  "{{GLOBAL_TOTAL_MARKET_CAP}}": "latest available market data",
  "{{BTC_DOM}}": "latest available BTC dominance data",
  "{{GLOBAL_BTC_DOMINANCE}}": "latest available BTC dominance data",
};

interface ArticleFile {
  title?: string;
  content?: string;
  generatedAt?: string;
}

function replacePlaceholders(value: string, tge: UpcomingTge): string {
  let next = value;
  for (const [placeholder, replacement] of Object.entries(MARKET_PLACEHOLDER_REPLACEMENTS)) {
    next = next.split(placeholder).join(replacement);
  }

  next = next.replace(/\bHype\b/g, "Signal strength");
  next = next.replace(/\bAI Sentiment\b/g, "source evidence");
  next = next.replace(/\bVerified by TokenRadar Engine\b/g, getTgeStatusLabel(tge));
  next = next.replace(/Pre-Launch Spotlight\s+[—-]\s+Upcoming TGE Analysis/g, "TGE Watchlist and Launch Evidence");
  return next;
}

function main() {
  const tges = (JSON.parse(fs.readFileSync(TGE_FILE, "utf-8")) as UpcomingTge[]).map(normalizeTge);
  const tgeById = new Map(tges.map((tge) => [tge.id, tge]));
  let repaired = 0;

  for (const baseDir of SCAN_DIRS) {
    if (!fs.existsSync(baseDir)) continue;

    for (const tokenId of fs.readdirSync(baseDir)) {
      const tge = tgeById.get(tokenId);
      if (!tge) continue;

      const previewPath = path.join(baseDir, tokenId, "tge-preview.json");
      if (!fs.existsSync(previewPath)) continue;

      const article = JSON.parse(fs.readFileSync(previewPath, "utf-8")) as ArticleFile;
      const original = JSON.stringify(article);

      article.title = replacePlaceholders(article.title || "", tge);
      article.content = normalizeArticleMarkdown(replacePlaceholders(article.content || "", tge));

      if (JSON.stringify(article) !== original) {
        fs.writeFileSync(previewPath, `${JSON.stringify(article, null, 2)}\n`);
        repaired++;
      }
    }
  }

  console.log(`Repaired ${repaired} TGE preview article(s).`);
}

main();

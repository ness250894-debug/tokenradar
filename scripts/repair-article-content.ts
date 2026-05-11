/**
 * Repairs legacy generated article Markdown without calling AI.
 *
 * Usage:
 *   npx tsx scripts/repair-article-content.ts --dry-run
 *   npx tsx scripts/repair-article-content.ts
 *   npx tsx scripts/repair-article-content.ts --token bitcoin --type how-to-buy
 */

import * as fs from "fs";
import * as path from "path";

import { repairArticleMarkdown } from "../src/lib/article-repair";
import { buildArticleQualitySnapshot } from "../src/lib/content-quality";
import { safeReadJson } from "../src/lib/utils";

const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const TOKENS_DIR = path.resolve(__dirname, "../data/tokens");

interface ArticleFile {
  tokenId?: string;
  tokenName?: string;
  type?: string;
  slug?: string;
  title?: string;
  content?: string;
  wordCount?: number;
  [key: string]: unknown;
}

function getArgValue(args: string[], name: string): string | null {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1] || null;
}

function getArticleFiles(targetToken: string | null, targetType: string | null): string[] {
  const files: string[] = [];
  const tokenIds = targetToken ? [targetToken] : fs.readdirSync(CONTENT_DIR);

  for (const tokenId of tokenIds) {
    const tokenDir = path.join(CONTENT_DIR, tokenId);
    if (!fs.existsSync(tokenDir) || !fs.statSync(tokenDir).isDirectory()) continue;

    const names = targetType ? [`${targetType}.json`] : fs.readdirSync(tokenDir);
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      const filePath = path.join(tokenDir, name);
      if (fs.existsSync(filePath)) files.push(filePath);
    }
  }

  return files;
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const targetToken = getArgValue(args, "--token");
  const targetType = getArgValue(args, "--type");

  const files = getArticleFiles(targetToken, targetType);
  let changed = 0;
  let linkRepairs = 0;
  let venueRepairs = 0;

  for (const filePath of files) {
    const article = safeReadJson<ArticleFile | null>(filePath, null);
    if (!article?.content) continue;

    const articleType = article.type || article.slug || path.basename(filePath, ".json");
    const tokenId = article.tokenId || path.basename(path.dirname(filePath));
    const tokenData = safeReadJson<{ name?: string; symbol?: string } | null>(
      path.join(TOKENS_DIR, `${tokenId}.json`),
      null,
    );
    const before = article.content;
    const repaired = repairArticleMarkdown(before, articleType, {
      tokenName: tokenData?.name || article.tokenName || tokenId || "this token",
      symbol: tokenData?.symbol || String(tokenId || "TOKEN").split("-")[0],
    });

    if (repaired === before) continue;

    if (before.includes("](/score)") || before.includes("](/would)") || before.includes("](/movement)")) {
      linkRepairs++;
    }
    if (articleType === "how-to-buy" && repaired.includes("## Market Availability Checks")) {
      venueRepairs++;
    }

    changed++;
    if (!dryRun) {
      article.content = repaired;
      article.wordCount = repaired.split(/\s+/).filter(Boolean).length;
      article.quality = buildArticleQualitySnapshot({
        type: article.type,
        slug: article.slug,
        title: article.title,
        content: repaired,
      });
      fs.writeFileSync(filePath, JSON.stringify(article, null, 2));
    }
  }

  console.log(JSON.stringify({
    dryRun,
    scanned: files.length,
    changed,
    linkRepairs,
    venueRepairs,
  }, null, 2));
}

main();

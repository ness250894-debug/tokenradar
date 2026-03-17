/**
 * Content Quality Checker — Phase 3
 *
 * Validates generated articles against quality rules:
 * - Word count (1,000-2,000)
 * - Data citation count (min 3)
 * - FAQ section presence
 * - Disclaimer presence
 * - Prohibited phrases (financial advice detection)
 * - Basic readability check
 *
 * Usage:
 *   npx tsx scripts/quality-check.ts
 *   npx tsx scripts/quality-check.ts --token injective-protocol
 *   npx tsx scripts/quality-check.ts --fix  (auto-append disclaimer if missing)
 *
 * Cost: $0
 */

import * as fs from "fs";
import * as path from "path";
import { logError } from "../src/lib/reporter";

const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");

// ── Prohibited Phrases ─────────────────────────────────────────

const PROHIBITED_PHRASES = [
  "you should buy",
  "you should invest",
  "guaranteed returns",
  "guaranteed gains",
  "guaranteed profit",
  "moonshot",
  "to the moon",
  "100x",
  "1000x",
  "will definitely",
  "sure thing",
  "can't lose",
  "risk-free",
  "act now",
  "buy now",
  "don't miss",
  "once in a lifetime",
  "financial advice",
  "not investment advice", // wrong — should be "not financial advice"
];

// ── Check Functions ────────────────────────────────────────────

interface QualityResult {
  file: string;
  tokenId: string;
  articleType: string;
  passed: boolean;
  issues: string[];
  warnings: string[];
  stats: {
    wordCount: number;
    hasFaq: boolean;
    hasDisclaimer: boolean;
    dataPointCount: number;
    prohibitedPhrases: string[];
    avgSentenceLength: number;
  };
}

function checkArticle(
  filePath: string,
  autoFix: boolean = false
): QualityResult {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const content: string = raw.content || "";
  const contentLower = content.toLowerCase();
  const issues: string[] = [];
  const warnings: string[] = [];

  // Word count
  const words = content.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < 800) issues.push(`Word count too low: ${wordCount} (min 1,000)`);
  else if (wordCount < 1000) warnings.push(`Word count borderline: ${wordCount} (target 1,000+)`);
  if (wordCount > 2500) warnings.push(`Word count high: ${wordCount} (target max 2,000)`);

  // FAQ section
  const hasFaq =
    contentLower.includes("## faq") ||
    contentLower.includes("### faq") ||
    contentLower.includes("frequently asked");

  if (!hasFaq) issues.push("Missing FAQ section");

  // Disclaimer
  const hasDisclaimer =
    contentLower.includes("not constitute financial advice") ||
    contentLower.includes("informational purposes only") ||
    contentLower.includes("does not constitute financial advice") ||
    contentLower.includes("disclaimer");

  if (!hasDisclaimer) {
    if (autoFix) {
      // Auto-append disclaimer
      raw.content +=
        "\n\n---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*";
      fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
      warnings.push("Disclaimer was missing — auto-appended");
    } else {
      issues.push("Missing disclaimer (use --fix to auto-append)");
    }
  }

  // Data points (numbers with $, %, or common patterns)
  const dataPointRegex = /\$[\d,.]+|\d+(\.\d+)?%|\d{1,3}(,\d{3})+/g;
  const dataPoints = content.match(dataPointRegex) || [];
  const dataPointCount = dataPoints.length;
  if (dataPointCount < 3) issues.push(`Too few data points: ${dataPointCount} (min 3)`);

  // Prohibited phrases
  const foundProhibited: string[] = [];
  for (const phrase of PROHIBITED_PHRASES) {
    if (contentLower.includes(phrase)) {
      foundProhibited.push(phrase);
    }
  }
  if (foundProhibited.length > 0) {
    issues.push(`Prohibited phrases found: "${foundProhibited.join('", "')}"`);
  }

  // Sentence length (readability)
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 10);
  const avgSentenceLength =
    sentences.length > 0
      ? Math.round(
          sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) /
            sentences.length
        )
      : 0;

  if (avgSentenceLength > 35) {
    warnings.push(`Average sentence length high: ${avgSentenceLength} words (target <30)`);
  }

  return {
    file: path.relative(process.cwd(), filePath),
    tokenId: raw.tokenId,
    articleType: raw.type,
    passed: issues.length === 0,
    issues,
    warnings,
    stats: {
      wordCount,
      hasFaq,
      hasDisclaimer: hasDisclaimer || autoFix,
      dataPointCount,
      prohibitedPhrases: foundProhibited,
      avgSentenceLength,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const targetToken = args[args.indexOf("--token") + 1] || null;
  const autoFix = args.includes("--fix");

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Content Quality Checker    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("  No content found. Run generate-content first.");
    return;
  }

  const tokenDirs = fs
    .readdirSync(CONTENT_DIR)
    .filter((d) => {
      const p = path.join(CONTENT_DIR, d);
      return fs.statSync(p).isDirectory();
    })
    .filter((d) => !targetToken || d === targetToken);

  if (tokenDirs.length === 0) {
    console.log("  No articles found to check.");
    return;
  }

  let totalPassed = 0;
  let totalFailed = 0;
  let totalWarnings = 0;

  for (const tokenDir of tokenDirs) {
    const dirPath = path.join(CONTENT_DIR, tokenDir);
    const articleFiles = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".json") && !f.includes(".prompt"));

    for (const file of articleFiles) {
      const filePath = path.join(dirPath, file);
      const result = checkArticle(filePath, autoFix);

      const status = result.passed ? "✓ PASS" : "✗ FAIL";
      console.log(
        `  ${status} ${result.tokenId}/${result.articleType} (${result.stats.wordCount} words)`
      );

      for (const issue of result.issues) {
        console.log(`    ✗ ${issue}`);
      }
      for (const warning of result.warnings) {
        console.log(`    ⚠ ${warning}`);
      }

      if (result.passed) totalPassed++;
      else totalFailed++;
      totalWarnings += result.warnings.length;
    }
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║        Quality Check Complete            ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Passed:    ${String(totalPassed).padStart(6)}                 ║`);
  console.log(`║  Failed:    ${String(totalFailed).padStart(6)}                 ║`);
  console.log(`║  Warnings:  ${String(totalWarnings).padStart(6)}                 ║`);
  console.log("╚══════════════════════════════════════════╝");

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  await logError("quality-check", error);
  process.exit(1);
});

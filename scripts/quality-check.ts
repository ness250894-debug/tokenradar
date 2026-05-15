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
 *   npx tsx scripts/quality-check.ts --dir data/queue --fail-on-error
 *   npx tsx scripts/quality-check.ts --fix  (auto-fix: append disclaimer, AI-rewrite prohibited phrases)
 *   npx tsx scripts/quality-check.ts --quarantine  (move failed articles to data/quarantine)
 *   npx tsx scripts/quality-check.ts --delete-failures  (delete failed generated articles)
 *
 * Cost: $0 without --fix, ~$0.001 per AI rewrite with --fix
 */

import * as fs from "fs";
import * as path from "path";
import { logError, logActivity } from "../src/lib/reporter";
import { ensureDirSync, loadEnv, safeReadJson } from "../src/lib/utils";
import { getArticleQualityThresholds, PROHIBITED_FINANCIAL_PHRASES } from "../src/lib/content-quality";
import { validateArticleOutboundUrls, validateGeneratedArticleIntegrity } from "./validate-content";

// Load environment
loadEnv();

const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");
const QUARANTINE_ROOT = path.resolve(__dirname, "../data/quarantine");
const QUARANTINE_RUN_DIR = path.join(
  QUARANTINE_ROOT,
  new Date().toISOString().replace(/[:.]/g, "-")
);

// ── Prohibited Phrases ─────────────────────────────────────────

const PROHIBITED_PHRASES = PROHIBITED_FINANCIAL_PHRASES;

// ── AI Paragraph Rewriter ──────────────────────────────────────

import { callAIWithFallback } from "../src/lib/gemini";

/**
 * Rewrite a paragraph to remove prohibited phrases using Gemini / Claude fallback.
 * Only sends the offending paragraph (~200-500 chars), keeping cost minimal.
 *
 * @returns Rewritten paragraph, or null on failure.
 */
async function aiRewriteParagraph(
  paragraph: string,
  prohibitedPhrases: string[]
): Promise<string | null> {
  const prompt = `Rewrite the following paragraph to remove or rephrase these prohibited phrases: ${prohibitedPhrases.map((p) => `"${p}"`).join(", ")}.

RULES:
1. Keep the same meaning, tone, length, and formatting (including any HTML tags).
2. Only change the parts that contain prohibited phrases. Keep everything else identical.
3. Use professional, analytical crypto language. No hype.
4. Return ONLY the rewritten paragraph, nothing else.

PARAGRAPH:
${paragraph}`;

  try {
    const result = await callAIWithFallback("", prompt, 512);

    if (result.content) {
      return result.content;
    }
    return null;
  } catch (error) {
    console.warn(`    ⚠ AI rewrite error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Find paragraphs containing prohibited phrases and rewrite them with AI.
 *
 * @returns Updated content string and lists of fixed/failed phrases.
 */
async function fixProhibitedPhrases(
  content: string,
  foundPhrases: string[]
): Promise<{ content: string; fixed: string[]; failed: string[] }> {
  const fixed: string[] = [];
  const failed: string[] = [];
  let updatedContent = content;

  // Split content into paragraphs (separated by double newlines)
  const paragraphs = content.split(/\n\n+/);

  for (const paragraph of paragraphs) {
    const paragraphLower = paragraph.toLowerCase();
    const matchingPhrases = foundPhrases.filter((p) => paragraphLower.includes(p));
    if (matchingPhrases.length === 0) continue;

    console.log(`    🤖 AI-rewriting paragraph with: "${matchingPhrases.join('", "')}"`);
    const rewritten = await aiRewriteParagraph(paragraph, matchingPhrases);

    if (rewritten) {
      // Verify the rewrite actually removed the prohibited phrases
      const rewrittenLower = rewritten.toLowerCase();
      const stillPresent = matchingPhrases.filter((p) => rewrittenLower.includes(p));

      if (stillPresent.length === 0) {
        updatedContent = updatedContent.replace(paragraph, rewritten);
        fixed.push(...matchingPhrases);
        console.log(`    ✓ Fixed: "${matchingPhrases.join('", "')}"`);
      } else {
        failed.push(...stillPresent);
        console.log(`    ✗ AI rewrite still contains: "${stillPresent.join('", "')}"`);
      }
    } else {
      failed.push(...matchingPhrases);
    }
  }

  return { content: updatedContent, fixed, failed };
}

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

function addUniqueIssues(issues: string[], newIssues: string[]): void {
  for (const issue of newIssues) {
    if (!issues.includes(issue)) issues.push(issue);
  }
}

async function checkArticle(
  filePath: string,
  autoFix: boolean = false
): Promise<QualityResult> {
  const raw = safeReadJson<any>(filePath, null);
  if (!raw) {
    return {
      file: filePath,
      tokenId: "unknown",
      articleType: "unknown",
      passed: false,
      issues: ["Failed to read or parse file"],
      warnings: [],
      stats: { wordCount: 0, hasFaq: false, hasDisclaimer: false, dataPointCount: 0, prohibitedPhrases: [], avgSentenceLength: 0 }
    };
  }
  let content: string = raw.content || "";
  let contentLower = content.toLowerCase();
  const issues: string[] = [];
  const warnings: string[] = [];

  // Word count — thresholds vary by article type
  const words = content.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const articleType = raw.type || raw.slug || "";
  const thresholds = getArticleQualityThresholds(articleType);
  const minFail = thresholds.minFailWords;
  const minWarn = thresholds.minWarnWords;
  if (wordCount < minFail) issues.push(`Word count too low: ${wordCount} (min ${minFail})`);
  else if (wordCount < minWarn) warnings.push(`Word count borderline: ${wordCount} (target ${minWarn}+)`);
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
      raw.content +=
        "\n\n---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*";
      content = raw.content;
      contentLower = content.toLowerCase();
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
  if (dataPointCount < thresholds.minDataPoints) {
    issues.push(`Too few data points: ${dataPointCount} (min ${thresholds.minDataPoints})`);
  }

  // Prohibited phrases
  const foundProhibited: string[] = [];
  for (const phrase of PROHIBITED_PHRASES) {
    if (contentLower.includes(phrase)) {
      foundProhibited.push(phrase);
    }
  }

  if (foundProhibited.length > 0) {
    if (autoFix && (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY)) {
      // Targeted AI fix: rewrite only the offending paragraphs
      const result = await fixProhibitedPhrases(content, foundProhibited);
      if (result.fixed.length > 0) {
        raw.content = result.content;
        content = result.content;
        contentLower = content.toLowerCase();
        fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
        warnings.push(`AI-fixed prohibited phrases: "${result.fixed.join('", "')}"`);
      }
      if (result.failed.length > 0) {
        issues.push(`Prohibited phrases (AI fix failed): "${result.failed.join('", "')}"`);
      }
    } else {
      issues.push(`Prohibited phrases found: "${foundProhibited.join('", "')}"`);
    }
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

  addUniqueIssues(issues, [
    ...validateGeneratedArticleIntegrity(filePath, raw),
    ...validateArticleOutboundUrls(filePath, raw),
  ]);

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

function quarantineArticle(filePath: string, rootDir: string): string {
  const relativePath = path.relative(rootDir, filePath);
  const targetPath = path.join(QUARANTINE_RUN_DIR, relativePath);
  ensureDirSync(path.dirname(targetPath));
  fs.renameSync(filePath, targetPath);
  return targetPath;
}

function deleteFailedArticle(filePath: string): void {
  fs.unlinkSync(filePath);
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf("--token");
  const targetToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;
  const dirIdx = args.indexOf("--dir");
  const targetRoot =
    dirIdx !== -1 && args[dirIdx + 1]
      ? path.resolve(process.cwd(), args[dirIdx + 1])
      : CONTENT_DIR;
  const autoFix = args.includes("--fix");
  const quarantineFailures = args.includes("--quarantine");
  const deleteFailures = args.includes("--delete-failures") || args.includes("--drop-failures");
  const failOnError = args.includes("--fail-on-error") || args.includes("--strict");

  if (quarantineFailures && deleteFailures) {
    console.error("  Use either --quarantine or --delete-failures, not both.");
    process.exit(1);
  }

  if (deleteFailures && path.basename(targetRoot) !== "queue") {
    console.error("  --delete-failures only supports queue directories. Pass --dir data/queue.");
    process.exit(1);
  }

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Content Quality Checker    ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();

  if (autoFix && (process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY)) {
    console.log("  Mode: --fix with AI rewrite (Gemini 2.5 Flash → Claude Haiku 4.5 fallback)");
  } else if (autoFix) {
    console.log("  Mode: --fix (disclaimer only, no AI API key for rewrite)");
  }
  if (deleteFailures) {
    console.log("  Mode: --delete-failures (failed articles will be removed from the queue)");
  } else if (quarantineFailures) {
    console.log("  Mode: --quarantine (failed articles will be moved to data/quarantine)");
  } else {
    console.log("  Mode: check-only (failed articles stay in place)");
  }
  if (failOnError) {
    console.log("  Mode: --fail-on-error (non-zero exit on failed articles)");
  }
  console.log(`  Root: ${path.relative(process.cwd(), targetRoot) || "."}`);
  console.log();

  if (!fs.existsSync(targetRoot)) {
    console.log("  No content found. Run generate-content first.");
    return;
  }

  const tokenDirs = fs
    .readdirSync(targetRoot)
    .filter((d) => {
      const p = path.join(targetRoot, d);
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
    const dirPath = path.join(targetRoot, tokenDir);
    const articleFiles = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".json") && !f.includes(".prompt"));

    for (const file of articleFiles) {
      const filePath = path.join(dirPath, file);
      const result = await checkArticle(filePath, autoFix);

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

      if (result.passed) {
        totalPassed++;
        if (result.warnings.length > 0) {
          logActivity("quality-check-fixed", {
            tokenId: result.tokenId,
            articleType: result.articleType,
            warnings: result.warnings.join("; ")
          });
        }
      } else {
        totalFailed++;
        if (deleteFailures) {
          deleteFailedArticle(filePath);
          console.log(`    Deleted failed article: ${result.file}`);
        } else if (quarantineFailures) {
          const quarantinedPath = quarantineArticle(filePath, targetRoot);
          console.log(`    🗑 Quarantining failed article: ${path.relative(process.cwd(), quarantinedPath)}`);
        } else {
          console.log("    Not deleted or quarantined. Re-run with --delete-failures or --quarantine to remove failed articles.");
        }
        logActivity("quality-check-failed", {
          tokenId: result.tokenId,
          articleType: result.articleType,
          issues: result.issues.join("; ")
        });
      }
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
    console.log(`
  Check completed with ${totalFailed} failed articles. Job will continue.`);
    if (failOnError) {
      process.exit(1);
    }
  }
}

main().catch(async (error) => {
  await logError("quality-check", error);
  process.exit(1);
});

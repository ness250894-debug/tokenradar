/**
 * Article Formatting Fixer
 *
 * Scans all generated articles and fixes common AI markdown formatting issues:
 *
 * 1. Duplicate FAQ sections (## FAQ appears more than once)
 * 2. Wrong heading levels (### instead of ##)
 * 3. Hybrid headings (## ### FAQ)
 * 4. H1 headings (# Title — should be ## or removed)
 * 5. Orphaned bold markers (**text without closing **)
 * 6. Excessive blank lines
 * 7. Stray markdown artifacts
 *
 * Usage:
 *   npx tsx scripts/fix-article-formatting.ts              (fix all)
 *   npx tsx scripts/fix-article-formatting.ts --dry-run    (report only, no writes)
 *   npx tsx scripts/fix-article-formatting.ts --token bitcoin  (single token)
 *
 * Exit codes:
 *   0 — all clean (or fixes applied successfully)
 *   1 — unexpected error
 */

import * as fs from "fs";
import * as path from "path";
import { logError, logActivity } from "../src/lib/reporter";

const CONTENT_DIR = path.resolve(__dirname, "../content/tokens");

// ── Fix Functions ──────────────────────────────────────────────

interface FixResult {
  file: string;
  tokenId: string;
  articleType: string;
  fixes: string[];
  originalLength: number;
  fixedLength: number;
}

/**
 * Normalize hybrid headings like "## ### FAQ" or "## #### Section" → "## FAQ" / "## Section"
 */
function fixHybridHeadings(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  // Match lines like "## ### Something" or "## #### Something"
  const hybridPattern = /^(#{2})\s+#{1,4}\s+(.+)$/gm;
  const replaced = content.replace(hybridPattern, (_match, _hashes, title) => {
    fixes.push(`Fixed hybrid heading: "## ### ${title}" → "## ${title}"`);
    return `## ${title}`;
  });
  return { content: replaced, fixes };
}

/**
 * Convert ### (and ####, #####) headings to ## per system prompt rules.
 * Skips headings inside FAQ answers (lines starting with **Q:).
 */
function fixWrongHeadingLevels(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    // Match ### or #### or ##### headings (but not ## which is correct)
    const match = line.match(/^(#{3,5})\s+(.+)$/);
    if (match) {
      const title = match[2];
      fixes.push(`Fixed heading level: "${match[1]} ${title}" → "## ${title}"`);
      fixedLines.push(`## ${title}`);
    } else {
      fixedLines.push(line);
    }
  }

  return { content: fixedLines.join("\n"), fixes };
}

/**
 * Remove H1 headings (# Title) at the start of articles.
 * The system prompt says "Start with a brief intro paragraph (no heading)".
 * If the H1 is the very first line, remove it entirely.
 * Otherwise convert to ##.
 */
function fixH1Headings(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^#\s+(.+)$/);

    if (match && !line.startsWith("##")) {
      if (i === 0) {
        // First line H1 — remove it entirely (intro should have no heading)
        fixes.push(`Removed H1 heading from article start: "# ${match[1]}"`);
        // Skip blank line after removed heading
        if (i + 1 < lines.length && lines[i + 1].trim() === "") {
          i++;
        }
      } else {
        // Non-first H1 — convert to ##
        fixes.push(`Converted H1 to H2: "# ${match[1]}" → "## ${match[1]}"`);
        fixedLines.push(`## ${match[1]}`);
      }
    } else {
      fixedLines.push(line);
    }
  }

  return { content: fixedLines.join("\n"), fixes };
}

/**
 * Remove duplicate FAQ sections.
 *
 * Strategy:
 * - Find all "## FAQ" headings in the content
 * - If there are 2+, keep only the first "## FAQ" heading
 * - For subsequent "## FAQ" headings: if the content underneath is unique,
 *   merge it into the first FAQ section; if it's a duplicate, remove entirely.
 */
function fixDuplicateFaqSections(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];

  // Split content by ## FAQ heading
  const faqPattern = /^## FAQ\s*$/gm;
  const faqIndices: number[] = [];
  let match: RegExpExecArray | null;

  while ((match = faqPattern.exec(content)) !== null) {
    faqIndices.push(match.index);
  }

  if (faqIndices.length <= 1) {
    return { content, fixes };
  }

  // We have multiple ## FAQ sections — need to merge/deduplicate
  fixes.push(`Found ${faqIndices.length} FAQ sections — merging into one`);

  // Extract content between each FAQ heading and the next major section or end
  const sections: { heading: string; body: string; startIndex: number; endIndex: number }[] = [];

  for (let i = 0; i < faqIndices.length; i++) {
    const start = faqIndices[i];
    const headingEnd = content.indexOf("\n", start);
    const bodyStart = headingEnd + 1;

    // Find end: next ## heading or next FAQ heading or the --- disclaimer or end of content
    let end = content.length;

    // Look for the next ## heading (that's not a FAQ heading at a later index)
    const nextSectionMatch = content.slice(bodyStart).search(/^## (?!FAQ\s*$)/m);
    if (nextSectionMatch !== -1) {
      end = Math.min(end, bodyStart + nextSectionMatch);
    }

    // Also check for the --- disclaimer separator
    const disclaimerMatch = content.slice(bodyStart).search(/^---\s*$/m);
    if (disclaimerMatch !== -1) {
      end = Math.min(end, bodyStart + disclaimerMatch);
    }

    // If there's a next FAQ section, that's also a boundary
    if (i + 1 < faqIndices.length) {
      end = Math.min(end, faqIndices[i + 1]);
    }

    sections.push({
      heading: "## FAQ",
      body: content.slice(bodyStart, end).trim(),
      startIndex: start,
      endIndex: end,
    });
  }

  // Collect unique Q&A items from all FAQ sections
  const allQAs = new Set<string>();
  const mergedQAs: string[] = [];

  for (const section of sections) {
    // Split FAQ body into Q&A blocks (separated by double newlines or **Q patterns)
    const qaBlocks = section.body
      .split(/\n\n+/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    for (const block of qaBlocks) {
      // Normalize for deduplication (lowercase, strip whitespace)
      const normalized = block.toLowerCase().replace(/\s+/g, " ").trim();
      if (!allQAs.has(normalized)) {
        allQAs.add(normalized);
        mergedQAs.push(block);
      } else {
        fixes.push(`Removed duplicate FAQ entry`);
      }
    }
  }

  // Rebuild: remove everything from first FAQ heading to the last FAQ section end,
  // then insert merged FAQ
  const firstStart = sections[0].startIndex;
  const lastEnd = sections[sections.length - 1].endIndex;

  const beforeFaq = content.slice(0, firstStart);
  const afterFaq = content.slice(lastEnd);
  const mergedFaqSection = `## FAQ\n\n${mergedQAs.join("\n\n")}`;

  const result = beforeFaq + mergedFaqSection + "\n\n" + afterFaq.replace(/^\n+/, "");

  return { content: result, fixes };
}

/**
 * Fix orphaned bold markers — **text without closing **
 *
 * Detects lines where ** opens but never closes on the same line.
 * Common pattern from AI: "**What is X?\n" instead of "**What is X?**\n"
 */
function fixOrphanedBoldMarkers(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    // Count ** occurrences in the line
    const boldMarkers = line.match(/\*\*/g);
    const count = boldMarkers ? boldMarkers.length : 0;

    if (count === 1) {
      // Single ** — it's orphaned. Check if it's an opening marker
      const trimmed = line.trim();
      if (trimmed.startsWith("**") && !trimmed.endsWith("**")) {
        // Opening bold without closing — add closing ** at end
        // Handle lines ending with punctuation: "**What is X?" → "**What is X?**"
        const fixed = line.replace(/^(\s*\*\*.+?)(\s*)$/, "$1**$2");
        fixes.push(`Fixed orphaned bold: "${trimmed.slice(0, 50)}..." → added closing **`);
        fixedLines.push(fixed);
        continue;
      }
    }

    // Check for empty/stray bold markers: lines that are just "**" or "****"
    if (line.trim() === "**" || line.trim() === "****" || line.trim() === "***") {
      fixes.push(`Removed stray bold marker: "${line.trim()}"`);
      continue; // Skip the line entirely
    }

    fixedLines.push(line);
  }

  return { content: fixedLines.join("\n"), fixes };
}

/**
 * Clean up excessive blank lines (3+ consecutive → 2).
 */
function fixExcessiveBlankLines(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const original = content;
  const cleaned = content.replace(/\n{4,}/g, "\n\n\n");

  if (cleaned !== original) {
    fixes.push("Cleaned excessive blank lines");
  }

  return { content: cleaned, fixes };
}

/**
 * Fix lines where heading markers appear inline incorrectly.
 * E.g. "Some text ## Another heading" on the same line.
 */
function fixInlineHeadingMarkers(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  // Lines that have text before ## markers (not at line start)
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    // Check for inline ## that's not at the start of a line and not inside bold/code
    const inlineMatch = line.match(/^(.{10,}?)\s+(#{2,3})\s+(.+)$/);
    if (inlineMatch && !line.includes("`") && !line.includes("|")) {
      // Split into two lines
      fixes.push(`Split inline heading: "${line.slice(0, 60)}..."`);
      fixedLines.push(inlineMatch[1]);
      fixedLines.push("");
      fixedLines.push(`## ${inlineMatch[3]}`);
      continue;
    }
    fixedLines.push(line);
  }

  return { content: fixedLines.join("\n"), fixes };
}

/**
 * Fix broken headers that were split into multiple lines.
 * E.g. "## The\n\nCore Problem" -> "## The Core Problem"
 */
function fixBrokenHeaders(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  
  // Match ## Word \n\n Rest of header
  // The first word should be relatively short (common in split headers, max 20 chars)
  // We use a regex that matches ## followed by a word, then 1-2 newlines, then the rest of the header line
  const pattern = /(##\s+[A-Z][A-Za-z]{1,20})\s*[\r\n]+\s*([^#\n\r]{3,})/g;
  
  const fixed = content.replace(pattern, (_match, start, rest) => {
    fixes.push(`Joined split header: "${start} ${rest.trim()}"`);
    return `${start} ${rest.trim()}`;
  });

  // Also fix headers that are immediately followed by a colon (common artifact)
  const colonPattern = /^## (.*?):\s*$/gm;
  const result = fixed.replace(colonPattern, (_match, title) => {
    fixes.push(`Removed trailing colon from header: "## ${title}"`);
    return `## ${title}`;
  });

  return { content: result, fixes };
}

/**
 * Fix excessive bolding (entire paragraphs or very long sentences).
 * If a bold block is > 150 characters, it's probably a formatting error.
 */
function fixExcessiveBolding(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  // Match bold blocks: **...**
  const boldPattern = /\*\*(.*?)\*\*/gs;
  
  const fixed = content.replace(boldPattern, (match, inner) => {
    if (inner.length > 150) {
      fixes.push(`Reduced excessive bolding (${inner.length} chars)`);
      return inner; // Strip bold markers
    }
    return match;
  });

  return { content: fixed, fixes };
}

/**
 * Fix missing newlines after headers.
 * E.g. "## Header Text Paragraph starts here..." -> "## Header Text\n\nParagraph starts here..."
 */
function fixMissingNewlineAfterHeader(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    // Match a header followed by a paragraph start on the same line
    // E.g. "## Header Title Paragraph text..."
    // Criteria: Starts with ##, has a title, then a space, then something that looks like a sentence start.
    // We look for a pattern where there's a space followed by a capitalized word of 3+ chars
    // AND that capitalized word is followed by several lowercase words (paragraph style)
    const match = line.match(/^(##\s+[A-Z][^#\n]+?)\s+([A-Z][a-z]{2,}\s+[a-z]{2,}\s+[a-z]{2,}.*)$/);
    if (match && !line.includes("|") && !line.includes("FAQ")) {
      fixes.push(`Added missing newline after header: "${match[1]}"`);
      fixedLines.push(match[1]);
      fixedLines.push("");
      fixedLines.push(match[2]);
    } else {
      fixedLines.push(line);
    }
  }

  return { content: fixedLines.join("\n"), fixes };
}

/**
 * Robust Table Surgeon: Finds, validates, and repairs markdown tables.
 * Ensures:
 * 1. Table starts with a header (not a separator).
 * 2. Exactly one separator row exists.
 * 3. Separator columns match data columns.
 * 4. No blank lines inside the table.
 * 5. Table is preceded by a blank line.
 */
function fixTables(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  const result: string[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // Detect start of a table (any line with pipes)
    if (line.startsWith("|")) {
      const tableLines: string[] = [];
      let j = i;
      
      // Collect all consecutive table lines (ignore internal blank lines)
      while (j < lines.length && (lines[j].trim().startsWith("|") || lines[j].trim() === "")) {
        const currentLine = lines[j].trim();
        if (currentLine !== "") {
          tableLines.push(currentLine);
        }
        j++;
      }
      
      if (tableLines.length > 0) {
        let repairedTable: string[] = [];
        
        // 1. Ensure it doesn't start with a separator
        if (tableLines[0].includes(":---") || tableLines[0].includes("---:")) {
          repairedTable.push("| Metric | Details |");
          fixes.push("Fixed table starting with separator");
        }
        
        // 2. Identify the data rows by filtering out ALL existing separators
        let nonSeparatorRows = tableLines.filter(row => !row.includes(":---") && !row.includes("---:"));
        
        if (nonSeparatorRows.length === 0) {
          nonSeparatorRows = ["| Metric | Details |", "| | |"];
        }

        const dataRow = nonSeparatorRows.length > 0 ? nonSeparatorRows[0] : "| | |";
        
        // Count columns in the data row to create a matching separator
        const columnCount = (dataRow.match(/\|/g) || []).length - 1;
        const correctSeparator = "|" + " :--- |".repeat(Math.max(1, columnCount));
        
        // 3. Rebuild the table: Header -> Separator -> Data
        repairedTable.push(nonSeparatorRows[0]);
        repairedTable.push(correctSeparator);
        repairedTable.push(...nonSeparatorRows.slice(1));
        
        // Ensure double newline BEFORE the table if not at the start
        if (result.length > 0 && result[result.length - 1] !== "") {
          result.push("");
        }
        
        result.push(...repairedTable);
        fixes.push(`Repaired table structure (${repairedTable.length} rows)`);
        
        i = j; // Skip the lines we processed
        continue;
      }
    }
    
    result.push(lines[i]);
    i++;
  }

  return { content: result.join("\n"), fixes };
}

/**
 * Move the market overview table from the top to after the intro.
 * The Ethereum standard starts with an intro paragraph.
 */
function moveMarketTable(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  
  // Find the table block
  let tableStart = -1;
  let tableEnd = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|")) {
      if (tableStart === -1) tableStart = i;
      tableEnd = i;
    } else if (tableStart !== -1) {
      break;
    }
  }

  if (tableStart === -1 || tableStart > 15) return { content, fixes };

  // Check if the line BEFORE the table is a Market Overview header
  let includeHeader = false;
  if (tableStart > 0) {
    const prevLine = lines[tableStart - 1].trim();
    if (prevLine.includes("Market Overview") || prevLine.includes("Market Summary")) {
      includeHeader = true;
      tableStart--;
    } else if (prevLine === "" && tableStart > 1) {
      const prevPrevLine = lines[tableStart - 2].trim();
      if (prevPrevLine.includes("Market Overview") || prevPrevLine.includes("Market Summary")) {
        includeHeader = true;
        tableStart -= 2;
      }
    }
  }

  const tableLines = lines.splice(tableStart, tableEnd - tableStart + 1);
  
  // Find insertion point (after first paragraph or second ## header)
  let insertAt = 0;
  let paragraphCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line !== "" && !line.startsWith("#")) {
      paragraphCount++;
      if (paragraphCount === 1) {
        insertAt = i + 1;
        break;
      }
    }
  }

  lines.splice(insertAt, 0, "", ...tableLines, "");
  fixes.push(`Moved market summary table ${includeHeader ? "with header " : ""}after intro paragraph`);
  
  return { content: lines.join("\n"), fixes };
}

// ── Article Processing ─────────────────────────────────────────

/**
 * Fix headers that were accidentally split into two lines.
 * Example: "## How to buy\nBitcoin?" -> "## How to buy Bitcoin?"
 */
function joinSplitHeaders(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // If current line is a header and doesn't end with punctuation
    if ((line.startsWith("##") || line.startsWith("###")) && 
        !line.endsWith("?") && !line.endsWith(".") && !line.endsWith("!")) {
      
      // Look ahead for the next non-empty line (skip blank lines)
      let nextLineIdx = i + 1;
      while (nextLineIdx < lines.length && lines[nextLineIdx].trim() === "") {
        nextLineIdx++;
      }
      
      const nextLine = lines[nextLineIdx]?.trim() || "";
      
      // If next line is short, doesn't look like a header, and seems to be a fragment
      if (nextLine !== "" && 
          !nextLine.startsWith("#") && 
          !nextLine.startsWith("|") && 
          nextLine.length < 50) {
        
        result.push(`${line} ${nextLine}`);
        fixes.push(`Joined split header: ${line} ${nextLine}`);
        i = nextLineIdx; // Skip the lines we consumed
        continue;
      }
    }
    
    result.push(lines[i]);
  }
  
  return { content: result.join("\n"), fixes };
}

/**
 * Ensure the ## Market Overview header is always exactly above the table.
 */
function syncTableHeader(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  const lines = content.split("\n");
  
  // Find the table start
  let tableIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("|")) {
      tableIdx = i;
      break;
    }
  }

  if (tableIdx === -1) return { content, fixes };

  // Find the Market Overview header
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.includes("Market Overview") || line.includes("Market Summary")) {
      headerIdx = i;
      break;
    }
  }

  // If header exists but is not right before the table
  if (headerIdx !== -1 && headerIdx !== tableIdx - 1 && headerIdx !== tableIdx - 2) {
    const headerLine = lines[headerIdx];
    lines.splice(headerIdx, 1);
    
    // Recalculate tableIdx
    let newTableIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith("|")) {
        newTableIdx = i;
        break;
      }
    }

    if (newTableIdx !== -1) {
      lines.splice(newTableIdx, 0, headerLine, "");
      fixes.push("Synced Market Overview header position with table");
    }
  }

  return { content: lines.join("\n"), fixes };
}

/**
 * Apply all formatting fixes to a single article's content.
 */
function fixArticle(content: string): { content: string; allFixes: string[] } {
  const allFixes: string[] = [];
  let current = content;

  // Order matters — fix hybrid headings first as they might interfere with other checks 
  const fixers = [
    joinSplitHeaders,
    fixHybridHeadings,
    fixH1Headings,
    fixWrongHeadingLevels,
    fixBrokenHeaders,
    fixMissingNewlineAfterHeader,
    fixTables,
    moveMarketTable,
    syncTableHeader,
    fixExcessiveBolding,
    fixDuplicateFaqSections,
    fixOrphanedBoldMarkers,
    fixInlineHeadingMarkers,
    fixExcessiveBlankLines,
  ];

  for (const fixer of fixers) {
    const result = fixer(current);
    current = result.content;
    allFixes.push(...result.fixes);
  }

  // Final pass to restore missing newlines if the content looks like a single block
  const newlineResult = fixMissingNewlines(current);
  current = newlineResult.content;
  allFixes.push(...newlineResult.fixes);

  return { content: current, allFixes };
}

/**
 * Restore missing newlines for articles that were generated as a single-line block.
 * Detects markdown markers (##, -, |) that are preceded by spaces instead of newlines.
 */
function fixMissingNewlines(content: string): { content: string; fixes: string[] } {
  const fixes: string[] = [];
  let fixed = content;

  // 1. Fix headers: "some text ## Header" -> "some text\n\n## Header"
  const headerStartPattern = /([^\n])\s+(#+\s+[A-Z])/g;
  if (headerStartPattern.test(fixed)) {
    fixed = fixed.replace(headerStartPattern, "$1\n\n$2");
    fixes.push("Restored missing newlines before headers");
  }

  // 2. Fix list starts: "some text\n- item" -> "some text\n\n- item"
  const listPattern = /([^\n])\s+(-\s+[A-Z])/g; 
  if (listPattern.test(fixed)) {
    fixed = fixed.replace(listPattern, "$1\n$2");
    fixes.push("Restored missing newlines for list items");
  }

  return { content: fixed, fixes };
}

/**
 * Process a single JSON article file.
 */
function processFile(filePath: string, dryRun: boolean): FixResult | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const content: string = raw.content || "";

    if (!content) return null;

    const { content: fixedContent, allFixes } = fixArticle(content);

    if (allFixes.length === 0) return null;

    const result: FixResult = {
      file: path.relative(process.cwd(), filePath),
      tokenId: raw.tokenId || path.basename(path.dirname(filePath)),
      articleType: raw.type || raw.slug || "unknown",
      fixes: allFixes,
      originalLength: content.length,
      fixedLength: fixedContent.length,
    };

    if (!dryRun) {
      raw.content = fixedContent;
      fs.writeFileSync(filePath, JSON.stringify(raw, null, 2));
    }

    return result;
  } catch (error) {
    console.error(`  ✗ Error processing ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// ── Main ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const tokenIdx = args.indexOf("--token");
  const targetToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;
  const dryRun = args.includes("--dry-run");

  console.log("╔══════════════════════════════════════════╗");
  console.log("║  TokenRadar — Article Formatting Fixer   ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log();
  console.log(`  Mode: ${dryRun ? "DRY RUN (report only)" : "LIVE (auto-fix)"}`);
  console.log(`  Target: ${targetToken || "all tokens"}`);
  console.log();

  if (!fs.existsSync(CONTENT_DIR)) {
    console.log("  No content directory found. Nothing to check.");
    return;
  }

  const tokenDirs = fs
    .readdirSync(CONTENT_DIR)
    .filter((d) => fs.statSync(path.join(CONTENT_DIR, d)).isDirectory())
    .filter((d) => !targetToken || d === targetToken);

  if (tokenDirs.length === 0) {
    console.log("  No token directories found.");
    return;
  }

  let totalFiles = 0;
  let totalFixed = 0;
  let totalFixCount = 0;
  const fixBreakdown: Record<string, number> = {};

  for (const tokenDir of tokenDirs) {
    const dirPath = path.join(CONTENT_DIR, tokenDir);
    const articleFiles = fs
      .readdirSync(dirPath)
      .filter((f) => f.endsWith(".json") && !f.includes(".prompt"));

    for (const file of articleFiles) {
      totalFiles++;
      const filePath = path.join(dirPath, file);
      const result = processFile(filePath, dryRun);

      if (result) {
        totalFixed++;
        totalFixCount += result.fixes.length;

        const action = dryRun ? "NEEDS FIX" : "FIXED";
        console.log(`  ${dryRun ? "⚠" : "✓"} ${action} ${result.tokenId}/${result.articleType} (${result.fixes.length} fixes)`);

        for (const fix of result.fixes) {
          console.log(`    → ${fix}`);

          // Track fix categories for summary
          const category = fix.split(":")[0] || "Other";
          fixBreakdown[category] = (fixBreakdown[category] || 0) + 1;
        }

        if (!dryRun) {
          logActivity("format-fix", {
            tokenId: result.tokenId,
            articleType: result.articleType,
            fixesCount: result.fixes.length
          });
        }
      }
    }
  }

  console.log();
  console.log("╔══════════════════════════════════════════╗");
  console.log("║      Formatting Check Complete           ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║  Files scanned:  ${String(totalFiles).padStart(6)}                ║`);
  console.log(`║  Files ${dryRun ? "needing" : " "} fix: ${String(totalFixed).padStart(6)}                ║`);
  console.log(`║  Total fixes:    ${String(totalFixCount).padStart(6)}                ║`);
  console.log("╚══════════════════════════════════════════╝");

  if (Object.keys(fixBreakdown).length > 0) {
    console.log();
    console.log("  Fix breakdown:");
    for (const [category, count] of Object.entries(fixBreakdown).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${category}: ${count}`);
    }
  }

  if (dryRun && totalFixed > 0) {
    console.log();
    console.log(`  ℹ Run without --dry-run to apply ${totalFixCount} fixes.`);
  }
}

main().catch(async (error) => {
  await logError("fix-article-formatting", error);
  process.exit(1);
});

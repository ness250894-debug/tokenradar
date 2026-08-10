function splitInlineFaq(content: string): string {
  return content
    .replace(/^## FAQ\s+(\*\*.+)$/gm, "## FAQ\n\n$1")
    .replace(/^## FAQ\s+(\d+\.\s+.+)$/gm, "## FAQ\n\n$1");
}

function dedupeFaqHeadings(content: string): string {
  return content.replace(/(^## FAQ\s*$\n+)(?:^## FAQ\s*$\n+)*/gim, "$1");
}

function joinSplitDates(content: string): string {
  return content.replace(/([A-Z][a-z]+ \d{1,2},)\s*\n+\s*(\d{4})/g, "$1 $2");
}

function repairNestedInternalLinks(content: string): string {
  return content.replace(
    /\[\[([^\]]+)\]\((\/[^)\s]+)\)\s+([^\]]+)\]\((.*?)\)/g,
    (_match, innerLabel: string, innerTarget: string, trailingLabel: string, outerTarget: string) => {
      const label = `${innerLabel} ${trailingLabel}`.replace(/\s+/g, " ").trim();
      const target = outerTarget.includes("[") || outerTarget.includes("](") ? innerTarget : outerTarget;
      return `[${label}](${target})`;
    },
  );
}

function fixHybridHeadings(content: string): string {
  return content.replace(/^(##)\s+#{1,4}\s+(.+)$/gm, "## $2");
}

function fixBrokenHeaders(content: string): string {
  return content.replace(
    /(##\s+(?!FAQ\b)[A-Z][A-Za-z]{1,20})\s*[\r\n]+\s*((?!\d+\.\s|\*\*|[-*]\s|\||---)[^#\n\r]{3,})/g,
    "$1 $2",
  );
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2;
}

function isMarkdownSeparatorRow(line: string): boolean {
  return /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

function isBrokenTableNoise(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed === "|" || /^-+$/.test(trimmed);
}

function buildSeparatorForTableHeader(header: string): string {
  const columnCount = Math.max(2, header.split("|").filter((part) => part.trim()).length);
  return `| ${Array(columnCount).fill(":---").join(" | ")} |`;
}

function repairBrokenSummaryTables(content: string): string {
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const nextLine = lines[index + 1] || "";
    const lookahead = lines.slice(index + 1, index + 40);

    if (
      isMarkdownTableRow(line) &&
      !isMarkdownSeparatorRow(nextLine) &&
      lookahead.some((candidate) => candidate.trim() === "|") &&
      lookahead.some((candidate) => isMarkdownTableRow(candidate) && !isBrokenTableNoise(candidate))
    ) {
      fixedLines.push(line, buildSeparatorForTableHeader(line));

      while (index + 1 < lines.length && isBrokenTableNoise(lines[index + 1])) {
        index++;
      }

      continue;
    }

    fixedLines.push(line);
  }

  return fixedLines.join("\n");
}

function dedupeRepeatedParagraphs(content: string): string {
  const paragraphs = content.split(/\n{2,}/);
  const seen = new Set<string>();

  return paragraphs
    .filter((paragraph) => {
      const normalized = paragraph.replace(/\s+/g, " ").trim().toLowerCase();
      const wordCount = normalized.split(/\s+/).filter(Boolean).length;
      if (wordCount < 14 || normalized.startsWith("|")) return true;
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join("\n\n");
}

function fixSplitQuestionHeadings(content: string): string {
  return content.replace(
    /^(##\s+(?!FAQ\b)[^\n\r?]{3,80})\s*[\r\n]+\s*((?!\d+\.\s|\*\*|[-*]\s|\||---)[^#\n\r]{3,120}\?)$/gm,
    "$1 $2",
  );
}

function fixMissingNewlineAfterHeader(content: string): string {
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    const boldBlockMatch = line.match(/^(##\s+[A-Z][^#\n]+?)\s+(\*\*.+)$/);
    if (boldBlockMatch) {
      fixedLines.push(boldBlockMatch[1], "", boldBlockMatch[2]);
      continue;
    }

    fixedLines.push(line);
  }

  return fixedLines.join("\n");
}

function fixInlineHeadingMarkers(content: string): string {
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    const inlineMatch = line.match(/^(.{10,}?)\s+(#{2,3})\s+(.+)$/);
    if (inlineMatch && !line.includes("`") && !line.includes("|")) {
      fixedLines.push(inlineMatch[1], "", `## ${inlineMatch[3]}`);
      continue;
    }

    fixedLines.push(line);
  }

  return fixedLines.join("\n");
}

function fixMissingNewlines(content: string): string {
  return content
    .replace(/([^\n])\s+(#+\s+[A-Z])/g, "$1\n\n$2")
    .replace(/([^\n])\s+(-\s+[A-Z])/g, "$1\n$2");
}

function fixDanglingNumericParagraphs(content: string): string {
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    if (/^\d+\.\s+[A-Z]/.test(line)) {
      let lastContentIndex = fixedLines.length - 1;
      while (lastContentIndex >= 0 && fixedLines[lastContentIndex].trim() === "") {
        lastContentIndex -= 1;
      }

      if (
        lastContentIndex >= 0 &&
        /\b(?:score|index|rank|rating)\s+of\s*$/i.test(fixedLines[lastContentIndex])
      ) {
        fixedLines.splice(lastContentIndex + 1);
        fixedLines[lastContentIndex] = `${fixedLines[lastContentIndex]} ${line}`;
        continue;
      }
    }

    fixedLines.push(line);
  }

  return fixedLines.join("\n");
}

function splitInlineHorizontalRules(content: string): string {
  return content.replace(/\s+---\s+/g, "\n\n---\n\n");
}

function normalizeWhitespace(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

const LIVE_MARKET_TABLE_FIELDS = new Map([
  ["price", "{{LIVE_PRICE}}"],
  ["market cap", "{{LIVE_MARKET_CAP}}"],
  ["24h change", "{{LIVE_24H_CHANGE}}"],
  ["market rank", "{{LIVE_RANK}}"],
]);

function normalizeTableLabel(value: string): string {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Converts the standard article summary table to render-time market fields.
 * The prose review date remains intact, while prices/rank in the table are
 * injected from the latest local token snapshot by markdownToHtml.
 */
export function hydrateLiveMarketSummaryFields(content: string): string {
  const withFreshnessScope = content.replace(
    /\bData snapshot date:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2})\./gi,
    "Article evidence snapshot: $1. Live values in the summary table and page metrics use the latest local market snapshot.",
  );

  return withFreshnessScope
    .split("\n")
    .map((line) => {
      if (!isMarkdownTableRow(line) || isMarkdownSeparatorRow(line)) return line;
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (cells.length !== 2) return line;
      const placeholder = LIVE_MARKET_TABLE_FIELDS.get(normalizeTableLabel(cells[0]));
      return placeholder ? `| ${cells[0]} | ${placeholder} |` : line;
    })
    .join("\n");
}

export function normalizeArticleMarkdown(content: string): string {
  let normalized = normalizeWhitespace(content);

  normalized = splitInlineFaq(normalized);
  normalized = dedupeFaqHeadings(normalized);
  normalized = joinSplitDates(normalized);
  normalized = repairNestedInternalLinks(normalized);
  normalized = repairBrokenSummaryTables(normalized);
  normalized = dedupeRepeatedParagraphs(normalized);
  normalized = fixHybridHeadings(normalized);
  normalized = fixBrokenHeaders(normalized);
  normalized = fixSplitQuestionHeadings(normalized);
  normalized = fixMissingNewlineAfterHeader(normalized);
  normalized = fixInlineHeadingMarkers(normalized);
  normalized = fixMissingNewlines(normalized);
  normalized = fixDanglingNumericParagraphs(normalized);
  normalized = splitInlineHorizontalRules(normalized);

  return normalizeWhitespace(normalized);
}

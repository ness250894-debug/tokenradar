export interface TgeEvidenceSummary {
  status: string;
  lifecycleStatus: string;
  confidence: number | string;
  sourceCount: number;
  expectedLaunchWindow: string;
  category: string;
  lastChecked: string;
}

export interface GeneratedArticleNormalizationOptions {
  articleType: string;
  tgeEvidence?: TgeEvidenceSummary;
}

const REGULAR_SUMMARY_TABLE = [
  "| Metric | Value |",
  "| :--- | :--- |",
  "| Price | {{LIVE_PRICE}} |",
  "| Market Cap | {{LIVE_MARKET_CAP}} |",
  "| 24h Change | {{LIVE_24H_CHANGE}} |",
  "| Market Rank | {{LIVE_RANK}} |",
].join("\n");

function escapeTableCell(value: string | number): string {
  return String(value).replace(/\|/g, "\\|").trim() || "Unknown";
}

function buildTgeEvidenceTable(evidence: TgeEvidenceSummary): string {
  return [
    "| Evidence | Current status |",
    "| :--- | :--- |",
    `| Status | ${escapeTableCell(evidence.status)} |`,
    `| Lifecycle Status | ${escapeTableCell(evidence.lifecycleStatus)} |`,
    `| Verification Confidence | ${escapeTableCell(evidence.confidence)}/100 |`,
    `| Source Count | ${escapeTableCell(evidence.sourceCount)} |`,
    `| Expected Launch Window | ${escapeTableCell(evidence.expectedLaunchWindow)} |`,
    `| Category | ${escapeTableCell(evidence.category)} |`,
    `| Last Checked | ${escapeTableCell(evidence.lastChecked)} |`,
  ].join("\n");
}

function normalizeHeadingDepths(content: string): string {
  let insideFaq = false;
  return content
    .split("\n")
    .map((line) => {
      const heading = line.match(/^\s*(#{2,})\s+(.+?)\s*$/);
      if (!heading) return line;

      const text = heading[2].trim();
      if (/^faq\b/i.test(text)) {
        insideFaq = true;
        return "## FAQ";
      }

      if (insideFaq && text.endsWith("?")) return `**${text}**`;
      return `## ${text}`;
    })
    .join("\n");
}

function stripLeadingIntroductionHeading(content: string): string {
  return content.replace(
    /^\s*##\s+(?:introduction(?:\s+to\b[^\n]*)?|overview(?:\s+of\b[^\n]*)?|executive summary|market overview)\s*\n+/i,
    "",
  );
}

interface TableRange {
  start: number;
  end: number;
  text: string;
}

function findMarkdownTables(lines: string[]): TableRange[] {
  const tables: TableRange[] = [];
  for (let index = 0; index < lines.length; index++) {
    const current = lines[index].trim();
    if (!current.startsWith("|") || !current.endsWith("|")) continue;

    let end = index + 1;
    while (end < lines.length && lines[end].trim().startsWith("|") && lines[end].trim().endsWith("|")) {
      end++;
    }
    tables.push({ start: index, end, text: lines.slice(index, end).join("\n") });
    index = end - 1;
  }
  return tables;
}

function isSummaryTable(table: string, articleType: string): boolean {
  const normalized = table.toLowerCase();
  if (articleType === "tge-preview") {
    return normalized.includes("status") && (
      normalized.includes("confidence") ||
      normalized.includes("source count") ||
      normalized.includes("launch window")
    );
  }
  return normalized.includes("price") && (
    normalized.includes("market cap") ||
    normalized.includes("24h") ||
    normalized.includes("market rank")
  );
}

function insertTableAfterOpeningParagraph(content: string, table: string, articleType: string): string {
  const lines = content.split("\n");
  const tables = findMarkdownTables(lines);
  const existingSummaries = tables.filter((candidate) => isSummaryTable(candidate.text, articleType));
  for (const existingSummary of existingSummaries.reverse()) {
    lines.splice(existingSummary.start, existingSummary.end - existingSummary.start);
  }

  while (lines[0]?.trim() === "") lines.shift();
  const firstContentLine = lines.findIndex((line) => line.trim() !== "");
  if (firstContentLine === -1) return table;

  let paragraphEnd = firstContentLine;
  while (paragraphEnd < lines.length && lines[paragraphEnd].trim() !== "") paragraphEnd++;
  lines.splice(paragraphEnd, 0, "", table, "");

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function normalizeGeneratedArticleMarkdown(
  content: string,
  options: GeneratedArticleNormalizationOptions,
): string {
  const normalizedHeadings = normalizeHeadingDepths(
    stripLeadingIntroductionHeading(content.replace(/\r\n?/g, "\n").trim()),
  );
  const table = options.articleType === "tge-preview" && options.tgeEvidence
    ? buildTgeEvidenceTable(options.tgeEvidence)
    : REGULAR_SUMMARY_TABLE;

  return insertTableAfterOpeningParagraph(normalizedHeadings, table, options.articleType);
}

export function buildGenerationRetryFeedback(articleType: string, issues: string[]): string {
  const tableInstruction = articleType === "tge-preview"
    ? "After the opening paragraph, include the evidence table with status, lifecycle status, confidence, source count, expected launch window, category, and last checked date."
    : "After the opening paragraph, include the exact live-data summary table rows for Price, Market Cap, 24h Change, and Market Rank using the required placeholders.";

  return `
CORRECTION REQUIRED — the previous response failed validation:
${issues.map((issue) => `- ${issue}`).join("\n")}

Before responding, verify this exact structure:
1. Start with a 3-4 sentence analytical paragraph. Do not put a heading before it.
2. ${tableInstruction}
3. Use only ## section headings after the table.
4. Use ## FAQ once, with 3-5 bold question lines such as **What should readers verify?**. Never use ### headings.
5. Use only supplied facts and numerical evidence. If data is unavailable, say so without inventing values.
6. Meet the requested word-count range and end with the exact disclaimer.
7. Return only the required ---TITLE--- / ---CONTENT--- / ---END--- structure.`;
}

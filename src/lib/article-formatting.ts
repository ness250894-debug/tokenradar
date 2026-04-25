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

function fixMissingNewlineAfterHeader(content: string): string {
  const lines = content.split("\n");
  const fixedLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^(##\s+[A-Z][^#\n]+?)\s+([A-Z][A-Za-z]{2,}\s+[A-Za-z]{2,}\s+[A-Za-z]{2,}.*)$/);
    if (match && !line.includes("|") && !line.includes("FAQ")) {
      fixedLines.push(match[1], "", match[2]);
      continue;
    }

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

export function normalizeArticleMarkdown(content: string): string {
  let normalized = normalizeWhitespace(content);

  normalized = splitInlineFaq(normalized);
  normalized = dedupeFaqHeadings(normalized);
  normalized = joinSplitDates(normalized);
  normalized = repairNestedInternalLinks(normalized);
  normalized = fixHybridHeadings(normalized);
  normalized = fixBrokenHeaders(normalized);
  normalized = fixMissingNewlineAfterHeader(normalized);
  normalized = fixInlineHeadingMarkers(normalized);
  normalized = fixMissingNewlines(normalized);
  normalized = fixDanglingNumericParagraphs(normalized);
  normalized = splitInlineHorizontalRules(normalized);

  return normalizeWhitespace(normalized);
}

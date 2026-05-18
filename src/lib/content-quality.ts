export interface ArticleQualityInput {
  type?: string;
  slug?: string;
  title?: string;
  content?: string;
}

export interface ArticleQualityThresholds {
  minFailWords: number;
  minWarnWords: number;
  minDataPoints: number;
}

export interface ArticleQualityResult {
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
    repeatedParagraphCount: number;
    hasMalformedTable: boolean;
    hasContinuationLink: boolean;
    hasEarlySummaryTable: boolean;
    faqQuestionCount: number;
    hasStandardDisclaimer: boolean;
  };
}

export interface ArticleQualitySnapshot extends ArticleQualityResult {
  checkedAt: string;
}

export const PROHIBITED_FINANCIAL_PHRASES = [
  "you should buy",
  "you should invest",
  "guaranteed returns",
  "guaranteed gains",
  "guaranteed profit",
  "moonshot",
  "to the moon",
  "100x",
  "10x",
  "1000x",
  "will definitely",
  "sure thing",
  "cannot lose",
  "can't lose",
  "risk-free investment",
  "act now before",
  "buy now",
  "buy now before",
  "invest now",
  "don't miss out",
  "once in a lifetime",
  "i recommend buying",
  "we recommend buying",
  "this is financial advice",
];

const STANDARD_DISCLAIMER =
  "---\n*Disclaimer: This article is for informational purposes only and does not constitute financial advice. Always do your own research (DYOR).*";
const STANDARD_DISCLAIMER_PATTERN =
  /---\s*\n\s*\*Disclaimer: This article is for informational purposes only and does not constitute financial advice\. Always do your own research \(DYOR\)\.\*/g;
const PROHIBITED_PROMOTIONAL_PHRASES = [
  "take the red pill",
  "we're here to make you",
  "forget what you know",
  "unmatched scalable tech",
  "transcend the traditional limitations",
  "financial freedom for everyone",
];
const LIVE_MARKET_PLACEHOLDER_PATTERN = /\{\{LIVE_[A-Z0-9_]+\}\}/;
const HARD_CODED_AS_OF_DATE_PATTERN =
  /\bAs of\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}/i;
const UNSUPPORTED_HEADING_PATTERN = /^#{3,}\s+/m;
const INTERNAL_CONTINUATION_LINK_PATTERN = /\]\(\/(?:learn|[a-z0-9-]+)(?:\/[a-z0-9-]+)?\)/i;

function findRepeatedParagraphs(content: string): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();

  for (const paragraph of content.split(/\n{2,}/)) {
    const normalized = paragraph.replace(/\s+/g, " ").trim().toLowerCase();
    const wordCount = normalized.split(/\s+/).filter(Boolean).length;
    if (wordCount < 14 || normalized.startsWith("|")) continue;
    if (seen.has(normalized)) repeated.add(normalized.slice(0, 120));
    seen.add(normalized);
  }

  return Array.from(repeated);
}

function hasMalformedMarkdownTable(content: string): boolean {
  const lines = content.split(/\n/);
  return lines.some((line, index) => {
    const trimmed = line.trim();
    const nextLines = lines.slice(index + 1, index + 8).map((candidate) => candidate.trim());
    return (
      trimmed.startsWith("|") &&
      trimmed.endsWith("|") &&
      nextLines.includes("|") &&
      nextLines.some((candidate) => /^-+$/.test(candidate))
    );
  });
}

function hasMarkdownTable(lines: string[]): boolean {
  return lines.some((line, index) => {
    const current = line.trim();
    const next = lines[index + 1]?.trim() || "";
    return (
      current.startsWith("|") &&
      current.endsWith("|") &&
      next.startsWith("|") &&
      /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(next)
    );
  });
}

function hasEarlySummaryTable(content: string): boolean {
  const beforeFirstHeading = content.split(/\n##\s+/)[0] || "";
  if (hasMarkdownTable(beforeFirstHeading.split(/\n/))) return true;

  return hasMarkdownTable(content.split(/\n/).slice(0, 18));
}

function hasWeakOpeningSummary(content: string): boolean {
  const firstParagraph = content
    .split(/\n{2,}/)
    .find((paragraph) => paragraph.trim() && !paragraph.trim().startsWith("|"));
  if (!firstParagraph) return true;

  const words = firstParagraph.split(/\s+/).filter(Boolean);
  return words.length < 35 || !/[.$%]|\b(?:risk|market|price|volume|supply|launch|custody)\b/i.test(firstParagraph);
}

function hasExcessiveGenericFiller(words: string[]): boolean {
  if (words.length < 100) return false;
  const counts = new Map<string, number>();
  for (const word of words) {
    const normalized = word.toLowerCase().replace(/[^a-z]/g, "");
    if (normalized.length < 5) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return Array.from(counts.entries()).some(([, count]) => count / words.length > 0.18);
}

function getFaqQuestionCount(content: string): number {
  const faqMatch = content.match(/(?:^|\n)##\s+FAQ\b([\s\S]*?)(?=\n---\s*\n\s*\*Disclaimer:|$)/i);
  if (!faqMatch) return 0;

  const faqBody = faqMatch[1];
  const questionMatches = faqBody.match(/\*\*[^*\n?]+\?\*\*|^#{2,6}\s+.+\?|^\s*(?:Q\d*[:.)]|Question\s+\d+[:.)]).+\?/gim);
  if (questionMatches?.length) return questionMatches.length;

  return (faqBody.match(/\?/g) || []).length;
}

function removeStandardDisclaimer(content: string): string {
  return content.replace(STANDARD_DISCLAIMER_PATTERN, "");
}

export function getArticleQualityThresholds(articleType?: string): ArticleQualityThresholds {
  const normalizedType = articleType || "";
  if (normalizedType === "how-to-buy") {
    return {
      minFailWords: 700,
      minWarnWords: 850,
      minDataPoints: 3,
    };
  }

  if (normalizedType === "tge-preview") {
    return {
      minFailWords: 500,
      minWarnWords: 700,
      minDataPoints: 3,
    };
  }

  return {
    minFailWords: 800,
    minWarnWords: 1000,
    minDataPoints: 3,
  };
}

export function evaluateArticleQuality(article: ArticleQualityInput): ArticleQualityResult {
  const content = article.content || "";
  const contentLower = content.toLowerCase();
  const articleType = article.type || article.slug || "";
  const thresholds = getArticleQualityThresholds(articleType);
  const issues: string[] = [];
  const warnings: string[] = [];
  const repeatedParagraphs = findRepeatedParagraphs(content);
  const malformedTable = hasMalformedMarkdownTable(content);
  const hasContinuationLink = INTERNAL_CONTINUATION_LINK_PATTERN.test(content);
  const earlySummaryTable = hasEarlySummaryTable(content);
  const faqQuestionCount = getFaqQuestionCount(content);
  const hasStandardDisclaimer = content.trim().endsWith(STANDARD_DISCLAIMER);

  const words = content.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  if (wordCount < thresholds.minFailWords) {
    issues.push(`Word count too low: ${wordCount} (min ${thresholds.minFailWords})`);
  } else if (wordCount < thresholds.minWarnWords) {
    warnings.push(`Word count borderline: ${wordCount} (target ${thresholds.minWarnWords}+)`);
  }
  if (wordCount > 2500) {
    warnings.push(`Word count high: ${wordCount} (target max 2,000)`);
  }

  if (repeatedParagraphs.length > 0) {
    issues.push(`Repeated filler paragraphs found: ${repeatedParagraphs.length}`);
  }

  if (malformedTable) {
    issues.push("Malformed Markdown table block found");
  }

  if (!earlySummaryTable) {
    issues.push("Missing early summary table");
  }

  const hasFaq =
    contentLower.includes("## faq") ||
    contentLower.includes("### faq") ||
    contentLower.includes("frequently asked");
  if (!hasFaq) issues.push("Missing FAQ section");
  else if (faqQuestionCount < 3) issues.push(`FAQ section has too few questions: ${faqQuestionCount} (min 3)`);
  else if (faqQuestionCount > 5) issues.push(`FAQ section has too many questions: ${faqQuestionCount} (max 5)`);

  const hasDisclaimer =
    contentLower.includes("not constitute financial advice") ||
    contentLower.includes("informational purposes only") ||
    contentLower.includes("does not constitute financial advice") ||
    contentLower.includes("disclaimer");
  if (!hasDisclaimer) issues.push("Missing disclaimer");

  const dataPoints =
    content.match(/\$[\d,.]+|\d+(\.\d+)?%|\b\d{1,3}\/100\b|#\d+|\d{1,3}(,\d{3})+|\b20\d{2}-\d{2}-\d{2}\b/g) ||
    [];
  const dataPointCount = dataPoints.length;
  if (dataPointCount < thresholds.minDataPoints) {
    issues.push(`Too few data points: ${dataPointCount} (min ${thresholds.minDataPoints})`);
  }

  const contentWithoutStandardDisclaimer = removeStandardDisclaimer(content).toLowerCase();
  const prohibitedPhrases = [
    ...PROHIBITED_FINANCIAL_PHRASES.filter((phrase) =>
      contentLower.includes(phrase),
    ),
    ...PROHIBITED_PROMOTIONAL_PHRASES.filter((phrase) => contentLower.includes(phrase)),
  ];
  if (contentWithoutStandardDisclaimer.includes("financial advice")) {
    prohibitedPhrases.push("financial advice outside disclaimer");
  }
  const uniqueProhibitedPhrases = Array.from(new Set(prohibitedPhrases));
  if (uniqueProhibitedPhrases.length > 0) {
    issues.push(`Prohibited phrases found: "${uniqueProhibitedPhrases.join('", "')}"`);
  }

  const sentences = content.split(/[.!?]+/).filter((sentence) => sentence.trim().length > 10);
  const avgSentenceLength =
    sentences.length > 0
      ? Math.round(
          sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).filter(Boolean).length, 0) /
            sentences.length,
        )
      : 0;

  if (avgSentenceLength > 35) {
    warnings.push(`Average sentence length high: ${avgSentenceLength} words (target <30)`);
  }

  if (UNSUPPORTED_HEADING_PATTERN.test(content)) {
    warnings.push("Unsupported heading depth found: use ## section headings only");
  }

  if (hasWeakOpeningSummary(content)) {
    warnings.push("Opening summary is too thin or does not expose useful market context early");
  }

  if (!hasContinuationLink && articleType !== "tge-preview") {
    warnings.push("No internal continuation link found in article content");
  }

  if (hasExcessiveGenericFiller(words)) {
    warnings.push("Generic filler term repetition is high");
  }

  if (LIVE_MARKET_PLACEHOLDER_PATTERN.test(content)) {
    warnings.push("Live market placeholders remain in article content");
  }

  if (articleType !== "tge-preview" && HARD_CODED_AS_OF_DATE_PATTERN.test(content)) {
    warnings.push("Hardcoded live-date phrasing found; use live market date placeholders instead");
  }

  if (hasDisclaimer && !contentLower.includes("always do your own research")) {
    warnings.push("Disclaimer is present but does not include the standard research reminder");
  }

  if (hasDisclaimer && !hasStandardDisclaimer) {
    warnings.push("Disclaimer does not match the exact standard wording");
  }

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    stats: {
      wordCount,
      hasFaq,
      hasDisclaimer,
      dataPointCount,
      prohibitedPhrases: uniqueProhibitedPhrases,
      avgSentenceLength,
      repeatedParagraphCount: repeatedParagraphs.length,
      hasMalformedTable: malformedTable,
      hasContinuationLink,
      hasEarlySummaryTable: earlySummaryTable,
      faqQuestionCount,
      hasStandardDisclaimer,
    },
  };
}

export function buildArticleQualitySnapshot(article: ArticleQualityInput): ArticleQualitySnapshot {
  return {
    ...evaluateArticleQuality(article),
    checkedAt: new Date().toISOString(),
  };
}

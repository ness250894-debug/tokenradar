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
  "1000x",
  "will definitely",
  "sure thing",
  "can't lose",
  "risk-free investment",
  "act now before",
  "buy now before",
  "don't miss out",
  "once in a lifetime",
  "i recommend buying",
  "we recommend buying",
  "this is financial advice",
];

export function getArticleQualityThresholds(articleType?: string): ArticleQualityThresholds {
  const normalizedType = articleType || "";
  const isShortForm = normalizedType === "how-to-buy" || normalizedType === "tge-preview";

  return {
    minFailWords: isShortForm ? 500 : 800,
    minWarnWords: isShortForm ? 600 : 1000,
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

  const hasFaq =
    contentLower.includes("## faq") ||
    contentLower.includes("### faq") ||
    contentLower.includes("frequently asked");
  if (!hasFaq) issues.push("Missing FAQ section");

  const hasDisclaimer =
    contentLower.includes("not constitute financial advice") ||
    contentLower.includes("informational purposes only") ||
    contentLower.includes("does not constitute financial advice") ||
    contentLower.includes("disclaimer");
  if (!hasDisclaimer) issues.push("Missing disclaimer");

  const dataPoints = content.match(/\$[\d,.]+|\d+(\.\d+)?%|\d{1,3}(,\d{3})+/g) || [];
  const dataPointCount = dataPoints.length;
  if (dataPointCount < thresholds.minDataPoints) {
    issues.push(`Too few data points: ${dataPointCount} (min ${thresholds.minDataPoints})`);
  }

  const prohibitedPhrases = PROHIBITED_FINANCIAL_PHRASES.filter((phrase) =>
    contentLower.includes(phrase),
  );
  if (prohibitedPhrases.length > 0) {
    issues.push(`Prohibited phrases found: "${prohibitedPhrases.join('", "')}"`);
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

  return {
    passed: issues.length === 0,
    issues,
    warnings,
    stats: {
      wordCount,
      hasFaq,
      hasDisclaimer,
      dataPointCount,
      prohibitedPhrases,
      avgSentenceLength,
    },
  };
}

export function buildArticleQualitySnapshot(article: ArticleQualityInput): ArticleQualitySnapshot {
  return {
    ...evaluateArticleQuality(article),
    checkedAt: new Date().toISOString(),
  };
}

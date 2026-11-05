import { formatCompact, formatPercent } from "./formatters";

export const READER_LESSONS = {
  turnover: "Turnover compares reported volume with market cap.",
  liquidity: "Checking liquidity also needs spreads and depth.",
  market_cap: "Market cap combines price with circulating supply.",
  price_change: "A daily percentage uses the earlier price as its baseline.",
  rank: "Rank orders assets by market cap; it does not measure liquidity.",
} as const;

export type ReaderLessonKey = "turnover" | "market_cap" | "price_change" | "rank";

export interface ReaderMarketFacts {
  priceChange24h?: number;
  marketCap?: number;
  marketCapRank?: number;
  volume24h?: number;
}

export function reportedTurnoverPercent(facts: ReaderMarketFacts): number | undefined {
  if (!Number.isFinite(facts.marketCap) || !Number.isFinite(facts.volume24h)
    || facts.marketCap! <= 0 || facts.volume24h! < 0) return undefined;
  const ratio = facts.volume24h! / facts.marketCap! * 100;
  return Number.isFinite(ratio) ? ratio : undefined;
}

export function selectReaderLesson(facts: ReaderMarketFacts, seed = ""): ReaderLessonKey | undefined {
  const available: ReaderLessonKey[] = [];
  if (reportedTurnoverPercent(facts) !== undefined) available.push("turnover");
  if (Number.isFinite(facts.marketCap) && facts.marketCap! > 0) available.push("market_cap");
  if (Number.isFinite(facts.priceChange24h)) available.push("price_change");
  if (Number.isInteger(facts.marketCapRank) && facts.marketCapRank! > 0) available.push("rank");
  if (!available.length) return undefined;
  const hash = Array.from(seed).reduce((value, char) => (Math.imul(value, 31) + char.charCodeAt(0)) >>> 0, 0);
  return available[hash % available.length];
}

/** Complete observation + explanation, with optional discussion. Never cut an attribution or sentence. */
export function buildReaderMarketNote(options: {
  symbol: string;
  facts: ReaderMarketFacts;
  platform: "x" | "threads" | "telegram";
  maxChars: number;
  attribution?: string;
  seed?: string;
}): { text: string; lessonKey: ReaderLessonKey } | undefined {
  const { facts } = options;
  const lessonKey = selectReaderLesson(facts, options.seed);
  if (!lessonKey) return undefined;
  const symbol = `$${options.symbol.toUpperCase().replace(/^\$+/, "")}`;
  const turnover = reportedTurnoverPercent(facts);
  const observations: Record<ReaderLessonKey, string> = {
    turnover: `${symbol} reported 24h turnover: ${turnover?.toFixed(1)}%.`,
    market_cap: `${symbol} market cap: ${formatCompact(facts.marketCap || 0)}.`,
    price_change: `${symbol}: ${formatPercent(facts.priceChange24h || 0)} over 24h.`,
    rank: `${symbol} market-cap rank: #${facts.marketCapRank}.`,
  };
  const questions: Record<ReaderLessonKey, string> = {
    turnover: "Which matters more to you: spread or depth?",
    market_cap: "Which do you check first: supply or diluted value?",
    price_change: "Which baseline helps more: the earlier price or a longer history?",
    rank: "Which matters for your research: market size or trading depth?",
  };
  const explanation = READER_LESSONS[lessonKey];
  const base = [observations[lessonKey], explanation];
  const extra = lessonKey === "turnover" ? READER_LESSONS.liquidity : undefined;
  const suffix = options.attribution ? `\n${options.attribution}` : "";
  const candidates = options.platform === "x"
    ? [[...base, extra], base]
    : [[...base, extra, questions[lessonKey]], [...base, questions[lessonKey]], base];
  for (const candidate of candidates) {
    const text = `${candidate.filter(Boolean).join(" ")}${suffix}`;
    if (text.length <= options.maxChars) return { text, lessonKey };
  }
  return undefined;
}

export function hasReaderExplanation(text: string): boolean {
  return /\b(?:means?|measures?|compares?|combines?|baseline|orders assets|divided by)\b/i.test(text)
    || /\b(?:check|checking|needs?|missing|requires?)\b[^.!?\n]{0,80}\b(?:spreads?|depth|circulating supply|time windows?)\b/i.test(text);
}

export function identifyReaderLesson(text: string): ReaderLessonKey | undefined {
  if (/\bturnover\b|\bvolume\s*(?:\/|divided by)\s*market cap\b/i.test(text)) return "turnover";
  if (/\brank\b[^.!?\n]{0,80}\b(?:orders|sorts|measures)\b/i.test(text)) return "rank";
  if (/\bcirculating supply\b/i.test(text)) return "market_cap";
  if (/\bearlier price\b|\bprice\b[^.!?\n]{0,60}\bbaseline\b/i.test(text)) return "price_change";
  return undefined;
}

import type { ResearchFollowUp } from "./social-follow-up";

export interface WeeklyRecapToken {
  id: string;
  symbol: string;
  name: string;
  marketDataSource?: "coingecko-live" | "local-cache";
  market: {
    price?: number | null;
    priceChange7d?: number | null;
    priceChange24h?: number | null;
    marketCap?: number | null;
    marketCapRank?: number | null;
    volume24h?: number | null;
  };
}

export interface WeeklyRecapSelection {
  leaders: WeeklyRecapToken[];
  pullback?: WeeklyRecapToken;
  volumeLeader?: WeeklyRecapToken;
}

export interface WeeklyThreadsRecap {
  caption: string;
  topicTag: string;
  tokenIds: string[];
  leaders: WeeklyRecapToken[];
  pullback?: WeeklyRecapToken;
  volumeLeader?: WeeklyRecapToken;
}

export interface TelegramWeeklyRecapImageData {
  followUps?: ResearchFollowUp[];
  title: string;
  subtitle: string;
  generatedAtLabel: string;
  leaders: Array<{
    symbol: string;
    name: string;
    change7d: number;
  }>;
  pullback?: {
    symbol: string;
    name: string;
    change7d: number;
  };
  volumeLeader?: {
    symbol: string;
    name: string;
    volume24h: number;
  };
}

export interface TelegramWeeklyRecap {
  captionBody: string;
  image: TelegramWeeklyRecapImageData;
  tokenIds: string[];
  leaders: WeeklyRecapToken[];
  pullback?: WeeklyRecapToken;
  volumeLeader?: WeeklyRecapToken;
}

const MIN_WEEKLY_RECAP_VOLUME_24H = 50_000;
const MAX_WEEKLY_RECAP_ABS_CHANGE_7D = 250;
const MAX_LEADERS = 3;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function weeklyChange(token: WeeklyRecapToken): number {
  return isFiniteNumber(token.market.priceChange7d) ? token.market.priceChange7d : 0;
}

function volume24h(token: WeeklyRecapToken): number {
  return isFiniteNumber(token.market.volume24h) ? token.market.volume24h : 0;
}

function isEligible(token: WeeklyRecapToken): boolean {
  if (token.marketDataSource === "local-cache") return false;
  if (!isFiniteNumber(token.market.priceChange7d)) return false;
  if (Math.abs(token.market.priceChange7d) > MAX_WEEKLY_RECAP_ABS_CHANGE_7D) return false;

  return isFiniteNumber(token.market.priceChange7d) &&
    isFiniteNumber(token.market.marketCap) &&
    token.market.marketCap > 0 &&
    volume24h(token) >= MIN_WEEKLY_RECAP_VOLUME_24H;
}

function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatTokenMove(token: WeeklyRecapToken): string {
  return `$${token.symbol.toUpperCase()} ${formatSignedPercent(weeklyChange(token))}`;
}

function formatCompactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function formatUtcDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function uniqueTokens(tokens: Array<WeeklyRecapToken | undefined>): WeeklyRecapToken[] {
  const seen = new Set<string>();
  return tokens.filter((token): token is WeeklyRecapToken => {
    if (!token || seen.has(token.id)) return false;
    seen.add(token.id);
    return true;
  });
}

export function selectWeeklyRecapTokens(tokens: WeeklyRecapToken[]): WeeklyRecapSelection {
  const eligible = tokens.filter(isEligible);
  const leaders = eligible
    .sort((a, b) => weeklyChange(b) - weeklyChange(a))
    .slice(0, MAX_LEADERS);

  const leaderIds = new Set(leaders.map((token) => token.id));
  const pullback = eligible
    .filter((token) => weeklyChange(token) < 0 && !leaderIds.has(token.id))
    .sort((a, b) => weeklyChange(a) - weeklyChange(b))[0];

  const volumeLeader = eligible
    .sort((a, b) => volume24h(b) - volume24h(a))[0];

  return { leaders, pullback, volumeLeader };
}

export function buildWeeklyThreadsRecap(selection: WeeklyRecapSelection): WeeklyThreadsRecap {
  if (selection.leaders.length === 0) {
    throw new Error("Cannot build Threads weekly recap without at least one weekly leader.");
  }

  const leaderLine = `Tracked 7d changes: ${selection.leaders.map(formatTokenMove).join(", ")}.`;
  const lines = [
    "Weekly research lesson: match the time windows.",
    leaderLine,
    selection.pullback ? `Pullback watch: ${formatTokenMove(selection.pullback)}.` : "",
    "A 7d return and a 24h volume reading cover different periods.",
    "Which should we unpack next: time windows or turnover?",
  ].filter(Boolean);
  let caption = lines.join("\n");
  // Reserve room for the full source timestamp appended by the publisher.
  if (caption.length > 420) caption = lines.filter((line) => !line.startsWith("Pullback watch:")).join("\n");
  if (caption.length > 420) throw new Error("Weekly lesson exceeds the source-preserving text budget.");

  const recapTokens = uniqueTokens([
    ...selection.leaders,
    selection.pullback,
    selection.volumeLeader,
  ]);

  return {
    caption,
    topicTag: "Crypto",
    tokenIds: recapTokens.map((token) => token.id),
    leaders: selection.leaders,
    pullback: selection.pullback,
    volumeLeader: selection.volumeLeader,
  };
}

export function buildTelegramWeeklyRecap(
  selection: WeeklyRecapSelection,
  generatedAt: Date = new Date(),
): TelegramWeeklyRecap {
  if (selection.leaders.length === 0) {
    throw new Error("Cannot build Telegram weekly recap without at least one weekly leader.");
  }

  const leaderLine = `Tracked 7d changes: ${selection.leaders.map(formatTokenMove).join(", ")}.`;
  const pullbackLine = selection.pullback
    ? `Pullback watch: <b>${formatTokenMove(selection.pullback)}</b>.`
    : "";
  const volumeLine = selection.volumeLeader
    ? `Reported-volume context: <b>$${selection.volumeLeader.symbol.toUpperCase()}</b> led tracked 24h volume at ${formatCompactNumber(volume24h(selection.volumeLeader))}.`
    : "";

  const captionBody = [
    "<b>Weekly Radar Recap</b>",
    leaderLine,
    pullbackLine,
    volumeLine,
    "Lesson: the return covers 7d; the reported volume covers 24h. Compare each metric over matching windows.",
    "Which should we explain next: time windows or trading turnover?",
  ].filter(Boolean).join("\n");

  const recapTokens = uniqueTokens([
    ...selection.leaders,
    selection.pullback,
    selection.volumeLeader,
  ]);

  return {
    captionBody,
    image: {
      title: "Weekly Radar Recap",
      subtitle: "Match each measurement to its time window",
      generatedAtLabel: formatUtcDate(generatedAt),
      leaders: selection.leaders.map((token) => ({
        symbol: token.symbol.toUpperCase(),
        name: token.name,
        change7d: weeklyChange(token),
      })),
      pullback: selection.pullback
        ? {
            symbol: selection.pullback.symbol.toUpperCase(),
            name: selection.pullback.name,
            change7d: weeklyChange(selection.pullback),
          }
        : undefined,
      volumeLeader: selection.volumeLeader
        ? {
            symbol: selection.volumeLeader.symbol.toUpperCase(),
            name: selection.volumeLeader.name,
            volume24h: volume24h(selection.volumeLeader),
          }
        : undefined,
    },
    tokenIds: recapTokens.map((token) => token.id),
    leaders: selection.leaders,
    pullback: selection.pullback,
    volumeLeader: selection.volumeLeader,
  };
}

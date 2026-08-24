export interface VideoEvidenceInput {
  tokenName: string;
  symbol: string;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  riskScore?: number;
  marketDataSource?: string;
  marketDataAsOf?: string;
}

export interface VideoEvidenceSummary {
  tokenLabel: string;
  moveLabel?: string;
  volumeLabel?: string;
  turnoverLabel?: string;
  riskLabel?: string;
  sourceLabel?: string;
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatVideoCompactCurrency(value: number | undefined): string | undefined {
  if (!finite(value) || value < 0) return undefined;
  if (value >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export function formatVideoMarketSource(source: string | undefined): string | undefined {
  const clean = source?.trim();
  if (!clean) return undefined;
  if (/coin\s*gecko/i.test(clean)) return "CoinGecko";
  return clean.length > 32 ? clean.slice(0, 32).trim() : clean;
}

export function formatVideoAsOf(asOf: string | undefined): string | undefined {
  if (!asOf) return undefined;
  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) return undefined;
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = parsed.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const year = parsed.getUTCFullYear();
  const hours = String(parsed.getUTCHours()).padStart(2, "0");
  const minutes = String(parsed.getUTCMinutes()).padStart(2, "0");
  return `${day} ${month} ${year} ${hours}:${minutes} UTC`;
}

export function buildVideoEvidenceSummary(input: VideoEvidenceInput): VideoEvidenceSummary {
  const symbol = input.symbol.replace(/[^a-z0-9._+-]/gi, "").toUpperCase();
  const moveLabel = finite(input.priceChange24h)
    ? `${input.priceChange24h >= 0 ? "+" : ""}${input.priceChange24h.toFixed(1)}% / 24H`
    : undefined;
  const turnover = finite(input.volume24h) && finite(input.marketCap) && input.marketCap > 0
    ? (input.volume24h / input.marketCap) * 100
    : undefined;
  const source = formatVideoMarketSource(input.marketDataSource);
  const asOf = formatVideoAsOf(input.marketDataAsOf);

  return {
    tokenLabel: symbol || input.tokenName.trim() || "TOKEN",
    moveLabel,
    volumeLabel: formatVideoCompactCurrency(input.volume24h),
    turnoverLabel: finite(turnover) ? `${turnover.toFixed(1)}% VOL/CAP` : undefined,
    riskLabel: finite(input.riskScore) ? `${input.riskScore.toFixed(1)}/10 RISK` : undefined,
    sourceLabel: source && asOf
      ? `Source: ${source} · ${asOf}`
      : source
        ? `Source: ${source}`
        : asOf
          ? `Data as of ${asOf}`
          : undefined,
  };
}

export function buildEvidenceLedVideoHook(input: VideoEvidenceInput): string {
  const evidence = buildVideoEvidenceSummary(input);
  const move = evidence.moveLabel?.replace(" / 24H", "") || "MOVE";
  const hook = `${evidence.tokenLabel} ${move}: WHAT'S THE CATCH?`;
  return hook.length <= 40 ? hook : `${evidence.tokenLabel} MOVE: WHAT'S THE CATCH?`.slice(0, 40).trim();
}

export function buildEvidenceLedVoiceover(
  input: VideoEvidenceInput,
  platform: "youtube" | "tiktok" | "standard" = "standard",
): string {
  const evidence = buildVideoEvidenceSummary(input);
  const clauses: string[] = [];
  const token = evidence.tokenLabel;

  if (evidence.moveLabel) {
    clauses.push(`${token} moved ${evidence.moveLabel.replace(" / 24H", "")} over 24 hours.`);
  } else {
    clauses.push(`${token} is the point-in-time market read.`);
  }

  if (evidence.turnoverLabel) {
    clauses.push(`Reported volume was ${evidence.turnoverLabel.replace(" VOL/CAP", " of market cap")}.`);
  } else if (evidence.volumeLabel) {
    clauses.push(`Reported 24-hour volume was ${evidence.volumeLabel}.`);
  }

  if (evidence.riskLabel) {
    clauses.push(`TokenRadar's supplied risk score is ${evidence.riskLabel.replace(" RISK", "")}.`);
  }

  clauses.push(platform === "tiktok"
    ? "Which matters more here: turnover or risk?"
    : "This is a snapshot, not a forecast. Which field should we break down next?");

  return clauses.join(" ");
}

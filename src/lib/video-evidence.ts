export type VideoDataTensionKind =
  | "turnover_spike"
  | "move_vs_risk"
  | "fdv_overhang"
  | "ath_drawdown_bounce"
  | "rank_outlier"
  | "snapshot_check";

export interface VideoEvidenceInput {
  tokenName: string;
  symbol: string;
  price?: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCap?: number;
  marketCapRank?: number;
  riskScore?: number;
  growthPotentialIndex?: number;
  fdv?: number;
  athChangePercentage?: number;
  formatKey?: string;
  /**
   * Enable derived-ratio clauses (vol/cap %, float/FDV %, peak drawdown %) in
   * narrative text when the caller attaches `suppliedContextLines` to
   * `SocialContentFacts.suppliedContext`.
   */
  allowDerivedContext?: boolean;
  marketDataSource?: string;
  marketDataAsOf?: string;
}

export interface VideoEvidenceSummary {
  tokenLabel: string;
  moveLabel?: string;
  volumeLabel?: string;
  marketCapLabel?: string;
  fdvLabel?: string;
  turnoverLabel?: string;
  riskLabel?: string;
  sourceLabel?: string;
}

export interface VideoDataTension {
  kind: VideoDataTensionKind;
  score: number;
  hookText: string;
  thesis: string;
  bullets: [string, string];
  takeaway: string;
  verdictKicker: string;
  verdictLabel: string;
  verdictSubLabel: string;
  suppliedContextLines: string[];
}

function finite(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatGroundedPercent(value: number): string {
  const tolerance = Math.max(Math.abs(value) * 0.01, 0.000001);

  for (let decimals = 1; decimals <= 6; decimals += 1) {
    const rendered = value.toFixed(decimals);
    if (Math.abs(Number(rendered) - value) <= tolerance) return rendered;
  }

  return value.toFixed(6);
}

/**
 * Format bounded scores (`riskScore` /10, `growthPotentialIndex` /100) without
 * losing numeric equality against `SocialContentFacts`.
 */
function formatExactScore(value: number, preferOneDecimal = true): string {
  if (preferOneDecimal) {
    const oneDecimal = value.toFixed(1);
    if (Number(oneDecimal) === value) return oneDecimal;
  }
  return String(value);
}

function formatGroundedCurrencyUnit(
  value: number,
  divisor: number,
  suffix: string,
  minimumDecimals: number,
): string {
  const tolerance = Math.max(Math.abs(value) * 0.01, 0.000001);
  const scaled = value / divisor;

  for (let decimals = minimumDecimals; decimals <= 6; decimals += 1) {
    const rendered = scaled.toFixed(decimals);
    if (Math.abs(Number(rendered) * divisor - value) <= tolerance) {
      return `$${rendered}${suffix}`;
    }
  }

  return `$${scaled.toFixed(6)}${suffix}`;
}

/**
 * Format non-negative USD figures into compact `$K/$M/$B/$T` notation while
 * preserving the 1% numeric validation tolerance.
 */
export function formatVideoCompactCurrency(value: number | undefined): string | undefined {
  if (!finite(value) || value < 0) return undefined;
  if (value >= 1_000_000_000_000) return formatGroundedCurrencyUnit(value, 1_000_000_000_000, "T", 2);
  if (value >= 1_000_000_000) return formatGroundedCurrencyUnit(value, 1_000_000_000, "B", 2);
  if (value >= 1_000_000) return formatGroundedCurrencyUnit(value, 1_000_000, "M", 1);
  if (value >= 1_000) return formatGroundedCurrencyUnit(value, 1_000, "K", 1);
  return formatGroundedCurrencyUnit(value, 1, "", 0);
}

/** Normalize raw market-data provider identifiers for display badges. */
export function formatVideoMarketSource(source: string | undefined): string | undefined {
  const clean = source?.trim();
  if (!clean) return undefined;
  if (/coin\s*gecko/i.test(clean)) return "CoinGecko";
  return clean.length > 32 ? clean.slice(0, 32).trim() : clean;
}

/** Format an ISO timestamp as a deterministic UTC display label. */
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

/** Build formatted display labels from raw token and metric inputs. */
export function buildVideoEvidenceSummary(input: VideoEvidenceInput): VideoEvidenceSummary {
  const cleanSymbol = input.symbol.trim().replace(/^\$+/, "").replace(/[^a-z0-9._+-]/gi, "").toUpperCase();
  const moveLabel = finite(input.priceChange24h)
    ? `${input.priceChange24h >= 0 ? "+" : ""}${formatGroundedPercent(input.priceChange24h)}% / 24H`
    : undefined;
  const turnover = finite(input.volume24h) && finite(input.marketCap) && input.marketCap > 0
    ? (input.volume24h / input.marketCap) * 100
    : undefined;
  const source = formatVideoMarketSource(input.marketDataSource);
  const asOf = formatVideoAsOf(input.marketDataAsOf);

  return {
    tokenLabel: cleanSymbol || input.tokenName.trim() || "TOKEN",
    moveLabel,
    volumeLabel: formatVideoCompactCurrency(input.volume24h),
    marketCapLabel: formatVideoCompactCurrency(input.marketCap),
    fdvLabel: formatVideoCompactCurrency(input.fdv),
    turnoverLabel: finite(turnover) ? `${turnover.toFixed(1)}% VOL/CAP` : undefined,
    riskLabel: finite(input.riskScore) ? `${formatExactScore(input.riskScore)}/10 RISK` : undefined,
    sourceLabel: source && asOf
      ? `Source: ${source} · ${asOf}`
      : source
        ? `Source: ${source}`
        : asOf
          ? `Data as of ${asOf}`
          : undefined,
  };
}

function fitHookLength(primary: string, fallback: string): string {
  if (primary.length <= 40) return primary;
  if (fallback.length <= 40) return fallback;
  return fallback.slice(0, 40).trim();
}

function appendSemicolonClause(clauses: string[], suffixClause: string): void {
  if (clauses.length === 0) {
    clauses.push(`${suffixClause.charAt(0).toUpperCase()}${suffixClause.slice(1)}.`);
    return;
  }
  const previous = clauses[clauses.length - 1].replace(/[.!?]+$/, "");
  clauses[clauses.length - 1] = `${previous}; ${suffixClause}.`;
}

const MACRO_ANCHOR_RE = /\b(?:global|total|dominance|sector|category)\b/i;
const PRICE_SUBJECT_RE = /\b(?:price|24h\s+(?:move|change)|token\s+(?:move|change))\b/i;

function normalizeIdentity(value: string): string {
  return value.toLowerCase().replace(/,/g, "").replace(/\s+/g, " ").trim();
}

function escapeIdentityRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Return whether a derived-ratio lead-in phrase (for example "reported volume
 * was") can be emitted without the content validator binding the ratio to the
 * token's own 24h move. Short names/tickers such as `RE` or `SHARE` collide
 * with ordinary words, so those clauses are skipped rather than mis-validated.
 */
function canAttachDerivedClause(input: VideoEvidenceInput, tokenLabel: string, leadIn: string): boolean {
  if (!input.allowDerivedContext) return false;
  const name = normalizeIdentity(input.tokenName);
  const symbol = normalizeIdentity(input.symbol.replace(/^\$+/, ""));
  const phrase = normalizeIdentity(leadIn);
  if (PRICE_SUBJECT_RE.test(name) || PRICE_SUBJECT_RE.test(tokenLabel)) return false;
  if (name && phrase.includes(name)) return false;
  if (symbol && (phrase.includes(`$${symbol}`) || new RegExp(`\\b${escapeIdentityRegExp(symbol)}\\b`).test(phrase))) {
    return false;
  }
  return true;
}

/**
 * Choose the spoken/written subject for narrative copy. Names containing
 * macro anchors (for example "Global Dollar") would make the validator treat
 * token figures as global-market statistics, so the ticker is used instead.
 */
function resolveNarrativeSubject(tokenName: string, tokenLabel: string): string {
  const cleanName = tokenName.trim() || tokenLabel;
  return MACRO_ANCHOR_RE.test(cleanName) && !MACRO_ANCHOR_RE.test(tokenLabel) ? tokenLabel : cleanName;
}

/**
 * Deterministically score factual contradictions in a token's market snapshot
 * and return structured hook, thesis, scene bullets, scorecard verdict, and
 * validator-ready `suppliedContextLines` at `$0` AI cost.
 */
export function selectVideoDataTension(input: VideoEvidenceInput): VideoDataTension {
  const evidence = buildVideoEvidenceSummary(input);
  const token = evidence.tokenLabel;
  const cleanName = resolveNarrativeSubject(input.tokenName, token);
  const move = evidence.moveLabel?.replace(" / 24H", "");
  const defaultHookFallback = `${token} MOVE: WHAT'S THE CATCH?`;
  const defaultHook = fitHookLength(
    `${token} ${move || "MOVE"}: WHAT'S THE CATCH?`,
    defaultHookFallback,
  );
  const riskExact = finite(input.riskScore) ? formatExactScore(input.riskScore) : undefined;
  const growthExact = finite(input.growthPotentialIndex)
    ? formatExactScore(input.growthPotentialIndex, false)
    : undefined;
  const turnoverPct = finite(input.volume24h) && finite(input.marketCap) && input.marketCap > 0
    ? (input.volume24h / input.marketCap) * 100
    : undefined;
  const turnoverFixed = finite(turnoverPct) ? turnoverPct.toFixed(1) : undefined;
  const fdvMultiple = finite(input.fdv) && finite(input.marketCap) && input.marketCap > 0
    ? input.fdv / input.marketCap
    : undefined;
  const floatShareFixed = finite(fdvMultiple) && fdvMultiple > 0
    ? ((1 / fdvMultiple) * 100).toFixed(1)
    : undefined;
  const rank = finite(input.marketCapRank) && input.marketCapRank > 0
    ? Math.trunc(input.marketCapRank)
    : undefined;

  const suppliedContextLines: string[] = [];
  if (turnoverFixed) {
    suppliedContextLines.push(`Reported volume was ${turnoverFixed}% of market cap.`);
  }
  if (floatShareFixed) {
    suppliedContextLines.push(`Unlocked cap share is ${floatShareFixed}% of FDV.`);
  }
  if (finite(input.athChangePercentage) && input.athChangePercentage < 0) {
    const athPct = formatGroundedPercent(input.athChangePercentage);
    suppliedContextLines.push(`Peak drawdown stands at ${athPct}%.`);
  }

  const candidates: VideoDataTension[] = [];

  if (finite(turnoverPct) && turnoverPct >= 15 && turnoverFixed) {
    const hookCandidate = move && evidence.volumeLabel
      ? `${token} ${move}: ${evidence.volumeLabel} VOLUME?`
      : move
        ? `${token} ${move}: VOLUME CHECK?`
        : defaultHook;
    const derivedSuffix = canAttachDerivedClause(input, token, "reported volume was")
      ? `; reported volume was ${turnoverFixed}% of market cap`
      : "";
    candidates.push({
      kind: "turnover_spike",
      score: 45 + Math.min(40, turnoverPct),
      hookText: fitHookLength(hookCandidate, defaultHook),
      thesis: move
        ? `${cleanName} moved ${move} over 24h${evidence.volumeLabel ? ` with ${evidence.volumeLabel} in 24h volume` : ""}${derivedSuffix}.`
        : `${cleanName} gets a descriptive TokenRadar snapshot without a forecast.`,
      bullets: [
        `24H TURNOVER: ${turnoverFixed}% OF CAP${evidence.volumeLabel ? ` (${evidence.volumeLabel})` : ""}`,
        `24H MOVE: ${move || "SNAPSHOT"}${riskExact ? ` · RISK ${riskExact}/10` : ""}`,
      ],
      takeaway: "Compare 24h trading volume against market cap before reacting to the headline candle.",
      verdictKicker: "TURNOVER SNAPSHOT",
      verdictLabel: `${turnoverFixed}% VOL / CAP`,
      verdictSubLabel: `${riskExact ? `RISK ${riskExact}/10 · ` : ""}24H DATA`,
      suppliedContextLines,
    });
  }

  if (
    finite(input.priceChange24h) &&
    finite(input.riskScore) &&
    riskExact &&
    move &&
    ((Math.abs(input.priceChange24h) >= 5 && input.riskScore >= 6.5) ||
      (Math.abs(input.priceChange24h) >= 8 && input.riskScore >= 5.5))
  ) {
    const hookCandidate = `${token} ${move}: RISK ${riskExact}/10?`;
    candidates.push({
      kind: "move_vs_risk",
      score: 42 + Math.min(36, Math.abs(input.priceChange24h) * 1.5 + input.riskScore * 2.5),
      hookText: fitHookLength(hookCandidate, defaultHook),
      thesis: `${cleanName} moved ${move} over 24h alongside risk score ${riskExact}/10.`,
      bullets: [
        `24H MOVE: ${move}${evidence.volumeLabel ? ` · ${evidence.volumeLabel} VOL` : ""}`,
        `RISK SCORE: ${riskExact}/10${growthExact ? ` · GROWTH ${growthExact}/100` : ""}`,
      ],
      takeaway: "Pair the 24h move with the supplied TokenRadar risk score before forming a thesis.",
      verdictKicker: "MOVE VS RISK READ",
      verdictLabel: `RISK ${riskExact}/10`,
      verdictSubLabel: `${token} ${move} · SNAPSHOT ONLY`,
      suppliedContextLines,
    });
  }

  if (finite(fdvMultiple) && fdvMultiple >= 2.0 && floatShareFixed) {
    const hookCandidate = move && evidence.marketCapLabel
      ? `${token} ${move}: ${evidence.marketCapLabel} MARKET CAP?`
      : move
        ? `${token} ${move}: CAP VS FDV?`
        : defaultHook;
    const derivedSuffix = canAttachDerivedClause(input, token, "unlocked cap share is")
      ? `; unlocked cap share is ${floatShareFixed}% of FDV`
      : "";
    candidates.push({
      kind: "fdv_overhang",
      score: 38 + Math.min(35, fdvMultiple * 8),
      hookText: fitHookLength(hookCandidate, defaultHook),
      thesis: move
        ? `${cleanName} moved ${move} over 24h${evidence.marketCapLabel ? ` with a ${evidence.marketCapLabel} market cap` : ""}${derivedSuffix}.`
        : `${cleanName} gets a descriptive TokenRadar snapshot without a forecast.`,
      bullets: [
        `FLOAT SHARE: ${floatShareFixed}% OF FDV${evidence.fdvLabel ? ` (${evidence.fdvLabel} FDV)` : ""}`,
        `MARKET CAP: ${evidence.marketCapLabel || "N/A"}${riskExact ? ` · RISK ${riskExact}/10` : ""}`,
      ],
      takeaway: "Check how much supply is unlocked in market cap versus fully diluted supply.",
      verdictKicker: "CAP VS FDV CHECK",
      verdictLabel: `${floatShareFixed}% FLOAT / FDV`,
      verdictSubLabel: `${evidence.marketCapLabel ? `CAP ${evidence.marketCapLabel}` : token}${evidence.fdvLabel ? ` · FDV ${evidence.fdvLabel}` : ""}`,
      suppliedContextLines,
    });
  }

  if (
    finite(input.priceChange24h) &&
    input.priceChange24h >= 3 &&
    finite(input.athChangePercentage) &&
    input.athChangePercentage <= -55 &&
    move
  ) {
    const athPct = formatGroundedPercent(input.athChangePercentage);
    const hookCandidate = `${token} ${move}: CYCLE REBOUND?`;
    const derivedSuffix = canAttachDerivedClause(input, token, "peak drawdown stands at")
      ? `; peak drawdown stands at ${athPct}%`
      : "";
    candidates.push({
      kind: "ath_drawdown_bounce",
      score: 34 + Math.min(30, Math.abs(input.athChangePercentage) * 0.3),
      hookText: fitHookLength(hookCandidate, defaultHook),
      thesis: `${cleanName} moved ${move} over 24h${derivedSuffix}.`,
      bullets: [
        `24H REBOUND: ${move}${evidence.volumeLabel ? ` · ${evidence.volumeLabel} VOL` : ""}`,
        `ATH DISTANCE: ${athPct}%${riskExact ? ` · RISK ${riskExact}/10` : ""}`,
      ],
      takeaway: "Zoom out from the 24h bounce to see distance from the prior all-time high.",
      verdictKicker: "24H MOVE VS ATH",
      verdictLabel: `${athPct}% FROM ATH`,
      verdictSubLabel: `24H ${move}${riskExact ? ` · RISK ${riskExact}/10` : ""}`,
      suppliedContextLines,
    });
  }

  if (rank !== undefined && rank > 50 && finite(turnoverPct) && turnoverPct >= 8 && turnoverFixed) {
    const hookCandidate = move
      ? `${token} ${move}: RANK #${rank} WATCH?`
      : `${token}: RANK #${rank} WATCH?`;
    const derivedSuffix = canAttachDerivedClause(input, token, "reported volume was")
      ? `; reported volume was ${turnoverFixed}% of market cap`
      : "";
    candidates.push({
      kind: "rank_outlier",
      score: 30 + Math.min(25, turnoverPct),
      hookText: fitHookLength(hookCandidate, defaultHook),
      thesis: move
        ? `${cleanName} moved ${move} over 24h at rank #${rank}${derivedSuffix}.`
        : `${cleanName} stands at rank #${rank} in the supplied snapshot${derivedSuffix}.`,
      bullets: [
        `RANK #${rank}${evidence.marketCapLabel ? ` · ${evidence.marketCapLabel} CAP` : ""}`,
        `TURNOVER: ${turnoverFixed}% VOL/CAP${riskExact ? ` · RISK ${riskExact}/10` : ""}`,
      ],
      takeaway: "Mid-cap rank movers warrant checking both reported turnover and risk score.",
      verdictKicker: "MID-CAP RADAR",
      verdictLabel: `RANK #${rank} READ`,
      verdictSubLabel: `${turnoverFixed}% VOL/CAP${riskExact ? ` · RISK ${riskExact}/10` : ""}`,
      suppliedContextLines,
    });
  }

  if (candidates.length > 0) {
    const boosted = candidates.map((candidate) => {
      let bonus = 0;
      if (input.formatKey === "volume_spike_check" && candidate.kind === "turnover_spike") bonus = 12;
      if ((input.formatKey === "risk_alert" || input.formatKey === "risk_score_breakdown") && candidate.kind === "move_vs_risk") bonus = 12;
      if (input.formatKey === "contrarian_signal" && (candidate.kind === "fdv_overhang" || candidate.kind === "ath_drawdown_bounce")) bonus = 10;
      if (input.formatKey === "token_vs_sector" && candidate.kind === "rank_outlier") bonus = 10;
      return { candidate, totalScore: candidate.score + bonus };
    });
    boosted.sort((left, right) => right.totalScore - left.totalScore);
    return boosted[0].candidate;
  }

  return {
    kind: "snapshot_check",
    score: 10,
    hookText: defaultHook,
    thesis: `${cleanName} gets a descriptive TokenRadar snapshot without a forecast.`,
    bullets: [
      `24H MOVE: ${move || "SNAPSHOT"}${evidence.volumeLabel ? ` · ${evidence.volumeLabel} VOL` : ""}`,
      `${riskExact ? `RISK SCORE: ${riskExact}/10` : "MARKET READ"}${turnoverFixed ? ` · ${turnoverFixed}% VOL/CAP` : evidence.marketCapLabel ? ` · ${evidence.marketCapLabel} CAP` : ""}`,
    ],
    takeaway: "Point-in-time market fields frame the setup without predicting future price direction.",
    verdictKicker: riskExact ? "SCORECARD READ" : "DATA SNAPSHOT",
    verdictLabel: riskExact
      ? `RISK ${riskExact}/10`
      : turnoverFixed
        ? `${turnoverFixed}% VOL / CAP`
        : "DATA SNAPSHOT",
    verdictSubLabel: `${move ? `${token} ${move}` : token}${turnoverFixed ? ` · ${turnoverFixed}% VOL/CAP` : " · SNAPSHOT ONLY"}`,
    suppliedContextLines,
  };
}

/**
 * Build a concise `<= 40`-character first-frame hook grounded in supplied
 * market fields. Uses data-tension hooks when `formatKey` or `allowDerivedContext`
 * is provided, preserving exact legacy hook output for bare callers.
 */
export function buildEvidenceLedVideoHook(input: VideoEvidenceInput): string {
  if (input.formatKey || input.allowDerivedContext) {
    return selectVideoDataTension(input).hookText;
  }
  const evidence = buildVideoEvidenceSummary(input);
  const move = evidence.moveLabel?.replace(" / 24H", "") || "MOVE";
  const hook = `${evidence.tokenLabel} ${move}: WHAT'S THE CATCH?`;
  return hook.length <= 40 ? hook : `${evidence.tokenLabel} MOVE: WHAT'S THE CATCH?`.slice(0, 40).trim();
}

/**
 * Build grounded short-form narration clauses from supplied token evidence.
 * Weaves in the primary data-tension ratio when `allowDerivedContext` is enabled.
 */
export function buildEvidenceLedVoiceover(
  input: VideoEvidenceInput,
  platform: "youtube" | "tiktok" | "standard" = "standard",
): string {
  const evidence = buildVideoEvidenceSummary(input);
  const tension = selectVideoDataTension(input);
  const clauses: string[] = [];
  const token = evidence.tokenLabel;

  if (evidence.moveLabel) {
    clauses.push(`${token} moved ${evidence.moveLabel.replace(" / 24H", "")} in the supplied daily snapshot.`);
  } else {
    clauses.push(`${token} is the point-in-time market read.`);
  }

  if (evidence.volumeLabel) {
    clauses.push(`Reported daily volume was ${evidence.volumeLabel}.`);
  }

  if ((tension.kind === "turnover_spike" || tension.kind === "rank_outlier") && evidence.turnoverLabel && canAttachDerivedClause(input, token, "reported volume was")) {
    appendSemicolonClause(
      clauses,
      `reported volume was ${evidence.turnoverLabel.replace(" VOL/CAP", " of market cap")}`,
    );
  } else if (tension.kind === "fdv_overhang" && canAttachDerivedClause(input, token, "unlocked cap share is")) {
    const fdvLine = tension.suppliedContextLines.find((line) => line.includes("FDV"));
    if (fdvLine) {
      appendSemicolonClause(
        clauses,
        `${fdvLine.charAt(0).toLowerCase()}${fdvLine.slice(1).replace(/\.$/, "")}`,
      );
    }
  } else if (tension.kind === "ath_drawdown_bounce" && canAttachDerivedClause(input, token, "peak drawdown stands at")) {
    const athLine = tension.suppliedContextLines.find((line) => line.startsWith("Peak drawdown"));
    if (athLine) {
      appendSemicolonClause(
        clauses,
        `${athLine.charAt(0).toLowerCase()}${athLine.slice(1).replace(/\.$/, "")}`,
      );
    }
  }

  if (evidence.riskLabel) {
    clauses.push(`Risk score: ${evidence.riskLabel.replace(" RISK", "")}.`);
  }

  if (platform === "tiktok") {
    clauses.push(
      tension.kind === "fdv_overhang"
        ? "Which matters more here: float share, turnover, or risk?"
        : "Which matters more here: turnover or risk?",
    );
  } else {
    const closingQuestion = tension.kind === "fdv_overhang"
      ? "Does FDV dilution or risk matter more here?"
      : tension.kind === "ath_drawdown_bounce"
        ? "Is this a 24h bounce or a real shift?"
        : tension.kind === "turnover_spike"
          ? "Does turnover or risk stand out more here?"
          : "Which field should we break down next?";
    clauses.push(`This is a snapshot, not a forecast. ${closingQuestion}`);
  }

  return clauses.join(" ");
}

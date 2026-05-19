export type VideoMetricId = "priceMove" | "volume" | "marketCap" | "risk" | "growth";

export interface VideoFormat {
  key: string;
  label: string;
  family: "momentum" | "risk" | "rotation" | "comparison" | "explainer" | "recap";
  angle: string;
  hookInstruction: string;
  captionInstruction: string;
  openingEyebrow: string;
  hookSubline: string;
  revealLabel: string;
  metricsTitle: string;
  contextTitle: string;
  contextLead: string;
  summaryTitle: string;
  summaryLead: string;
  verdictKicker: string;
  signalLabel: string;
  metricOrder: VideoMetricId[];
}

export const VIDEO_FORMATS = [
  {
    key: "breakout_watch",
    label: "Breakout Watch",
    family: "momentum",
    angle: "test whether the move has enough follow-through to deserve attention",
    hookInstruction: "Open with urgency around confirmation, not upside promises.",
    captionInstruction: "Frame the post as a breakout quality check with a clear follow-through filter.",
    openingEyebrow: "BREAKOUT WATCH",
    hookSubline: "Educational Market Data Only | Follow-through decides",
    revealLabel: "Breakout Candidate",
    metricsTitle: "Momentum Proof",
    contextTitle: "Breakout Context",
    contextLead: "This format asks whether the move is backed by enough market activity to stay on the radar.",
    summaryTitle: "Breakout Check",
    summaryLead: "A breakout is only useful when the market data supports the move beyond the first candle.",
    verdictKicker: "WATCHLIST READ",
    signalLabel: "FOLLOW-THROUGH WATCH",
    metricOrder: ["priceMove", "volume", "marketCap", "risk", "growth"],
  },
  {
    key: "risk_alert",
    label: "Risk Alert",
    family: "risk",
    angle: "lead with what could weaken the setup before discussing momentum",
    hookInstruction: "Open with the risk or invalidation filter first.",
    captionInstruction: "Make confirmation and invalidation the point; avoid hype language.",
    openingEyebrow: "RISK ALERT",
    hookSubline: "Educational Market Data Only | Verify before reacting",
    revealLabel: "Risk Candidate",
    metricsTitle: "Risk Filter",
    contextTitle: "What Could Break",
    contextLead: "This format starts with the downside filter so the move is judged before it is chased.",
    summaryTitle: "Risk Read",
    summaryLead: "The data matters most when it shows what would invalidate the market read.",
    verdictKicker: "RISK DESK",
    signalLabel: "CONFIRMATION NEEDED",
    metricOrder: ["risk", "volume", "priceMove", "marketCap", "growth"],
  },
  {
    key: "volume_spike_check",
    label: "Volume Spike Check",
    family: "momentum",
    angle: "judge whether volume supports the price move",
    hookInstruction: "Open with volume quality, not price alone.",
    captionInstruction: "Explain whether the volume profile makes the move more or less credible.",
    openingEyebrow: "VOLUME CHECK",
    hookSubline: "Educational Market Data Only | Volume must confirm",
    revealLabel: "Volume Read",
    metricsTitle: "Volume Quality",
    contextTitle: "Move Quality",
    contextLead: "This format separates a real liquidity event from a thin price spike.",
    summaryTitle: "Volume Read",
    summaryLead: "A sharp move needs volume context before it deserves attention.",
    verdictKicker: "LIQUIDITY READ",
    signalLabel: "VOLUME CONFIRMATION",
    metricOrder: ["volume", "priceMove", "marketCap", "risk", "growth"],
  },
  {
    key: "sector_rotation",
    label: "Sector Rotation",
    family: "rotation",
    angle: "connect the token to broader narrative or sector movement",
    hookInstruction: "Open with rotation language and make the token the evidence.",
    captionInstruction: "Tie the token to sector context and avoid treating the move as isolated.",
    openingEyebrow: "ROTATION RADAR",
    hookSubline: "Educational Market Data Only | Context before conviction",
    revealLabel: "Rotation Name",
    metricsTitle: "Rotation Evidence",
    contextTitle: "Sector Context",
    contextLead: "This format asks whether the token is moving alone or as part of a broader rotation.",
    summaryTitle: "Rotation Read",
    summaryLead: "Isolated candles matter less than where momentum is clustering across the market.",
    verdictKicker: "ROTATION DESK",
    signalLabel: "ROTATION WATCH",
    metricOrder: ["priceMove", "marketCap", "volume", "growth", "risk"],
  },
  {
    key: "token_vs_sector",
    label: "Token vs Sector",
    family: "comparison",
    angle: "compare the token against its broader market context",
    hookInstruction: "Open with a contrast between the token and the broader tape.",
    captionInstruction: "Write the post as a comparison, not a standalone token pitch.",
    openingEyebrow: "TOKEN VS MARKET",
    hookSubline: "Educational Market Data Only | Compare the setup",
    revealLabel: "Comparison Focus",
    metricsTitle: "Relative Read",
    contextTitle: "Relative Context",
    contextLead: "This format compares the token setup against broader market conditions before making a read.",
    summaryTitle: "Relative Read",
    summaryLead: "A token read is stronger when it makes sense against the broader market backdrop.",
    verdictKicker: "COMPARISON READ",
    signalLabel: "RELATIVE STRENGTH",
    metricOrder: ["marketCap", "priceMove", "volume", "risk", "growth"],
  },
  {
    key: "momentum_cooling",
    label: "Momentum Cooling",
    family: "risk",
    angle: "look for signs that the move may be fading",
    hookInstruction: "Open with the possibility that momentum is cooling.",
    captionInstruction: "Make the post about whether the move can stay valid, not whether it can extend.",
    openingEyebrow: "MOMENTUM CHECK",
    hookSubline: "Educational Market Data Only | Watch the fade risk",
    revealLabel: "Cooling Watch",
    metricsTitle: "Fade Risk",
    contextTitle: "Momentum Context",
    contextLead: "This format checks whether the move is still building or already losing quality.",
    summaryTitle: "Cooling Read",
    summaryLead: "Strong moves can still fade when confirmation and liquidity break down.",
    verdictKicker: "MOMENTUM DESK",
    signalLabel: "LEVEL CHECK",
    metricOrder: ["priceMove", "risk", "volume", "growth", "marketCap"],
  },
  {
    key: "catalyst_explainer",
    label: "Catalyst Explainer",
    family: "explainer",
    angle: "explain why the token is moving today",
    hookInstruction: "Open with a why-now question tied to the catalyst.",
    captionInstruction: "Make the copy explain the reason for attention before the metrics.",
    openingEyebrow: "WHY NOW",
    hookSubline: "Educational Market Data Only | Catalyst first",
    revealLabel: "Catalyst Focus",
    metricsTitle: "Catalyst Data",
    contextTitle: "Why It Moved",
    contextLead: "This format turns the selection reason into the main story and uses data as support.",
    summaryTitle: "Catalyst Read",
    summaryLead: "A useful market update explains why the move is happening, not only that it happened.",
    verdictKicker: "CATALYST READ",
    signalLabel: "WHY-NOW WATCH",
    metricOrder: ["priceMove", "volume", "growth", "risk", "marketCap"],
  },
  {
    key: "liquidity_stress_test",
    label: "Liquidity Stress Test",
    family: "risk",
    angle: "stress-test the move through volume and market-cap context",
    hookInstruction: "Open with liquidity quality and stress-test language.",
    captionInstruction: "Explain why liquidity and market depth matter before reacting to price.",
    openingEyebrow: "LIQUIDITY TEST",
    hookSubline: "Educational Market Data Only | Depth matters",
    revealLabel: "Liquidity Candidate",
    metricsTitle: "Depth Check",
    contextTitle: "Liquidity Context",
    contextLead: "This format asks whether the move can survive basic liquidity scrutiny.",
    summaryTitle: "Liquidity Read",
    summaryLead: "Percent gains need depth and volume behind them before the market read gets cleaner.",
    verdictKicker: "LIQUIDITY DESK",
    signalLabel: "DEPTH CHECK",
    metricOrder: ["volume", "marketCap", "priceMove", "risk", "growth"],
  },
  {
    key: "data_vs_hype",
    label: "Data vs Hype",
    family: "explainer",
    angle: "separate measurable data from social noise",
    hookInstruction: "Open with data challenging the hype.",
    captionInstruction: "Position TokenRadar as filtering hype through measurable data.",
    openingEyebrow: "DATA VS HYPE",
    hookSubline: "Educational Market Data Only | Numbers before narratives",
    revealLabel: "Hype Check",
    metricsTitle: "Data Filter",
    contextTitle: "Data Context",
    contextLead: "This format uses measurable market data to separate useful evidence from noise.",
    summaryTitle: "Data Read",
    summaryLead: "The question is not whether attention exists; it is whether the data supports it.",
    verdictKicker: "DATA DESK",
    signalLabel: "DATA FILTER",
    metricOrder: ["risk", "priceMove", "volume", "growth", "marketCap"],
  },
  {
    key: "risk_score_breakdown",
    label: "Risk Score Breakdown",
    family: "risk",
    angle: "make the TokenRadar risk score the main educational point",
    hookInstruction: "Open with the risk score tension.",
    captionInstruction: "Explain the setup through risk profile, not just movement.",
    openingEyebrow: "RISK SCORE",
    hookSubline: "Educational Market Data Only | Read the risk first",
    revealLabel: "Risk Profile",
    metricsTitle: "Risk Model",
    contextTitle: "Risk Breakdown",
    contextLead: "This format makes the risk profile the center of the market read.",
    summaryTitle: "Risk Score Read",
    summaryLead: "A clean market read should make sense after risk, liquidity, and volatility are checked.",
    verdictKicker: "RISK MODEL",
    signalLabel: "RISK-CHECKED",
    metricOrder: ["risk", "growth", "volume", "priceMove", "marketCap"],
  },
  {
    key: "watchlist_battle",
    label: "Watchlist Battle",
    family: "comparison",
    angle: "frame the token as competing for watchlist attention",
    hookInstruction: "Open like a watchlist challenge, not a recommendation.",
    captionInstruction: "Ask whether this setup deserves watchlist space versus stronger alternatives.",
    openingEyebrow: "WATCHLIST BATTLE",
    hookSubline: "Educational Market Data Only | Earn the watchlist slot",
    revealLabel: "Watchlist Contender",
    metricsTitle: "Watchlist Case",
    contextTitle: "Contender Context",
    contextLead: "This format asks whether the token has enough evidence to compete for attention.",
    summaryTitle: "Watchlist Read",
    summaryLead: "Watchlist space should go to setups with a clear data reason, not only a green candle.",
    verdictKicker: "WATCHLIST DESK",
    signalLabel: "CONTENDER WATCH",
    metricOrder: ["growth", "priceMove", "volume", "risk", "marketCap"],
  },
  {
    key: "weekly_recap",
    label: "Weekly Recap",
    family: "recap",
    angle: "turn the token into one part of a broader market recap",
    hookInstruction: "Open like a quick market recap with one standout name.",
    captionInstruction: "Make the copy feel like a weekly or session recap, even when focused on one token.",
    openingEyebrow: "MARKET RECAP",
    hookSubline: "Educational Market Data Only | Fast market scan",
    revealLabel: "Standout Name",
    metricsTitle: "Recap Metrics",
    contextTitle: "Market Read",
    contextLead: "This format treats the token as the standout example inside a broader market scan.",
    summaryTitle: "Recap Read",
    summaryLead: "The stronger recap connects the token read back to market context.",
    verdictKicker: "RECAP DESK",
    signalLabel: "MARKET STANDOUT",
    metricOrder: ["marketCap", "priceMove", "volume", "growth", "risk"],
  },
  {
    key: "new_listing_radar",
    label: "New Listing Radar",
    family: "explainer",
    angle: "focus on newly published or newly tracked names",
    hookInstruction: "Open with discovery and verification language.",
    captionInstruction: "Explain why the token is newly on radar and what must be verified next.",
    openingEyebrow: "NEW RADAR",
    hookSubline: "Educational Market Data Only | Discovery needs filters",
    revealLabel: "New Radar Name",
    metricsTitle: "First Filters",
    contextTitle: "Discovery Context",
    contextLead: "This format treats the token as a fresh radar candidate that still needs verification.",
    summaryTitle: "New Radar Read",
    summaryLead: "Newly tracked names need stricter filters before the research read becomes useful.",
    verdictKicker: "RADAR DESK",
    signalLabel: "NEW WATCHLIST",
    metricOrder: ["risk", "marketCap", "volume", "priceMove", "growth"],
  },
  {
    key: "narrative_heatmap",
    label: "Narrative Heatmap",
    family: "rotation",
    angle: "use the token to explain where narrative heat is building",
    hookInstruction: "Open with narrative heat and evidence.",
    captionInstruction: "Tie the token to narrative heat while keeping the post data-led.",
    openingEyebrow: "NARRATIVE HEAT",
    hookSubline: "Educational Market Data Only | Heat needs confirmation",
    revealLabel: "Narrative Read",
    metricsTitle: "Heatmap Evidence",
    contextTitle: "Narrative Context",
    contextLead: "This format checks whether the token is part of a narrative heating up or just a one-off move.",
    summaryTitle: "Narrative Read",
    summaryLead: "Narrative heat matters more when price, volume, and risk profile align.",
    verdictKicker: "NARRATIVE DESK",
    signalLabel: "NARRATIVE WATCH",
    metricOrder: ["growth", "priceMove", "volume", "marketCap", "risk"],
  },
  {
    key: "contrarian_signal",
    label: "Contrarian Read",
    family: "comparison",
    angle: "surface the tension in the setup instead of only the obvious move",
    hookInstruction: "Open with the contradiction in the data.",
    captionInstruction: "Make the post about the tension: what looks strong versus what still worries the model.",
    openingEyebrow: "CONTRARIAN READ",
    hookSubline: "Educational Market Data Only | Tension creates the read",
    revealLabel: "Tension Setup",
    metricsTitle: "Contrarian Data",
    contextTitle: "Data Tension",
    contextLead: "This format highlights the strongest contradiction in the setup before giving a read.",
    summaryTitle: "Contrarian Read",
    summaryLead: "The useful part of a read is often the tension between momentum and risk.",
    verdictKicker: "CONTRARIAN DESK",
    signalLabel: "TENSION WATCH",
    metricOrder: ["risk", "priceMove", "growth", "volume", "marketCap"],
  },
] as const satisfies readonly VideoFormat[];

export type VideoFormatKey = typeof VIDEO_FORMATS[number]["key"];

const DEFAULT_VIDEO_FORMAT_KEY: VideoFormatKey = "breakout_watch";

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function isVideoFormatKey(value: string | undefined | null): value is VideoFormatKey {
  return VIDEO_FORMATS.some((format) => format.key === value);
}

export function getVideoFormat(key: string | undefined | null): VideoFormat {
  return VIDEO_FORMATS.find((format) => format.key === key) ||
    VIDEO_FORMATS.find((format) => format.key === DEFAULT_VIDEO_FORMAT_KEY) ||
    VIDEO_FORMATS[0];
}

export function selectVideoFormat(options: {
  usedFormatKeys?: Iterable<string>;
  seedParts?: Array<string | number | undefined | null>;
} = {}): VideoFormat {
  const used = new Set(options.usedFormatKeys || []);
  const eligible = VIDEO_FORMATS.filter((format) => !used.has(format.key));
  const candidates = eligible.length > 0 ? eligible : VIDEO_FORMATS;
  const seed = (options.seedParts || [])
    .filter((part) => part !== undefined && part !== null)
    .join(":")
    .toLowerCase();
  const index = stableHash(seed || "tokenradar-video-format") % candidates.length;
  return candidates[index];
}

export function selectVideoFormatsForSlots<TSlot extends string>(
  slots: readonly TSlot[],
  options: {
    getUsedFormatKeys?: (slot: TSlot) => Iterable<string>;
    getSeedParts?: (slot: TSlot) => Array<string | number | undefined | null>;
  } = {},
): Map<TSlot, VideoFormat> {
  const selected = new Map<TSlot, VideoFormat>();
  const selectedKeys = new Set<string>();

  for (const slot of slots) {
    const used = new Set(options.getUsedFormatKeys?.(slot) || []);
    for (const key of selectedKeys) used.add(key);

    const format = selectVideoFormat({
      usedFormatKeys: used,
      seedParts: options.getSeedParts?.(slot) || [slot],
    });
    selected.set(slot, format);
    selectedKeys.add(format.key);
  }

  return selected;
}

export function formatVideoFormatPromptLine(format: VideoFormat): string {
  return `${format.label}: ${format.angle}. ${format.captionInstruction}`;
}

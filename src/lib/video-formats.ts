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
    label: "Market Snapshot",
    family: "momentum",
    angle: "present the supplied token snapshot without a forecast",
    hookInstruction: "Open with the token name and call this a descriptive data snapshot.",
    captionInstruction: "Present only supplied fields and avoid interpreting momentum, quality, or direction.",
    openingEyebrow: "MARKET SNAPSHOT",
    hookSubline: "Educational Market Data Only | No forecast",
    revealLabel: "Tracked Token",
    metricsTitle: "Supplied Market Data",
    contextTitle: "Snapshot Context",
    contextLead: "This format presents the supplied market fields as a point-in-time snapshot.",
    summaryTitle: "Snapshot Read",
    summaryLead: "Use the displayed fields as descriptive context, not a prediction or recommendation.",
    verdictKicker: "DATA SNAPSHOT",
    signalLabel: "DESCRIPTIVE VIEW",
    metricOrder: ["priceMove", "volume", "marketCap", "risk", "growth"],
  },
  {
    key: "risk_alert",
    label: "Risk Score Snapshot",
    family: "risk",
    angle: "quote the supplied risk score alongside the market snapshot",
    hookInstruction: "Open by naming the supplied risk score without interpreting its methodology.",
    captionInstruction: "Quote only supplied values and avoid qualitative risk conclusions.",
    openingEyebrow: "RISK SCORE SNAPSHOT",
    hookSubline: "Educational Market Data Only | Supplied score",
    revealLabel: "Tracked Token",
    metricsTitle: "Supplied Fields",
    contextTitle: "Score Context",
    contextLead: "This format displays the supplied risk score with the point-in-time market fields.",
    summaryTitle: "Score Snapshot",
    summaryLead: "The displayed score is descriptive and does not provide a forecast or recommendation.",
    verdictKicker: "SUPPLIED SCORE",
    signalLabel: "RISK SCORE VIEW",
    metricOrder: ["risk", "volume", "priceMove", "marketCap", "growth"],
  },
  {
    key: "volume_spike_check",
    label: "Volume and Market-Cap Snapshot",
    family: "momentum",
    angle: "display the supplied 24h volume and market-cap fields side by side",
    hookInstruction: "Open by naming this a point-in-time volume and market-cap snapshot.",
    captionInstruction: "Quote only supplied fields and do not characterize liquidity, depth, or volume direction.",
    openingEyebrow: "VOLUME + CAP",
    hookSubline: "Educational Market Data Only | Point-in-time fields",
    revealLabel: "Tracked Token",
    metricsTitle: "Volume and Market Cap",
    contextTitle: "Snapshot Context",
    contextLead: "This format displays reported 24h volume and market cap without inferring liquidity or trend.",
    summaryTitle: "Field Snapshot",
    summaryLead: "The displayed values are separate point-in-time fields, not proof of market quality.",
    verdictKicker: "DATA SNAPSHOT",
    signalLabel: "SUPPLIED FIELDS",
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
    label: "Price and Rank Snapshot",
    family: "comparison",
    angle: "display the supplied price and market-cap rank without a relative-performance claim",
    hookInstruction: "Open with the token name and call out that the fields are a dated snapshot.",
    captionInstruction: "Quote only supplied price, rank, and market fields; do not compare against a sector or another asset.",
    openingEyebrow: "PRICE + RANK",
    hookSubline: "Educational Market Data Only | Dated snapshot",
    revealLabel: "Tracked Token",
    metricsTitle: "Price and Rank Fields",
    contextTitle: "Snapshot Context",
    contextLead: "This format presents the supplied price and market-cap rank without claiming relative strength.",
    summaryTitle: "Field Snapshot",
    summaryLead: "Price and rank describe the supplied snapshot; neither predicts what happens next.",
    verdictKicker: "DATA SNAPSHOT",
    signalLabel: "SUPPLIED FIELDS",
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
    label: "Data Snapshot",
    family: "explainer",
    angle: "present a concise view of the supplied fields",
    hookInstruction: "Open by calling the video a descriptive TokenRadar snapshot.",
    captionInstruction: "List only supplied fields without claiming what they prove.",
    openingEyebrow: "DATA SNAPSHOT",
    hookSubline: "Educational Market Data Only | Numbers before narratives",
    revealLabel: "Tracked Token",
    metricsTitle: "Supplied Fields",
    contextTitle: "Data Context",
    contextLead: "This format presents the supplied market data without adding a causal explanation.",
    summaryTitle: "Snapshot Read",
    summaryLead: "The displayed values are a point-in-time description, not a forecast.",
    verdictKicker: "DATA SNAPSHOT",
    signalLabel: "DESCRIPTIVE VIEW",
    metricOrder: ["risk", "priceMove", "volume", "growth", "marketCap"],
  },
  {
    key: "risk_score_breakdown",
    label: "Risk Score View",
    family: "risk",
    angle: "display the supplied TokenRadar risk score without explaining its methodology",
    hookInstruction: "Open with the exact supplied risk score.",
    captionInstruction: "Quote the score and supplied market fields without a qualitative conclusion.",
    openingEyebrow: "RISK SCORE",
    hookSubline: "Educational Market Data Only | Supplied score",
    revealLabel: "Tracked Token",
    metricsTitle: "Risk Score and Market Data",
    contextTitle: "Score Snapshot",
    contextLead: "This format displays the supplied risk score beside the point-in-time market fields.",
    summaryTitle: "Supplied Score",
    summaryLead: "The displayed score is quoted as supplied and is not a recommendation.",
    verdictKicker: "SUPPLIED SCORE",
    signalLabel: "SCORE SNAPSHOT",
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
    label: "Snapshot Recap",
    family: "recap",
    angle: "recap the supplied point-in-time token fields",
    hookInstruction: "Open with a concise snapshot recap.",
    captionInstruction: "Recap only supplied token fields without broader-market claims.",
    openingEyebrow: "SNAPSHOT RECAP",
    hookSubline: "Educational Market Data Only | Point-in-time view",
    revealLabel: "Tracked Token",
    metricsTitle: "Recap Fields",
    contextTitle: "Snapshot Context",
    contextLead: "This format recaps the supplied token fields from one point in time.",
    summaryTitle: "Snapshot Recap",
    summaryLead: "The displayed values are descriptive context and do not predict a future move.",
    verdictKicker: "DATA RECAP",
    signalLabel: "SNAPSHOT VIEW",
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

export const PUBLISHABLE_VIDEO_FORMAT_KEYS = [
  "breakout_watch",
  "risk_alert",
  "volume_spike_check",
  "token_vs_sector",
  "data_vs_hype",
  "risk_score_breakdown",
  "weekly_recap",
] as const satisfies readonly VideoFormatKey[];

const publishableVideoFormatKeySet = new Set<string>(PUBLISHABLE_VIDEO_FORMAT_KEYS);

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
  return VIDEO_FORMATS.find((format) => format.key === key && publishableVideoFormatKeySet.has(format.key)) ||
    VIDEO_FORMATS.find((format) => format.key === DEFAULT_VIDEO_FORMAT_KEY) ||
    VIDEO_FORMATS[0];
}

export function selectVideoFormat(options: {
  usedFormatKeys?: Iterable<string>;
  seedParts?: Array<string | number | undefined | null>;
} = {}): VideoFormat {
  const used = new Set(options.usedFormatKeys || []);
  const publishableFormats = VIDEO_FORMATS.filter((format) => publishableVideoFormatKeySet.has(format.key));
  const eligible = publishableFormats.filter((format) => !used.has(format.key));
  const candidates = eligible.length > 0 ? eligible : publishableFormats;
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

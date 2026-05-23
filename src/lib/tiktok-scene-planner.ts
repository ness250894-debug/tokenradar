export type TikTokSceneIntent =
  | "comment_reply"
  | "pattern_interrupt"
  | "proof_check"
  | "breakpoint"
  | "watch_next";

export type TikTokSceneTone = "paper" | "green" | "amber" | "red" | "blue";
export type TikTokSceneTransition = "cut" | "push" | "flash" | "wipe";

export interface TikTokScenePlanItem {
  id: string;
  intent: TikTokSceneIntent;
  fromSeconds: number;
  toSeconds: number;
  prompt: string;
  subtitle: string;
  note: string;
  tone: TikTokSceneTone;
  visualQuery: string;
  transition: TikTokSceneTransition;
}

export interface TikTokScenePlan {
  style: "invideo_local";
  version: 1;
  totalDurationSeconds: number;
  scenes: TikTokScenePlanItem[];
}

export interface BuildTikTokInVideoScenePlanOptions {
  tokenName: string;
  symbol: string;
  priceChange24h?: number;
  riskScore?: number;
  volume24h?: number;
  contextText?: string;
  videoThesis?: string;
  durationSeconds?: number;
  seedParts?: Array<string | number | undefined | null>;
}

const DEFAULT_DURATION_SECONDS = 42;
const MIN_DURATION_SECONDS = 40;
const MAX_DURATION_SECONDS = 44;
const FORTY_TWO_SECOND_TIMINGS = [0, 6, 14, 23, 33, 42] as const;
const TIMING_RATIOS = FORTY_TWO_SECOND_TIMINGS.map((value) => value / DEFAULT_DURATION_SECONDS);

const VISUAL_QUERIES: Record<TikTokSceneIntent, string[]> = {
  comment_reply: [
    "vertical creator replying to phone comment natural desk light",
    "handheld phone comment reply finance creator vertical b-roll",
    "person checking phone notification casual creator setup",
  ],
  pattern_interrupt: [
    "vertical handheld office phone finance b-roll quick movement",
    "busy desk laptop phone market app handheld vertical",
    "creator desk phone screen reaction finance vertical",
  ],
  proof_check: [
    "person reviewing market app on phone vertical close-up",
    "hands scrolling finance app with laptop in background vertical",
    "creator checking activity on phone finance b-roll",
  ],
  breakpoint: [
    "desk laptop finance risk review moody vertical b-roll",
    "person pausing over laptop chart risk review vertical",
    "close-up notebook laptop phone research check vertical",
  ],
  watch_next: [
    "phone comment box creator call to action finance vertical",
    "creator looking at phone comments casual finance b-roll",
    "hands typing ticker comment on phone vertical creator",
  ],
};

const SUBTITLES: Record<TikTokSceneIntent, string[]> = {
  comment_reply: [
    "I would not start with the candle.",
    "The chart is not the first question.",
    "I would slow this read down first.",
  ],
  pattern_interrupt: [
    "The move is just the opening line.",
    "The headline is only the first layer.",
    "The first reaction is not the full story.",
  ],
  proof_check: [
    "Did real activity show up, or was it a thin spike?",
    "First check: did attention turn into activity?",
    "The useful read starts with whether activity followed.",
  ],
  breakpoint: [
    "Ask what would break the story before the crowd reacts.",
    "Second check: what makes this read fall apart?",
    "The risk question matters before the reaction gets loud.",
  ],
  watch_next: [
    "Comment one ticker for the next two-check read.",
    "Drop one ticker and I will run the same two-check read.",
    "Send one ticker for the next quick two-check read.",
  ],
};

function hashSeed(seedParts: Array<string | number | undefined | null>): number {
  const seed = seedParts
    .filter((part): part is string | number => part !== undefined && part !== null)
    .join(":");
  let hash = 2166136261;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function pickSeeded<T>(items: readonly T[], seed: number, offset: number): T {
  return items[(seed + offset) % items.length];
}

function normalizeSymbol(symbol: string): string {
  const clean = symbol.replace(/[^a-z0-9]/gi, "").toUpperCase();
  return clean || "THIS";
}

function normalizeDurationSeconds(durationSeconds: number | undefined): number {
  if (!Number.isFinite(durationSeconds)) return DEFAULT_DURATION_SECONDS;
  return Math.min(MAX_DURATION_SECONDS, Math.max(MIN_DURATION_SECONDS, Math.round(durationSeconds as number)));
}

function stripDryMetrics(value: string): string {
  return value
    .replace(/\$[\d,.]+(?:\s?[kmbt])?/gi, "")
    .replace(/[+-]?\d+(?:\.\d+)?%/g, "")
    .replace(/\bvolume\s*:\s*/gi, "activity ")
    .replace(/\bmarket cap\s*:\s*/gi, "market size ")
    .replace(/\brank\s*#?\d+\b/gi, "ranking context")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?])/g, "$1")
    .trim();
}

function firstUsefulSentence(value: string | undefined): string {
  const clean = stripDryMetrics(value || "");
  if (!clean) return "";
  const first = clean.split(/(?<=[.!?])\s+/)[0] || clean;
  return first.length > 92 ? `${first.slice(0, 88).trim()}...` : first;
}

function getRiskNote(riskScore: number | undefined): { note: string; tone: TikTokSceneTone } {
  if (typeof riskScore !== "number" || !Number.isFinite(riskScore)) {
    return { note: "risk still needs a check", tone: "paper" };
  }
  if (riskScore >= 7) return { note: "risk is already elevated", tone: "red" };
  if (riskScore >= 4) return { note: "middle risk, verify first", tone: "amber" };
  return { note: "cleaner risk, still verify", tone: "paper" };
}

function getActivityNote(volume24h: number | undefined): string {
  return typeof volume24h === "number" && Number.isFinite(volume24h) && volume24h > 0
    ? "activity showed up"
    : "activity still needs proof";
}

function getContextNote(options: BuildTikTokInVideoScenePlanOptions): string {
  return firstUsefulSentence(options.videoThesis || options.contextText) ||
    "Context first, reaction second.";
}

function buildTimings(durationSeconds: number): Array<[number, number]> {
  if (durationSeconds === DEFAULT_DURATION_SECONDS) {
    return FORTY_TWO_SECOND_TIMINGS.slice(0, -1).map((fromSeconds, index) => [
      fromSeconds,
      FORTY_TWO_SECOND_TIMINGS[index + 1],
    ]);
  }

  const cuts = TIMING_RATIOS.map((ratio) => Math.round(ratio * durationSeconds));
  cuts[0] = 0;
  cuts[cuts.length - 1] = durationSeconds;

  for (let index = 1; index < cuts.length; index += 1) {
    if (cuts[index] <= cuts[index - 1]) cuts[index] = cuts[index - 1] + 1;
  }

  return cuts.slice(0, -1).map((fromSeconds, index) => [fromSeconds, cuts[index + 1]]);
}

export function buildTikTokInVideoScenePlan(options: BuildTikTokInVideoScenePlanOptions): TikTokScenePlan {
  const totalDurationSeconds = normalizeDurationSeconds(options.durationSeconds);
  const symbol = normalizeSymbol(options.symbol);
  const seed = hashSeed([
    options.tokenName,
    symbol,
    options.priceChange24h,
    options.riskScore,
    ...(options.seedParts || []),
  ]);
  const timings = buildTimings(totalDurationSeconds);
  const risk = getRiskNote(options.riskScore);
  const sceneMeta: Array<{
    intent: TikTokSceneIntent;
    prompt: string;
    note: string;
    tone: TikTokSceneTone;
    transition: TikTokSceneTransition;
  }> = [
    {
      intent: "comment_reply",
      prompt: `viewer asked: is ${symbol} actually worth watching?`,
      note: "quick reply",
      tone: "paper",
      transition: "cut",
    },
    {
      intent: "pattern_interrupt",
      prompt: "what changed?",
      note: "headline only",
      tone: "green",
      transition: "push",
    },
    {
      intent: "proof_check",
      prompt: "first check",
      note: getActivityNote(options.volume24h),
      tone: "amber",
      transition: "flash",
    },
    {
      intent: "breakpoint",
      prompt: "second check",
      note: risk.note,
      tone: risk.tone,
      transition: "wipe",
    },
    {
      intent: "watch_next",
      prompt: "your turn",
      note: getContextNote(options),
      tone: "blue",
      transition: "cut",
    },
  ];

  return {
    style: "invideo_local",
    version: 1,
    totalDurationSeconds,
    scenes: sceneMeta.map((scene, index) => {
      const [fromSeconds, toSeconds] = timings[index];
      return {
        id: `${index + 1}-${scene.intent}`,
        intent: scene.intent,
        fromSeconds,
        toSeconds,
        prompt: scene.prompt,
        subtitle: pickSeeded(SUBTITLES[scene.intent], seed, index * 17),
        note: scene.note,
        tone: scene.tone,
        visualQuery: pickSeeded(VISUAL_QUERIES[scene.intent], seed, index * 29),
        transition: scene.transition,
      };
    }),
  };
}

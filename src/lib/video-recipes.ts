export type VideoSceneId = "hook" | "reveal" | "metrics" | "context" | "verdict";

export type VideoLayoutPack =
  | "center_card"
  | "split_report"
  | "terminal_feed"
  | "scoreboard"
  | "market_map"
  | "ticker_stack";

export type VideoChartPack =
  | "spotlight_count"
  | "risk_gauge"
  | "volume_ladder"
  | "heat_tiles"
  | "market_compare"
  | "signal_radar";

export type VideoMotionPack =
  | "snap_zoom"
  | "slide_cut"
  | "scanline"
  | "rise_pop"
  | "ticker_push"
  | "pulse_lock";

export type VideoBackgroundSystem =
  | "radar_grid"
  | "ticker_tape"
  | "terminal_scan"
  | "heatmap_field"
  | "orbital_map"
  | "liquidity_depth";

export type VideoColorTheme =
  | "electric_indigo"
  | "terminal_green"
  | "amber_signal"
  | "cyan_depth"
  | "rose_risk"
  | "whitepaper";

export type VideoPacingProfile = "standard" | "data_burst" | "context_punch" | "fast_reveal";

export interface VideoVisualRecipe {
  key: string;
  sceneOrder: VideoSceneId[];
  layoutPack: VideoLayoutPack;
  chartPack: VideoChartPack;
  motionPack: VideoMotionPack;
  backgroundSystem: VideoBackgroundSystem;
  colorTheme: VideoColorTheme;
  pacingProfile: VideoPacingProfile;
}

export interface VideoThemeDefinition {
  accent: string;
  secondary: string;
  positive: string;
  warning: string;
  negative: string;
  muted: string;
}

export const VIDEO_SCENE_ORDERS: readonly VideoSceneId[][] = [
  ["hook", "reveal", "metrics", "context", "verdict"],
  ["hook", "reveal", "context", "metrics", "verdict"],
  ["hook", "metrics", "reveal", "context", "verdict"],
  ["hook", "context", "reveal", "metrics", "verdict"],
] as const;

export const VIDEO_LAYOUT_PACKS: readonly VideoLayoutPack[] = [
  "center_card",
  "split_report",
  "terminal_feed",
  "scoreboard",
  "market_map",
  "ticker_stack",
] as const;

export const VIDEO_CHART_PACKS: readonly VideoChartPack[] = [
  "spotlight_count",
  "risk_gauge",
  "volume_ladder",
  "heat_tiles",
  "market_compare",
  "signal_radar",
] as const;

export const VIDEO_MOTION_PACKS: readonly VideoMotionPack[] = [
  "snap_zoom",
  "slide_cut",
  "scanline",
  "rise_pop",
  "ticker_push",
  "pulse_lock",
] as const;

export const VIDEO_BACKGROUND_SYSTEMS: readonly VideoBackgroundSystem[] = [
  "radar_grid",
  "ticker_tape",
  "terminal_scan",
  "heatmap_field",
  "orbital_map",
  "liquidity_depth",
] as const;

export const VIDEO_COLOR_THEMES: Record<VideoColorTheme, VideoThemeDefinition> = {
  electric_indigo: {
    accent: "#4F46E5",
    secondary: "#22D3EE",
    positive: "#10B981",
    warning: "#F59E0B",
    negative: "#EF4444",
    muted: "#9CA3AF",
  },
  terminal_green: {
    accent: "#22C55E",
    secondary: "#84CC16",
    positive: "#10B981",
    warning: "#FACC15",
    negative: "#F87171",
    muted: "#A3E635",
  },
  amber_signal: {
    accent: "#F59E0B",
    secondary: "#FDE68A",
    positive: "#34D399",
    warning: "#FBBF24",
    negative: "#F43F5E",
    muted: "#FCD34D",
  },
  cyan_depth: {
    accent: "#06B6D4",
    secondary: "#38BDF8",
    positive: "#2DD4BF",
    warning: "#FBBF24",
    negative: "#FB7185",
    muted: "#A5F3FC",
  },
  rose_risk: {
    accent: "#E11D48",
    secondary: "#FB7185",
    positive: "#34D399",
    warning: "#F59E0B",
    negative: "#F43F5E",
    muted: "#FDA4AF",
  },
  whitepaper: {
    accent: "#E5E7EB",
    secondary: "#94A3B8",
    positive: "#22C55E",
    warning: "#F59E0B",
    negative: "#EF4444",
    muted: "#CBD5E1",
  },
};

export const VIDEO_PACING_PROFILES: Record<VideoPacingProfile, Record<VideoSceneId, number>> = {
  standard: { hook: 90, reveal: 120, metrics: 330, context: 210, verdict: 150 },
  data_burst: { hook: 75, reveal: 105, metrics: 390, context: 180, verdict: 150 },
  context_punch: { hook: 75, reveal: 105, metrics: 300, context: 270, verdict: 150 },
  fast_reveal: { hook: 75, reveal: 150, metrics: 315, context: 210, verdict: 150 },
};

const VIDEO_PACING_KEYS = Object.keys(VIDEO_PACING_PROFILES) as VideoPacingProfile[];
const DEFAULT_RECIPE: VideoVisualRecipe = {
  key: "default:center_card:spotlight_count:radar_grid:electric_indigo:snap_zoom:standard",
  sceneOrder: ["hook", "reveal", "metrics", "context", "verdict"],
  layoutPack: "center_card",
  chartPack: "spotlight_count",
  motionPack: "snap_zoom",
  backgroundSystem: "radar_grid",
  colorTheme: "electric_indigo",
  pacingProfile: "standard",
};

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(items: readonly T[], hash: number, shift: number): T {
  return items[(hash >>> shift) % items.length];
}

function buildRecipeKey(recipe: Omit<VideoVisualRecipe, "key">): string {
  return [
    recipe.sceneOrder.join("-"),
    recipe.layoutPack,
    recipe.chartPack,
    recipe.backgroundSystem,
    recipe.colorTheme,
    recipe.motionPack,
    recipe.pacingProfile,
  ].join(":");
}

function buildCandidate(seed: string): VideoVisualRecipe {
  const hash = stableHash(seed);
  const sceneOrder = [...pick(VIDEO_SCENE_ORDERS, hash, 0)];
  const recipe = {
    sceneOrder,
    layoutPack: pick(VIDEO_LAYOUT_PACKS, hash, 4),
    chartPack: pick(VIDEO_CHART_PACKS, hash, 9),
    backgroundSystem: pick(VIDEO_BACKGROUND_SYSTEMS, hash, 14),
    colorTheme: pick(Object.keys(VIDEO_COLOR_THEMES) as VideoColorTheme[], hash, 19),
    motionPack: pick(VIDEO_MOTION_PACKS, hash, 24),
    pacingProfile: pick(VIDEO_PACING_KEYS, hash, 28),
  };

  return { ...recipe, key: buildRecipeKey(recipe) };
}

export function selectVideoVisualRecipe(options: {
  seedParts?: Array<string | number | undefined | null>;
  usedRecipeKeys?: Iterable<string>;
} = {}): VideoVisualRecipe {
  const used = new Set(options.usedRecipeKeys || []);
  const seed = (options.seedParts || [])
    .filter((part) => part !== undefined && part !== null)
    .join(":")
    .toLowerCase();

  for (let attempt = 0; attempt < 96; attempt++) {
    const candidate = buildCandidate(`${seed || "tokenradar-video-recipe"}:${attempt}`);
    if (!used.has(candidate.key)) return candidate;
  }

  return buildCandidate(`${seed || "tokenradar-video-recipe"}:fallback`);
}

export function resolveVideoVisualRecipe(recipe: VideoVisualRecipe | undefined | null): VideoVisualRecipe {
  if (!recipe) return DEFAULT_RECIPE;
  const inputSceneOrder = Array.isArray(recipe.sceneOrder) ? recipe.sceneOrder : [];
  const sceneIds = new Set(inputSceneOrder);
  const hasValidScenes = VIDEO_SCENE_ORDERS.some(
    (order) => order.length === inputSceneOrder.length && order.every((scene) => sceneIds.has(scene)),
  );

  const resolved = {
    sceneOrder: hasValidScenes ? inputSceneOrder : DEFAULT_RECIPE.sceneOrder,
    layoutPack: VIDEO_LAYOUT_PACKS.includes(recipe.layoutPack) ? recipe.layoutPack : DEFAULT_RECIPE.layoutPack,
    chartPack: VIDEO_CHART_PACKS.includes(recipe.chartPack) ? recipe.chartPack : DEFAULT_RECIPE.chartPack,
    motionPack: VIDEO_MOTION_PACKS.includes(recipe.motionPack) ? recipe.motionPack : DEFAULT_RECIPE.motionPack,
    backgroundSystem: VIDEO_BACKGROUND_SYSTEMS.includes(recipe.backgroundSystem)
      ? recipe.backgroundSystem
      : DEFAULT_RECIPE.backgroundSystem,
    colorTheme: recipe.colorTheme in VIDEO_COLOR_THEMES ? recipe.colorTheme : DEFAULT_RECIPE.colorTheme,
    pacingProfile: recipe.pacingProfile in VIDEO_PACING_PROFILES
      ? recipe.pacingProfile
      : DEFAULT_RECIPE.pacingProfile,
  };

  return {
    ...resolved,
    key: recipe.key || buildRecipeKey(resolved),
  };
}

export function getVideoTheme(recipe: VideoVisualRecipe | undefined | null): VideoThemeDefinition {
  return VIDEO_COLOR_THEMES[resolveVideoVisualRecipe(recipe).colorTheme];
}

export function getVideoSceneDurations(recipe: VideoVisualRecipe | undefined | null): Record<VideoSceneId, number> {
  return VIDEO_PACING_PROFILES[resolveVideoVisualRecipe(recipe).pacingProfile];
}

export function getVideoSceneDurationsForTotalFrames(
  recipe: VideoVisualRecipe | undefined | null,
  totalFrames: number,
): Record<VideoSceneId, number> {
  const baseDurations = getVideoSceneDurations(recipe);
  const safeTotalFrames = Math.max(1, Math.round(totalFrames));
  const baseTotal = Object.values(baseDurations).reduce((total, value) => total + value, 0);

  if (safeTotalFrames === baseTotal) return baseDurations;

  const scale = safeTotalFrames / baseTotal;
  const scaled: Record<VideoSceneId, number> = {
    hook: Math.max(1, Math.round(baseDurations.hook * scale)),
    reveal: Math.max(1, Math.round(baseDurations.reveal * scale)),
    metrics: Math.max(1, Math.round(baseDurations.metrics * scale)),
    context: Math.max(1, Math.round(baseDurations.context * scale)),
    verdict: Math.max(1, Math.round(baseDurations.verdict * scale)),
  };
  const scaledTotal = Object.values(scaled).reduce((total, value) => total + value, 0);
  scaled.verdict = Math.max(1, scaled.verdict + safeTotalFrames - scaledTotal);

  return scaled;
}

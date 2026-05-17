import type { VideoFormatKey } from "./video-formats";
import type { VideoSceneId, VideoVisualRecipe } from "./video-recipes";

export type VideoAssetKind = "image" | "video" | "animated";
export type VideoAssetSource = "local" | "remote";
export type VideoAssetOrientation = "vertical" | "horizontal" | "square" | "any";
export type VideoAssetFit = "cover" | "contain" | "fill";
export type VideoAssetRole = "background" | "overlay";
export type VideoAssetPlatform = "telegram" | "x" | "youtube" | "instagram" | "threads" | "tiktok";
export type VideoMediaStage = "ambient" | "primary";
export type VideoAssetSegmentId = "hook" | "evidence" | "closing";
export type VideoAssetFallbackLevel = "fresh" | "relaxed-cooldown" | "generated-only";

export interface VideoAssetLayer {
  id: string;
  kind: VideoAssetKind;
  source: VideoAssetSource;
  src: string;
  provider?: "local" | "pexels" | "pixabay" | "manual" | "generated";
  orientation?: VideoAssetOrientation;
  role?: VideoAssetRole;
  fit?: VideoAssetFit;
  opacity?: number;
  blur?: number;
  saturation?: number;
  playbackRate?: number;
  startOffsetSeconds?: number;
  sceneIds?: VideoSceneId[];
  tags?: string[];
  attribution?: string;
  sourcePageUrl?: string;
  license?: string;
  downloadedAt?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  sha256?: string;
  safeStartOffsets?: number[];
}

export interface VideoAssetManifest {
  updatedAt?: string;
  assets: VideoAssetLayer[];
}

export interface VideoAssetUsageRecord {
  assetId: string;
  usedAt: string;
  platform?: VideoAssetPlatform;
  segmentId?: VideoAssetSegmentId;
}

export interface VideoAssetStageSegment {
  segmentId: VideoAssetSegmentId;
  fromSeconds: number;
  toSeconds: number;
  asset: VideoAssetLayer;
  startOffsetSeconds: number;
  fallbackLevel: VideoAssetFallbackLevel;
}

export interface VideoAssetShotList {
  segments: VideoAssetStageSegment[];
  fallbackLevel: VideoAssetFallbackLevel;
  warnings: string[];
}

interface BuildStockAssetQueriesOptions {
  tokenName: string;
  symbol: string;
  selectionReason?: string;
  videoFormatKey?: VideoFormatKey;
  visualRecipe?: VideoVisualRecipe;
}

interface SelectVideoAssetLayersOptions {
  manifest: VideoAssetManifest | undefined | null;
  platform: VideoAssetPlatform;
  visualRecipe?: VideoVisualRecipe;
  videoFormatKey?: VideoFormatKey;
  seedParts?: Array<string | number | undefined | null>;
  maxLayers?: number;
  stageMode?: VideoMediaStage;
}

export interface SelectVideoAssetShotListOptions {
  manifest: VideoAssetManifest | undefined | null;
  platform: VideoAssetPlatform;
  seedParts?: Array<string | number | undefined | null>;
  usageRecords?: VideoAssetUsageRecord[];
  now?: Date;
  cooldownDays?: number;
  durationSeconds?: number;
}

const SUPPORTED_KINDS = new Set<VideoAssetKind>(["image", "video", "animated"]);
const SUPPORTED_SOURCES = new Set<VideoAssetSource>(["local", "remote"]);
const SUPPORTED_ORIENTATIONS = new Set<VideoAssetOrientation>(["vertical", "horizontal", "square", "any"]);
const SUPPORTED_FITS = new Set<VideoAssetFit>(["cover", "contain", "fill"]);
const SUPPORTED_ROLES = new Set<VideoAssetRole>(["background", "overlay"]);

const SHOT_SEGMENTS: Array<Pick<VideoAssetStageSegment, "segmentId" | "fromSeconds" | "toSeconds">> = [
  { segmentId: "hook", fromSeconds: 0, toSeconds: 8 },
  { segmentId: "evidence", fromSeconds: 8, toSeconds: 20 },
  { segmentId: "closing", fromSeconds: 20, toSeconds: 30 },
];

const VIDEO_FORMAT_QUERY_HINTS: Partial<Record<VideoFormatKey, string[]>> = {
  breakout_watch: ["crypto candlestick breakout", "market momentum chart"],
  risk_alert: ["risk management dashboard", "red financial chart"],
  volume_spike_check: ["vertical crypto trading chart", "financial market data dashboard"],
  sector_rotation: ["digital finance network", "market sector dashboard"],
  token_vs_sector: ["financial comparison dashboard", "stock market screen"],
  momentum_cooling: ["cooling market chart", "trading screen close up"],
  catalyst_explainer: ["blockchain technology abstract", "financial news dashboard"],
  liquidity_stress_test: ["liquidity trading screen", "order book market data"],
  data_vs_hype: ["financial analytics dashboard", "data visualization screen"],
  risk_score_breakdown: ["risk analytics dashboard", "financial warning chart"],
  watchlist_battle: ["trading watchlist dashboard", "market monitor screens"],
  weekly_recap: ["financial market recap", "trading desk screens"],
  new_listing_radar: ["crypto market discovery", "digital asset dashboard"],
  narrative_heatmap: ["financial heatmap dashboard", "market data heatmap"],
  contrarian_signal: ["contrarian market chart", "trading data tension"],
};

const BACKGROUND_QUERY_HINTS: Partial<Record<VideoVisualRecipe["backgroundSystem"], string[]>> = {
  radar_grid: ["digital radar grid", "abstract technology grid"],
  ticker_tape: ["stock ticker screen", "financial ticker display"],
  terminal_scan: ["financial market data dashboard", "terminal trading screen"],
  heatmap_field: ["financial market heatmap", "data heatmap dashboard"],
  orbital_map: ["blockchain network animation", "digital finance network"],
  liquidity_depth: ["order book market data", "liquidity trading screen"],
};

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const normalized = item.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function isSafeLocalSrc(src: string): boolean {
  const normalized = src.replace(/\\/g, "/").trim();
  if (!normalized) return false;
  if (normalized.startsWith("/") || normalized.startsWith("./") || normalized.startsWith("../")) return false;
  if (normalized.includes("/../") || normalized.includes("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;
  return true;
}

function isSafeRemoteSrc(src: string): boolean {
  try {
    const parsed = new URL(src);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function defaultOpacity(kind: VideoAssetKind): number {
  if (kind === "video") return 0.22;
  if (kind === "animated") return 0.18;
  return 0.16;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function optionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const number = optionalPositiveNumber(value);
  return number === undefined ? undefined : Math.round(number);
}

function optionalSha256(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
}

function normalizeSafeStartOffsets(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const offsets = value
    .map((offset) => typeof offset === "number" && Number.isFinite(offset) && offset >= 0 ? offset : undefined)
    .filter((offset): offset is number => offset !== undefined)
    .sort((left, right) => left - right);
  return offsets.length > 0 ? [...new Set(offsets)] : undefined;
}

function isGeneratedAsset(asset: VideoAssetLayer): boolean {
  const tags = new Set(asset.tags || []);
  return asset.provider === "generated" || tags.has("generated") || tags.has("blender");
}

function isStockLikeAsset(asset: VideoAssetLayer): boolean {
  return !isGeneratedAsset(asset) && asset.kind === "video";
}

function normalizeLayer(input: VideoAssetLayer): VideoAssetLayer | null {
  if (!input || typeof input !== "object") return null;
  if (!input.id || !input.src || !SUPPORTED_KINDS.has(input.kind) || !SUPPORTED_SOURCES.has(input.source)) return null;

  const src = input.source === "local"
    ? input.src.replace(/\\/g, "/").trim()
    : input.src.trim();

  if (input.source === "local" && !isSafeLocalSrc(src)) return null;
  if (input.source === "remote" && !isSafeRemoteSrc(src)) return null;

  const orientation = input.orientation && SUPPORTED_ORIENTATIONS.has(input.orientation)
    ? input.orientation
    : "any";
  const fit = input.fit && SUPPORTED_FITS.has(input.fit) ? input.fit : "cover";
  const role = input.role && SUPPORTED_ROLES.has(input.role) ? input.role : "background";

  return {
    ...input,
    id: input.id.trim(),
    src,
    orientation,
    fit,
    role,
    opacity: typeof input.opacity === "number" ? Math.max(0, Math.min(input.opacity, 1)) : defaultOpacity(input.kind),
    blur: typeof input.blur === "number" ? Math.max(0, input.blur) : 0,
    saturation: typeof input.saturation === "number" ? Math.max(0, input.saturation) : 1,
    playbackRate: typeof input.playbackRate === "number" && input.playbackRate > 0 ? input.playbackRate : 1,
    startOffsetSeconds: typeof input.startOffsetSeconds === "number" && input.startOffsetSeconds > 0
      ? input.startOffsetSeconds
      : 0,
    tags: Array.isArray(input.tags)
      ? unique(input.tags.map((tag) => String(tag)))
      : [],
    attribution: optionalString(input.attribution),
    sourcePageUrl: optionalString(input.sourcePageUrl),
    license: optionalString(input.license),
    downloadedAt: optionalString(input.downloadedAt),
    durationSeconds: optionalPositiveNumber(input.durationSeconds),
    width: optionalPositiveInteger(input.width),
    height: optionalPositiveInteger(input.height),
    fileSizeBytes: optionalPositiveInteger(input.fileSizeBytes),
    sha256: optionalSha256(input.sha256),
    safeStartOffsets: normalizeSafeStartOffsets(input.safeStartOffsets),
  };
}

export function normalizeVideoAssetManifest(manifest: VideoAssetManifest | undefined | null): VideoAssetManifest {
  const assets = Array.isArray(manifest?.assets)
    ? manifest.assets.map(normalizeLayer).filter((asset): asset is VideoAssetLayer => Boolean(asset))
    : [];

  return {
    updatedAt: manifest?.updatedAt,
    assets,
  };
}

export function buildStockAssetQueries(options: BuildStockAssetQueriesOptions): string[] {
  void options.tokenName;
  void options.symbol;

  const formatHints = options.videoFormatKey ? VIDEO_FORMAT_QUERY_HINTS[options.videoFormatKey] || [] : [];
  const backgroundHints = options.visualRecipe
    ? BACKGROUND_QUERY_HINTS[options.visualRecipe.backgroundSystem] || []
    : [];
  const reason = (options.selectionReason || "").toLowerCase();
  const reasonHints = [
    reason.includes("volume") ? "vertical crypto trading chart" : "",
    reason.includes("risk") ? "risk management dashboard" : "",
    reason.includes("listing") ? "digital asset dashboard" : "",
  ];

  return unique([
    ...reasonHints,
    ...formatHints,
    ...backgroundHints,
    "financial market data dashboard",
    "crypto trading screen vertical",
    "blockchain network abstract",
  ]);
}

function assetScore(asset: VideoAssetLayer, options: SelectVideoAssetLayersOptions): number {
  const tags = new Set(asset.tags || []);
  let score = 0;

  if (asset.orientation === "vertical") score += 60;
  else if (asset.orientation === "square") score += 28;
  else if (asset.orientation === "horizontal") score += options.platform === "x" ? 18 : 6;
  else score += 20;

  if (asset.kind === "video") score += 80;
  else if (asset.kind === "animated") score += 50;
  else score += 30;

  if (asset.role === "background") score += 12;
  if (options.visualRecipe?.backgroundSystem && tags.has(options.visualRecipe.backgroundSystem)) score += 18;
  if (options.videoFormatKey && tags.has(options.videoFormatKey)) score += 18;
  if (tags.has("market") || tags.has("chart") || tags.has("signal")) score += 8;

  return score;
}

function primaryStageScore(asset: VideoAssetLayer): number {
  let score = 0;

  if (asset.kind === "video") score += 80;
  else if (asset.kind === "animated") score += 48;
  else score += 24;

  if (asset.orientation === "vertical") score += 60;
  else if (asset.orientation === "square") score += 28;
  else if (asset.orientation === "any") score += 20;
  else score += 8;

  if (asset.role === "background") score += 16;
  if (isStockLikeAsset(asset)) score += 24;

  return score;
}

function selectSeededAsset(
  assets: VideoAssetLayer[],
  seed: string,
  salt: string,
): VideoAssetLayer | undefined {
  return [...assets]
    .map((asset) => ({
      asset,
      score: primaryStageScore(asset),
      tieBreaker: stableHash(`${seed}:${salt}:${asset.id}`),
    }))
    .sort((left, right) => right.score - left.score || left.tieBreaker - right.tieBreaker)
    [0]?.asset;
}

function withStageTreatment(asset: VideoAssetLayer, layer: "primary" | "generatedOverlay"): VideoAssetLayer {
  if (layer === "generatedOverlay") {
    return {
      ...asset,
      opacity: 0.12,
      blur: asset.blur ?? 0,
      saturation: Math.max(asset.saturation ?? 1, 1.08),
      fit: asset.fit ?? "cover",
      role: "background",
    };
  }

  return {
    ...asset,
    opacity: 1,
    blur: asset.blur ?? 0,
    saturation: Math.max(asset.saturation ?? 1, isGeneratedAsset(asset) ? 1.08 : 1.05),
    fit: asset.fit ?? "cover",
    role: "background",
  };
}

function getShotListSeed(options: SelectVideoAssetShotListOptions): string {
  return (options.seedParts || [])
    .filter((part) => part !== undefined && part !== null)
    .join(":")
    .toLowerCase();
}

function getRecentAssetUse(
  assetId: string,
  usageRecords: VideoAssetUsageRecord[] = [],
): Date | undefined {
  let newest: Date | undefined;

  for (const record of usageRecords) {
    if (record.assetId !== assetId) continue;
    const usedAt = new Date(record.usedAt);
    if (Number.isNaN(usedAt.getTime())) continue;
    if (!newest || usedAt > newest) newest = usedAt;
  }

  return newest;
}

function isAssetInCooldown(
  asset: VideoAssetLayer,
  usageRecords: VideoAssetUsageRecord[] | undefined,
  now: Date,
  cooldownDays: number,
): boolean {
  const recentUse = getRecentAssetUse(asset.id, usageRecords);
  if (!recentUse) return false;

  const ageMs = now.getTime() - recentUse.getTime();
  if (ageMs < 0) return true;
  return ageMs < cooldownDays * 24 * 60 * 60 * 1000;
}

function getShotSegmentTags(segmentId: VideoAssetSegmentId): Set<string> {
  if (segmentId === "hook") return new Set(["phone", "screen", "terminal", "market", "trader"]);
  if (segmentId === "evidence") return new Set(["chart", "data", "dashboard", "market", "liquidity"]);
  return new Set(["signal", "blender", "generated", "network", "radar_grid"]);
}

function shotSegmentScore(
  asset: VideoAssetLayer,
  segmentId: VideoAssetSegmentId,
  seed: string,
  selectedIds: Set<string>,
  usageRecords: VideoAssetUsageRecord[] | undefined,
): number {
  const tags = new Set(asset.tags || []);
  const segmentTags = getShotSegmentTags(segmentId);
  let score = primaryStageScore(asset);

  for (const tag of segmentTags) {
    if (tags.has(tag)) score += 16;
  }

  if (segmentId === "closing" && isGeneratedAsset(asset)) score += 20;
  if (segmentId !== "closing" && isStockLikeAsset(asset)) score += 8;
  if (selectedIds.has(asset.id)) score -= 240;

  const recentUse = getRecentAssetUse(asset.id, usageRecords);
  if (recentUse) {
    const recentUseHash = stableHash(`${recentUse.toISOString()}:${asset.id}`) % 30;
    score -= recentUseHash;
  }

  score -= stableHash(`${seed}:${segmentId}:${asset.id}`) / 0xffffffff;
  return score;
}

function pickShotAsset(
  candidates: VideoAssetLayer[],
  segmentId: VideoAssetSegmentId,
  seed: string,
  selectedIds: Set<string>,
  usageRecords: VideoAssetUsageRecord[] | undefined,
): VideoAssetLayer | undefined {
  if (candidates.length === 0) return undefined;

  const withoutDuplicates = candidates.filter((asset) => !selectedIds.has(asset.id));
  const pool = withoutDuplicates.length > 0 ? withoutDuplicates : candidates;

  return [...pool]
    .map((asset) => ({
      asset,
      score: shotSegmentScore(asset, segmentId, seed, selectedIds, usageRecords),
    }))
    .sort((left, right) => right.score - left.score || left.asset.id.localeCompare(right.asset.id))[0]?.asset;
}

function pickStartOffsetSeconds(
  asset: VideoAssetLayer,
  segment: Pick<VideoAssetStageSegment, "segmentId" | "fromSeconds" | "toSeconds">,
  seed: string,
): number {
  const segmentDurationSeconds = segment.toSeconds - segment.fromSeconds;
  const maxOffset = asset.durationSeconds
    ? Math.max(0, asset.durationSeconds - segmentDurationSeconds)
    : Number.POSITIVE_INFINITY;
  const candidateOffsets = asset.safeStartOffsets && asset.safeStartOffsets.length > 0
    ? asset.safeStartOffsets
    : [asset.startOffsetSeconds ?? 0];
  const usableOffsets = candidateOffsets
    .filter((offset) => offset >= 0 && offset <= maxOffset)
    .sort((left, right) => left - right);
  const pool = usableOffsets.length > 0 ? usableOffsets : [0];
  const selected = pool[stableHash(`${seed}:${segment.segmentId}:${asset.id}:offset`) % pool.length] ?? 0;

  return Math.min(selected, Number.isFinite(maxOffset) ? maxOffset : selected);
}

function buildShotSegments(
  candidates: VideoAssetLayer[],
  seed: string,
  fallbackLevel: VideoAssetFallbackLevel,
  usageRecords: VideoAssetUsageRecord[] | undefined,
  durationSeconds: number,
): VideoAssetStageSegment[] {
  const selectedIds = new Set<string>();
  const segments = SHOT_SEGMENTS
    .filter((segment) => segment.fromSeconds < durationSeconds)
    .map((segment) => ({
      ...segment,
      toSeconds: Math.min(segment.toSeconds, durationSeconds),
    }));
  const output: VideoAssetStageSegment[] = [];

  for (const segment of segments) {
    const asset = pickShotAsset(candidates, segment.segmentId, seed, selectedIds, usageRecords);
    if (!asset) continue;

    selectedIds.add(asset.id);
    const startOffsetSeconds = pickStartOffsetSeconds(asset, segment, seed);
    const treatedAsset: VideoAssetLayer = {
      ...withStageTreatment(asset, "primary"),
      startOffsetSeconds,
    };

    output.push({
      ...segment,
      asset: treatedAsset,
      startOffsetSeconds,
      fallbackLevel,
    });
  }

  return output;
}

export function selectVideoAssetShotList(options: SelectVideoAssetShotListOptions): VideoAssetShotList {
  const manifest = normalizeVideoAssetManifest(options.manifest);
  const now = options.now || new Date();
  const cooldownDays = Math.max(0, options.cooldownDays ?? 14);
  const durationSeconds = Math.max(1, options.durationSeconds ?? 30);
  const seed = getShotListSeed(options);
  const warnings: string[] = [];
  const backgroundAssets = manifest.assets.filter((asset) =>
    asset.role === "background" && (asset.kind === "video" || asset.kind === "animated" || asset.kind === "image")
  );

  if (backgroundAssets.length === 0) {
    return {
      segments: [],
      fallbackLevel: "generated-only",
      warnings: ["no-usable-video-assets"],
    };
  }

  const freshAssets = backgroundAssets.filter((asset) =>
    !isAssetInCooldown(asset, options.usageRecords, now, cooldownDays)
  );
  const requiredSegments = Math.min(SHOT_SEGMENTS.length, backgroundAssets.length);
  const fallbackLevel: VideoAssetFallbackLevel = freshAssets.length >= requiredSegments
    ? "fresh"
    : "relaxed-cooldown";
  const candidateAssets = fallbackLevel === "fresh" ? freshAssets : backgroundAssets;

  if (fallbackLevel === "relaxed-cooldown") {
    warnings.push("asset-cooldown-relaxed");
  }

  const segments = buildShotSegments(candidateAssets, seed, fallbackLevel, options.usageRecords, durationSeconds);

  return {
    segments,
    fallbackLevel: segments.length > 0 ? fallbackLevel : "generated-only",
    warnings: segments.length > 0 ? warnings : ["no-usable-video-assets"],
  };
}

function selectPrimaryStageLayers(
  manifest: VideoAssetManifest,
  options: SelectVideoAssetLayersOptions,
  seed: string,
): VideoAssetLayer[] {
  const maxLayers = Math.min(options.maxLayers ?? 1, 1);
  if (maxLayers <= 0) return [];

  const backgroundAssets = manifest.assets.filter((asset) => asset.role === "background");
  const stockAssets = backgroundAssets.filter(isStockLikeAsset);
  const generatedAssets = backgroundAssets.filter(isGeneratedAsset);
  const preferGenerated = stockAssets.length > 0 &&
    generatedAssets.length > 0 &&
    stableHash(`${seed}:${options.platform}:stage-provider`) % 3 === 0;
  const preferredPool = preferGenerated
    ? generatedAssets
    : stockAssets.length > 0
      ? stockAssets
      : backgroundAssets;
  const primary = selectSeededAsset(preferredPool, seed, preferGenerated ? "primary-generated" : "primary-stock") ||
    selectSeededAsset(backgroundAssets, seed, "primary-fallback");

  return primary ? [withStageTreatment(primary, "primary")] : [];
}

export function selectVideoAssetLayers(options: SelectVideoAssetLayersOptions): VideoAssetLayer[] {
  const manifest = normalizeVideoAssetManifest(options.manifest);
  const maxLayers = options.maxLayers ?? 2;
  if (maxLayers <= 0 || manifest.assets.length === 0) return [];

  const seed = (options.seedParts || [])
    .filter((part) => part !== undefined && part !== null)
    .join(":")
    .toLowerCase();

  if (options.stageMode === "primary") {
    return selectPrimaryStageLayers(manifest, options, seed);
  }

  return [...manifest.assets]
    .map((asset) => ({
      asset,
      score: assetScore(asset, options),
      tieBreaker: stableHash(`${seed}:${options.platform}:${asset.id}`),
    }))
    .sort((left, right) => right.score - left.score || left.tieBreaker - right.tieBreaker)
    .slice(0, maxLayers)
    .map(({ asset }) => asset);
}

export function resolveVideoAssetRenderSource<TAsset extends Pick<VideoAssetLayer, "source" | "src">>(
  asset: TAsset,
  staticFileResolver: (src: string) => string,
): string {
  return asset.source === "local" ? staticFileResolver(asset.src) : asset.src;
}
